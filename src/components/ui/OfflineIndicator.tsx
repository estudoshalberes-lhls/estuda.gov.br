import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 left-3 sm:bottom-4 sm:left-4 z-40 flex items-center gap-2 rounded-xl border border-amber-600/30 bg-amber-600 px-3 py-1.5 text-[11.5px] font-bold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Modo Offline — Dados locais em uso.</span>
    </div>
  );
};
