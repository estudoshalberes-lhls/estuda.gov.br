import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';

export const FirestoreAuthAlertBanner: React.FC = () => {
  const {
    firestoreConnectionMonitor,
    validateFirestoreConnectionNow,
    dismissFirestoreConnectionAlert,
    connectGoogleDrive,
    driveConnected,
    driveTokenReady,
    isRenewingDriveToken,
    hasPendingCloudChanges,
    gasConnected,
    setActivePage,
  } = useStudy();
  const [checking, setChecking] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  if (gasConnected) {
    return null;
  }

  const { status, code, message, lastCheckedAt, consecutiveFailures, oauthDriveExpired, dismissed } =
    firestoreConnectionMonitor;

  const isDriveOAuthPending =
    driveConnected &&
    !driveTokenReady &&
    !isRenewingDriveToken &&
    (oauthDriveExpired || hasPendingCloudChanges);

  const shouldDisplay =
    !dismissed &&
    (status === 'expired' ||
      status === 'inconsistent' ||
      isDriveOAuthPending ||
      (status === 'warning' && consecutiveFailures >= 2));

  if (!shouldDisplay) {
    return null;
  }

  const isOAuthDriveExpired = code === 'oauth/drive-token-expired' || (isDriveOAuthPending && status === 'healthy');
  const displayCode = isOAuthDriveExpired && !code ? 'oauth/drive-token-expired' : code;
  const isCritical = status === 'expired' || status === 'inconsistent';
  const title = isOAuthDriveExpired
    ? 'Sessão do Google Drive Expirada'
    : status === 'expired'
      ? 'Sessão do Firebase Expirada'
      : status === 'inconsistent'
        ? 'Inconsistência de Autenticação no Firebase'
        : 'Instabilidade na Conexão com o Firestore';

  const displayMessage = isOAuthDriveExpired
    ? 'O Firebase Firestore está ativo, mas o token OAuth do Google Drive expirou ou não está presente nesta janela. Clique em "Reconectar conta Google" para reativar backups e exclusões no Drive.'
    : message || 'Não foi possível confirmar a autenticação com o Firebase Firestore.';

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await connectGoogleDrive({ forceAccountPicker: status === 'inconsistent' });
      await validateFirestoreConnectionNow({ silent: true });
    } finally {
      setReconnecting(false);
    }
  };

  const handleRevalidate = async () => {
    setChecking(true);
    try {
      await validateFirestoreConnectionNow({ silent: false });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full max-w-[1440px] mx-auto px-4 sm:px-7 pt-4"
    >
      <div
        className={`rounded-xl border px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs ${
          isCritical
            ? 'border-[var(--bad)]/45 bg-[var(--bad)]/10 text-[var(--text)]'
            : 'border-amber-500/45 bg-amber-500/10 text-[var(--text)]'
        }`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          {isCritical ? (
            <ShieldAlert className="w-5 h-5 text-[var(--bad)] shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong
                className={`text-[13px] font-bold ${
                  isCritical ? 'text-[var(--bad)]' : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {title}
              </strong>
              {displayCode && (
                <span className="font-mono-num text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--panel)] border border-[var(--line)] text-[var(--muted)]">
                  {displayCode}
                </span>
              )}
              {lastCheckedAt && (
                <span className="text-[11px] text-[var(--muted)] font-mono-num">
                  Verificado às {new Date(lastCheckedAt).toLocaleTimeString('pt-BR')}
                </span>
              )}
            </div>
            <p className="m-0 mt-1 text-[12px] text-[var(--text)] leading-relaxed">
              {displayMessage}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleReconnect()}
            disabled={reconnecting || checking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{reconnecting ? 'Reconectando…' : 'Reconectar conta Google'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePage('Configurações')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[12px] font-semibold hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>Configurações OAuth</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRevalidate()}
            disabled={reconnecting || checking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[12px] font-semibold hover:border-[var(--accent)] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>{checking ? 'Validando…' : 'Validar Agora'}</span>
          </button>

          <button
            type="button"
            onClick={dismissFirestoreConnectionAlert}
            aria-label="Dispensar alerta de autenticação"
            title="Dispensar alerta temporariamente"
            className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
