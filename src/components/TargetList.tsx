import React, { useState } from 'react';
import {
  Shield,
  Wrench,
  ChevronRight,
  Plus,
  Clock,
  Code2,
  Layers,
  AlertOctagon,
  Trash2,
  AlertTriangle,
  X,
  Flame,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { AgentTarget } from '../types';
import {
  VULNERABLE_INVOICE_ASSISTANT,
  STANDARD_FINTECH_ASSISTANT,
  type StarterTargetTemplate,
} from '../data/starterTargets';

interface TargetListProps {
  targets: AgentTarget[];
  onSelectTarget: (target: AgentTarget) => void;
  onOpenNewTargetForm: () => void;
  onDeleteTarget: (targetId: string) => Promise<void>;
  onLoadStarterTarget?: (starter: StarterTargetTemplate) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const TargetList: React.FC<TargetListProps> = ({
  targets,
  onSelectTarget,
  onOpenNewTargetForm,
  onDeleteTarget,
  onLoadStarterTarget,
  isLoading,
  error,
}) => {
  const [targetToDelete, setTargetToDelete] = useState<AgentTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isLoadingStarter, setIsLoadingStarter] = useState(false);

  const handleConfirmDelete = async () => {
    if (!targetToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteTarget(targetToDelete.id);
      setTargetToDelete(null);
    } catch (err: any) {
      console.error('Delete target error:', err);
      setDeleteError(err.message || 'Failed to delete target. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLoadStarter = async (starter: StarterTargetTemplate) => {
    if (!onLoadStarterTarget || isLoadingStarter) return;
    setIsLoadingStarter(true);
    try {
      await onLoadStarterTarget(starter);
    } finally {
      setIsLoadingStarter(false);
    }
  };
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-black tracking-tight text-[#EDEDED]">
              Agent Targets
            </h2>
            <span className="rounded border border-[#262626] bg-[#141414] px-2.5 py-0.5 font-mono text-xs font-bold text-[#FF4D00]">
              {targets.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#888888]">
            Select an agent to inspect its untrusted prompt, tool interfaces, and chat with the Gemini Red Team Auditor.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onLoadStarterTarget && (
            <button
              type="button"
              id="quick-load-vulnerable-btn"
              disabled={isLoadingStarter}
              onClick={() => handleLoadStarter(VULNERABLE_INVOICE_ASSISTANT)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/15 px-3.5 py-2 text-xs font-bold text-amber-300 transition-all hover:bg-amber-500/25 active:scale-95 disabled:opacity-50"
              title="Quick-load the intentionally vulnerable accounts payable agent to see attack detonation in action"
            >
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span>Load Vulnerable Sample</span>
            </button>
          )}

          <button
            id="open-new-target-btn"
            type="button"
            onClick={onOpenNewTargetForm}
            className="flex items-center gap-2 rounded-lg bg-[#FF4D00] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#0D0D0D] transition-all hover:bg-[#E04400] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            <span>New Target</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          id="target-list-error-banner"
          className="rounded-lg border border-[#FF4D00]/40 bg-[#FF4D00]/10 p-4 text-xs text-[#FF4D00]"
        >
          <p className="font-bold">Error syncing targets from Firestore:</p>
          <p className="mt-1 text-[#EDEDED]">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#262626] bg-[#141414] py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#FF4D00] border-t-transparent" />
          <p className="mt-4 font-mono text-xs font-bold uppercase tracking-wider text-[#888888]">
            Syncing targets from private Firestore vault...
          </p>
        </div>
      ) : targets.length === 0 ? (
        <div
          id="empty-targets-state"
          className="space-y-6"
        >
          <div className="rounded-xl border border-[#262626] bg-[#141414] p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#262626] bg-[#1C1C1C] text-[#FF4D00]">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-[#EDEDED]">
              No agent targets registered yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-xs text-[#888888] leading-relaxed">
              Wiretrap red-teams AI agents by sandboxing their tools, attacking them with real-world prompt injection payloads, and scoring defenses. Choose a starter agent to test immediately or register your own.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Vulnerable Starter Card */}
            <div className="relative flex flex-col justify-between rounded-xl border border-amber-500/40 bg-[#141414] p-6 transition-all hover:border-amber-500/70">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-300 flex items-center gap-1">
                    <Flame className="h-3 w-3 text-amber-400" />
                    <span>Built to Fail (Teaching Example)</span>
                  </span>
                </div>
                <h4 className="mt-2 font-display text-base font-bold text-[#EDEDED]">
                  Accounts Payable Invoice Assistant
                </h4>
                <p className="mt-1.5 text-xs text-[#888888] leading-relaxed">
                  Demonstrates realistic systemic flaws: trusts embedded invoice directives, accepts informal prose approval, and holds high-privilege disbursement tools (<code className="text-amber-300">approve_payment</code>, <code className="text-amber-300">read_invoice</code>).
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-[#262626] pt-4">
                <span className="font-mono text-xs text-[#666666]">4 Decoy Tools</span>
                <button
                  type="button"
                  id="load-vulnerable-starter-btn"
                  disabled={isLoadingStarter}
                  onClick={() => handleLoadStarter(VULNERABLE_INVOICE_ASSISTANT)}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-black hover:bg-amber-400 active:scale-95 transition-all"
                >
                  <Flame className="h-3.5 w-3.5" />
                  <span>Load & Detonate</span>
                </button>
              </div>
            </div>

            {/* Guarded Starter Card */}
            <div className="relative flex flex-col justify-between rounded-xl border border-[#262626] bg-[#141414] p-6 transition-all hover:border-[#383838]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Guarded Baseline</span>
                  </span>
                </div>
                <h4 className="mt-2 font-display text-base font-bold text-[#EDEDED]">
                  FinTech Support Assistant
                </h4>
                <p className="mt-1.5 text-xs text-[#888888] leading-relaxed">
                  A standard banking assistant with balance lookups and small refund capabilities. Tests how basic guardrails hold up to adversarial prompt injection.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-[#262626] pt-4">
                <span className="font-mono text-xs text-[#666666]">2 Decoy Tools</span>
                <button
                  type="button"
                  id="load-guarded-starter-btn"
                  disabled={isLoadingStarter}
                  onClick={() => handleLoadStarter(STANDARD_FINTECH_ASSISTANT)}
                  className="flex items-center gap-2 rounded-lg border border-[#333333] bg-[#1C1C1C] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#EDEDED] hover:bg-[#252525] active:scale-95 transition-all"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Load Guarded Target</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {targets.map((target) => (
            <div
              key={target.id}
              id={`target-card-${target.id}`}
              onClick={() => onSelectTarget(target)}
              className="group cursor-pointer rounded-xl border border-[#262626] bg-[#141414] p-5 transition-all hover:border-[#FF4D00]/50 hover:bg-[#1A1A1A] relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-bold text-[#EDEDED] group-hover:text-[#FF4D00] transition-colors line-clamp-1">
                        {target.name}
                      </span>
                      {target.isVulnerableSample && (
                        <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.2 font-mono text-[9px] font-bold text-amber-300 flex items-center gap-0.5">
                          <Flame className="h-2.5 w-2.5 text-amber-400" />
                          <span>Built to Fail</span>
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 inline-block font-mono text-[10px] text-[#777777]">
                      ID: {target.id.substring(0, 12)}...
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Delete target option with confirm step */}
                    <button
                      id={`delete-target-btn-${target.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError(null);
                        setTargetToDelete(target);
                      }}
                      className="rounded-lg p-1.5 text-[#666666] transition-colors hover:bg-red-500/10 hover:text-red-400"
                      title="Delete target and its subcollections"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-[#555555] transition-transform group-hover:translate-x-0.5 group-hover:text-[#FF4D00]" />
                  </div>
                </div>

                {/* Prompt snippet */}
                <div className="mt-3 rounded border border-[#262626] bg-[#0D0D0D] p-3">
                  <p className="line-clamp-3 font-mono text-xs leading-relaxed text-[#A1A1A1]">
                    {target.systemPrompt || '(No system prompt provided)'}
                  </p>
                </div>
              </div>

              {/* Meta tags */}
              <div className="mt-4 flex items-center justify-between border-t border-[#262626] pt-3 text-[11px]">
                <div className="flex items-center gap-1.5 text-[#EDEDED]">
                  <Wrench className="h-3.5 w-3.5 text-[#FF4D00]" />
                  <span className="font-mono font-medium">
                    {target.tools?.length || 0}{' '}
                    {target.tools?.length === 1 ? 'tool' : 'tools'}
                  </span>
                </div>

                <div className="flex items-center gap-1 font-mono text-[#777777]">
                  <Clock className="h-3 w-3" />
                  <span>
                    {new Date(target.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {targetToDelete && (
        <div
          id="delete-target-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!isDeleting) {
              setTargetToDelete(null);
              setDeleteError(null);
            }
          }}
        >
          <div
            id="delete-target-modal"
            className="w-full max-w-md rounded-xl border border-[#262626] bg-[#141414] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-[#EDEDED]">
                    Delete Agent Target?
                  </h3>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-red-400">
                    Irreversible Action
                  </p>
                </div>
              </div>
              {!isDeleting && (
                <button
                  type="button"
                  onClick={() => setTargetToDelete(null)}
                  className="rounded-lg p-1.5 text-[#777777] hover:bg-[#222222] hover:text-[#EDEDED]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="rounded-lg border border-[#262626] bg-[#0D0D0D] p-3 text-xs space-y-1.5 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[#777777]">Target Name:</span>
                <span className="font-bold text-[#EDEDED]">{targetToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#777777]">Target ID:</span>
                <span className="text-[#A1A1A1]">{targetToDelete.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#777777]">Configured Tools:</span>
                <span className="text-[#A1A1A1]">{targetToDelete.tools?.length || 0}</span>
              </div>
            </div>

            <p className="text-xs text-[#888888] leading-relaxed">
              Deleting this agent target permanently deletes its specification and recursively purges its subcollections: all security auditor chat messages and detonation run logs. Nothing will be orphaned.
            </p>

            {deleteError && (
              <div
                id="delete-error-banner"
                className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400"
              >
                <p className="font-bold">Failed to delete target:</p>
                <p className="mt-1 text-[#EDEDED]">{deleteError}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#262626]">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setTargetToDelete(null);
                  setDeleteError(null);
                }}
                className="rounded-lg border border-[#262626] bg-[#1C1C1C] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#888888] hover:text-[#EDEDED] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-target-btn"
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 font-mono text-xs font-black uppercase tracking-wider text-white hover:bg-red-500 transition-all disabled:opacity-50 shadow-lg shadow-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? 'Deleting Target & History...' : 'Permanently Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
