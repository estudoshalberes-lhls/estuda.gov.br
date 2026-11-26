import React, { useEffect, useRef, useState } from 'react';
import { CloudUpload, RefreshCw, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useStudySyncSlice } from '../../context/studySliceStore';
import { useStudy } from '../../context/StudyContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const syncSlice = useStudySyncSlice();
  const {
    processGasQueueNow,
    triggerActiveSyncPushNow,
    saveCloudBackup,
    toast,
  } = useStudy();

  const wasOfflineRef = useRef<boolean>(!isOnline);
  const [retrying, setRetrying] = useState(false);

  const hasCloudAccount = syncSlice.driveConnected || syncSlice.gasConnected;
  const pendingTotal = syncSlice.totalPendingSyncCount;

  const triggerSyncRetry = async (silent = false) => {
    if (retrying || !hasCloudAccount) return;
    setRetrying(true);
    try {
      if (syncSlice.gasConnected) {
        if (syncSlice.gasQueueCount > 0) {
          await processGasQueueNow({ forceAll: true });
        }
        await triggerActiveSyncPushNow();
      } else if (syncSlice.driveConnected) {
        await saveCloudBackup();
      }
      if (!silent) {
        toast('Fila offline sincronizada com a nuvem!');
      }
    } catch {
      if (!silent) {
        toast('Não foi possível sincronizar agora. Tentaremos novamente automaticamente.', true);
      }
    } finally {
      setRetrying(false);
    }
  };

  // Automatic retry when reconnecting after being offline
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current && hasCloudAccount && pendingTotal > 0) {
      wasOfflineRef.current = false;
      const timer = window.setTimeout(() => {
        void triggerSyncRetry(true);
      }, 1200);
      return () => window.clearTimeout(timer);
    }
    wasOfflineRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, hasCloudAccount, pendingTotal]);

  // 1. Offline banner with queued changes counter
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-print-hide="true"
        className="fixed bottom-16 left-3 sm:bottom-4 sm:left-4 z-40 flex items-center gap-2.5 rounded-xl border border-amber-700/30 bg-amber-600 px-3.5 py-2 text-[11.5px] font-bold text-white shadow-lg print:hidden"
      >
        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <div className="flex flex-col leading-tight">
          <span>Modo Offline — Dados salvos localmente</span>
          {pendingTotal > 0 && (
            <span className="text-[10.5px] font-medium text-amber-100 tabular-nums">
              {pendingTotal} {pendingTotal === 1 ? 'alteração na fila' : 'alterações na fila'} · sincroniza ao reconectar
            </span>
          )}
        </div>
      </div>
    );
  }

  // 2. Back online with queued items waiting to sync (only when cloud is connected and > 0)
  if (hasCloudAccount && (syncSlice.gasQueueCount > 0 || syncSlice.driveOutboxCount > 0)) {
    const queuedOps = syncSlice.gasQueueCount + syncSlice.driveOutboxCount;
    return (
      <div
        role="status"
        aria-live="polite"
        data-print-hide="true"
        className="fixed bottom-16 left-3 sm:bottom-4 sm:left-4 z-40 flex items-center gap-2.5 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-[11.5px] text-[var(--text)] shadow-lg print:hidden"
      >
        <CloudUpload className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
        <span className="font-semibold tabular-nums">
          {queuedOps} {queuedOps === 1 ? 'item na fila da nuvem' : 'itens na fila da nuvem'}
        </span>
        <button
          type="button"
          disabled={retrying || syncSlice.isSyncing}
          onClick={() => void triggerSyncRetry(false)}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer whitespace-nowrap"
        >
          <RefreshCw
            className={`w-3 h-3 ${retrying || syncSlice.isSyncing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Sincronizar
        </button>
      </div>
    );
  }

  return null;
};
