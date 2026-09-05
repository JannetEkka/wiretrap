import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Sparkles,
  Bot,
  User,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Terminal,
  HelpCircle,
} from 'lucide-react';
import type { AgentTarget, TargetChatMessage } from '../types';
import {
  subscribeTargetMessages,
  saveChatMessage,
  auth,
} from '../lib/firebase';

interface TargetChatPanelProps {
  userId: string;
  target: AgentTarget;
}

const QUICK_PROMPTS = [
  "What's risky about this agent's tools?",
  "How could indirect prompt injection exploit this agent?",
  "Suggest safe validation guardrails for these tools.",
];

export const TargetChatPanel: React.FC<TargetChatPanelProps> = ({
  userId,
  target,
}) => {
  const [messages, setMessages] = useState<TargetChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [detailMode, setDetailMode] = useState<'brief' | 'full'>('brief');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to real-time chat messages under users/{userId}/targets/{targetId}/messages
  useEffect(() => {
    setIsSyncing(true);
    setChatError(null);

    const unsubscribe = subscribeTargetMessages(
      userId,
      target.id,
      (incomingMessages) => {
        setMessages(incomingMessages);
        setIsSyncing(false);
      },
      (err) => {
        console.error('Failed to load chat history:', err);
        setChatError('Could not sync chat messages from Firestore.');
        setIsSyncing(false);
      }
    );

    return () => unsubscribe();
  }, [userId, target.id]);

  // Scroll ONLY the internal chat container to bottom — never scroll the window/page
  const scrollChatToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  // Scroll on message list updates or when sending state changes
  useEffect(() => {
    scrollChatToBottom('smooth');
  }, [messages.length, isSending]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isSending) return;

    setChatError(null);
    setIsSending(true);

    // Immediately ensure internal container is at bottom
    scrollChatToBottom('smooth');

    try {
      // 1. Save user message to Firestore subcollection
      await saveChatMessage(userId, target.id, {
        role: 'user',
        content: text,
        detailLevel: detailMode,
      });

      // Clear input only after confirmed user message write
      if (!textToSend) {
        setInputMessage('');
      }

      // 2. Prepare conversation history for server-side Gemini
      const conversationHistory = messages.map((m) => ({
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: m.content,
      }));

      // 3. Call server-side API endpoint with verified Bearer token
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Authentication required: please sign in to chat.');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetId: target.id,
          history: conversationHistory,
          userMessage: text,
          detailLevel: detailMode,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || `Server responded with HTTP ${response.status}`);
      }

      // 4. Save assistant response to Firestore including model ladder diagnostics
      await saveChatMessage(userId, target.id, {
        role: 'assistant',
        content: data.reply,
        modelUsed: data.modelUsed,
        primarySkipped: data.primarySkipped,
        primaryError: data.primaryError,
        detailLevel: detailMode,
      });

      // Scroll internal container smoothly
      setTimeout(() => scrollChatToBottom('smooth'), 50);
    } catch (err: any) {
      console.error('Chat analysis error:', err);
      // Keep input accessible if it failed before sending or restore
      if (!inputMessage && text) {
        setInputMessage(text);
      }
      setChatError(err.message || 'Failed to contact Gemini security auditor. Please retry.');
    } finally {
      setIsSending(false);
      // Keep focus on input for fast multi-turn testing
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      id="gemini-chat-panel"
      className="flex h-[720px] max-h-[85vh] flex-col rounded-xl border border-[#262626] bg-[#141414] shadow-2xl overflow-hidden"
    >
      {/* Panel Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#262626] bg-[#0D0D0D] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#FF4D00]/40 bg-[#FF4D00]/10 text-[#FF4D00]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#EDEDED]">
                AI Security Auditor
              </h3>
              <span className="flex items-center gap-1.5 rounded border border-[#262626] bg-[#1C1C1C] px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#FF4D00]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF4D00] animate-pulse" />
                Gemini Multi-Turn
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#777777]">
            Target: {target.name}
          </span>
        </div>
      </div>

      {/* Untrusted Data Delimiter Warning */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#262626] bg-[#0D0D0D]/60 px-4 py-2 text-[11px] text-[#888888] font-mono">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[#FF4D00]" />
        <span className="truncate">
          Untrusted agent prompt & tools encapsulated in XML tags to prevent indirect prompt injection.
        </span>
      </div>

      {/* Internal Scroll Container for Messages - Fixed Height, Overflow-Y */}
      <div
        ref={messagesContainerRef}
        id="auditor-messages-container"
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
      >
        {isSyncing && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#FF4D00] border-t-transparent" />
            <p className="mt-2 font-mono text-xs font-bold uppercase tracking-wider text-[#888888]">
              Loading security audit history...
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#262626] bg-[#1C1C1C] text-[#FF4D00]">
              <Bot className="h-6 w-6" />
            </div>
            <h4 className="mt-4 font-display text-base font-bold text-[#EDEDED]">
              Begin Adversarial Analysis
            </h4>
            <p className="mt-1 max-w-sm text-xs text-[#888888] leading-relaxed">
              Ask questions to red-team this agent. Gemini analyzes tool attack surfaces, prompt injection risks, and blast radius.
            </p>

            {/* Suggested quick queries */}
            <div className="mt-6 flex flex-col gap-2 w-full max-w-md">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#777777] text-left">
                Suggested Red-Team Queries:
              </span>
              {QUICK_PROMPTS.map((promptText, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(promptText)}
                  className="flex items-center justify-between rounded-lg border border-[#262626] bg-[#0D0D0D] p-3 text-left text-xs font-medium text-[#EDEDED] transition-all hover:border-[#FF4D00]/50 hover:bg-[#1A1A1A]"
                >
                  <span>{promptText}</span>
                  <Terminal className="h-3.5 w-3.5 text-[#FF4D00] shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1 flex-wrap">
                {msg.role === 'user' ? (
                  <>
                    <span className="font-mono text-[10px] font-bold uppercase text-[#888888]">
                      Security Engineer
                    </span>
                    <User className="h-3 w-3 text-[#888888]" />
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 text-[#FF4D00]" />
                    <span className="font-mono text-[10px] text-[#FF4D00] font-bold uppercase">
                      Security Auditor
                    </span>
                    {msg.modelUsed && (
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                          msg.primarySkipped
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 font-bold'
                            : 'border-[#262626] bg-[#1C1C1C] text-[#888888]'
                        }`}
                      >
                        {msg.modelUsed}
                      </span>
                    )}
                    {msg.primarySkipped && (
                      <span
                        className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300"
                        title="Primary model (gemini-3.8-flash) was unavailable; fallback ladder served this request."
                      >
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-400" />
                        Fallback Active
                      </span>
                    )}
                    {msg.detailLevel && (
                      <span className="rounded border border-[#262626] bg-[#141414] px-1 py-0.2 text-[9px] font-mono uppercase text-[#666666]">
                        {msg.detailLevel}
                      </span>
                    )}
                  </>
                )}
              </div>

              <div
                className={`rounded-xl px-4 py-3 max-w-[92%] text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#1C1C1C] text-[#EDEDED] border border-[#333333]'
                    : 'bg-[#0D0D0D] text-[#EDEDED] border border-[#262626]'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap font-sans">{msg.content}</p>
                ) : (
                  <div>
                    {/* Primary error banner if primary model was skipped */}
                    {msg.primarySkipped && msg.primaryError && (
                      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 font-mono text-[11px] text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" />
                        <div>
                          <span className="font-bold text-amber-200">
                            Primary Model Skipped:
                          </span>{' '}
                          {msg.primaryError}
                          <div className="text-[10px] text-amber-400/80 mt-0.5">
                            Automatically routed to fallback ladder candidate: {msg.modelUsed}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Markdown Renderer with GitHub-Flavored Markdown and Terminal Table Styling */}
                    <div className="prose prose-invert prose-xs max-w-none space-y-2 [&_p]:leading-relaxed [&_pre]:bg-[#141414] [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#262626] [&_code]:font-mono [&_code]:text-[11px] [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ node, ...props }) => (
                            <div className="my-3 overflow-x-auto rounded-lg border border-[#FF4D00]/40 bg-[#0A0A0A]">
                              <table
                                className="min-w-full border-collapse font-mono text-xs text-[#EDEDED]"
                                {...props}
                              />
                            </div>
                          ),
                          thead: ({ node, ...props }) => (
                            <thead
                              className="border-b border-[#FF4D00]/40 bg-[#1C1C1C]"
                              {...props}
                            />
                          ),
                          tbody: ({ node, ...props }) => (
                            <tbody className="divide-y divide-[#222222]" {...props} />
                          ),
                          tr: ({ node, ...props }) => (
                            <tr
                              className="hover:bg-[#161616] transition-colors"
                              {...props}
                            />
                          ),
                          th: ({ node, ...props }) => (
                            <th
                              className="px-3.5 py-2 text-left font-mono text-[11px] font-bold uppercase tracking-wider text-[#FF4D00] border-r border-[#262626] last:border-r-0"
                              {...props}
                            />
                          ),
                          td: ({ node, ...props }) => (
                            <td
                              className="px-3.5 py-2 font-mono text-xs text-[#D4D4D4] border-r border-[#1F1F1F] last:border-r-0"
                              {...props}
                            />
                          ),
                          // Sanitize: Links made inert, preventing execution or unvalidated URL redirects
                          a: ({ node, children, href }) => (
                            <span
                              className="font-mono text-xs text-[#FF4D00] underline underline-offset-2 cursor-help"
                              title={href ? `Reference (inert): ${href}` : 'Inert external link'}
                            >
                              {children}
                            </span>
                          ),
                          // Sanitize: Neutralize raw script or embedded tags
                          script: () => null,
                          iframe: () => null,
                          object: () => null,
                          embed: () => null,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isSending && (
          <div className="flex flex-col items-start space-y-1">
            <div className="flex items-center gap-1.5 px-1">
              <Sparkles className="h-3 w-3 text-[#FF4D00] animate-pulse" />
              <span className="font-mono text-[10px] text-[#FF4D00] font-bold uppercase">
                Auditing target boundaries...
              </span>
            </div>
            <div className="rounded-xl bg-[#0D0D0D] border border-[#262626] px-4 py-3 text-xs text-[#888888] flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#FF4D00] animate-ping" />
              <span>Analyzing untrusted prompt and tool risk profiles...</span>
            </div>
          </div>
        )}
      </div>

      {/* Error & Retry Banner */}
      {chatError && (
        <div
          id="chat-error-banner"
          className="flex shrink-0 items-center justify-between gap-3 border-t border-[#FF4D00]/40 bg-[#FF4D00]/10 px-4 py-2.5 text-xs text-[#FF4D00]"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#FF4D00]" />
            <span className="truncate">{chatError}</span>
          </div>
          <button
            type="button"
            onClick={() => handleSendMessage()}
            className="flex items-center gap-1 rounded border border-[#FF4D00]/50 bg-[#FF4D00]/20 px-2.5 py-1 font-mono text-[11px] font-bold uppercase text-[#FF4D00] hover:bg-[#FF4D00]/30"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Detail Mode Toggle: Brief / Full */}
      <div
        id="auditor-detail-mode-bar"
        className="flex shrink-0 items-center justify-between border-t border-[#262626] bg-[#0A0A0A] px-4 py-2"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#777777]">
            Detail:
          </span>
          <div className="inline-flex rounded-lg border border-[#262626] bg-[#141414] p-0.5">
            <button
              type="button"
              id="detail-mode-brief-btn"
              onClick={() => setDetailMode('brief')}
              className={`rounded px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase transition-all ${
                detailMode === 'brief'
                  ? 'bg-[#FF4D00] text-[#0D0D0D] shadow'
                  : 'text-[#888888] hover:text-[#EDEDED]'
              }`}
            >
              Brief
            </button>
            <button
              type="button"
              id="detail-mode-full-btn"
              onClick={() => setDetailMode('full')}
              className={`rounded px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase transition-all ${
                detailMode === 'full'
                  ? 'bg-[#FF4D00] text-[#0D0D0D] shadow'
                  : 'text-[#888888] hover:text-[#EDEDED]'
              }`}
            >
              Full
            </button>
          </div>
        </div>
        <span className="font-mono text-[10px] text-[#666666]">
          {detailMode === 'brief'
            ? 'Brief (1-2 sentence lead + max 3 bullets)'
            : 'Full (In-depth analysis & mitigations)'}
        </span>
      </div>

      {/* Input Form */}
      <div className="shrink-0 border-t border-[#262626] bg-[#0D0D0D] p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            id="chat-user-message-input"
            rows={2}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Gemini about vulnerabilities, risky tools, or injection vectors... (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none rounded-lg border border-[#262626] bg-[#141414] p-3 font-sans text-xs text-[#EDEDED] placeholder-[#555555] focus:border-[#FF4D00] focus:outline-none"
            disabled={isSending}
          />
          <button
            id="chat-send-btn"
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || isSending}
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#FF4D00] text-[#0D0D0D] transition-colors hover:bg-[#E04400] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Send analysis query"
          >
            <Send className="h-4 w-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
