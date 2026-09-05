import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface AccessDeniedProps {
  onBack: () => void;
  targetId?: string;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ onBack, targetId }) => {
  return (
    <div
      id="target-access-denied-view"
      className="flex min-h-[500px] flex-col items-center justify-center rounded-2xl border border-[#262626] bg-[#141414] p-8 text-center shadow-2xl"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#FF4D00]/40 bg-[#FF4D00]/10 text-[#FF4D00] shadow-lg shadow-[#FF4D00]/5">
        <ShieldAlert className="h-8 w-8" />
      </div>

      <h2 className="mt-6 font-display text-2xl font-black tracking-tight text-[#EDEDED]">
        Target not found or access denied
      </h2>

      <p className="mt-2 max-w-md text-xs text-[#888888] leading-relaxed">
        The requested agent target cannot be loaded. It either does not exist or belongs to another user account. Wiretrap strictly isolates each researcher's targets and tools at the database layer.
      </p>

      {targetId && (
        <div className="mt-4 inline-block rounded-lg border border-[#262626] bg-[#0D0D0D] px-3 py-1 font-mono text-[11px] text-[#777777]">
          Target ID: <span className="text-[#A1A1A1]">{targetId}</span>
        </div>
      )}

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          id="back-to-targets-denied-btn"
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl bg-[#FF4D00] px-5 py-2.5 font-mono text-xs font-black uppercase tracking-wider text-[#0D0D0D] transition-all hover:bg-[#E04400] shadow-lg shadow-[#FF4D00]/10"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Targets Dashboard</span>
        </button>
      </div>

      <div className="mt-8 border-t border-[#222222] pt-4 font-mono text-[10px] text-[#555555]">
        Isolation Boundary: Firestore Security Rules <span className="text-[#FF4D00] font-bold">request.auth.uid == userId</span>
      </div>
    </div>
  );
};
