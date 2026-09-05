import React, { useState, useEffect } from 'react';
import {
  History,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Check,
  ChevronDown,
  ChevronUp,
  FileDiff,
  Info,
  TrendingUp,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { AgentTarget, DetonationRun, TargetPromptVersion, RemediationFinding } from '../types';
import { subscribeTargetVersions, subscribeTargetFindings, auth } from '../lib/firebase';

interface VersionHistoryPanelProps {
  userId: string;
  target: AgentTarget;
  pastRuns: DetonationRun[];
  onTargetUpdated?: (updatedTarget: AgentTarget) => void;
  onOpenRun?: (run: DetonationRun) => void;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  userId,
  target,
  pastRuns,
  onTargetUpdated,
  onOpenRun,
}) => {
  const [versions, setVersions] = useState<TargetPromptVersion[]>([]);
  const [findings, setFindings] = useState<RemediationFinding[]>([]);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Subscribe to versions and findings
  useEffect(() => {
    if (!userId || !target.id) return;

    const unsubVersions = subscribeTargetVersions(
      userId,
      target.id,
      (list) => setVersions(list),
      (err) => console.warn('Versions subscription warning:', err)
    );

    const unsubFindings = subscribeTargetFindings(
      userId,
      target.id,
      (list) => setFindings(list),
      (err) => console.warn('Findings subscription warning:', err)
    );

    return () => {
      unsubVersions();
      unsubFindings();
    };
  }, [userId, target.id]);

  const currentVersionNumber = target.promptVersion || 1;

  // Handle Rollback
  const handleRollback = async (versionNumber: number) => {
    if (!auth.currentUser || rollingBackVersion !== null) return;
    const confirmRollback = window.confirm(
      `Roll back system prompt to the content of v${versionNumber}? This will create a new audit version record and update the active target prompt.`
    );
    if (!confirmRollback) return;

    setRollingBackVersion(versionNumber);
    setErrorMessage(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch(`/api/targets/${target.id}/versions/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetVersionNumber: versionNumber }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to rollback version');
      }

      const data = await resp.json();
      setNotification(`Prompt rolled back to v${versionNumber} (now active as v${data.newVersion})`);
      setTimeout(() => setNotification(null), 5000);

      if (onTargetUpdated) {
        onTargetUpdated({
          ...target,
          systemPrompt: data.systemPrompt,
          promptVersion: data.newVersion,
          updatedAt: Date.now(),
        });
      }
    } catch (err: any) {
      console.error('Rollback error:', err);
      setErrorMessage(err.message || 'Rollback failed');
    } finally {
      setRollingBackVersion(null);
    }
  };

  // Chronological score history across runs
  const sortedRuns = [...pastRuns].sort((a, b) => a.startedAt - b.startedAt);
  const scoreData = sortedRuns.map((run) => {
    const applicable = run.results.filter(
      (r) => r.status === 'PASSED' || r.status === 'BREACHED'
    ).length;
    const score = applicable > 0 ? Math.round((run.attacksPassed / applicable) * 100) : null;
    return {
      runId: run.id,
      date: new Date(run.startedAt).toLocaleDateString(),
      time: new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      score,
      passed: run.attacksPassed,
      breached: run.attacksBreached,
      isVerification: Boolean(run.isVerificationRun),
      promptVersion: run.promptVersionTested || 1,
      run,
    };
  });

  return (
    <div id="version-history-panel" className="space-y-6">
      {/* Notifications */}
      {notification && (
        <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-3 font-mono text-xs text-emerald-300 flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg bg-red-500/15 border border-red-500/30 p-3 font-mono text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 1. SCORE OVER TIME TIMELINE */}
      <div className="rounded-xl border border-[#262626] bg-[#141414] p-5">
        <div className="flex items-center justify-between border-b border-[#262626] pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#FF4D00]" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#EDEDED]">
              Score Over Time Across Detonation Runs
            </h3>
          </div>
          <span className="font-mono text-[10px] text-zinc-500">
            {pastRuns.length} total run{pastRuns.length !== 1 ? 's' : ''} recorded
          </span>
        </div>

        {scoreData.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-zinc-500">
            No test runs completed yet. Detonate this agent target to record defense scores.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Visual Mini Trend Strip */}
            <div className="flex items-end gap-2 h-24 pt-4 px-2 border-b border-[#222222] overflow-x-auto">
              {scoreData.map((item, idx) => {
                const heightPercent = item.score !== null ? Math.max(15, item.score) : 10;
                const barColor =
                  item.score !== null
                    ? item.score >= 80
                      ? 'bg-emerald-500 hover:bg-emerald-400'
                      : item.score >= 50
                      ? 'bg-amber-500 hover:bg-amber-400'
                      : 'bg-red-500 hover:bg-red-400'
                    : 'bg-zinc-700';

                return (
                  <div
                    key={item.runId}
                    onClick={() => onOpenRun && onOpenRun(item.run)}
                    className="flex-1 min-w-[48px] max-w-[80px] flex flex-col items-center gap-1 cursor-pointer group"
                    title={`Run #${idx + 1}: ${item.score !== null ? item.score + '%' : 'N/A'} (v${item.promptVersion})`}
                  >
                    <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-100 transition-colors">
                      {item.score !== null ? `${item.score}%` : '—'}
                    </span>
                    <div className="w-full bg-[#1c1c1c] rounded-t overflow-hidden h-14 flex items-end">
                      <div
                        className={`w-full rounded-t transition-all ${barColor}`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-zinc-500 truncate w-full text-center">
                      {item.isVerification ? 'Verify' : `R${idx + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Honest Reporting Caveat */}
            <div className="flex items-start gap-2 bg-[#0d0d0d] rounded p-2.5 text-[11px] font-mono text-zinc-400 border border-[#222222]">
              <Info className="h-3.5 w-3.5 text-zinc-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-zinc-300">Assessment Caveat:</strong> A score indicates the
                agent withstood specific tested attacks in that specific run. Never interpret any
                score as complete or universal safety.
              </span>
            </div>

            {/* Run List */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {scoreData.slice().reverse().map((item, idx) => (
                <div
                  key={item.runId}
                  onClick={() => onOpenRun && onOpenRun(item.run)}
                  className="rounded border border-[#222222] bg-[#0c0c0c] hover:border-[#333333] p-2.5 flex items-center justify-between text-xs font-mono transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        item.score !== null && item.score >= 80
                          ? 'bg-emerald-400'
                          : item.score !== null && item.score >= 50
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                      }`}
                    />
                    <span className="font-bold text-zinc-200">
                      {item.isVerification ? 'Verification Run' : `Detonation Run`}
                    </span>
                    <span className="text-[10px] text-zinc-500 bg-zinc-800/60 px-1.5 py-0.5 rounded">
                      Tested v{item.promptVersion}
                    </span>
                    <span className="text-zinc-500 text-[11px]">
                      {item.date} {item.time}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400">{item.passed} Pass</span>
                    <span className="text-red-400">{item.breached} Breached</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded ${
                        item.score !== null && item.score >= 80
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : item.score !== null && item.score >= 50
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {item.score !== null ? `${item.score}%` : 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. PROMPT VERSION HISTORY & ROLLBACK */}
      <div className="rounded-xl border border-[#262626] bg-[#141414] p-5">
        <div className="flex items-center justify-between border-b border-[#262626] pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#FF4D00]" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#EDEDED]">
              Audited Prompt Version History ({versions.length || 1} Versions)
            </h3>
          </div>
          <span className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 font-mono text-[10px] text-amber-300 font-bold">
            Active: v{currentVersionNumber}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {versions.length === 0 ? (
            <div className="rounded border border-[#222222] bg-[#0d0d0d] p-4 font-mono text-xs text-zinc-400 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400">v1 (Current Baseline)</span>
                <span className="text-[10px] text-zinc-500">Initial Setup</span>
              </div>
              <p className="text-zinc-500 text-[11px]">
                No patch approvals recorded yet. When you approve prompt patches in the Remediation
                Engine, each version is strictly archived here with full rollback capability.
              </p>
            </div>
          ) : (
            versions.map((ver) => {
              const isActive = ver.versionNumber === currentVersionNumber;
              const isExpanded = expandedVersionId === ver.id;
              const isRollingBack = rollingBackVersion === ver.versionNumber;

              return (
                <div
                  key={ver.id}
                  id={`version-card-v${ver.versionNumber}`}
                  className={`rounded-lg border transition-all ${
                    isActive
                      ? 'border-emerald-500/40 bg-[#0f1711]'
                      : 'border-[#222222] bg-[#0c0c0c]'
                  }`}
                >
                  <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        }`}
                      >
                        v{ver.versionNumber}
                      </span>
                      {isActive && (
                        <span className="font-mono text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                          ● Active Prompt
                        </span>
                      )}
                      <span className="font-mono text-xs text-zinc-300">
                        {ver.changeReason || 'Prompt Update'}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {new Date(ver.appliedAt).toLocaleDateString()}{' '}
                        {new Date(ver.appliedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() =>
                          setExpandedVersionId(isExpanded ? null : ver.id)
                        }
                        className="px-2.5 py-1 text-xs font-mono text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded bg-[#181818] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <FileDiff className="h-3 w-3" />
                        <span>{isExpanded ? 'Hide Prompt' : 'View Prompt'}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>

                      {!isActive && (
                        <button
                          id={`rollback-to-v${ver.versionNumber}`}
                          onClick={() => handleRollback(ver.versionNumber)}
                          disabled={isRollingBack}
                          className="px-2.5 py-1 text-xs font-mono text-amber-300 hover:text-amber-200 border border-amber-500/40 hover:bg-amber-500/10 rounded bg-[#1a1612] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title={`Restore prompt content of v${ver.versionNumber}`}
                        >
                          {isRollingBack ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          <span>Roll Back to v{ver.versionNumber}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#202020] p-3.5 bg-[#080808]">
                      <div className="flex items-center justify-between pb-1.5 text-[11px] font-mono text-zinc-500">
                        <span>System Prompt Content:</span>
                        <span>{ver.systemPrompt.length} characters</span>
                      </div>
                      <pre className="max-h-60 overflow-y-auto rounded border border-[#222222] bg-[#050505] p-3 font-mono text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                        {ver.systemPrompt}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. PERSISTED REMEDIATION FINDINGS */}
      {findings.length > 0 && (
        <div className="rounded-xl border border-[#262626] bg-[#141414] p-5">
          <div className="flex items-center justify-between border-b border-[#262626] pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#EDEDED]">
                Persisted Remediation Findings ({findings.length})
              </h3>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {findings.map((f, idx) => (
              <div
                key={f.id}
                className="rounded border border-[#222222] bg-[#0c0c0c] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-200">
                      #{idx + 1} {f.rootCause}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                        f.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : f.status === 'rejected'
                          ? 'bg-zinc-800 text-zinc-400'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {f.status}
                    </span>
                  </div>
                  <p className="text-zinc-400 font-sans text-xs mt-0.5 line-clamp-1">
                    {f.description}
                  </p>
                </div>
                <div className="text-[10px] text-zinc-500 shrink-0">
                  {new Date(f.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
