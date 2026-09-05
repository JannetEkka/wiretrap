/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  signInWithGoogle,
  subscribeUserTargets,
  saveAgentTarget,
  updateAgentTarget,
  deleteAgentTarget,
} from './lib/firebase';
import type { AgentTarget, ToolDefinition } from './types';
import { Header } from './components/Header';
import { LandingHero } from './components/LandingHero';
import { TargetList } from './components/TargetList';
import { TargetForm } from './components/TargetForm';
import { TargetDetail } from './components/TargetDetail';
import { SecurityPage } from './components/SecurityPage';
import { AccessDenied } from './components/AccessDenied';
import { Shield, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { StarterTargetTemplate } from './data/starterTargets';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // URL Routing State
  const [currentPath, setCurrentPath] = useState<string>(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  // Targets state
  const [targets, setTargets] = useState<AgentTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  // Form / Edit State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<AgentTarget | null>(null);
  const [isSubmittingTarget, setIsSubmittingTarget] = useState(false);
  const [targetSubmitError, setTargetSubmitError] = useState<string | null>(null);

  // Sync browser back/forward history navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      setTargetSubmitError(null);
      setEditingTarget(null);
      setShowCreateForm(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigation handler updating History API and state
  const navigate = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      setTargetSubmitError(null);
      setEditingTarget(null);
      setShowCreateForm(false);
    }
  };

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (!currentUser) {
        setTargets([]);
        setShowCreateForm(false);
        setEditingTarget(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to user's targets in Firestore when user is authenticated
  useEffect(() => {
    if (!user) {
      setTargets([]);
      setTargetsLoading(false);
      return;
    }

    setTargetsLoading(true);
    setTargetsError(null);

    const unsubscribe = subscribeUserTargets(
      user.uid,
      (userTargets) => {
        setTargets(userTargets);
        setTargetsLoading(false);
      },
      (error) => {
        console.error('Firestore targets subscription failed:', error);
        setTargetsError(error.message || 'Failed to sync targets.');
        setTargetsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleSignIn = async () => {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign-in error:', err);
      if (err?.code === 'auth/popup-blocked') {
        setAuthError(
          'The sign-in popup was blocked by the browser. If previewing in an iframe, please allow popups or open the app in a new browser tab.'
        );
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in was cancelled before completion.');
      } else {
        setAuthError(err?.message || 'Google Sign-In failed.');
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleCreateTarget = async (data: {
    name: string;
    systemPrompt: string;
    tools: ToolDefinition[];
    isVulnerableSample?: boolean;
    warningLabel?: string;
  }) => {
    if (!user) return;
    setTargetSubmitError(null);
    setIsSubmittingTarget(true);

    try {
      const newTargetId = await saveAgentTarget(user.uid, data);
      setShowCreateForm(false);
      navigate(`/target/${newTargetId}`);
    } catch (err: any) {
      console.error('Failed to save target:', err);
      setTargetSubmitError(
        err.message || 'Failed to save target to Firestore. Please try again.'
      );
    } finally {
      setIsSubmittingTarget(false);
    }
  };

  const handleLoadStarterTarget = async (starter: StarterTargetTemplate) => {
    if (!user) return;
    setTargetsError(null);
    setTargetsLoading(true);
    try {
      const newTargetId = await saveAgentTarget(user.uid, {
        name: starter.name,
        systemPrompt: starter.systemPrompt,
        tools: starter.tools,
        isVulnerableSample: starter.isVulnerableSample,
        warningLabel: starter.warningLabel,
      });
      navigate(`/target/${newTargetId}`);
    } catch (err: any) {
      console.error('Failed to load starter agent:', err);
      setTargetsError(err.message || 'Failed to load starter agent.');
    } finally {
      setTargetsLoading(false);
    }
  };

  const handleUpdateTarget = async (data: {
    name: string;
    systemPrompt: string;
    tools: ToolDefinition[];
  }) => {
    if (!user || !editingTarget) return;
    setTargetSubmitError(null);
    setIsSubmittingTarget(true);

    try {
      await updateAgentTarget(user.uid, editingTarget.id, data);
      setEditingTarget(null);
    } catch (err: any) {
      console.error('Failed to update target:', err);
      setTargetSubmitError(
        err.message || 'Failed to update target in Firestore. Please try again.'
      );
    } finally {
      setIsSubmittingTarget(false);
    }
  };

  const handleDeleteTarget = async (targetId: string) => {
    if (!user) return;
    await deleteAgentTarget(user.uid, targetId);
    if (currentPath === `/target/${targetId}`) {
      navigate('/');
    }
    if (editingTarget?.id === targetId) {
      setEditingTarget(null);
    }
  };

  // Route evaluation
  const isSecurityRoute = currentPath === '/security';
  const isTargetRoute = currentPath.startsWith('/target/');
  const targetIdFromRoute = isTargetRoute ? currentPath.slice('/target/'.length).trim() : null;
  const matchedTarget = targetIdFromRoute
    ? targets.find((t) => t.id === targetIdFromRoute) || null
    : null;

  return (
    <div className="min-h-screen bg-[#0D0D0D] font-sans text-[#EDEDED] flex flex-col selection:bg-[#FF4D00]/30 selection:text-[#FF4D00]">
      <Header
        user={user}
        onSignIn={handleSignIn}
        isAuthenticating={isAuthenticating}
        currentPath={currentPath}
        onNavigate={navigate}
      />

      <main className="flex-1">
        {authLoading ? (
          <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#FF4D00] border-t-transparent" />
            <p className="mt-4 font-mono text-xs tracking-wider uppercase text-[#888888]">
              Initializing Wiretrap Red Team Workbench...
            </p>
          </div>
        ) : isSecurityRoute ? (
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <SecurityPage user={user} onBack={() => navigate('/')} />
          </div>
        ) : !user ? (
          <LandingHero
            onSignIn={handleSignIn}
            isAuthenticating={isAuthenticating}
            authError={authError}
          />
        ) : isTargetRoute ? (
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {targetsLoading ? (
              <div className="flex h-[450px] flex-col items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#FF4D00] border-t-transparent" />
                <p className="mt-4 font-mono text-xs text-[#888888] uppercase tracking-wider">
                  Resolving Target Credentials...
                </p>
              </div>
            ) : matchedTarget ? (
              editingTarget && editingTarget.id === matchedTarget.id ? (
                <TargetForm
                  initialTarget={editingTarget}
                  onSubmit={handleUpdateTarget}
                  onCancel={() => {
                    setEditingTarget(null);
                    setTargetSubmitError(null);
                  }}
                  isSubmitting={isSubmittingTarget}
                  submitError={targetSubmitError}
                />
              ) : (
                <TargetDetail
                  userId={user.uid}
                  target={matchedTarget}
                  onBack={() => navigate('/')}
                  onEdit={() => {
                    setTargetSubmitError(null);
                    setEditingTarget(matchedTarget);
                  }}
                />
              )
            ) : (
              /* Clean access denied / target not found state — never exposure of data or raw error */
              <AccessDenied onBack={() => navigate('/')} targetId={targetIdFromRoute || undefined} />
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {showCreateForm ? (
              <TargetForm
                onSubmit={handleCreateTarget}
                onCancel={() => {
                  setShowCreateForm(false);
                  setTargetSubmitError(null);
                }}
                isSubmitting={isSubmittingTarget}
                submitError={targetSubmitError}
              />
            ) : (
              <TargetList
                targets={targets}
                onSelectTarget={(target) => navigate(`/target/${target.id}`)}
                onOpenNewTargetForm={() => {
                  setTargetSubmitError(null);
                  setShowCreateForm(true);
                }}
                onDeleteTarget={handleDeleteTarget}
                onLoadStarterTarget={handleLoadStarterTarget}
                isLoading={targetsLoading}
                error={targetsError}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer status */}
      <footer className="border-t border-[#1F1F1F] bg-[#0D0D0D] px-4 py-4 text-center">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 sm:flex-row px-4 text-[11px] font-mono text-[#777777]">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Wiretrap Adversarial Engine • Target isolation active</span>
          </div>
          <div>
            <span>Prompt instructions classified as untrusted data</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
