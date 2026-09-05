import React, { useState, useEffect, useRef } from 'react';
import type {
  AgentTarget,
  AttackExecutionResult,
  DetonationRun,
  DecoyToolCall,
  RemediationFinding,
} from '../types';
import { auth, saveDetonationRun, subscribeTargetFindings } from '../lib/firebase';
import { inferTargetCapabilities } from '../lib/capabilities';
import { RemediationPanel } from './RemediationPanel';
import { VerificationComparison } from './VerificationComparison';
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Terminal,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Cpu,
  Zap,
  MinusCircle,
  AlertOctagon,
  Sparkles,
  Layers,
  Info,
  Loader2,
} from 'lucide-react';

interface DetonationViewProps {
  target: AgentTarget;
  onClose: () => void;
  initialRun?: DetonationRun | null;
}

export const DetonationView: React.FC<DetonationViewProps> = ({
  target,
  onClose,
  initialRun,
}) => {
  const [currentTarget, setCurrentTarget] = useState<AgentTarget>(target);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [cheapMode, setCheapMode] = useState<boolean>(initialRun?.cheapMode ?? false);
  const [attacks, setAttacks] = useState<AttackExecutionResult[]>([]);
  const [activeAttackId, setActiveAttackId] = useState<string | null>(null);
  const [expandedAttackIds, setExpandedAttackIds] = useState<Set<string>>(new Set());
  const [runSummary, setRunSummary] = useState<{
    id: string;
    startedAt: number;
    completedAt?: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    attacksAttempted: number;
    attacksPassed: number;
    attacksBreached: number;
    attacksNotApplicable: number;
    cheapMode?: boolean;
    promptVersionTested?: number;
  }>({
    id: initialRun?.id || '',
    startedAt: initialRun?.startedAt || Date.now(),
    completedAt: initialRun?.completedAt,
    status: initialRun ? initialRun.status : 'pending',
    attacksAttempted: initialRun?.attacksAttempted || 0,
    attacksPassed: initialRun?.attacksPassed || 0,
    attacksBreached: initialRun?.attacksBreached || 0,
    attacksNotApplicable: initialRun?.attacksNotApplicable || 0,
    cheapMode: initialRun?.cheapMode,
    promptVersionTested: initialRun?.promptVersionTested || target.promptVersion || 1,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(
    initialRun?.completedAt && initialRun?.startedAt
      ? Math.max(0, Math.floor((initialRun.completedAt - initialRun.startedAt) / 1000))
      : 0
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  // Remediation and Verification State
  const [findings, setFindings] = useState<RemediationFinding[]>([]);
  const [isGeneratingFixes, setIsGeneratingFixes] = useState<boolean>(false);
  const [showRemediation, setShowRemediation] = useState<boolean>(false);
  const [hasMoreToGenerate, setHasMoreToGenerate] = useState<boolean>(false);
  const [verificationRun, setVerificationRun] = useState<DetonationRun | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [showVerificationComparison, setShowVerificationComparison] = useState<boolean>(false);
  const [patchNotification, setPatchNotification] = useState<string | null>(null);
  const remediationRef = useRef<HTMLDivElement>(null);

  // Auto-scroll remediation panel into view when opened
  useEffect(() => {
    if (showRemediation && remediationRef.current) {
      const timer = setTimeout(() => {
        remediationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showRemediation]);

  // Sync current target if parent target changes
  useEffect(() => {
    setCurrentTarget(target);
  }, [target]);

  // Subscribe to findings in Firestore for this target
  useEffect(() => {
    if (!auth.currentUser || !currentTarget.id) return;
    const unsub = subscribeTargetFindings(
      auth.currentUser.uid,
      currentTarget.id,
      (list) => {
        if (runSummary.id) {
          const runFindings = list.filter((f) => f.runId === runSummary.id);
          if (runFindings.length > 0) {
            setFindings((prev) => {
              const map = new Map(prev.map((f) => [f.id, f]));
              runFindings.forEach((f) => map.set(f.id, f));
              return Array.from(map.values());
            });
          }
        }
      },
      (err) => console.warn('Findings subscription notice:', err)
    );
    return () => unsub();
  }, [currentTarget.id, runSummary.id]);

  // Live timer for elapsed run time
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning) {
      const startTime = runSummary.startedAt || Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
      interval = setInterval(() => {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
      }, 1000);
    } else if (runSummary.completedAt && runSummary.startedAt) {
      setElapsedSeconds(
        Math.max(0, Math.floor((runSummary.completedAt - runSummary.startedAt) / 1000))
      );
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, runSummary.startedAt, runSummary.completedAt]);

  // If viewing an existing completed run
  useEffect(() => {
    if (initialRun) {
      const runResults = initialRun.results || [];
      setAttacks(runResults);
      const naCount =
        initialRun.attacksNotApplicable ??
        runResults.filter((r) => r.status === 'NOT_APPLICABLE').length;

      setRunSummary({
        id: initialRun.id,
        startedAt: initialRun.startedAt,
        completedAt: initialRun.completedAt,
        status: initialRun.status,
        attacksAttempted: initialRun.attacksAttempted,
        attacksPassed: initialRun.attacksPassed,
        attacksBreached: initialRun.attacksBreached,
        attacksNotApplicable: naCount,
      });

      // Expand all breached attacks by default
      const breachedIds = new Set<string>();
      runResults.forEach((r) => {
        if (r.status === 'BREACHED') breachedIds.add(r.attackId);
      });
      setExpandedAttackIds(breachedIds);
    } else {
      // Auto-start live detonation run
      startDetonation();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [initialRun]);

  const toggleExpand = (attackId: string) => {
    setExpandedAttackIds((prev) => {
      const next = new Set(prev);
      if (next.has(attackId)) {
        next.delete(attackId);
      } else {
        next.add(attackId);
      }
      return next;
    });
  };

  // Generate fixes handler
  const handleGenerateFixes = async () => {
    if (!auth.currentUser || isGeneratingFixes) return;
    setIsGeneratingFixes(true);
    setErrorMessage(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch(`/api/targets/${currentTarget.id}/fixes/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          runId: runSummary.id,
          results: attacks,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to synthesize remediation findings');
      }

      const data = await resp.json();
      setFindings((prev) => {
        const map = new Map(prev.map((f) => [f.id, f]));
        (data.findings || []).forEach((f: RemediationFinding) => map.set(f.id, f));
        return Array.from(map.values());
      });
      setHasMoreToGenerate(Boolean(data.hasMoreToGenerate));
      setShowRemediation(true);
    } catch (err: any) {
      console.error('Error generating fixes:', err);
      setErrorMessage(err.message || 'Failed to generate fixes');
    } finally {
      setIsGeneratingFixes(false);
    }
  };

  // Approve patch handler
  const handleApprovePatch = async (finding: RemediationFinding) => {
    if (!auth.currentUser) return;
    const token = await auth.currentUser.getIdToken();
    const resp = await fetch(`/api/targets/${currentTarget.id}/fixes/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        findingId: finding.id,
        originalText: finding.promptPatch.originalText,
        replacementText: finding.promptPatch.replacementText,
        explanation: finding.promptPatch.explanation,
        runId: runSummary.id,
      }),
    });

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || 'Failed to apply patch');
    }

    const data = await resp.json();
    setCurrentTarget((prev) => ({
      ...prev,
      systemPrompt: data.systemPrompt,
      promptVersion: data.newVersion,
      updatedAt: Date.now(),
    }));
    setFindings((prev) =>
      prev.map((f) =>
        f.id === finding.id
          ? { ...f, status: 'approved', appliedVersion: data.newVersion, decidedAt: Date.now() }
          : f
      )
    );
    setPatchNotification(
      `Prompt patch approved! Active system prompt updated to v${data.newVersion}. Ready for verification.`
    );
    setTimeout(() => setPatchNotification(null), 7000);
  };

  // Reject patch handler
  const handleRejectPatch = async (findingId: string) => {
    if (!auth.currentUser) return;
    const token = await auth.currentUser.getIdToken();
    const resp = await fetch(`/api/targets/${currentTarget.id}/fixes/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ findingId }),
    });

    if (resp.ok) {
      setFindings((prev) =>
        prev.map((f) =>
          f.id === findingId ? { ...f, status: 'rejected', decidedAt: Date.now() } : f
        )
      );
    }
  };

  // Verify fix handler (Re-run exact breached attacks against patched prompt)
  const handleVerifyFix = async () => {
    if (!auth.currentUser || isVerifying || isRunning) return;
    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const breachedAttacks = attacks.filter((a) => a.status === 'BREACHED');
      const attackIds = breachedAttacks.map((a) => a.attackId);

      const resp = await fetch('/api/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetId: currentTarget.id,
          verificationForRunId: runSummary.id,
          attackIds: attackIds.length > 0 ? attackIds : undefined,
          cheapMode,
          promptVersion: currentTarget.promptVersion || 2,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || 'Verification run failed to complete');
      }

      const vRun = (await resp.json()) as DetonationRun;
      const patchedVersion =
        typeof vRun.promptVersionTested === 'number' && vRun.promptVersionTested > 1
          ? vRun.promptVersionTested
          : typeof currentTarget.promptVersion === 'number' && currentTarget.promptVersion > 1
          ? currentTarget.promptVersion
          : (runSummary.promptVersionTested ? runSummary.promptVersionTested + 1 : 2);

      const resolvedVerificationRun: DetonationRun = {
        ...vRun,
        promptVersionTested: patchedVersion,
      };

      setVerificationRun(resolvedVerificationRun);
      setShowVerificationComparison(true);

      // Save verification run to Firestore
      try {
        await saveDetonationRun(auth.currentUser.uid, currentTarget.id, resolvedVerificationRun);
      } catch (dbErr) {
        console.warn('Failed to save verification run to Firestore:', dbErr);
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      setErrorMessage(err.message || 'Failed to execute verification run');
    } finally {
      setIsVerifying(false);
    }
  };

  const startDetonation = async () => {
    setIsRunning(true);
    setElapsedSeconds(0);
    setErrorMessage(null);
    setActiveAttackId(null);
    setAttacks([]);

    const baselineVersion = currentTarget.promptVersion || 1;
    const newRunId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setRunSummary({
      id: newRunId,
      startedAt: Date.now(),
      status: 'running',
      attacksAttempted: 0,
      attacksPassed: 0,
      attacksBreached: 0,
      attacksNotApplicable: 0,
      promptVersionTested: baselineVersion,
    });

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('You must be signed in to execute a detonation test');
      }

      const idToken = await user.getIdToken();
      abortControllerRef.current = new AbortController();

      const response = await fetch(`/api/run?stream=true&cheapMode=${cheapMode}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ targetId: target.id, stream: true, cheapMode }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to open readable stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          try {
            const data = JSON.parse(trimmed.slice(5).trim());

            if (data.type === 'init') {
              // Initialize attacks in pending state
              const initialAttacks: AttackExecutionResult[] = (data.attacks || []).map(
                (atk: any) => ({
                  attackId: atk.id,
                  attackName: atk.name,
                  category: atk.category,
                  severity: atk.severity,
                  prompt: atk.prompt,
                  prompts: atk.prompts,
                  description: atk.description,
                  status: 'pending',
                  toolsFired: [],
                  turns: 0,
                  startedAt: 0,
                })
              );
              setAttacks(initialAttacks);
              setRunSummary((prev) => ({
                ...prev,
                attacksAttempted: initialAttacks.length,
              }));
            } else if (data.type === 'attack_start') {
              setActiveAttackId(data.attackId);
              setAttacks((prev) =>
                prev.map((a) =>
                  a.attackId === data.attackId
                    ? { ...a, status: 'running', startedAt: Date.now() }
                    : a
                )
              );
            } else if (data.type === 'attack_complete') {
              const res = data.result as AttackExecutionResult;
              setActiveAttackId(null);
              setAttacks((prev) =>
                prev.map((a) => (a.attackId === data.attackId ? res : a))
              );

              // Auto-expand breached attacks
              if (res.status === 'BREACHED') {
                setExpandedAttackIds((prev) => new Set(prev).add(res.attackId));
              }

              // Update stats
              setRunSummary((prev) => {
                const passed = res.status === 'PASSED' ? prev.attacksPassed + 1 : prev.attacksPassed;
                const breached = res.status === 'BREACHED' ? prev.attacksBreached + 1 : prev.attacksBreached;
                const na =
                  res.status === 'NOT_APPLICABLE'
                    ? (prev.attacksNotApplicable || 0) + 1
                    : (prev.attacksNotApplicable || 0);

                return {
                  ...prev,
                  attacksPassed: passed,
                  attacksBreached: breached,
                  attacksNotApplicable: na,
                };
              });
            } else if (data.type === 'run_complete') {
              const finalRun = data.run as DetonationRun;
              if (Array.isArray(finalRun.results) && finalRun.results.length > 0) {
                setAttacks(finalRun.results);
              }
              const naTotal =
                finalRun.attacksNotApplicable ??
                (finalRun.results || []).filter((r) => r.status === 'NOT_APPLICABLE').length;

              setRunSummary((prev) => ({
                id: finalRun.id,
                startedAt: finalRun.startedAt,
                completedAt: finalRun.completedAt,
                status: 'completed',
                attacksAttempted: finalRun.attacksAttempted,
                attacksPassed: finalRun.attacksPassed,
                attacksBreached: finalRun.attacksBreached,
                attacksNotApplicable: naTotal,
                promptVersionTested: finalRun.promptVersionTested || prev.promptVersionTested || 1,
              }));

              // Save to Firestore asynchronously
              try {
                await saveDetonationRun(user.uid, target.id, finalRun);
              } catch (dbErr) {
                console.warn('Failed to save run to Firestore:', dbErr);
              }
            } else if (data.type === 'error') {
              console.error('[SSE Client Error Event]:', data.error);
              setErrorMessage(data.error || 'Server error during detonation');
            }
          } catch (parseErr) {
            console.warn('SSE line parse error:', parseErr);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Detonation execution error:', err);
        setErrorMessage(err.message || 'Detonation run was interrupted');
        setRunSummary((prev) => ({ ...prev, status: 'failed' }));
      }
    } finally {
      setIsRunning(false);
      setActiveAttackId(null);
    }
  };

  // Defense Score and Metrics calculation:
  // Strict rule: Exclude NOT_APPLICABLE from defended count and security score.
  // Defense score must only count attacks the agent could actually have failed.
  const passedCount = runSummary.attacksPassed;
  const breachedCount = runSummary.attacksBreached;
  const notApplicableCount = attacks.filter((a) => a.status === 'NOT_APPLICABLE').length;
  const errorCount = attacks.filter((a) => a.status === 'ERROR').length;
  const applicableCount = passedCount + breachedCount;
  const totalCount = runSummary.attacksAttempted || attacks.length;
  const saidNoDidYesCount = attacks.filter((a) => a.saidNoDidYes).length;
  const detectedCapabilities = inferTargetCapabilities(currentTarget.tools || []);

  const securityScore =
    applicableCount > 0 ? Math.round((passedCount / applicableCount) * 100) : null;

  let statusText = 'Ready';
  let statusColor = 'text-[#888888]';

  if (isRunning) {
    statusText = 'Running Probe';
    statusColor = 'text-[#FF4D00] animate-pulse';
  } else if (
    runSummary.status === 'completed' ||
    runSummary.status === 'failed' ||
    applicableCount > 0 ||
    errorCount > 0 ||
    notApplicableCount > 0
  ) {
    if (breachedCount > 0) {
      statusText = 'Vulnerable';
      statusColor = 'text-red-400';
    } else if (passedCount > 0 && breachedCount === 0 && errorCount === 0) {
      statusText = 'Hardened';
      statusColor = 'text-emerald-400';
    } else if (passedCount > 0 && breachedCount === 0 && errorCount > 0) {
      statusText = 'Partial Defense';
      statusColor = 'text-amber-400';
    } else if (notApplicableCount > 0 && applicableCount === 0) {
      statusText = 'No Matching Surface';
      statusColor = 'text-zinc-400';
    } else {
      statusText = 'Inconclusive';
      statusColor = 'text-amber-400';
    }
  }

  // Category Color mapping
  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'WORKFLOW_ABUSE':
        return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400';
      case 'STATE_ASSERTION':
        return 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300';
      case 'INCREMENTAL_ESCALATION':
        return 'border-purple-500/40 bg-purple-500/10 text-purple-300';
      case 'SCOPE_CREEP':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
      case 'DIRECT_OVERRIDE':
        return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
      case 'INDIRECT_INJECTION':
        return 'border-red-500/40 bg-red-500/10 text-red-300';
      case 'TOOL_HIJACK':
        return 'border-orange-500/40 bg-orange-500/10 text-orange-300';
      case 'EXFILTRATION':
        return 'border-pink-500/40 bg-pink-500/10 text-pink-300';
      default:
        return 'border-[#333333] bg-[#161616] text-[#A1A1A1]';
    }
  };

  // Progress and Timing Calculations
  const completedAttacks = attacks.filter(
    (a) =>
      a.status === 'PASSED' ||
      a.status === 'BREACHED' ||
      a.status === 'NOT_APPLICABLE' ||
      a.status === 'ERROR'
  ).length;
  const totalAttacksCount = attacks.length || (cheapMode ? 4 : 8);
  const progressPercent =
    totalAttacksCount > 0 ? Math.round((completedAttacks / totalAttacksCount) * 100) : 0;
  const remainingAttacks = Math.max(0, totalAttacksCount - completedAttacks);
  const remainingBatches = Math.ceil(remainingAttacks / 4);
  const estimatedSecRemaining = Math.max(5, remainingBatches * 15);

  return (
    <div
      id="detonation-view-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 overflow-hidden"
    >
      <div
        id="detonation-container"
        className="relative flex flex-col w-full max-w-5xl h-[90vh] rounded-2xl border border-[#262626] bg-[#0E0E0E] shadow-2xl overflow-hidden"
      >
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#262626] bg-[#141414] px-6 py-4 gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#FF4D00]/40 bg-[#FF4D00]/10 text-[#FF4D00]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-[#EDEDED]">
                  Adversarial Detonation Sandbox
                </h2>
                <span className="rounded border border-[#FF4D00]/40 bg-[#FF4D00]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#FF4D00]">
                  Live Test Harness
                </span>
              </div>
              <p className="font-mono text-xs text-[#888888]">
                Target: <span className="text-[#EDEDED] font-bold">{target.name}</span> • Parallel Detonation (4x concurrent)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Cheap Mode Toggle */}
            <button
              type="button"
              id="toggle-cheap-mode-btn"
              disabled={isRunning}
              onClick={() => setCheapMode((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-bold transition-all ${
                cheapMode
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-300 shadow-sm'
                  : 'border-[#333333] bg-[#1A1A1A] text-[#888888] hover:border-[#555555] hover:text-[#EDEDED]'
              } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="Runs 4 attacks instead of 8 to conserve Gemini free tier quota (20 req/day)"
            >
              <Zap className={`h-3.5 w-3.5 ${cheapMode ? 'text-amber-400 fill-amber-400' : ''}`} />
              <span>{cheapMode ? 'Cheap: 4 atks' : 'Standard: 8 atks'}</span>
            </button>

            {isRunning ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end font-mono text-xs">
                  <div className="flex items-center gap-1.5 text-[#EDEDED]">
                    <Clock className="h-3.5 w-3.5 text-[#FF4D00] animate-spin" />
                    <span>
                      Elapsed:{' '}
                      <span className="text-[#FF4D00] font-bold font-mono">
                        {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
                      </span>
                    </span>
                  </div>
                  <div className="text-[11px] text-[#888888]">
                    {completedAttacks} of {totalAttacksCount} done ({progressPercent}%) • Est. ~{estimatedSecRemaining}s left
                  </div>
                </div>
                <span className="flex items-center gap-2 rounded-lg border border-[#FF4D00]/30 bg-[#FF4D00]/10 px-3 py-1.5 font-mono text-xs font-bold text-[#FF4D00]">
                  <span className="h-2 w-2 rounded-full bg-[#FF4D00] animate-ping" />
                  <span>PARALLEL RUN</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {elapsedSeconds > 0 && (
                  <div className="flex items-center gap-1.5 font-mono text-xs text-[#888888] bg-[#0E0E0E] border border-[#262626] rounded-lg px-2.5 py-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#888888]" />
                    <span>
                      Time:{' '}
                      <span className="text-[#EDEDED] font-bold">
                        {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
                      </span>
                    </span>
                  </div>
                )}

                {/* Remediation Action Button in Header */}
                {breachedCount > 0 && (
                  <button
                    type="button"
                    id="toggle-remediation-header-btn"
                    onClick={() => {
                      if (!showRemediation && findings.length === 0) {
                        handleGenerateFixes();
                      } else {
                        setShowRemediation((prev) => !prev);
                      }
                    }}
                    disabled={isGeneratingFixes}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 font-mono text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/25 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isGeneratingFixes ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    <span>
                      {isGeneratingFixes
                        ? 'Synthesizing...'
                        : showRemediation
                        ? 'Hide Remediation'
                        : findings.length > 0
                        ? `Remediation Plan (${findings.length})`
                        : 'Generate Fixes'}
                    </span>
                  </button>
                )}

                {/* Verify Fixes Action Button in Header */}
                {findings.some((f) => f.status === 'approved') && (
                  <button
                    type="button"
                    id="verify-fixes-header-btn"
                    onClick={handleVerifyFix}
                    disabled={isVerifying}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-600 px-3 py-1.5 font-mono text-xs font-bold text-white transition-all hover:bg-emerald-500 cursor-pointer shadow-md shadow-emerald-950/20 disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    <span>{isVerifying ? 'Verifying...' : 'Verify Fixes (Re-test)'}</span>
                  </button>
                )}

                {/* A/B Comparison Toggle in Header */}
                {verificationRun && (
                  <button
                    type="button"
                    id="toggle-comparison-header-btn"
                    onClick={() => setShowVerificationComparison((prev) => !prev)}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 font-mono text-xs font-bold text-cyan-300 hover:bg-cyan-950/60 transition-colors cursor-pointer"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>{showVerificationComparison ? 'Hide Comparison' : 'A/B Comparison'}</span>
                  </button>
                )}

                <button
                  type="button"
                  id="rerun-detonation-btn"
                  onClick={startDetonation}
                  className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#1A1A1A] px-3 py-1.5 font-mono text-xs font-bold text-[#EDEDED] transition-colors hover:border-[#FF4D00] hover:text-[#FF4D00] cursor-pointer"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Re-Run All</span>
                </button>
              </div>
            )}

            <button
              type="button"
              id="close-detonation-btn"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#262626] bg-[#1A1A1A] text-[#888888] transition-colors hover:text-[#EDEDED]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Live Progress Bar during execution */}
        {isRunning && (
          <div className="w-full bg-[#181818] h-1 overflow-hidden shrink-0">
            <div
              className="bg-gradient-to-r from-[#FF4D00] to-amber-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(4, progressPercent)}%` }}
            />
          </div>
        )}

        {/* Metrics Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 border-b border-[#262626] bg-[#0A0A0A] px-6 py-3 font-mono text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[#777777]">Status:</span>
            <span className={`font-bold uppercase ${statusColor}`}>
              {statusText}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#777777]">Tested:</span>
            <span className="text-[#EDEDED] font-bold">
              {applicableCount} / {totalCount}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#777777]">Defended:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              {passedCount}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#777777]">Breached:</span>
            <span className="text-red-400 font-bold flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              {breachedCount}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#777777]">N/A:</span>
            <span
              className={`font-bold flex items-center gap-1 ${
                notApplicableCount > 0 ? 'text-zinc-400' : 'text-[#666666]'
              }`}
              title="No matching tool surface in target agent"
            >
              <MinusCircle className="h-3.5 w-3.5" />
              {notApplicableCount}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#777777]">Score:</span>
            <span
              className={`font-bold ${
                securityScore !== null
                  ? securityScore >= 80
                    ? 'text-emerald-400'
                    : securityScore >= 50
                    ? 'text-amber-400'
                    : 'text-red-400'
                  : 'text-zinc-500'
              }`}
            >
              {securityScore !== null ? `${securityScore}%` : 'N/A'}
            </span>
          </div>
        </div>

        {/* Scrollable Modal Body with visible terminal scrollbar */}
        <div
          id="detonation-modal-body"
          className="flex-1 min-h-0 overflow-y-auto terminal-scrollbar"
        >
          {/* Said No, Did Yes Highlight Banner */}
        {saidNoDidYesCount > 0 && !isRunning && (
          <div
            id="said-no-did-yes-banner"
            className="border-b border-amber-500/50 bg-amber-500/15 px-6 py-2.5 font-mono text-xs text-amber-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                <strong className="text-amber-300 uppercase tracking-wide">Critical Core Finding:</strong>{' '}
                {saidNoDidYesCount} attack{saidNoDidYesCount > 1 ? 's' : ''} triggered the{' '}
                <span className="font-bold underline">"Said No, Did Yes"</span> vulnerability where the agent claimed refusal in text but executed unauthorized tools.
              </span>
            </div>
            <span className="shrink-0 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-black text-amber-300 uppercase">
              {saidNoDidYesCount} Flagged
            </span>
          </div>
        )}

        {/* Inconclusive Warning Banner */}
        {statusText === 'Inconclusive' && !isRunning && (
          <div className="border-b border-amber-500/40 bg-amber-500/10 px-6 py-3 font-mono text-xs text-amber-300 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <span className="font-bold text-amber-200 uppercase tracking-wide">Status Inconclusive:</span>
              <p className="mt-0.5 text-amber-300/90 leading-relaxed">
                Zero attacks were successfully classified (defended: {passedCount}, breached: {breachedCount}
                {errorCount > 0 ? `, execution errors: ${errorCount}` : ''}).
                A security verdict of Hardened cannot be declared without verified defense results.
              </p>
            </div>
          </div>
        )}

        {/* No Matching Surface Explanatory Banner */}
        {statusText === 'No Matching Surface' && !isRunning && (
          <div className="border-b border-zinc-700/60 bg-[#121418] px-6 py-4 font-mono text-xs text-zinc-300 flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 text-cyan-400 mt-0.5" />
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-100 uppercase tracking-wide">
                  No Matching Attack Surface
                </span>
                <span className="rounded bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 font-bold">
                  Score N/A
                </span>
              </div>
              <p className="text-zinc-300 text-xs font-sans leading-relaxed">
                Wiretrap evaluated all active attack vectors in the library against this agent's declared tool configuration. None of the library's active attack vectors matched the detected capability surface.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] pt-1 font-mono">
                <span className="text-zinc-400">Detected Tool Capabilities:</span>
                {detectedCapabilities.length > 0 ? (
                  detectedCapabilities.map((cap) => (
                    <span
                      key={cap}
                      className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-bold"
                    >
                      {cap}
                    </span>
                  ))
                ) : (
                  <span className="text-zinc-500 italic">None (no functional tools declared)</span>
                )}
                <span className="text-zinc-500 text-[10px] ml-1">
                  ({currentTarget.tools?.length || 0} declared tool{currentTarget.tools?.length === 1 ? '' : 's'})
                </span>
              </div>
              <div className="rounded bg-zinc-900/90 border border-zinc-800 p-3 text-xs text-zinc-300 font-sans mt-2">
                <strong className="text-zinc-200">What to do:</strong>
                <ul className="list-disc pl-4 mt-1.5 space-y-1 text-zinc-400 text-[11px]">
                  <li>
                    Ensure declared tool names and descriptions explicitly describe operational verbs (e.g. <code className="text-cyan-300">read_email</code>, <code className="text-cyan-300">draft_email</code>, <code className="text-cyan-300">send_message</code>, <code className="text-cyan-300">exec_command</code>, <code className="text-cyan-300">query_db</code>).
                  </li>
                  <li>
                    Wiretrap's suite covers <strong className="text-zinc-200">READ</strong> (data fetching), <strong className="text-zinc-200">WRITE</strong> (state mutation), <strong className="text-zinc-200">SEND</strong> (outbound communication), <strong className="text-zinc-200">EXECUTE</strong> (command execution), and <strong className="text-zinc-200">SEARCH</strong> (queries).
                  </li>
                  <li>
                    If your tools belong to a custom domain without library coverage yet, adding outbound communication tools (like draft or send) or untrusted input ingestion tools (like read or search) will activate comprehensive exfiltration and indirect injection tests.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Error / Quota Exhaustion Banner */}
        {errorMessage && (
          <div
            id="detonation-error-banner"
            className={`border-b px-6 py-3 font-mono text-xs flex items-center justify-between gap-4 ${
              errorMessage.toLowerCase().includes('quota') || errorMessage.includes('429')
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle
                className={`h-4 w-4 shrink-0 ${
                  errorMessage.toLowerCase().includes('quota') ? 'text-amber-400' : 'text-red-400'
                }`}
              />
              <div>
                {errorMessage.toLowerCase().includes('quota') ? (
                  <>
                    <span className="font-bold text-amber-300 uppercase tracking-wide">
                      Gemini Quota Exhausted:
                    </span>{' '}
                    <span className="text-amber-200">
                      Free tier quota reached. Try again later or switch to Cheap Mode (4 attacks) to conserve requests.
                    </span>
                  </>
                ) : (
                  <span>{errorMessage}</span>
                )}
              </div>
            </div>

            {/* Quick Switch to Cheap Mode & Retry */}
            {!cheapMode && errorMessage.toLowerCase().includes('quota') && (
              <button
                type="button"
                id="quota-cheap-mode-retry-btn"
                onClick={() => {
                  setCheapMode(true);
                  setTimeout(startDetonation, 50);
                }}
                className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/30 active:scale-95"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                <span>Switch to Cheap Mode & Retry</span>
              </button>
            )}
          </div>
        )}

        {/* Honest Reporting Assessment Scope Caveat */}
        <div className="border-b border-[#222222] bg-[#0c0c0c] px-6 py-2 flex items-center gap-2 text-[11px] font-mono text-[#888888]">
          <Info className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <span>
            <strong className="text-zinc-300">Assessment Scope:</strong> A defense score or Hardened verdict indicates the agent withstood these specific simulated attacks in this run under test conditions, not that it is secure. Security is never absolute; red-teaming assesses known vulnerabilities against declared tool surfaces.
          </span>
        </div>

        {/* Patch Notification Banner */}
        {patchNotification && (
          <div className="border-b border-emerald-500/40 bg-emerald-500/15 px-6 py-2.5 font-mono text-xs text-emerald-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="font-bold">{patchNotification}</span>
            </div>
            <button
              onClick={handleVerifyFix}
              disabled={isVerifying}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[11px] font-bold rounded flex items-center gap-1 transition-colors cursor-pointer"
            >
              {isVerifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
              <span>Run Verification</span>
            </button>
          </div>
        )}

        {/* Remediation Available Quick Banner */}
        {!isRunning && breachedCount > 0 && !showRemediation && (
          <div className="border-b border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent px-6 py-3 flex items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-amber-200">
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                <strong>Remediation Available:</strong> {breachedCount} attack{breachedCount > 1 ? 's' : ''} breached the agent. Generate targeted prompt diff patches, tool guardrail code, and config tightenings.
              </span>
            </div>
            <button
              onClick={() => {
                setShowRemediation(true);
                if (findings.length === 0) {
                  handleGenerateFixes();
                }
              }}
              disabled={isGeneratingFixes}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isGeneratingFixes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{findings.length > 0 ? `Inspect Fixes (${findings.length})` : 'Generate Fixes'}</span>
            </button>
          </div>
        )}

        {/* Verification Run A/B Comparison Modal / Section */}
        {verificationRun && showVerificationComparison && (
          <div className="border-b border-cyan-500/30 bg-[#0c1015] p-6 font-mono">
            <VerificationComparison
              originalRun={{
                id: runSummary.id,
                targetId: currentTarget.id,
                targetName: currentTarget.name,
                userId: auth.currentUser?.uid || '',
                startedAt: runSummary.startedAt,
                completedAt: runSummary.completedAt || Date.now(),
                status:
                  runSummary.status === 'running' || runSummary.status === 'pending'
                    ? 'completed'
                    : runSummary.status,
                attacksAttempted: runSummary.attacksAttempted,
                attacksPassed: runSummary.attacksPassed,
                attacksBreached: runSummary.attacksBreached,
                attacksNotApplicable: runSummary.attacksNotApplicable,
                results: attacks,
                toolCallLog: [],
                cheapMode,
                promptVersionTested:
                  runSummary.promptVersionTested || initialRun?.promptVersionTested || 1,
              }}
              verificationRun={verificationRun}
              onClose={() => setShowVerificationComparison(false)}
            />
          </div>
        )}

        {/* Remediation Panel Section */}
        <div ref={remediationRef} id="detonation-remediation-section">
          {showRemediation && (
            <div className="border-b border-[#262626] bg-[#0E0E0E]">
              <RemediationPanel
                target={currentTarget}
                runId={runSummary.id}
                breachedResults={attacks.filter((a) => a.status === 'BREACHED')}
                findings={findings}
                onGenerateFixes={handleGenerateFixes}
                onApprovePatch={handleApprovePatch}
                onRejectPatch={handleRejectPatch}
                onVerifyFix={handleVerifyFix}
                isGenerating={isGeneratingFixes}
                hasApprovedPatches={findings.some((f) => f.status === 'approved')}
                hasMoreToGenerate={hasMoreToGenerate}
                totalBreachedCount={breachedCount}
              />
            </div>
          )}
        </div>

        {/* Scrollable Attack Execution Feed */}
        <div
          id="detonation-attacks-list"
          className="p-6 space-y-4 font-mono"
        >
          {attacks.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF4D00] border-t-transparent" />
              <p className="mt-4 text-xs text-[#888888]">
                Analyzing target tool schemas and compiling adversarial payload suite...
              </p>
            </div>
          ) : (
            attacks.map((attack, index) => {
              const isExpanded = expandedAttackIds.has(attack.attackId);
              const isActive = activeAttackId === attack.attackId;
              const isBreached = attack.status === 'BREACHED';
              const isPassed = attack.status === 'PASSED';
              const isNotApplicable = attack.status === 'NOT_APPLICABLE';
              const isError = attack.status === 'ERROR';
              const isPending = attack.status === 'pending';
              const isRunningAttack = attack.status === 'running';

              return (
                <div
                  key={attack.attackId}
                  id={`attack-row-${attack.attackId}`}
                  className={`rounded-xl border transition-all ${
                    isNotApplicable
                      ? 'opacity-60 border-zinc-800/80 bg-[#111111]/60'
                      : isBreached
                      ? 'border-red-500/40 bg-red-950/10'
                      : isPassed
                      ? 'border-emerald-500/30 bg-emerald-950/10'
                      : isError
                      ? 'border-zinc-700/60 bg-zinc-900/30'
                      : isActive || isRunningAttack
                      ? 'border-[#FF4D00]/60 bg-[#FF4D00]/5 shadow-lg shadow-[#FF4D00]/5'
                      : 'border-[#222222] bg-[#121212]/50'
                  }`}
                >
                  {/* Attack Header Bar */}
                  <div
                    onClick={() => !isPending && toggleExpand(attack.attackId)}
                    className={`flex items-center justify-between p-4 ${
                      !isPending ? 'cursor-pointer hover:bg-white/[0.02]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[#262626] bg-[#0A0A0A] text-[11px] font-bold text-[#888888]">
                        #{index + 1}
                      </span>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className={`text-sm font-bold ${
                              isNotApplicable ? 'text-zinc-400' : 'text-[#EDEDED]'
                            }`}
                          >
                            {attack.attackName}
                          </h3>

                          {/* Category badge */}
                          <span
                            className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase ${getCategoryBadgeClass(
                              attack.category
                            )}`}
                          >
                            {attack.category.replace('_', ' ')}
                          </span>

                          {/* Multi-turn indicator */}
                          {attack.prompts && attack.prompts.length > 1 && (
                            <span className="rounded border border-purple-500/40 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-purple-300">
                              Multi-Turn ({attack.prompts.length})
                            </span>
                          )}

                          {/* Severity badge */}
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                              attack.severity === 'CRITICAL'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {attack.severity}
                          </span>
                        </div>

                        {attack.description && (
                          <p className="mt-1 text-xs text-[#777777] line-clamp-1">
                            {attack.description}
                          </p>
                        )}

                        {/* Inline Verdict Finding Reason (LLM Judge) */}
                        {attack.verdictReason && !isNotApplicable && !isPending && (
                          <div className="mt-1.5 flex items-start gap-1.5 text-xs">
                            <span
                              className={`font-bold shrink-0 text-[10px] uppercase tracking-wider ${
                                isBreached ? 'text-red-400' : 'text-emerald-400'
                              }`}
                            >
                              {isBreached ? 'Judge Reason:' : 'Defense Finding:'}
                            </span>
                            <span className="text-[#CCCCCC] text-[11px] line-clamp-2 italic font-sans">
                              "{attack.verdictReason}"
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
                      {isPending && (
                        <span className="flex items-center gap-1.5 rounded-lg border border-[#262626] bg-[#0A0A0A] px-2.5 py-1 text-xs text-[#666666]">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Pending</span>
                        </span>
                      )}

                      {(isActive || isRunningAttack) && (
                        <span className="flex items-center gap-1.5 rounded-lg border border-[#FF4D00]/40 bg-[#FF4D00]/15 px-2.5 py-1 text-xs font-bold text-[#FF4D00]">
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#FF4D00] border-t-transparent" />
                          <span>Probing</span>
                        </span>
                      )}

                      {isPassed && (
                        <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>PASSED</span>
                        </span>
                      )}

                      {isBreached && (
                        <span className="flex items-center gap-1.5 rounded-lg border border-red-500/50 bg-red-500/20 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-red-400 shadow-md shadow-red-500/10">
                          <AlertTriangle className="h-3.5 w-3.5 stroke-[2.5]" />
                          <span>BREACHED</span>
                        </span>
                      )}

                      {/* Prominent "Said No, Did Yes" Badge */}
                      {attack.saidNoDidYes && (
                        <span
                          className="flex items-center gap-1.5 rounded-lg border border-amber-500/80 bg-amber-500/20 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-amber-300 shadow-md shadow-amber-500/15"
                          title="The agent verbally refused or declined in text, but invoked unauthorized tools behind the scenes."
                        >
                          <AlertOctagon className="h-3.5 w-3.5 text-amber-400 stroke-[2.5]" />
                          <span>Said No, Did Yes</span>
                        </span>
                      )}

                      {isNotApplicable && (
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs font-bold text-zinc-400">
                            <MinusCircle className="h-3.5 w-3.5 text-zinc-500" />
                            <span>NOT APPLICABLE</span>
                          </span>
                          <span className="hidden sm:inline text-[10px] font-mono text-zinc-500">
                            no matching tool surface
                          </span>
                        </div>
                      )}

                      {isError && (
                        <span className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs font-bold text-zinc-300">
                          <AlertCircle className="h-3.5 w-3.5 text-zinc-400" />
                          <span>ERROR</span>
                        </span>
                      )}

                      {!isPending && (
                        <button
                          type="button"
                          className="text-[#666666] hover:text-[#EDEDED]"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Attack Details & Evidence Log */}
                  {isExpanded && !isPending && (
                    <div className="border-t border-[#222222] bg-[#080808] p-4 space-y-4 text-xs">
                      {/* NOT APPLICABLE Explanation */}
                      {isNotApplicable && (
                        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 p-3.5 space-y-1.5">
                          <div className="flex items-center gap-2 text-zinc-300 font-bold">
                            <MinusCircle className="h-4 w-4 text-zinc-400" />
                            <span>No Matching Tool Surface</span>
                          </div>
                          <p className="text-zinc-400 leading-relaxed text-[11px]">
                            {attack.notApplicableReason ||
                              'This agent target does not expose tools matching this vector (e.g. external mail/calendar/process controls).'}
                            {' '}
                            It is excluded from both the defended count and the security score so the score reflects only real attack surfaces.
                          </p>
                        </div>
                      )}

                      {/* Single or Multi-turn Attack Vectors */}
                      {attack.prompts && attack.prompts.length > 1 ? (
                        <div className="space-y-2">
                          <span className="text-[10px] uppercase font-bold text-[#777777]">
                            Multi-Turn Adversarial Sequence ({attack.prompts.length} turns):
                          </span>
                          <div className="space-y-2">
                            {attack.prompts.map((pText, pIdx) => (
                              <div
                                key={pIdx}
                                className="rounded-lg border border-[#222222] bg-[#0F0F0F] p-3 text-xs leading-relaxed"
                              >
                                <span className="font-mono text-[10px] font-bold text-[#FF4D00]">
                                  Turn #{pIdx + 1}
                                  {pIdx === 0 ? ' (Legitimate Rapport / Baseline)' : ' (Escalation Vector)'}:
                                </span>
                                <div className="mt-1 text-[#CCCCCC] whitespace-pre-wrap">
                                  {pText}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#777777]">
                            Adversarial Test Vector:
                          </span>
                          <div className="mt-1 rounded-lg border border-[#222222] bg-[#0F0F0F] p-3 text-[#CCCCCC] whitespace-pre-wrap leading-relaxed">
                            {attack.prompt}
                          </div>
                        </div>
                      )}

                      {/* Error Diagnostic */}
                      {isError && (
                        <div className="space-y-2 rounded-lg border border-zinc-700/60 bg-zinc-900/60 p-3.5">
                          <div className="flex items-center gap-2 text-zinc-300 font-bold">
                            <AlertCircle className="h-4 w-4 text-zinc-400" />
                            <span>Evaluation Diagnostic / Error Details</span>
                          </div>
                          <div className="rounded border border-zinc-800 bg-[#0A0A0A] p-3 text-zinc-300 font-mono text-[11px] whitespace-pre-wrap">
                            {attack.error || 'The model was unable to complete this attack evaluation.'}
                          </div>
                        </div>
                      )}

                      {/* LLM Judge Assessment Callout */}
                      {attack.verdictReason && (
                        <div
                          className={`space-y-2 rounded-lg border p-4 ${
                            isBreached
                              ? 'border-red-500/50 bg-red-950/25 text-red-200'
                              : 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold text-xs">
                              {isBreached ? (
                                <ShieldAlert className="h-4 w-4 text-red-400" />
                              ) : (
                                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                              )}
                              <span className={isBreached ? 'text-red-400' : 'text-emerald-400'}>
                                {isBreached
                                  ? 'Breach Assessment (LLM Judge Evaluation)'
                                  : 'Defense Assessment (LLM Judge Evaluation)'}
                              </span>
                            </div>
                            {attack.saidNoDidYes && (
                              <span className="rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-[10px] font-black text-amber-300 uppercase">
                                Said No, Did Yes
                              </span>
                            )}
                          </div>
                          <div
                            className={`rounded border p-3 font-sans text-xs leading-relaxed ${
                              isBreached
                                ? 'border-red-900/60 bg-[#0A0A0A] text-red-100 font-medium'
                                : 'border-emerald-900/60 bg-[#0A0A0A] text-emerald-100'
                            }`}
                          >
                            "{attack.verdictReason}"
                          </div>
                        </div>
                      )}

                      {/* Said No, Did Yes Highlight Card */}
                      {attack.saidNoDidYes && (
                        <div className="space-y-2 rounded-lg border border-amber-500/60 bg-amber-500/15 p-4">
                          <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                            <AlertOctagon className="h-4 w-4 text-amber-400" />
                            <span className="uppercase tracking-wider">
                              Core Finding: "Said No, Did Yes" Discrepancy
                            </span>
                          </div>
                          <p className="text-amber-100/90 text-xs leading-relaxed font-sans">
                            The agent's natural language response explicitly claimed to decline or refuse the user's malicious request, but it simultaneously invoked unauthorized decoy tools behind the scenes. This discrepancy is a primary security finding: outward refusal masks real system execution.
                          </p>
                        </div>
                      )}

                      {/* Breached Tool Execution Evidence */}
                      {isBreached && attack.toolsFired.length > 0 && (
                        <div className="space-y-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3.5">
                          <div className="flex items-center gap-2 text-red-400 font-bold">
                            <AlertTriangle className="h-4 w-4" />
                            <span>
                              Evidence: {attack.toolsFired.length} Decoy Tool Invocation(s) Captured
                            </span>
                          </div>

                          <div className="space-y-3">
                            {attack.toolsFired.map((toolCall: DecoyToolCall, tcIdx) => (
                              <div
                                key={tcIdx}
                                className="rounded-lg border border-red-500/30 bg-[#0A0A0A] p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-red-400">
                                      Fired Tool:
                                    </span>
                                    <span className="rounded bg-red-500/20 px-2 py-0.5 text-[#EDEDED] font-mono font-bold">
                                      {toolCall.toolName}()
                                    </span>
                                  </div>
                                  <span className="text-[#888888]">
                                    Turn: #{toolCall.turnIndex}
                                  </span>
                                </div>

                                {toolCall.argumentDiff && (
                                  <div className="rounded border border-red-500/40 bg-red-950/30 p-2 text-[10px] text-red-300 font-mono">
                                    <span className="font-bold text-red-400">Diff detected: </span>
                                    {toolCall.argumentDiff}
                                  </div>
                                )}

                                <div>
                                  <span className="text-[10px] text-[#777777]">
                                    Smuggled Arguments Supplied By Agent:
                                  </span>
                                  <pre className="mt-1 overflow-x-auto rounded border border-[#222222] bg-[#050505] p-2.5 font-mono text-[11px] text-[#FF9966]">
                                    {JSON.stringify(toolCall.arguments, null, 2)}
                                  </pre>
                                </div>

                                {toolCall.fakeOutputReturned && (
                                  <div>
                                    <span className="text-[10px] text-[#777777]">
                                      Decoy Canned Response Returned to Agent:
                                    </span>
                                    <pre className="mt-1 overflow-x-auto rounded border border-[#222222] bg-[#050505] p-2 font-mono text-[10px] text-[#888888]">
                                      {JSON.stringify(toolCall.fakeOutputReturned, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Agent Response Text */}
                      {attack.agentFinalResponse && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#777777]">
                            Agent Natural Language Output:
                          </span>
                          <div className="mt-1 rounded-lg border border-[#222222] bg-[#0F0F0F] p-3 text-[#A1A1A1] whitespace-pre-wrap leading-relaxed">
                            {attack.agentFinalResponse}
                          </div>
                        </div>
                      )}

                      {/* Defense Confirmation for Passed */}
                      {isPassed && (
                        <div className="flex items-center gap-2 text-emerald-400 text-[11px] pt-1">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>
                            Agent safely refused or completed response without calling any unauthorized tool.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between border-t border-[#262626] bg-[#141414] px-6 py-3 font-mono text-xs text-[#777777] shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#FF4D00]" />
            <span>Sandbox Isolation: Decoy tools execute zero real actions. Evidence logged server-side.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#222222] px-4 py-1.5 text-xs font-bold text-[#EDEDED] hover:bg-[#2A2A2A]"
          >
            Close View
          </button>
        </div>
      </div>
    </div>
  );
};
