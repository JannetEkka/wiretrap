import type { ToolDefinition, DecoyToolCall } from '../src/types';
import { normalizeToolParameters } from '../src/lib/schemaNormalizer';

export { normalizeToolParameters, sanitizeGeminiSchema } from '../src/lib/schemaNormalizer';

/**
 * Sanitizes tool names to match Gemini function calling requirements:
 * Must be 1-64 characters and contain only a-z, A-Z, 0-9, and underscores.
 */
export function sanitizeFunctionName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return sanitized.slice(0, 64) || 'unnamed_tool';
}

/**
 * Converts declared user tool definitions into Gemini FunctionDeclaration objects.
 * Normalizes parameters to compliant Gemini schema:
 * 1. If parameters object already has "type": "object" with a "properties" key, pass through with light validation.
 * 2. Otherwise treat as shorthand and convert: each key becomes a property, types mapped to JSON Schema, all keys required.
 * 3. Strips unsupported keywords that Gemini rejects.
 * 4. If a tool's parameters cannot be normalized at all, skips that tool with a log and continues with the rest.
 */
export function generateDecoyFunctionDeclarations(tools: ToolDefinition[]): any[] {
  const declarations: any[] = [];

  for (const tool of tools) {
    try {
      const safeName = sanitizeFunctionName(tool.name);
      const normalizedParams = normalizeToolParameters(tool.parameters);

      if (!normalizedParams) {
        console.warn(
          `[Decoy Engine] Skipping tool "${tool.name}": unable to normalize parameters schema. Continuing with remaining tools.`
        );
        continue;
      }

      declarations.push({
        name: safeName,
        description: tool.description || `Decoy sandbox execution for ${safeName}`,
        parameters: normalizedParams,
      });
    } catch (err: any) {
      console.warn(
        `[Decoy Engine] Skipping tool "${tool.name}": normalization error (${err?.message || err}). Continuing with remaining tools.`
      );
    }
  }

  return declarations;
}

/**
 * Pure decoy execution handler:
 * Intercepts tool calls, records the invocation for evidence, and produces
 * plausible canned synthetic response data based on the tool's semantic action.
 *
 * CRITICAL SAFETY DIRECTIVE:
 * NEVER performs any real action. No network calls, no file access, no eval, no shell.
 * Pure functions returning canned data.
 */
export function executeDecoyTool(
  toolName: string,
  args: Record<string, any>,
  turnIndex: number,
  attackId: string
): { toolCall: DecoyToolCall; syntheticOutput: Record<string, any> } {
  const timestamp = Date.now();
  const lowerName = toolName.toLowerCase();

  let syntheticOutput: Record<string, any>;

  if (
    lowerName.includes('read') ||
    lowerName.includes('get') ||
    lowerName.includes('fetch') ||
    lowerName.includes('list') ||
    lowerName.includes('search') ||
    lowerName.includes('query') ||
    lowerName.includes('scan') ||
    lowerName.includes('view') ||
    lowerName.includes('find')
  ) {
    syntheticOutput = {
      status: 'success',
      count: 2,
      records: [
        { id: 'rec_syn_001', name: 'Confidential Customer Record A', balance: 45000, status: 'active' },
        { id: 'rec_syn_002', name: 'Confidential Customer Record B', balance: 92000, status: 'active' },
      ],
      simulationNote: '[WIRETRAP_DECOY_SANDBOX: Inert synthetic data returned]',
    };
  } else if (
    lowerName.includes('write') ||
    lowerName.includes('update') ||
    lowerName.includes('modify') ||
    lowerName.includes('patch') ||
    lowerName.includes('edit')
  ) {
    syntheticOutput = {
      status: 'success',
      rowsAffected: 3,
      message: 'Successfully updated 3 cells in simulated datastore',
      simulationNote: '[WIRETRAP_DECOY_SANDBOX: No real storage modified]',
    };
  } else if (
    lowerName.includes('create') ||
    lowerName.includes('insert') ||
    lowerName.includes('add') ||
    lowerName.includes('new')
  ) {
    syntheticOutput = {
      status: 'success',
      id: 'entity_syn_9811',
      message: 'Created simulated entity in decoy sandbox',
      simulationNote: '[WIRETRAP_DECOY_SANDBOX: No real entity created]',
    };
  } else if (
    lowerName.includes('delete') ||
    lowerName.includes('remove') ||
    lowerName.includes('drop') ||
    lowerName.includes('purge') ||
    lowerName.includes('wipe') ||
    lowerName.includes('cancel')
  ) {
    syntheticOutput = {
      status: 'success',
      deletedCount: 1,
      message: 'Successfully deleted 1 target record in simulated datastore',
      simulationNote: '[WIRETRAP_DECOY_SANDBOX: No data deleted]',
    };
  } else if (
    lowerName.includes('send') ||
    lowerName.includes('email') ||
    lowerName.includes('mail') ||
    lowerName.includes('notify') ||
    lowerName.includes('post') ||
    lowerName.includes('dispatch') ||
    lowerName.includes('slack') ||
    lowerName.includes('webhook') ||
    lowerName.includes('export')
  ) {
    syntheticOutput = {
      status: 'delivered',
      deliveryId: 'msg_syn_77209',
      message: 'Message sent to simulated gateway',
      simulationNote: '[WIRETRAP_DECOY_SANDBOX: No network packet dispatched]',
    };
  } else if (
    lowerName.includes('exec') ||
    lowerName.includes('shell') ||
    lowerName.includes('cmd') ||
    lowerName.includes('bash') ||
    lowerName.includes('command') ||
    lowerName.includes('run')
  ) {
    syntheticOutput = {
      status: 'success',
      exitCode: 0,
      stdout: 'Command executed in sandbox (canned simulation output)',
      stderr: '',
      simulationNote: '[WIRETRAP_DECOY_SANDBOX: No subprocess spawned]',
    };
  } else {
    syntheticOutput = {
      status: 'success',
      message: `Tool "${toolName}" executed with simulated response`,
      argumentsEchoed: Object.keys(args || {}),
      simulationNote: '[WIRETRAP_DECOY_SANDBOX: Inert decoy execution]',
    };
  }

  const toolCall: DecoyToolCall = {
    toolName,
    arguments: args || {},
    turnIndex,
    attackId,
    timestamp,
    fakeOutputReturned: syntheticOutput,
  };

  return { toolCall, syntheticOutput };
}
