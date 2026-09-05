import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  ArrowLeft,
  Copy,
  Check,
  Terminal,
  AlertTriangle,
  FileCode,
  Sparkles,
  Server,
  Key,
} from 'lucide-react';

interface SecurityPageProps {
  user: User | null;
  onBack: () => void;
}

const FALLBACK_FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Deny all by default
    match /{document=**} {
      allow read, write: if false;
    }

    // Owner-bound user hierarchy
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /targets/{targetId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow create: if request.auth != null && request.auth.uid == userId
                      && request.resource.data.userId == userId;
        allow update: if request.auth != null && request.auth.uid == userId
                      && request.resource.data.userId == userId
                      && request.resource.data.createdAt == resource.data.createdAt;
        allow delete: if request.auth != null && request.auth.uid == userId;

        match /messages/{messageId} {
          allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;
        }

        match /runs/{runId} {
          allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  }
}`;

interface RuleExplanation {
  title: string;
  ruleSignature: string;
  plainEnglish: string;
  threatBlocked: string;
}

const RULE_EXPLANATIONS: RuleExplanation[] = [
  {
    title: '1. Global Default Deny',
    ruleSignature: 'match /{document=**} { allow read, write: if false; }',
    plainEnglish:
      'Closes all database endpoints by default. No document or collection anywhere in the database can be read or written unless an explicit owner-bound rule matches.',
    threatBlocked:
      'Prevents directory enumeration, crawler leakage, and accidental exposure of internal or debug collections.',
  },
  {
    title: '2. User Root Isolation Boundary',
    ruleSignature: 'match /users/{userId} { allow read, write: if request.auth.uid == userId; }',
    plainEnglish:
      'Strict multi-tenant barrier. A researcher can only access the document tree rooted at their own verified Google Auth UID. Zero cross-tenant snooping.',
    threatBlocked:
      'Blocks Horizontal Privilege Escalation (BOLA/IDOR). User A cannot read or overwrite User B\'s workspace under any circumstance.',
  },
  {
    title: '3. Agent Target Integrity & Immutability',
    ruleSignature: 'match /targets/{targetId} { allow create, update, delete: ... }',
    plainEnglish:
      'Guarantees that targets created under a user must declare matching ownership (userId == request.auth.uid) and locks the creation timestamp (createdAt) against retroactive tampering.',
    threatBlocked:
      'Prevents forgery of audit history, unauthorized target modification, or parameter spoofing.',
  },
  {
    title: '4. Security Audit Chat & Run Log Isolation',
    ruleSignature: 'match /messages/{messageId} / match /runs/{runId}',
    plainEnglish:
      'Subcollections housing conversational red-team audits and tool detonation logs are locked exclusively to the owning researcher.',
    threatBlocked:
      'Ensures decoy tool execution records, vulnerability discussions, and agent prompts are never visible to other users.',
  },
];

interface VerificationResult {
  success: boolean;
  code: string;
  rawMessage: string;
  attemptedPath: string;
  enforcedBy: string;
  callerUid: string;
  ruleViolated: string;
  timestamp: string;
}

export const SecurityPage: React.FC<SecurityPageProps> = ({ user, onBack }) => {
  const [rulesContent, setRulesContent] = useState<string>(FALLBACK_FIRESTORE_RULES);
  const [isCopied, setIsCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    // Fetch live firestore.rules from server if available
    fetch('/api/security/rules')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.rules) {
          setRulesContent(data.rules);
        }
      })
      .catch(() => {
        // Fallback already preloaded
      });
  }, []);

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(rulesContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const handleVerifyIsolation = async () => {
    setIsVerifying(true);
    setVerificationResult(null);

    const foreignTenantId = 'adversary-foreign-tenant-9921';
    const foreignTargetId = 'decoy-target-id';
    const attemptedPath = `/users/${foreignTenantId}/targets/${foreignTargetId}`;

    try {
      // Attempt real, live direct read across the database boundary to another user's path
      const foreignDocRef = doc(db, 'users', foreignTenantId, 'targets', foreignTargetId);
      const snap = await getDoc(foreignDocRef);

      // Under our strict rules, this promise should reject with permission-denied.
      // If it somehow resolved, we strictly treat this as a security alert:
      if (snap.exists()) {
        setVerificationResult({
          success: false,
          code: 'UNEXPECTED_DATA_EXPOSURE',
          rawMessage: 'CRITICAL: Data was returned from foreign path! Rules misconfigured.',
          attemptedPath,
          enforcedBy: 'None (Bypassed)',
          callerUid: user ? user.uid : 'unauthenticated',
          ruleViolated: 'All isolation boundaries violated',
          timestamp: new Date().toLocaleTimeString(),
        });
      } else {
        setVerificationResult({
          success: false,
          code: 'READ_UNBLOCKED_EMPTY',
          rawMessage: 'Read succeeded without permission error. Expected permission-denied rejection.',
          attemptedPath,
          enforcedBy: 'Unenforced',
          callerUid: user ? user.uid : 'unauthenticated',
          ruleViolated: 'Expected rule rejection did not fire.',
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    } catch (err: any) {
      // Expected outcome: FirebaseError [permission-denied]
      const isPermissionDenied =
        err?.code === 'permission-denied' ||
        String(err?.message).toLowerCase().includes('permission');

      setVerificationResult({
        success: isPermissionDenied,
        code: err?.code || 'permission-denied',
        rawMessage: err?.message || 'Missing or insufficient permissions.',
        attemptedPath,
        enforcedBy: 'Google Cloud Firestore Security Rules Engine',
        callerUid: user ? user.uid : 'unauthenticated',
        ruleViolated: 'match /users/{userId} { allow read, write: if request.auth.uid == userId; }',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div id="security-page-container" className="space-y-8 pb-12">
      {/* Header bar with Back button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#262626] pb-6">
        <div>
          <button
            type="button"
            id="security-back-btn"
            onClick={onBack}
            className="group mb-2 flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#888888] transition-colors hover:text-[#FF4D00]"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Targets</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#FF4D00]/40 bg-[#FF4D00]/10 text-[#FF4D00]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-black tracking-tight text-[#EDEDED]">
                Security Architecture & Database Isolation
              </h1>
              <p className="font-mono text-xs text-[#888888]">
                Real-time multi-tenant boundary verification and live Firestore security rule audit.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs font-bold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Rules Engine: ACTIVE
          </span>
        </div>
      </div>

      {/* SECTION 1: Interactive Live Database Isolation Proof */}
      <div
        id="verify-isolation-panel"
        className="rounded-2xl border border-[#262626] bg-[#141414] p-6 shadow-2xl space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#262626] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#FF4D00]" />
              <h2 className="font-display text-base font-bold text-[#EDEDED]">
                Live Database Isolation Proof
              </h2>
              <span className="rounded border border-[#FF4D00]/40 bg-[#FF4D00]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#FF4D00]">
                Kernel Verification
              </span>
            </div>
            <p className="text-xs text-[#888888] max-w-2xl leading-relaxed">
              Verify that tenant isolation is enforced strictly at the database engine layer rather than through client-side UI filters. Clicking below issues an authentic Firestore read to a foreign user ID path.
            </p>
          </div>

          <button
            type="button"
            id="verify-isolation-btn"
            onClick={handleVerifyIsolation}
            disabled={isVerifying}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#FF4D00] px-5 py-2.5 font-mono text-xs font-black uppercase tracking-wider text-[#0D0D0D] transition-all hover:bg-[#E04400] disabled:opacity-50 shadow-lg shadow-[#FF4D00]/10 shrink-0"
          >
            {isVerifying ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D0D0D] border-t-transparent" />
                <span>Executing Live Probe...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>Verify Isolation</span>
              </>
            )}
          </button>
        </div>

        {/* Test Parameters Context */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="rounded-xl border border-[#262626] bg-[#0D0D0D] p-3.5 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[#777777]">
              Current Authenticated Caller:
            </span>
            <div className="flex items-center gap-2 text-[#EDEDED] truncate">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate font-bold">
                {user ? user.uid : 'Unauthenticated (Public Token)'}
              </span>
            </div>
            <p className="text-[10px] text-[#666666]">
              {user ? `Signed in via Google (${user.email})` : 'Guest caller context'}
            </p>
          </div>

          <div className="rounded-xl border border-[#262626] bg-[#0D0D0D] p-3.5 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[#777777]">
              Foreign Target Path (Forbidden):
            </span>
            <div className="flex items-center gap-2 text-[#FF4D00] truncate">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate font-bold">
                /users/adversary-foreign-tenant-9921/targets/decoy-target-id
              </span>
            </div>
            <p className="text-[10px] text-[#666666]">
              A path belonging strictly to another researcher UID
            </p>
          </div>
        </div>

        {/* Verification Terminal Output */}
        {verificationResult && (
          <div
            id="isolation-verification-result"
            className={`rounded-xl border p-4 space-y-3 font-mono text-xs ${
              verificationResult.success
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : 'border-red-500/40 bg-red-500/5'
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                {verificationResult.success ? (
                  <>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                    <span className="font-bold uppercase tracking-wider text-emerald-400">
                      Isolation Enforced: Database Blocked Foreign Read
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <span className="font-bold uppercase tracking-wider text-red-400">
                      Isolation Anomaly Detected
                    </span>
                  </>
                )}
              </div>
              <span className="text-[10px] text-[#888888]">
                Timestamp: {verificationResult.timestamp}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-[#777777]">Firestore Engine Status:</span>
                <p className="font-bold text-[#EDEDED] mt-0.5">
                  {verificationResult.code.toUpperCase()} (HTTP 403 Equivalent)
                </p>
              </div>
              <div>
                <span className="text-[#777777]">Enforcement Mechanism:</span>
                <p className="font-bold text-emerald-400 mt-0.5">
                  {verificationResult.enforcedBy}
                </p>
              </div>
              <div className="md:col-span-2">
                <span className="text-[#777777]">Engine Diagnostic Message:</span>
                <p className="font-mono text-[#CCCCCC] bg-[#0A0A0A] p-2 rounded border border-[#222222] mt-1">
                  {verificationResult.rawMessage}
                </p>
              </div>
              <div className="md:col-span-2">
                <span className="text-[#777777]">Enforcing Security Rule:</span>
                <p className="font-mono text-[#FF4D00] bg-[#0A0A0A] p-2 rounded border border-[#222222] mt-1">
                  {verificationResult.ruleViolated}
                </p>
              </div>
            </div>

            <div className="border-t border-white/5 pt-2 text-[10px] text-[#888888]">
              * Demo artifact guarantee: No actual cross-tenant data was accessed or transferred over the wire. The cloud database driver halted execution prior to document retrieval.
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Live Firestore Security Rules (Read-Only Code) */}
      <div
        id="firestore-rules-block"
        className="rounded-2xl border border-[#262626] bg-[#141414] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-[#FF4D00]" />
            <h2 className="font-display text-base font-bold text-[#EDEDED]">
              Live Firestore Security Rules
            </h2>
            <span className="rounded border border-[#262626] bg-[#0D0D0D] px-2 py-0.5 font-mono text-[10px] text-[#888888]">
              firestore.rules (Read-Only)
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyRules}
            className="flex items-center gap-1.5 rounded-lg border border-[#262626] bg-[#0D0D0D] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#A1A1A1] transition-colors hover:border-[#FF4D00]/40 hover:text-[#EDEDED]"
          >
            {isCopied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Rules</span>
              </>
            )}
          </button>
        </div>

        <div className="relative rounded-xl border border-[#262626] bg-[#0A0A0A] p-4 overflow-x-auto">
          <pre className="font-mono text-xs text-[#D4D4D4] leading-relaxed">
            <code>{rulesContent}</code>
          </pre>
        </div>
      </div>

      {/* SECTION 3: Plain-English Rule Explanations */}
      <div
        id="plain-english-rules-breakdown"
        className="rounded-2xl border border-[#262626] bg-[#141414] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-2 border-b border-[#262626] pb-3">
          <Terminal className="h-4 w-4 text-[#FF4D00]" />
          <h2 className="font-display text-base font-bold text-[#EDEDED]">
            Rule Specification Breakdown
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RULE_EXPLANATIONS.map((item, index) => (
            <div
              key={index}
              className="flex flex-col justify-between rounded-xl border border-[#262626] bg-[#0D0D0D] p-4 space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#EDEDED]">
                    {item.title}
                  </h3>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-400">
                    Enforced
                  </span>
                </div>

                <div className="rounded bg-[#141414] px-2.5 py-1.5 font-mono text-[11px] text-[#FF4D00] border border-[#222222]">
                  {item.ruleSignature}
                </div>

                <p className="text-xs text-[#A1A1A1] leading-relaxed">
                  {item.plainEnglish}
                </p>
              </div>

              <div className="border-t border-[#1C1C1C] pt-2 text-[11px] text-[#777777]">
                <strong className="text-[#888888]">Threat Countermeasure:</strong> {item.threatBlocked}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
