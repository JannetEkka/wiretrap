import React from 'react';
import {
  ShieldAlert,
  Terminal,
  Cpu,
  Lock,
  ArrowRight,
  AlertTriangle,
  FileCode2,
  ExternalLink,
} from 'lucide-react';

interface LandingHeroProps {
  onSignIn: () => void;
  isAuthenticating: boolean;
  authError: string | null;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onSignIn,
  isAuthenticating,
  authError,
}) => {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      {/* Top Banner / Status */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#262626] bg-[#141414] px-4 py-1.5 text-xs text-[#EDEDED]">
          <span className="flex h-2 w-2 rounded-full bg-[#FF4D00] animate-pulse" />
          <span className="font-mono font-bold text-[#888888]">STATUS:</span>
          <span className="font-mono text-xs text-[#EDEDED]">Core Isolation & Target Registry Online</span>
        </div>
      </div>

      {/* Main Headline */}
      <div className="mt-8 text-center">
        <h1 className="font-display text-5xl font-black tracking-tighter text-[#EDEDED] sm:text-6xl md:text-7xl">
          Test AI agents by{' '}
          <span className="text-[#FF4D00] underline decoration-[#FF4D00]/50 decoration-wavy">
            attacking them.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#A1A1A1] sm:text-lg">
          Submit your agent's system prompt and tool definitions. We isolate untrusted instructions,
          prepare decoy tools that never touch production systems, and red-team your agent's execution boundaries.
        </p>

        {/* CTA Area */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4">
          <button
            id="landing-google-sign-in-button"
            type="button"
            disabled={isAuthenticating}
            onClick={onSignIn}
            className="flex items-center justify-center gap-3 rounded-xl bg-[#FF4D00] px-8 py-4 font-black uppercase tracking-wider text-[#0D0D0D] shadow-xl transition-all hover:bg-[#E04400] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#0D0D0D"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#0D0D0D"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#0D0D0D"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#0D0D0D"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="text-sm sm:text-base font-black tracking-wider">
              {isAuthenticating ? 'Authenticating with Google...' : 'Sign In with Google'}
            </span>
          </button>

          {authError && (
            <div
              id="auth-error-banner"
              className="mt-4 flex max-w-md items-start gap-3 rounded-lg border border-[#FF4D00]/40 bg-[#FF4D00]/10 p-4 text-left text-sm text-[#FF4D00]"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-[#FF4D00]" />
              <div>
                <p className="font-bold">Authentication Error</p>
                <p className="mt-1 text-xs text-[#EDEDED]">{authError}</p>
                <p className="mt-2 text-xs text-[#888888]">
                  Tip: If the sign-in popup was blocked by your browser or iframe, allow popups or open this applet in a new tab.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs font-mono text-[#777777]">
            Strict OAuth authentication via Firebase. No email/passwords stored.
          </p>
        </div>
      </div>

      {/* Security Architecture Pillars */}
      <div className="mt-20 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-[#262626] bg-[#141414] p-6 transition-colors hover:border-[#383838]">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#262626] bg-[#1C1C1C] text-[#FF4D00]">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-display text-base font-bold tracking-tight text-[#EDEDED]">
            1. Hostile Data Isolation
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#888888]">
            Submitted agent system prompts are treated strictly as untrusted DATA, wrapped in explicit XML delimiters to prevent indirect prompt injection.
          </p>
        </div>

        <div className="rounded-xl border border-[#262626] bg-[#141414] p-6 transition-colors hover:border-[#383838]">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#262626] bg-[#1C1C1C] text-[#FF4D00]">
            <Terminal className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-display text-base font-bold tracking-tight text-[#EDEDED]">
            2. Decoy Tool Schemas
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#888888]">
            Define executable agent tools with JSON schemas. In our test harnesses, tools log calls and return synthetic decoy responses without executing real payloads.
          </p>
        </div>

        <div className="rounded-xl border border-[#262626] bg-[#141414] p-6 transition-colors hover:border-[#383838]">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#262626] bg-[#1C1C1C] text-[#FF4D00]">
            <Cpu className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-display text-base font-bold tracking-tight text-[#EDEDED]">
            3. Gemini Security Auditor
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#888888]">
            Multi-turn adversarial intelligence powered by server-side Gemini. Interrogate vulnerabilities, privilege escalation, and tool risk profiles.
          </p>
        </div>
      </div>
    </div>
  );
};
