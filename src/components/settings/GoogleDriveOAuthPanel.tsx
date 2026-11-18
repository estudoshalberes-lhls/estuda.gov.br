import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  FolderSearch,
  LogOut,
  RefreshCw,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { Panel } from '../ui/PageHeader';

interface GoogleDriveOAuthPanelProps {
  onOpenBackupPage?: () => void;
}

export const GoogleDriveOAuthPanel: React.FC<GoogleDriveOAuthPanelProps> = ({
  onOpenBackupPage,
}) => {
  const {
    googleUser,
    firebaseConnected,
    driveConnected,
    driveTokenReady,
    isRenewingDriveToken,
    isSyncingDrive,
    hasPendingCloudChanges,
    drivePermissionNeedsPicker,
    activeDriveFolderName,
    driveFolderUrl,
    lastCloudSyncAt,
    firestoreConnectionMonitor,
    authError,
    connectGoogleDrive,
    disconnectGoogleDrive,
    authorizeDriveFolderViaPicker,
    validateFirestoreConnectionNow,
    setActivePage,
  } = useStudy();

  const [reconnecting, setReconnecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [authorizingFolder, setAuthorizingFolder] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const isExpired =
    driveConnected &&
    ((!driveTokenReady && !isRenewingDriveToken) ||
      firestoreConnectionMonitor.oauthDriveExpired ||
      firestoreConnectionMonitor.status === 'expired');

  const isInconsistent = firestoreConnectionMonitor.status === 'inconsistent';
  const isRenewing = driveConnected && isRenewingDriveToken;
  const needsFolderAuth = driveConnected && driveTokenReady && Boolean(drivePermissionNeedsPicker);
  const isHealthyConnected =
    driveConnected && driveTokenReady && !isExpired && !isInconsistent && !needsFolderAuth;

  const statusMeta = (() => {
    if (!driveConnected) {
      return {
        label: 'Desconectado',
        toneClass: 'text-[var(--muted)]',
        surfaceClass: 'border-[var(--line)] bg-[var(--panel-soft)]',
        Icon: CloudOff,
        summary:
          'Nenhuma conta Google conectada nesta sessão. Conecte para habilitar backups automáticos e sincronização de apostilas e PDFs com o Google Drive.',
      };
    }
    if (isInconsistent) {
      return {
        label: 'Inconsistência de autenticação',
        toneClass: 'text-[var(--bad)]',
        surfaceClass: 'border-[var(--bad)]/40 bg-[var(--bad)]/8',
        Icon: ShieldAlert,
        summary:
          firestoreConnectionMonitor.message ||
          'A conta autenticada apresentou inconsistência. Reconecte sua conta Google para restaurar o acesso completo.',
      };
    }
    if (isExpired) {
      return {
        label: 'Sessão OAuth expirada',
        toneClass: 'text-[var(--bad)]',
        surfaceClass: 'border-[var(--bad)]/40 bg-[var(--bad)]/8',
        Icon: ShieldAlert,
        summary:
          'A permissão OAuth do Google Drive expirou neste navegador ou ainda não foi concedida. Clique em "Reconectar conta Google" para reautorizar o envio de backups e PDFs.',
      };
    }
    if (isRenewing) {
      return {
        label: 'Verificando sessão OAuth…',
        toneClass: 'text-[var(--accent)]',
        surfaceClass: 'border-[var(--accent)]/40 bg-[var(--accent-soft)]',
        Icon: RefreshCw,
        summary: 'Validando credenciais atuais do Google Drive.',
      };
    }
    if (needsFolderAuth) {
      return {
        label: 'Autorização de pasta pendente',
        toneClass: 'text-[var(--warning)]',
        surfaceClass: 'border-[var(--warning)]/45 bg-[var(--warning)]/10',
        Icon: AlertTriangle,
        summary: `A conta Google está conectada, mas a pasta "${drivePermissionNeedsPicker?.folderName}" precisa ser autorizada pelo seletor oficial do Google Drive.`,
      };
    }
    return {
      label: 'Conectado e autorizado',
      toneClass: 'text-[var(--good)]',
      surfaceClass: 'border-[var(--good)]/35 bg-[var(--good)]/8',
      Icon: CheckCircle2,
      summary:
        'A sessão OAuth do Google Drive está ativa em memória e autorizada para sincronizar backups, marcações em PDFs e arquivos de estudo.',
    };
  })();

  const StatusIcon = statusMeta.Icon;

  const handleReconnect = async (forceAccountPicker = false) => {
    setReconnecting(true);
    setActionFeedback(null);
    try {
      const ok = await connectGoogleDrive({
        forceAccountPicker: forceAccountPicker || isInconsistent,
      });
      await validateFirestoreConnectionNow({ silent: true });
      if (ok) {
        setActionFeedback({
          type: 'success',
          message:
            'Conta Google reconectada e permissões do Google Drive atualizadas para esta sessão.',
        });
      } else {
        setActionFeedback({
          type: 'error',
          message:
            'A janela de autenticação foi fechada ou não concluiu a autorização. Tente novamente.',
        });
      }
    } catch (err: unknown) {
      setActionFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Não foi possível reautorizar a conta Google.',
      });
    } finally {
      setReconnecting(false);
    }
  };

  const handleValidateNow = async () => {
    setValidating(true);
    setActionFeedback(null);
    try {
      const report = await validateFirestoreConnectionNow({ silent: false });
      if (report?.status === 'healthy' && driveTokenReady) {
        setActionFeedback({
          type: 'success',
          message: 'Conexão Firebase e autorização OAuth do Google Drive validadas com sucesso.',
        });
      } else if (driveConnected && !driveTokenReady) {
        setActionFeedback({
          type: 'error',
          message:
            'A conta está vinculada, mas o token OAuth do Google Drive expirou. Clique em "Reconectar conta Google".',
        });
      }
    } finally {
      setValidating(false);
    }
  };

  const handleAuthorizeFolder = async () => {
    setAuthorizingFolder(true);
    setActionFeedback(null);
    try {
      const ok = await authorizeDriveFolderViaPicker();
      if (ok) {
        setActionFeedback({
          type: 'success',
          message: 'Pasta do Google Drive autorizada com sucesso.',
        });
      }
    } finally {
      setAuthorizingFolder(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setActionFeedback(null);
    try {
      await disconnectGoogleDrive();
    } finally {
      setDisconnecting(false);
    }
  };

  const primaryButtonLabel = reconnecting
    ? 'Reconectando…'
    : driveConnected
      ? 'Reconectar conta Google'
      : 'Conectar conta Google';

  const lastCheckedFormatted = firestoreConnectionMonitor.lastCheckedAt
    ? new Date(firestoreConnectionMonitor.lastCheckedAt).toLocaleTimeString('pt-BR')
    : null;

  const lastCloudSyncFormatted = lastCloudSyncAt
    ? new Date(lastCloudSyncAt).toLocaleString('pt-BR')
    : null;

  return (
    <Panel
      title="Conexão OAuth do Google Drive"
      subtitle="Acompanhe o estado da autorização com sua conta Google e reautorize o acesso ao Google Drive sempre que a sessão expirar."
      action={
        <button
          type="button"
          onClick={() => void handleReconnect(false)}
          disabled={reconnecting || isSyncingDrive || disconnecting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 shrink-0 ${reconnecting ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{primaryButtonLabel}</span>
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div
          className={`rounded-lg border px-4 py-3.5 flex flex-col gap-2 ${statusMeta.surfaceClass}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon
                className={`w-4 h-4 shrink-0 ${statusMeta.toneClass} ${isRenewing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <strong className={`text-[13.5px] font-bold ${statusMeta.toneClass}`}>
                {statusMeta.label}
              </strong>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--muted)] font-mono-num tabular-nums">
              <span>{firebaseConnected ? 'Firebase ativo' : 'Firebase inativo'}</span>
              {lastCheckedFormatted && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Verificado às {lastCheckedFormatted}</span>
                </>
              )}
            </div>
          </div>

          <p className="m-0 text-[12.5px] text-[var(--text)] leading-relaxed">
            {statusMeta.summary}
          </p>

          {hasPendingCloudChanges && (
            <p className="m-0 text-[12px] font-semibold text-[var(--warning)]">
              Existem alterações pendentes aguardando envio automático para a nuvem assim que a sessão OAuth estiver autorizada.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 border-t border-[var(--line)]">
          <div className="pt-3 min-w-0">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Conta Google vinculada</div>
            <div className="mt-1 flex items-center gap-1.5 min-w-0">
              <UserCheck className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
              <strong className="text-[13px] font-bold text-[var(--text)] truncate">
                {driveConnected
                  ? googleUser?.email || googleUser?.displayName || 'Conta autenticada'
                  : 'Nenhuma conta conectada'}
              </strong>
            </div>
            <div className="mt-1 text-[11.5px] text-[var(--muted)]">
              {driveConnected
                ? googleUser?.displayName && googleUser?.email
                  ? googleUser.displayName
                  : 'Autenticação Google vinculada'
                : 'Entre com uma conta Google autorizada'}
            </div>
          </div>

          <div className="pt-3 min-w-0 md:border-l md:border-[var(--line)] md:pl-4">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Permissão OAuth (Drive)</div>
            <strong
              className={`mt-1 block text-[13px] font-bold ${
                isHealthyConnected
                  ? 'text-[var(--good)]'
                  : isExpired || isInconsistent
                    ? 'text-[var(--bad)]'
                    : needsFolderAuth
                      ? 'text-[var(--warning)]'
                      : 'text-[var(--text)]'
              }`}
            >
              {isHealthyConnected
                ? 'Token ativo em memória'
                : isRenewing
                  ? 'Renovando permissão…'
                  : isExpired
                    ? 'Token expirado ou ausente'
                    : needsFolderAuth
                      ? 'Aguardando seleção de pasta'
                      : 'Aguardando autorização'}
            </strong>
            <div className="mt-1 text-[11.5px] text-[var(--muted)] font-mono-num">
              Escopos: drive.file · drive.metadata.readonly
            </div>
          </div>

          <div className="pt-3 min-w-0 md:border-l md:border-[var(--line)] md:pl-4">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Pasta ativa e sincronização</div>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <strong className="text-[13px] font-bold text-[var(--text)] truncate">
                {driveConnected ? activeDriveFolderName : 'Não definida'}
              </strong>
              {driveFolderUrl && (
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--accent)] hover:underline whitespace-nowrap shrink-0"
                >
                  <span>Abrir</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              )}
            </div>
            <div className="mt-1 text-[11.5px] text-[var(--muted)] font-mono-num tabular-nums">
              {lastCloudSyncFormatted
                ? `Último envio: ${lastCloudSyncFormatted}`
                : 'Nenhum envio registrado nesta sessão'}
            </div>
          </div>
        </div>

        {(authError || actionFeedback) && (
          <div
            role="status"
            className={`rounded-lg border px-3.5 py-2.5 text-[12px] leading-relaxed ${
              actionFeedback?.type === 'success' && !authError
                ? 'border-[var(--good)]/40 bg-[var(--good)]/8 text-[var(--text)]'
                : 'border-[var(--bad)]/40 bg-[var(--bad)]/8 text-[var(--bad)]'
            }`}
          >
            {authError || actionFeedback?.message}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3.5 border-t border-[var(--line)]">
          <div className="flex flex-wrap items-center gap-2">
            {needsFolderAuth && (
              <button
                type="button"
                onClick={() => void handleAuthorizeFolder()}
                disabled={authorizingFolder || isSyncingDrive}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--warning)]/60 bg-[var(--warning)]/12 text-[var(--warning)] text-[12px] font-bold hover:bg-[var(--warning)]/20 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderSearch className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{authorizingFolder ? 'Abrindo seletor…' : 'Autorizar pasta no Drive'}</span>
              </button>
            )}

            {driveConnected && (
              <button
                type="button"
                onClick={() => void handleReconnect(true)}
                disabled={reconnecting || isSyncingDrive || disconnecting}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-semibold hover:border-[var(--accent)] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Trocar conta Google</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleValidateNow()}
              disabled={validating || reconnecting}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-semibold hover:border-[var(--accent)] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${validating ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{validating ? 'Verificando…' : 'Verificar conexão'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenBackupPage) {
                  onOpenBackupPage();
                } else {
                  setActivePage('Backup e Restauração');
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)] text-[12px] font-semibold hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Gerenciar backups</span>
            </button>
          </div>

          {driveConnected && (
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={disconnecting || reconnecting}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{disconnecting ? 'Saindo…' : 'Desconectar'}</span>
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
};
