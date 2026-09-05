import React from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Layers,
} from 'lucide-react';
import type { DetonationRun, AttackExecutionResult, AttackTransition } from '../types';

interface VerificationComparisonProps {
  originalRun: DetonationRun;
  verificationRun: DetonationRun;
  onClose: () => void;
  onGenerateMoreFixes?: () => void;
}

export const VerificationComparison: React.FC<VerificationComparisonProps> = ({
  originalRun,
  verificationRun,
  onClose,
  onGenerateMoreFixes,
}) => {
  // Compute scores
  const calcScore = (run: DetonationRun) => {
    const applicable = run.results.filter(
      (r) => r.status === 'PASSED' || r.status === 'BREACHED'
    ).length;
    if (applicable === 0) return null;
    return Math.round((run.attacksPassed / applicable) * 100);
  };

  const beforeScore = calcScore(originalRun);
  const afterScore = calcScore(verificationRun);

  // Derive version numbers directly from the respective run records
  const beforeVersion = originalRun.promptVersionTested || 1;
  const afterVersion =
    typeof verificationRun.promptVersionTested === 'number' &&
    verificationRun.promptVersionTested > beforeVersion
      ? verificationRun.promptVersionTested
      : typeof verificationRun.promptVersionTested === 'number' &&
        verificationRun.promptVersionTested > 1
      ? verificationRun.promptVersionTested
      : beforeVersion + 1;

  // Map transitions per attack
  const transitions: AttackTransition[] = originalRun.results
    .filter((r) => r.status === 'BREACHED')
    .map((beforeResult) => {
      const afterResult = verificationRun.results.find(
        (r) => r.attackId === beforeResult.attackId
      );
      const afterStatus = afterResult ? afterResult.status : 'ERROR';

      let transitionType: 'RESOLVED' | 'STILL_BREACHED' | 'REGRESSED' | 'UNCHANGED' =
        'STILL_BREACHED';
      let explanation = '';

      if (afterStatus === 'PASSED') {
        transitionType = 'RESOLVED';
        explanation = 'Attack successfully neutralized. Agent prevented unauthorized decoy tool execution.';
      } else if (afterStatus === 'BREACHED') {
        transitionType = 'STILL_BREACHED';
        explanation =
          'Fix did not hold: The prompt patch failed to stop this attack payload. Agent still fired unauthorized tools.';
      } else {
        transitionType = 'UNCHANGED';
        explanation = 'Inconclusive or test error during re-evaluation.';
      }

      return {
        attackId: beforeResult.attackId,
        attackName: beforeResult.attackName,
        category: beforeResult.category,
        severity: beforeResult.severity,
        beforeStatus: beforeResult.status,
        afterStatus,
        transition: transitionType,
        explanation,
      };
    });

  const resolvedCount = transitions.filter((t) => t.transition === 'RESOLVED').length;
  const stillBreachedCount = transitions.filter((t) => t.transition === 'STILL_BREACHED').length;
  const totalBreachesTested = transitions.length;

  const isAllResolved = totalBreachesTested > 0 && stillBreachedCount === 0;

  return (
    <div
      id="verification-comparison-modal"
      className="border border-emerald-500/40 bg-[#0c0c0c] rounded-lg shadow-2xl overflow-hidden text-zinc-200 my-6"
    >
      {/* Header */}
      <div className="bg-[#141414] border-b border-[#262626] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm font-bold text-[#EDEDED] uppercase tracking-wide">
                Remediation Verification & Comparative Analysis
              </h3>
              <span className="rounded bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                A/B Re-run
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Empirical re-testing of the exact breached attack suite against the newly hardened
              system prompt.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-zinc-300 text-xs font-mono rounded border border-zinc-700 transition-colors cursor-pointer"
        >
          Close Comparison
        </button>
      </div>

      {/* Before / After Comparison Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-b border-[#222222] bg-[#101010]">
        {/* BEFORE RUN */}
        <div className="p-5 border-b md:border-b-0 md:border-r border-[#222222]">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Before Patches (Baseline Run)</span>
            <span id="comparison-before-version" className="text-zinc-400 font-bold">
              v{beforeVersion}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span
              className={`font-mono text-3xl font-black ${
                beforeScore !== null && beforeScore < 50 ? 'text-red-400' : 'text-amber-400'
              }`}
            >
              {beforeScore !== null ? `${beforeScore}%` : 'N/A'}
            </span>
            <span className="text-xs text-zinc-400 font-mono">Defense Score</span>
          </div>
          <div className="mt-2 text-xs font-mono text-zinc-400 flex items-center gap-3">
            <span className="text-red-400">Breached: {originalRun.attacksBreached}</span>
            <span className="text-emerald-400">Defended: {originalRun.attacksPassed}</span>
          </div>
        </div>

        {/* TRANSITION DELTA */}
        <div className="p-5 flex flex-col justify-center items-center text-center border-b md:border-b-0 md:border-r border-[#222222] bg-[#0d140e]">
          <div className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider mb-1">
            Verification Delta
          </div>
          <div className="flex items-center gap-2 font-mono text-2xl font-black text-emerald-300">
            <span>{resolvedCount} / {totalBreachesTested}</span>
            <span className="text-xs font-normal text-emerald-400/80 uppercase">Resolved</span>
          </div>
          <div className="mt-1 text-[11px] font-mono text-zinc-400">
            {stillBreachedCount > 0 ? (
              <span className="text-amber-400 font-bold">
                {stillBreachedCount} vector{stillBreachedCount > 1 ? 's' : ''} still breached
              </span>
            ) : (
              <span className="text-emerald-400 font-bold">100% Breaches Closed</span>
            )}
          </div>
        </div>

        {/* AFTER RUN */}
        <div className="p-5">
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>After Patches (Verification Run)</span>
            <span id="comparison-after-version" className="text-emerald-400 font-bold">
              v{afterVersion}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span
              className={`font-mono text-3xl font-black ${
                afterScore !== null && afterScore >= 80
                  ? 'text-emerald-400'
                  : afterScore !== null && afterScore >= 50
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {afterScore !== null ? `${afterScore}%` : 'N/A'}
            </span>
            <span className="text-xs text-zinc-400 font-mono">Defense Score</span>
          </div>
          <div className="mt-2 text-xs font-mono text-zinc-400 flex items-center gap-3">
            <span className="text-red-400">Breached: {verificationRun.attacksBreached}</span>
            <span className="text-emerald-400">Defended: {verificationRun.attacksPassed}</span>
          </div>
        </div>
      </div>

      {/* Outcome Banner */}
      <div
        className={`px-6 py-3 border-b flex items-start gap-3 font-mono text-xs ${
          isAllResolved
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
            : 'bg-amber-500/15 border-amber-500/30 text-amber-200'
        }`}
      >
        {isAllResolved ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div>
          <span className="font-bold uppercase tracking-wider">
            {isAllResolved
              ? 'Verification Confirmed: All targeted attack vectors neutralized'
              : 'Partial Remediation: Some attacks still breached the target agent'}
          </span>
          <p className="mt-0.5 text-xs text-zinc-300 font-sans leading-relaxed">
            {isAllResolved
              ? 'The approved prompt patches successfully blocked the re-executed adversarial attacks. Decoy tools were safely protected.'
              : 'The prompt patches closed some vectors, but the agent still succumbed to remaining attack vectors. Implement the generated Guardrail Code and Config Changes for defense-in-depth.'}
          </p>
        </div>
      </div>

      {/* Honest Reporting Mandatory Caveat */}
      <div className="bg-[#0a0a0a] border-b border-[#222222] px-6 py-2.5 flex items-start gap-2.5 text-[11px] font-mono text-[#888888]">
        <Info className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
        <span>
          <strong className="text-zinc-200">Plain-English Caveat:</strong> This verification means the
          agent withstood these specific attacks in this run under test conditions, not that it is
          secure. Never imply completeness. Adversarial testing tests declared tool surfaces against
          simulated threats, but no automated test guarantees absolute safety.
        </span>
      </div>

      {/* Per-Attack Transitions Table */}
      <div className="p-6">
        <h4 className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">
          Per-Attack Transition Log ({transitions.length} Tested)
        </h4>

        <div className="space-y-2.5">
          {transitions.map((t) => {
            const isResolved = t.transition === 'RESOLVED';
            return (
              <div
                key={t.attackId}
                id={`transition-row-${t.attackId}`}
                className={`rounded border p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono text-xs ${
                  isResolved
                    ? 'border-emerald-500/30 bg-emerald-950/15'
                    : 'border-red-500/40 bg-red-950/20'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-100">{t.attackName}</span>
                    <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                      {t.category}
                    </span>
                    <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                      {t.severity}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 font-sans mt-1">
                    {t.explanation}
                  </p>
                </div>

                {/* Transition Flow: BREACHED -> PASSED or STILL BREACHED */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded bg-red-950 border border-red-800 px-2 py-1 text-[11px] font-bold text-red-400">
                    BREACHED
                  </span>
                  <ArrowRight className="h-4 w-4 text-zinc-400" />
                  {isResolved ? (
                    <span className="rounded bg-emerald-950 border border-emerald-600 px-2.5 py-1 text-[11px] font-bold text-emerald-300 flex items-center gap-1 shadow-sm">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      PASSED (NEUTRALIZED)
                    </span>
                  ) : (
                    <span className="rounded bg-red-900 border border-red-500 px-2.5 py-1 text-[11px] font-bold text-red-200 flex items-center gap-1 shadow-sm animate-pulse">
                      <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
                      STILL BREACHED
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
