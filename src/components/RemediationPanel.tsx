import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Shield,
  Code,
  Sliders,
  FileDiff,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Info,
  Loader2,
  ChevronRight,
  ExternalLink,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { AgentTarget, RemediationFinding, AttackExecutionResult } from '../types';

interface RemediationPanelProps {
  target: AgentTarget;
  runId: string;
  breachedResults: AttackExecutionResult[];
  findings: RemediationFinding[];
  onGenerateFixes: () => Promise<void>;
  onApprovePatch: (finding: RemediationFinding) => Promise<void>;
  onRejectPatch: (findingId: string) => Promise<void>;
  onVerifyFix: () => void;
  isGenerating: boolean;
  hasApprovedPatches: boolean;
  hasMoreToGenerate?: boolean;
  totalBreachedCount: number;
}

export const RemediationPanel: React.FC<RemediationPanelProps> = ({
  target,
  runId,
  breachedResults,
  findings,
  onGenerateFixes,
  onApprovePatch,
  onRejectPatch,
  onVerifyFix,
  isGenerating,
  hasApprovedPatches,
  hasMoreToGenerate = false,
  totalBreachedCount,
}) => {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [activeTabByFinding, setActiveTabByFinding] = useState<
    Record<string, 'prompt' | 'guardrail' | 'config'>
  >({});
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Close full-screen on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const getActiveTab = (findingId: string) => activeTabByFinding[findingId] || 'prompt';
  const setActiveTab = (findingId: string, tab: 'prompt' | 'guardrail' | 'config') => {
    setActiveTabByFinding((prev) => ({ ...prev, [findingId]: tab }));
  };

  const handleApprove = async (finding: RemediationFinding) => {
    setActionInProgressId(finding.id);
    try {
      await onApprovePatch(finding);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleReject = async (findingId: string) => {
    setActionInProgressId(findingId);
    try {
      await onRejectPatch(findingId);
    } finally {
      setActionInProgressId(null);
    }
  };

  const approvedCount = findings.filter((f) => f.status === 'approved').length;
  const pendingCount = findings.filter((f) => f.status === 'pending').length;

  const panelContent = (
    <div
      id="remediation-panel-container"
      className={`${
        isExpanded
          ? 'relative flex flex-col w-full h-[94vh] max-w-7xl rounded-2xl border border-zinc-700 bg-[#0c0c0c] shadow-2xl overflow-hidden'
          : 'border-t border-[#262626] bg-[#0c0c0c] text-zinc-200 flex flex-col'
      }`}
    >
      {/* Panel Header */}
      <div className="border-b border-[#222222] bg-[#141414] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm font-bold tracking-tight text-[#EDEDED] uppercase">
                Autonomous Security Remediation Engine
              </h3>
              <span className="rounded bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                Target: {target.name} (v{target.promptVersion || 1})
              </span>
              {isExpanded && (
                <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-mono text-amber-300 font-bold uppercase">
                  Full-Screen View
                </span>
              )}
            </div>
            <p className="text-xs text-[#888888] font-sans mt-0.5">
              Generates targeted prompt diff patches, deterministically enforced tool guardrails, and
              infrastructure config tightenings grouped by vulnerability root cause.
            </p>
          </div>
        </div>

        {/* Action Controls in Header */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {findings.length === 0 ? (
            <button
              id="generate-fixes-btn-main"
              onClick={onGenerateFixes}
              disabled={isGenerating || totalBreachedCount === 0}
              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-black font-mono text-xs font-bold rounded flex items-center gap-2 shadow-lg shadow-amber-950/20 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Synthesizing Fixes...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate Fixes ({totalBreachedCount} Breached)</span>
                </>
              )}
            </button>
          ) : (
            <>
              {hasMoreToGenerate && (
                <button
                  id="generate-more-fixes-btn"
                  onClick={onGenerateFixes}
                  disabled={isGenerating}
                  className="px-3 py-1.5 bg-[#1f1f1f] hover:bg-[#282828] text-amber-300 border border-amber-500/40 text-xs font-mono font-medium rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Quota note: generates up to 3 more findings per click"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  <span>Generate More Fixes (+3)</span>
                </button>
              )}

              {hasApprovedPatches && (
                <button
                  id="verify-fixes-btn-header"
                  onClick={onVerifyFix}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded flex items-center gap-2 shadow-md shadow-emerald-950/20 transition-all cursor-pointer animate-pulse"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>Verify Fixes (Re-run Attacks)</span>
                </button>
              )}
            </>
          )}

          {/* Full-Screen Expand / Collapse Toggle */}
          <button
            type="button"
            id="toggle-remediation-fullscreen-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="px-3 py-1.5 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-zinc-300 hover:text-white border border-zinc-700 text-xs font-mono rounded flex items-center gap-1.5 transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse to standard view (Esc)' : 'Expand full-screen'}
          >
            {isExpanded ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-amber-400" />
                <span>Collapse</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 text-amber-400" />
                <span>Expand</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Honest Reporting & Quota Caveat Banner */}
      <div className="border-b border-[#1f1f1f] bg-[#111111]/80 px-6 py-2 flex items-center justify-between text-[11px] font-mono text-zinc-400 shrink-0">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <span>
            <strong className="text-zinc-300">Policy:</strong> "Approve, never auto-apply." Prompt
            modifications are saved as audited versions. Quota limit: Max 3 root causes per click.
          </span>
        </div>
        {findings.length > 0 && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-zinc-400">
              Findings: <strong className="text-zinc-200">{findings.length}</strong>
            </span>
            <span className="text-emerald-400">
              Approved: <strong className="font-bold">{approvedCount}</strong>
            </span>
            <span className="text-amber-400">
              Pending: <strong className="font-bold">{pendingCount}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Body Content with Bounded Height and Internal Scroll */}
      <div
        className={`terminal-scrollbar overflow-y-auto ${
          isExpanded ? 'flex-1 min-h-0 p-6' : 'max-h-[56vh] p-6'
        }`}
      >
        {findings.length === 0 ? (
          <div className="py-12 text-center rounded-lg border border-dashed border-[#222222] bg-[#0e0e0e]">
            <Sparkles className="h-8 w-8 text-amber-400/60 mx-auto mb-3" />
            <h4 className="font-mono text-sm font-semibold text-zinc-300">
              No Remediation Plan Generated Yet
            </h4>
            <p className="text-xs text-zinc-500 font-sans max-w-md mx-auto mt-1 mb-5">
              Click "Generate Fixes" to let the Autonomous Fixer Agent group the {totalBreachedCount}{' '}
              breached attack{totalBreachedCount > 1 ? 's' : ''} by root cause and produce actionable
              prompt patches, runtime guardrail code, and configuration tightenings.
            </p>
            <button
              id="empty-state-generate-fixes-btn"
              onClick={onGenerateFixes}
              disabled={isGenerating || totalBreachedCount === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold rounded shadow-lg shadow-amber-950/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Synthesizing Remediation Plan...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Fixes for {totalBreachedCount} Breaches</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {findings.map((finding, index) => {
              const activeTab = getActiveTab(finding.id);
              const isApproved = finding.status === 'approved';
              const isRejected = finding.status === 'rejected';
              const isPending = finding.status === 'pending';
              const isProcessing = actionInProgressId === finding.id;

              return (
                <div
                  key={finding.id}
                  id={`finding-card-${finding.id}`}
                  className={`rounded-lg border transition-all ${
                    isApproved
                      ? 'border-emerald-500/40 bg-[#0f1912]'
                      : isRejected
                      ? 'border-zinc-800 bg-[#121212] opacity-60'
                      : 'border-[#2a2a2a] bg-[#121212] shadow-md'
                  }`}
                >
                  {/* Finding Top Bar */}
                  <div className="p-4 border-b border-[#202020] flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                          Root Cause #{index + 1}
                        </span>
                        <h4 className="font-mono text-sm font-bold text-zinc-100">
                          {finding.rootCause}
                        </h4>
                        <span
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isApproved
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : isRejected
                              ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                          }`}
                        >
                          {isApproved
                            ? `Approved (Prompt v${finding.appliedVersion || 'Updated'})`
                            : isRejected
                            ? 'Rejected'
                            : 'Pending User Decision'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-sans mt-1.5 leading-relaxed">
                        {finding.description}
                      </p>

                      {/* Breached Attacks Resolved Tag List */}
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-zinc-500">Breaches Covered:</span>
                        {finding.breachedAttackNames.map((name, i) => (
                          <span
                            key={i}
                            className="rounded bg-red-950/40 border border-red-800/40 px-2 py-0.5 text-[10px] font-mono text-red-300"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Decision Controls: Approve & Reject */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isPending && (
                        <>
                          <button
                            id={`approve-patch-btn-${finding.id}`}
                            onClick={() => handleApprove(finding)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold rounded flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            <span>Approve Patch</span>
                          </button>
                          <button
                            id={`reject-patch-btn-${finding.id}`}
                            onClick={() => handleReject(finding.id)}
                            disabled={isProcessing}
                            className="px-3 py-1.5 bg-[#202020] hover:bg-[#2a2a2a] text-zinc-400 hover:text-zinc-200 border border-zinc-700 font-mono text-xs rounded flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {isApproved && (
                        <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
                          <Check className="h-4 w-4 text-emerald-400" />
                          <span>Applied to System Prompt</span>
                        </div>
                      )}

                      {isRejected && (
                        <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-500">
                          <XCircle className="h-4 w-4 text-zinc-500" />
                          <span>Patch Declined</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Remediation Sub-tabs */}
                  <div className="border-b border-[#202020] bg-[#0e0e0e] px-4 flex gap-1">
                    <button
                      onClick={() => setActiveTab(finding.id, 'prompt')}
                      className={`px-3 py-2 font-mono text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                        activeTab === 'prompt'
                          ? 'border-amber-400 text-amber-300'
                          : 'border-transparent text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <FileDiff className="h-3.5 w-3.5" />
                      <span>1. Prompt Patch (Diff)</span>
                    </button>
                    <button
                      onClick={() => setActiveTab(finding.id, 'guardrail')}
                      className={`px-3 py-2 font-mono text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                        activeTab === 'guardrail'
                          ? 'border-cyan-400 text-cyan-300'
                          : 'border-transparent text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Code className="h-3.5 w-3.5" />
                      <span>2. Guardrail Code</span>
                    </button>
                    <button
                      onClick={() => setActiveTab(finding.id, 'config')}
                      className={`px-3 py-2 font-mono text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                        activeTab === 'config'
                          ? 'border-purple-400 text-purple-300'
                          : 'border-transparent text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Sliders className="h-3.5 w-3.5" />
                      <span>3. Config Change</span>
                    </button>
                  </div>

                  {/* Tab Body */}
                  <div className="p-4">
                    {/* TAB 1: PROMPT PATCH (DIFF VIEW) */}
                    {activeTab === 'prompt' && (
                      <div className="space-y-3">
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2.5 font-mono text-xs text-amber-300 flex items-start gap-2">
                          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                          <div>
                            <span className="font-bold">Why this closes the gap:</span>{' '}
                            {finding.promptPatch.explanation}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Original Text */}
                          <div className="rounded border border-red-900/40 bg-red-950/20 p-3 flex flex-col">
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-red-900/30 text-[11px] font-mono text-red-400 font-bold shrink-0">
                              <span>- ORIGINAL PROMPT TEXT</span>
                              <span className="text-[10px] text-red-500 font-normal">Removed / Modified</span>
                            </div>
                            <div
                              className={`overflow-y-auto terminal-scrollbar pr-1 ${
                                isExpanded ? 'max-h-[44vh]' : 'max-h-60 sm:max-h-72'
                              }`}
                            >
                              <pre className="font-mono text-xs text-red-200 whitespace-pre-wrap break-words leading-relaxed">
                                {finding.promptPatch.originalText || '(No specific anchor sentence)'}
                              </pre>
                            </div>
                          </div>

                          {/* Replacement Text */}
                          <div className="rounded border border-emerald-900/40 bg-emerald-950/20 p-3 flex flex-col">
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-900/30 text-[11px] font-mono text-emerald-400 font-bold shrink-0">
                              <span>+ REPLACEMENT TEXT (HARDENED)</span>
                              <span className="text-[10px] text-emerald-500 font-normal">Added Guardrail</span>
                            </div>
                            <div
                              className={`overflow-y-auto terminal-scrollbar pr-1 ${
                                isExpanded ? 'max-h-[44vh]' : 'max-h-60 sm:max-h-72'
                              }`}
                            >
                              <pre className="font-mono text-xs text-emerald-200 whitespace-pre-wrap break-words leading-relaxed font-semibold">
                                {finding.promptPatch.replacementText}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: GUARDRAIL CODE */}
                    {activeTab === 'guardrail' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-zinc-400 font-sans">
                            <span className="font-bold text-zinc-200">Enforcement logic:</span>{' '}
                            {finding.guardrailCode.explanation}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300 uppercase">
                              {finding.guardrailCode.language}
                            </span>
                            <button
                              onClick={() => handleCopyCode(finding.id, finding.guardrailCode.code)}
                              className="px-2.5 py-1 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-zinc-200 border border-zinc-700 text-xs font-mono rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {copiedCodeId === finding.id ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-400" />
                                  <span className="text-emerald-400">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  <span>Copy Code</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div
                          className={`rounded border border-[#262626] bg-[#080808] p-3 overflow-y-auto overflow-x-auto terminal-scrollbar ${
                            isExpanded ? 'max-h-[48vh]' : 'max-h-60 sm:max-h-72'
                          }`}
                        >
                          <pre className="font-mono text-xs text-cyan-300 leading-relaxed">
                            {finding.guardrailCode.code}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: CONFIG CHANGE */}
                    {activeTab === 'config' && (
                      <div className="space-y-3">
                        <div className="rounded border border-purple-900/40 bg-purple-950/15 p-4 max-h-60 overflow-y-auto terminal-scrollbar">
                          <h5 className="font-mono text-xs font-bold text-purple-300 flex items-center gap-2">
                            <Sliders className="h-4 w-4 text-purple-400" />
                            <span>{finding.configChange.title}</span>
                          </h5>
                          <div className="mt-2 space-y-2 text-xs font-sans">
                            <div>
                              <span className="font-mono font-bold text-zinc-300">Action: </span>
                              <span className="text-zinc-200">
                                {finding.configChange.recommendation}
                              </span>
                            </div>
                            <div>
                              <span className="font-mono font-bold text-zinc-400">Rationale: </span>
                              <span className="text-zinc-400">{finding.configChange.rationale}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (isExpanded) {
    return (
      <div
        id="remediation-panel-fullscreen-overlay"
        className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-hidden"
      >
        {panelContent}
      </div>
    );
  }

  return panelContent;
};
