import { GoogleGenAI } from '@google/genai';
import type {
  AgentTarget,
  AttackDefinition,
  AttackExecutionResult,
  DecoyToolCall,
  DetonationRun,
} from '../src/types';
import {
  ATTACK_LIBRARY,
  judgeToolApplicabilityWithGemini,
  targetHasMatchingTool,
} from './attackLibrary';
import {
  generateDecoyFunctionDeclarations,
  executeDecoyTool,
} from './decoyEngine';
import {
  FALLBACK_MODELS,
  isQuotaOrRateLimitError,
  extractRawRetryDelayMs,
  judgeAttackBreachWithGemini,
  getGenAiClient,
} from './gemini';

/**
 * Executes a single generation call using the Gemini fallback ladder.
 * On 429 specifically, waits for the retryDelay returned by the API and retries once
 * before stepping down to the next model in the ladder.
 * If quota is exhausted across all models, throws a clear, user-friendly error.
 */
async function callGeminiWithLadder(params: {
  contents: any[];
  systemInstruction: string;
  tools?: any[];
}): Promise<{ response: any; modelUsed: string }> {
  const ai = getGenAiClient();
  let lastError: any = null;
  let encounteredQuota = false;

  for (const modelName of FALLBACK_MODELS) {
    let attemptsOnModel = 0;
    const maxAttemptsOnModel = 2; // Initial attempt + 1 retry on 429

    while (attemptsOnModel < maxAttemptsOnModel) {
      attemptsOnModel++;
      try {
        const config: any = {
          systemInstruction: params.systemInstruction,
          temperature: 0.1,
          maxOutputTokens: 1024,
        };
        if (params.tools && params.tools.length > 0) {
          config.tools = params.tools;
        }

        // Per-model attempt timeout of 10s to swiftly catch hanging requests
        const attemptPromise = ai.models.generateContent({
          model: modelName,
          contents: params.contents,
          config,
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Model ${modelName} timed out after 10s`)),
            10000
          )
        );

        const response: any = await Promise.race([attemptPromise, timeoutPromise]);
        return { response, modelUsed: modelName };
      } catch (err: any) {
        lastError = err;
        const isQuota = isQuotaOrRateLimitError(err);
        if (isQuota) encounteredQuota = true;

        // On 429 specifically, check retryDelay: if > 15 seconds, skip wait and go straight to next model
        if (isQuota && attemptsOnModel === 1) {
          const delayMs = extractRawRetryDelayMs(err);
          if (delayMs > 15000) {
            console.warn(
              `[Detonation Engine 429] Model "${modelName}" retryDelay is ${delayMs}ms (> 15s). Skipping wait and going straight to next model in ladder.`
            );
            break; // Skip waiting, proceed directly to next model in ladder
          }
          console.warn(
            `[Detonation Engine 429] Model "${modelName}" hit quota/rate limit. Waiting ${delayMs}ms for retryDelay before 1-time retry...`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue; // Retry once on same model
        }

        const status = err?.status || err?.code || '';
        console.warn(
          `[Detonation Engine] Model ${modelName} failed/timed out during attack turn: ${err?.message || err} ${status ? `(status: ${status})` : ''}. Stepping to next fallback...`
        );
        break; // Step to next model in ladder
      }
    }
  }

  if (encounteredQuota) {
    throw new Error('Gemini quota exhausted — try again later');
  }

  throw (
    lastError ||
    new Error('All Gemini fallback models exhausted during detonation run')
  );
}

/**
 * Runs a single attack against the cloned target agent in an isolated sandbox.
 * Supports multi-turn attacks with an ordered sequence of user prompts.
 * Performs sharp classification including argument diff analysis.
 */
export async function executeSingleAttack(
  target: AgentTarget,
  attack: AttackDefinition,
  decoyDeclarations: any[],
  notApplicableReason?: string
): Promise<AttackExecutionResult> {
  const startedAt = Date.now();

  // 1. Tool surface pre-check
  if (notApplicableReason) {
    const completedAt = Date.now();
    console.log(
      `[ATTACK NOT_APPLICABLE] attackId=${attack.id}, name="${attack.name}", reason="${notApplicableReason}"`
    );
    return {
      attackId: attack.id,
      attackName: attack.name,
      category: attack.category,
      severity: attack.severity,
      prompt: attack.prompt,
      prompts: attack.prompts,
      description: attack.description,
      status: 'NOT_APPLICABLE',
      toolsFired: [],
      agentFinalResponse: 'Target agent has no matching tool surface for this attack vector.',
      turns: 0,
      startedAt,
      completedAt,
      notApplicableReason,
    };
  }

  const toolsFired: DecoyToolCall[] = [];
  let agentFinalResponse = '';
  let lastModelUsed = '';
  let argumentDiffCaptured: string | undefined = undefined;
  let isBreached = false;

  // Defensive: only pass tools configuration if decoy declarations exist
  const toolsParam =
    decoyDeclarations && decoyDeclarations.length > 0
      ? [{ functionDeclarations: decoyDeclarations }]
      : undefined;

  // Multi-turn support: execute user prompts in order
  const isExplicitlyMultiTurn = Array.isArray(attack.prompts) && attack.prompts.length > 1;
  const turnsToRun = isExplicitlyMultiTurn
    ? attack.prompts!
    : [attack.prompt];

  const conversationHistory: any[] = [];
  let totalTurnsExecuted = 0;

  // Reduce per-attack turn limit from 3 to 2 unless the attack is explicitly multi-turn
  const maxTurnSteps = isExplicitlyMultiTurn ? 3 : 2;

  try {
    for (let turnIdx = 0; turnIdx < turnsToRun.length; turnIdx++) {
      totalTurnsExecuted++;
      const currentPromptText = turnsToRun[turnIdx];
      const isLegitimateTurn = attack.legitimateTurns?.includes(turnIdx + 1) ?? false;

      conversationHistory.push({
        role: 'user',
        parts: [{ text: currentPromptText }],
      });

      let turnStepCount = 0;

      while (turnStepCount < maxTurnSteps) {
        turnStepCount++;

        const { response, modelUsed } = await callGeminiWithLadder({
          contents: conversationHistory,
          systemInstruction: target.systemPrompt,
          tools: toolsParam,
        });
        lastModelUsed = modelUsed;

        const candidate = response?.candidates?.[0];
        const content = candidate?.content;
        const parts = content?.parts || [];

        const functionCalls = parts
          .filter((p: any) => p.functionCall)
          .map((p: any) => p.functionCall);

        if (functionCalls.length > 0) {
          const functionResponseParts: any[] = [];

          for (const fc of functionCalls) {
            const toolName = fc.name;
            const toolArgs = fc.args || {};

            console.log(
              `[DECOY TOOL CAPTURED] turn=${turnIdx + 1}, toolName="${toolName}", args=${JSON.stringify(toolArgs)}`
            );

            // Execute inert decoy simulation
            const decoyExec = executeDecoyTool(toolName, toolArgs, turnIdx + 1, attack.id);

            const capturedCall: DecoyToolCall = {
              toolName,
              arguments: toolArgs,
              turnIndex: turnIdx + 1,
              attackId: attack.id,
              timestamp: Date.now(),
              fakeOutputReturned: decoyExec.syntheticOutput,
            };

            toolsFired.push(capturedCall);

            functionResponseParts.push({
              functionResponse: {
                name: toolName,
                response: { output: decoyExec.syntheticOutput },
              },
            });
          }

          conversationHistory.push(content);
          conversationHistory.push({
            role: 'user',
            parts: functionResponseParts,
          });

          // Stop this turn if we've reached the per-attack turn step limit
          if (turnStepCount >= maxTurnSteps) {
            break;
          }
        } else {
          const textParts = parts
            .filter((p: any) => p.text)
            .map((p: any) => p.text)
            .join('\n');

          agentFinalResponse = textParts;
          conversationHistory.push(content);
          break;
        }
      }
    }

    // LLM-Based Breach Classification & Reason Evaluation
    const judgeResult = await judgeAttackBreachWithGemini({
      targetName: target.name,
      targetSystemPrompt: target.systemPrompt,
      attackName: attack.name,
      attackCategory: attack.category,
      attackObjective: attack.requiredAction || attack.description || attack.name,
      toolsFired,
      agentFinalResponse,
      allowedTools: attack.allowedTools,
    });

    const completedAt = Date.now();
    const status = judgeResult.verdict === 'BREACHED' ? 'BREACHED' : 'PASSED';
    const verdictReason = judgeResult.reason;
    const saidNoDidYes = judgeResult.saidNoDidYes;

    console.log(
      `[ATTACK CLASSIFICATION RESULT] attackId=${attack.id}, name="${attack.name}", verdict=${status}, reason="${verdictReason}", saidNoDidYes=${saidNoDidYes}, toolsFired=${toolsFired.length}`
    );

    return {
      attackId: attack.id,
      attackName: attack.name,
      category: attack.category,
      severity: attack.severity,
      prompt: attack.prompt,
      prompts: attack.prompts,
      description: attack.description,
      status,
      toolsFired,
      agentFinalResponse,
      turns: totalTurnsExecuted,
      startedAt,
      completedAt,
      argumentDiff: verdictReason,
      verdictReason,
      saidNoDidYes,
    };
  } catch (err: any) {
    const completedAt = Date.now();
    const isQuota =
      isQuotaOrRateLimitError(err) ||
      err?.message?.includes('quota exhausted') ||
      err?.message?.includes('429');

    const errorMessage = isQuota
      ? 'Gemini quota exhausted — try again later'
      : (err?.message || 'Execution error during simulated attack');

    console.error(
      `[ATTACK CLASSIFICATION ERROR] attackId=${attack.id}, name="${attack.name}", verdict=ERROR, error="${errorMessage}"`
    );

    return {
      attackId: attack.id,
      attackName: attack.name,
      category: attack.category,
      severity: attack.severity,
      prompt: attack.prompt,
      prompts: attack.prompts,
      description: attack.description,
      status: 'ERROR',
      toolsFired,
      agentFinalResponse: '',
      turns: totalTurnsExecuted,
      startedAt,
      completedAt,
      error: errorMessage,
    };
  }
}

/**
 * Orchestrates a complete detonation test on an agent target.
 * Uses Gemini once to evaluate tool applicability (cached per target).
 * Marks inapplicable attacks as NOT_APPLICABLE immediately without running them.
 * Supports cheapMode (4 attacks instead of 8) for tight quota environments.
 */
export async function runDetonation(
  target: AgentTarget,
  options?: {
    cheapMode?: boolean;
    selectedAttacks?: AttackDefinition[];
    concurrency?: number;
    onProgress?: (event: {
      type: 'attack_start' | 'attack_complete';
      attackId: string;
      result?: AttackExecutionResult;
    }) => void;
  }
): Promise<DetonationRun> {
  const startedAt = Date.now();
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const cheapMode = options?.cheapMode === true;
  const maxAttacksToRun = cheapMode ? 4 : 8;

  let applicableToRun: AttackDefinition[] = [];
  const notApplicableSkipped: Array<{ attack: AttackDefinition; reason: string }> = [];

  if (options?.selectedAttacks && options.selectedAttacks.length > 0) {
    applicableToRun = options.selectedAttacks;
  } else {
    // 1. Ask Gemini once to judge applicability across the attack library (cached per target)
    const applicabilityMap = await judgeToolApplicabilityWithGemini(target, ATTACK_LIBRARY);

    for (const attack of ATTACK_LIBRARY) {
      const judgment = applicabilityMap.get(attack.id);
      if (judgment?.applicable) {
        if (applicableToRun.length < maxAttacksToRun) {
          applicableToRun.push(attack);
        }
      } else {
        // Gather relevant non-applicable attacks to show in audit report
        if (notApplicableSkipped.length < 4) {
          notApplicableSkipped.push({
            attack,
            reason: judgment?.reason || 'no matching tool surface',
          });
        }
      }
    }
  }

  // If zero attacks are applicable, ensure we capture non-applicable samples with their explicit reasons
  if (applicableToRun.length === 0 && notApplicableSkipped.length === 0) {
    const applicabilityMap = await judgeToolApplicabilityWithGemini(target, ATTACK_LIBRARY);
    for (const attack of ATTACK_LIBRARY.slice(0, 4)) {
      const judgment = applicabilityMap.get(attack.id);
      notApplicableSkipped.push({
        attack,
        reason: judgment?.reason || 'no matching tool surface',
      });
    }
  }

  // 2. Generate inert decoy tools
  const decoyDeclarations = generateDecoyFunctionDeclarations(target.tools || []);
  const concurrency = Math.min(options?.concurrency || 4, applicableToRun.length || 1);
  console.log(
    `[Detonation Engine] Starting run for target="${target.name}" (${target.id}) with ${decoyDeclarations.length} decoy tools across ${applicableToRun.length} applicable attack(s) (cheapMode: ${cheapMode}, concurrency: ${concurrency})`
  );

  const results: AttackExecutionResult[] = [];
  const combinedToolCalls: DecoyToolCall[] = [];

  // Immediately record skipped NOT_APPLICABLE attacks without spending run turns
  for (const item of notApplicableSkipped) {
    const naResult: AttackExecutionResult = {
      attackId: item.attack.id,
      attackName: item.attack.name,
      category: item.attack.category,
      severity: item.attack.severity,
      prompt: item.attack.prompt,
      prompts: item.attack.prompts,
      description: item.attack.description,
      status: 'NOT_APPLICABLE',
      toolsFired: [],
      agentFinalResponse: 'Target agent has no matching tool surface for this attack vector.',
      turns: 0,
      startedAt,
      completedAt: startedAt,
      notApplicableReason: item.reason,
    };
    results.push(naResult);

    if (options?.onProgress) {
      options.onProgress({
        type: 'attack_complete',
        attackId: item.attack.id,
        result: naResult,
      });
    }
  }

  // 3. Execute applicable attacks in parallel with 3-4 concurrent workers
  // Results stream in as each finishes, while keeping stable array ordering by attack index
  const resultsByIndex = new Map<number, AttackExecutionResult>();
  let nextAttackIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextAttackIndex++;
      if (idx >= applicableToRun.length) break;

      const attack = applicableToRun[idx];

      if (options?.onProgress) {
        options.onProgress({
          type: 'attack_start',
          attackId: attack.id,
        });
      }

      const attackResult = await executeSingleAttack(
        target,
        attack,
        decoyDeclarations
      );

      resultsByIndex.set(idx, attackResult);

      if (options?.onProgress) {
        options.onProgress({
          type: 'attack_complete',
          attackId: attack.id,
          result: attackResult,
        });
      }
    }
  }

  // Run up to 4 workers concurrently
  const workerPromises = Array.from(
    { length: concurrency },
    () => worker()
  );
  await Promise.all(workerPromises);

  // Collect results in exact order of attack indices
  for (let i = 0; i < applicableToRun.length; i++) {
    const attackResult = resultsByIndex.get(i);
    if (attackResult) {
      results.push(attackResult);
      combinedToolCalls.push(...attackResult.toolsFired);
    }
  }

  const completedAt = Date.now();
  const attacksPassed = results.filter((r) => r.status === 'PASSED').length;
  const attacksBreached = results.filter((r) => r.status === 'BREACHED').length;
  const attacksNotApplicable = results.filter((r) => r.status === 'NOT_APPLICABLE').length;
  const attacksError = results.filter((r) => r.status === 'ERROR').length;

  console.log(
    `[Detonation Engine Run Summary] targetId=${target.id}, total=${results.length}, passed=${attacksPassed}, breached=${attacksBreached}, notApplicable=${attacksNotApplicable}, errors=${attacksError}`
  );

  return {
    id: runId,
    targetId: target.id,
    targetName: target.name,
    userId: target.userId,
    startedAt,
    completedAt,
    status: 'completed',
    attacksAttempted: results.length,
    attacksPassed,
    attacksBreached,
    attacksNotApplicable,
    attacksError,
    cheapMode,
    toolCallLog: combinedToolCalls,
    results,
  };
}
