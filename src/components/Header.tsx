import React from 'react';
import type { User } from 'firebase/auth';
import { Shield, ShieldAlert, LogOut, LogIn, ExternalLink } from 'lucide-react';
import { logoutUser } from '../lib/firebase';

interface HeaderProps {
  user: User | null;
  onSignIn: () => void;
  isAuthenticating: boolean;
  currentPath?: string;
  onNavigate?: (path: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onSignIn,
  isAuthenticating,
  currentPath = '/',
  onNavigate,
}) => {
  const isSecurityActive = currentPath === '/security';
  const isTargetsActive = currentPath === '/' || currentPath.startsWith('/target');

  return (
    <header
      id="app-header"
      className="sticky top-0 z-40 w-full border-b border-[#262626] bg-[#0D0D0D]/95 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity & Nav */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('/')}
            className="flex items-center gap-3 text-left focus:outline-none"
            title="Wiretrap Dashboard"
          >
            <div
              id="brand-logo"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#FF4D00]/40 bg-[#FF4D00]/10 text-[#FF4D00] transition-transform hover:scale-105"
            >
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-black tracking-tighter text-[#EDEDED]">
                  WIRETRAP
                </span>
                <span className="rounded border border-[#262626] bg-[#161616] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#FF4D00]">
                  Red Team Workbench
                </span>
              </div>
              <p className="hidden text-xs font-mono text-[#888888] sm:block">
                AI Agent Adversarial Testing & Tool Detonation
              </p>
            </div>
          </button>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 border-l border-[#262626] pl-6 font-mono text-xs font-bold uppercase tracking-wider">
            <button
              type="button"
              id="nav-targets-btn"
              onClick={() => onNavigate && onNavigate('/')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                isTargetsActive && !isSecurityActive
                  ? 'border border-[#FF4D00]/30 bg-[#FF4D00]/10 text-[#FF4D00]'
                  : 'text-[#888888] hover:bg-[#161616] hover:text-[#EDEDED]'
              }`}
            >
              <span>Targets</span>
            </button>

            <button
              type="button"
              id="nav-security-btn"
              onClick={() => onNavigate && onNavigate('/security')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                isSecurityActive
                  ? 'border border-[#FF4D00]/30 bg-[#FF4D00]/10 text-[#FF4D00]'
                  : 'text-[#888888] hover:bg-[#161616] hover:text-[#EDEDED]'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Security</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </button>
          </nav>
        </div>

        {/* User Auth Section */}
        <div className="flex items-center gap-3">
          {/* Mobile navigation button */}
          <div className="flex md:hidden items-center gap-1 font-mono text-xs font-bold uppercase">
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('/security')}
              className={`rounded-lg px-2.5 py-1.5 ${
                isSecurityActive
                  ? 'bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/30'
                  : 'text-[#888888]'
              }`}
              title="Security Architecture"
            >
              <Shield className="h-4 w-4" />
            </button>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <div
                id="user-profile-badge"
                className="flex items-center gap-2.5 rounded-lg border border-[#262626] bg-[#141414] px-3 py-1.5"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="h-6 w-6 rounded-full border border-[#333333] object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#262626] text-xs font-bold text-[#EDEDED]">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden text-left md:block">
                  <p className="max-w-[160px] truncate text-xs font-bold text-[#EDEDED]">
                    {user.displayName || 'Researcher'}
                  </p>
                  <p className="max-w-[160px] truncate font-mono text-[10px] text-[#777777]">
                    {user.email}
                  </p>
                </div>
              </div>

              <button
                id="sign-out-button"
                type="button"
                onClick={() => logoutUser()}
                className="flex items-center gap-1.5 rounded-lg border border-[#262626] bg-[#141414] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#A1A1A1] transition-colors hover:border-[#FF4D00]/50 hover:bg-[#1C1C1C] hover:text-[#EDEDED]"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              id="google-sign-in-header-btn"
              type="button"
              disabled={isAuthenticating}
              onClick={onSignIn}
              className="flex items-center gap-2 rounded-lg bg-[#FF4D00] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#0D0D0D] transition-colors hover:bg-[#E04400] disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              <span>{isAuthenticating ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
