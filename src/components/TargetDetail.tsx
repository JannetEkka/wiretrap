import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Play,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  Code2,
  Clock,
  Terminal,
  Lock,
  Layers,
  Edit3,
  RotateCw,
  Eye,
  History,
  TrendingUp,
} from 'lucide-react';
import type { AgentTarget, DetonationRun } from '../types';
import { TargetChatPanel } from './TargetChatPanel';
import { DetonationView } from './DetonationView';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { subscribeDetonationRuns } from '../lib/firebase';

interface TargetDetailProps {
  userId: string;
  target: AgentTarget;
  onBack: () => void;
  onEdit: () => void;
}

export const TargetDetail: React.FC<TargetDetailProps> = ({
  userId,
  target: initialTarget,
  onBack,
  onEdit,
}) => {
  const [target, setTarget] = useState<AgentTarget>(initialTarget);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showDetonationView, setShowDetonationView] = useState(false);
  const [selectedRun, setSelectedRun] = useState<DetonationRun | null>(null);
  const [pastRuns, setPastRuns] = useState<DetonationRun[]>([]);

  // Keep local target in sync if parent target changes
  useEffect(() => {
    setTarget(initialTarget);
  }, [initialTarget]);

  // Subscribe to past detonation runs for this target
  useEffect(() => {
    if (!userId || !target.id) return;

    const unsub = subscribeDetonationRuns(
      userId,
      target.id,
      (runs) => setPastRuns(runs),
      (err) => console.warn('Detonation runs subscription warning:', err)
    );

    return () => unsub();
  }, [userId, target.id]);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(target.systemPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleOpenLiveRun = () => {
    setSelectedRun(null);
    setShowDetonationView(true);
  };

  const handleOpenPastRun = (run: DetonationRun) => {
    setSelectedRun(run);
    setShowDetonationView(true);
  };

  return (
    <div className="space-y-6">
      {/* Navigation & Header Bar */}
      <div className="flex flex-col gap-4 border-b border-[#262626] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            id="back-to-targets-btn"
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-[#262626] bg-[#141414] px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-[#EDEDED] transition-colors hover:border-[#FF4D00]/50 hover:bg-[#1C1C1C]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Targets</span>
          </button>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-[#EDEDED]">
                {target.name}
              </h1>
              <span className="rounded border border-[#FF4D00]/40 bg-[#FF4D00]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF4D00]">
                Target Active
              </span>
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
                v{target.promptVersion || 1}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs text-[#777777]">
              <span>ID: {target.id}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Updated: {new Date(target.updatedAt).toLocaleTimeString()}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {target.tools?.length || 0} Tools Declared
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            id="edit-target-button"
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg border border-[#262626] bg-[#141414] px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#EDEDED] transition-colors hover:border-[#FF4D00]/50 hover:bg-[#1C1C1C] cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5 text-[#FF4D00]" />
            <span>Edit Target</span>
          </button>

          <button
            id="run-test-button"
            type="button"
            onClick={handleOpenLiveRun}
            className="flex items-center gap-2 rounded-lg border border-[#FF4D00] bg-[#FF4D00] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-[#0D0D0D] transition-all hover:bg-[#FF6622] shadow-lg shadow-[#FF4D00]/20 active:scale-[0.98] cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Run Detonation</span>
            {pastRuns.length > 0 && (
              <span className="rounded bg-[#0D0D0D] px-1.5 py-0.5 font-mono text-[10px] text-[#FF4D00]">
                {pastRuns.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-[#262626] gap-2">
        <button
          id="tab-overview"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-[#FF4D00] text-[#EDEDED]'
              : 'border-transparent text-[#777777] hover:text-[#EDEDED]'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Active Configuration & Chat</span>
        </button>
        <button
          id="tab-history"
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-[#FF4D00] text-[#EDEDED]'
              : 'border-transparent text-[#777777] hover:text-[#EDEDED]'
          }`}
        >
          <History className="h-3.5 w-3.5 text-amber-400" />
          <span>Prompt Versions & Defense History ({pastRuns.length})</span>
        </button>
      </div>

      {/* TAB 1: ACTIVE CONFIGURATION & CHAT */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Past Runs Strip (if any previous runs exist) */}
          {pastRuns.length > 0 && (
            <div
              id="past-runs-banner"
              className="rounded-xl border border-[#262626] bg-[#141414] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="rounded border border-[#333333] bg-[#1E1E1E] px-2.5 py-1 text-[11px] font-bold text-[#EDEDED]">
                  Latest Detonation
                </span>
                <div className="flex items-center gap-2 text-xs text-[#888888]">
                  <span>At:</span>
                  <span className="text-[#EDEDED]">
                    {new Date(pastRuns[0].startedAt).toLocaleTimeString()}
                  </span>
                  <span className="text-emerald-400 font-bold">
                    {pastRuns[0].attacksPassed} Defended
                  </span>
                  <span>•</span>
                  <span
                    className={`font-bold ${
                      pastRuns[0].attacksBreached > 0
                        ? 'text-red-400'
                        : 'text-[#888888]'
                    }`}
                  >
                    {pastRuns[0].attacksBreached} Breached
                  </span>
                  {(pastRuns[0].attacksNotApplicable ?? 0) > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-zinc-400 font-bold" title="No matching tool surface">
                        {pastRuns[0].attacksNotApplicable} N/A
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="view-latest-run-btn"
                  onClick={() => handleOpenPastRun(pastRuns[0])}
                  className="flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#1C1C1C] px-3 py-1.5 text-xs text-[#EDEDED] hover:border-[#FF4D00] hover:text-[#FF4D00] transition-colors cursor-pointer"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Inspect Latest Run</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Two-Column Layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            {/* Left Column: Read-Only System Prompt & Tool Schemas */}
            <div className="space-y-6 lg:col-span-6">
              {/* Read-Only System Prompt */}
              <div className="rounded-xl border border-[#262626] bg-[#141414] p-5">
                <div className="flex items-center justify-between border-b border-[#262626] pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-[#FF4D00]" />
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#EDEDED]">
                      Untrusted System Prompt (v{target.promptVersion || 1})
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[#777777]">
                      {target.systemPrompt.length} chars
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      className="flex items-center gap-1 rounded border border-[#262626] bg-[#1C1C1C] px-2.5 py-1 text-[10px] font-mono uppercase font-bold text-[#A1A1A1] hover:text-[#EDEDED] hover:border-[#FF4D00]/50 transition-colors"
                      title="Copy prompt"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-[#262626] bg-[#0D0D0D] p-3.5">
                  <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[#EDEDED]">
                    {target.systemPrompt || '(No system prompt provided)'}
                  </pre>
                </div>

                <p className="mt-2.5 font-mono text-[11px] text-[#777777] leading-tight">
                  Notice: All user-submitted agent prompts are treated as untrusted hostile data by default.
                </p>
              </div>

              {/* Read-Only Tools Schemas */}
              <div className="rounded-xl border border-[#262626] bg-[#141414] p-5">
                <div className="flex items-center justify-between border-b border-[#262626] pb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-[#FF4D00]" />
                    <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#EDEDED]">
                      Configured Tools ({target.tools?.length || 0})
                    </h3>
                  </div>
                  <span className="rounded border border-[#262626] bg-[#1C1C1C] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#FF4D00]">
                    Decoy Interceptors
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  {!target.tools || target.tools.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#262626] p-6 text-center font-mono text-xs text-[#777777]">
                      No tools declared for this agent target.
                    </div>
                  ) : (
                    target.tools.map((tool, idx) => {
                      let formattedParams = tool.parameters;
                      try {
                        formattedParams = JSON.stringify(
                          JSON.parse(tool.parameters),
                          null,
                          2
                        );
                      } catch {
                        // keep raw if parse fails
                      }

                      return (
                        <div
                          key={tool.id || idx}
                          className="rounded-lg border border-[#262626] bg-[#0D0D0D] p-3.5 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#EDEDED] flex items-center gap-1.5">
                              <span className="text-[#FF4D00]">#</span>
                              {tool.name || 'unnamed_tool'}
                            </span>
                            <span className="rounded border border-[#262626] bg-[#141414] px-1.5 py-0.5 font-mono text-[10px] text-[#888888]">
                              Tool #{idx + 1}
                            </span>
                          </div>

                          {tool.description && (
                            <p className="text-xs text-[#A1A1A1] leading-normal">
                              {tool.description}
                            </p>
                          )}

                          {formattedParams && (
                            <div>
                              <span className="block font-mono text-[10px] uppercase font-bold text-[#777777] mb-1">
                                Parameters Schema:
                              </span>
                              <pre className="max-h-48 overflow-y-auto rounded border border-[#262626] bg-[#141414] p-2.5 font-mono text-[11px] text-[#EDEDED]">
                                {formattedParams}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Gemini Red-Team Chat Panel */}
            <div className="lg:col-span-6">
              <TargetChatPanel userId={userId} target={target} />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VERSIONS & DEFENSE HISTORY */}
      {activeTab === 'history' && (
        <VersionHistoryPanel
          userId={userId}
          target={target}
          pastRuns={pastRuns}
          onTargetUpdated={(updated) => setTarget(updated)}
          onOpenRun={(run) => handleOpenPastRun(run)}
        />
      )}

      {/* Detonation Live Sandbox Overlay */}
      {showDetonationView && (
        <DetonationView
          target={target}
          initialRun={selectedRun}
          onClose={() => setShowDetonationView(false)}
        />
      )}
    </div>
  );
};
