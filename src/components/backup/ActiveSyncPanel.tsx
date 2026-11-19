import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  CloudDownload,
  CloudUpload,
  Lock,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { Panel } from '../ui/PageHeader';

function formatShortChecksum(hash?: string | null): string {
  const clean = String(hash || '').trim();
  if (!clean) return '—';
  if (clean.length <= 16) return clean;
  return `${clean.slice(0, 8)}…${clean.slice(-6)}`;
}

function formatDateTimeShort(iso?: string | null): string {
  if (!iso) return 'Ainda não verificado';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const ActiveSyncPanel: React.FC = () => {
  const {
    gasConnected,
    gasConnectionHealth,
    gasOperationQueue,
    activeSyncState,
    verifyActiveSyncChecksumNow,
    triggerActiveSyncPushNow,
    resolveVersionDivergenceKeepDrive,
    resolveVersionDivergenceKeepLocal,
    resolvingConflictAction,
    isSyncingDrive,
    requestConfirm,
  } = useStudy();

  const [checkingNow, setCheckingNow] = useState(false);
  const [pushingNow, setPushingNow] = useState(false);
  const autoCheckedRef = useRef(false);

  // Realiza uma verificação silenciosa inicial ao abrir a página de Backup com sessão ativa
  useEffect(() => {
    if (!gasConnected || autoCheckedRef.current) return;
    if (activeSyncState.lastCheckedAt) {
      autoCheckedRef.current = true;
      return;
    }
    autoCheckedRef.current = true;
    void verifyActiveSyncChecksumNow({ silent: true });
  }, [activeSyncState.lastCheckedAt, gasConnected, verifyActiveSyncChecksumNow]);

  const handleVerifyNow = async () => {
    setCheckingNow(true);
    try {
      await verifyActiveSyncChecksumNow({ silent: false });
    } finally {
      setCheckingNow(false);
    }
  };

  const handlePushNow = async () => {
    setPushingNow(true);
    try {
      await triggerActiveSyncPushNow();
    } finally {
      setPushingNow(false);
    }
  };

  const handleForceOverwrite = async () => {
    const confirmed = await requestConfirm({
      title: 'Sobrescrever versão mais recente da nuvem?',
      description:
        'A Sincronização Ativa bloqueou a gravação porque a planilha de controle no Google Apps Script possui um checksum/versão mais recente. Um ponto de restauração local será salvo antes, mas os dados atuais da nuvem serão substituídos pelos deste dispositivo. Deseja continuar?',
      confirmLabel: 'Forçar gravação local',
      danger: true,
    });
    if (!confirmed) return;
    await resolveVersionDivergenceKeepLocal();
  };

  const isChecking = checkingNow || activeSyncState.status === 'checking';
  const isBlocked = activeSyncState.status === 'blocked-conflict';
  const isOfflineQueued =
    activeSyncState.status === 'offline-queued' || gasConnectionHealth.status === 'offline';
  const isInSync = activeSyncState.status === 'in-sync';
  const isLocalAhead = activeSyncState.status === 'local-ahead';

  const waitingQueueCount = gasOperationQueue.filter(
    (item) => item.status === 'waiting-connection',
  ).length;

  const statusMeta = !gasConnected
    ? {
        icon: <Lock className="w-4 h-4 text-[var(--muted)] shrink-0" aria-hidden="true" />,
        label: 'Aguardando sessão ativa do Google Apps Script',
        toneClass: 'text-[var(--muted)]',
        detail: 'Conecte sua conta para ativar a validação automática de checksum contra a planilha de controle.',
      }
    : isBlocked
      ? {
          icon: <ShieldAlert className="w-4 h-4 text-[var(--bad)] shrink-0" aria-hidden="true" />,
          label: 'Gravação bloqueada — divergência na planilha de controle',
          toneClass: 'text-[var(--bad)]',
          detail:
            activeSyncState.blockedReason ||
            'Outro dispositivo gravou uma versão mais recente no Google Apps Script. Puxe a versão mais recente antes de continuar.',
        }
      : isOfflineQueued
        ? {
            icon: <WifiOff className="w-4 h-4 text-[var(--warning)] shrink-0" aria-hidden="true" />,
            label: 'Offline — gravações protegidas na fila local',
            toneClass: 'text-[var(--warning)]',
            detail:
              gasOperationQueue.length > 0
                ? `${gasOperationQueue.length} operação(ões) salva(s) no LocalStorage com ID e timestamp; o reenvio ocorrerá automaticamente quando a conexão for restabelecida.`
                : 'Sem conexão com a internet no momento. Alterações locais serão enfileiradas e verificadas por checksum assim que a rede voltar.',
          }
        : isInSync
          ? {
              icon: <ShieldCheck className="w-4 h-4 text-[var(--good)] shrink-0" aria-hidden="true" />,
              label: 'Sincronizado — gravação liberada',
              toneClass: 'text-[var(--good)]',
              detail:
                'O estado local coincide exatamente com o registro mais recente da planilha de controle (tb_estado).',
            }
          : isLocalAhead
            ? {
                icon: <CheckCircle2 className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />,
                label: 'Base verificada — alterações locais prontas para envio',
                toneClass: 'text-[var(--accent)]',
                detail:
                  'Este dispositivo possui a versão mais recente da planilha de controle e está autorizado a gravar as novas edições.',
              }
            : {
                icon: <ShieldCheck className="w-4 h-4 text-[var(--text)] shrink-0" aria-hidden="true" />,
                label: 'Proteção pré-gravação ativa',
                toneClass: 'text-[var(--text)]',
                detail:
                  'Antes de cada gravação na nuvem, o checksum e a versão locais são comparados com a planilha de controle do Google Apps Script.',
              };

  return (
    <Panel
      title="Sincronização Ativa (Verificação de Checksum e Versão)"
      subtitle="Compara o checksum e a versão local com a planilha de controle no Google Apps Script antes de cada gravação, impedindo sobrescritas acidentais quando outro dispositivo salvou dados mais recentes."
      className="mb-4"
    >
      {/* Faixa de status operacional e ações primárias */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-[var(--line)]">
        <div className="min-w-0 flex-1">
          <div className={`inline-flex items-center gap-2 text-[13px] font-bold ${statusMeta.toneClass}`}>
            {statusMeta.icon}
            <span>{statusMeta.label}</span>
          </div>
          <p className="text-[12px] text-[var(--muted)] mt-1 leading-relaxed">{statusMeta.detail}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleVerifyNow()}
            disabled={!gasConnected || isChecking}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCcw className={`w-3.5 h-3.5 shrink-0 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Verificando checksum…' : 'Verificar integridade agora'}</span>
          </button>

          {isBlocked && (
            <>
              <button
                type="button"
                onClick={() => void resolveVersionDivergenceKeepDrive()}
                disabled={Boolean(resolvingConflictAction)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CloudDownload className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {resolvingConflictAction === 'keep-drive'
                    ? 'Puxando versão recente…'
                    : 'Puxar versão mais recente'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleForceOverwrite()}
                disabled={Boolean(resolvingConflictAction)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--bad)]/50 bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--bad)] hover:border-[var(--bad)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                <span>Forçar envio local</span>
              </button>
            </>
          )}

          {!isBlocked && isLocalAhead && gasConnected && !isOfflineQueued && (
            <button
              type="button"
              onClick={() => void handlePushNow()}
              disabled={pushingNow || isSyncingDrive}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CloudUpload className="w-3.5 h-3.5 shrink-0" />
              <span>{pushingNow || isSyncingDrive ? 'Sincronizando…' : 'Gravar com verificação'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Grade de comparação estruturada (Local × Planilha de Controle × Trava × Fila) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--muted)]">
            Estado local (este dispositivo)
          </div>
          <div
            title={activeSyncState.localChecksum || undefined}
            className="font-mono-num text-[14px] font-bold text-[var(--text)] mt-1 truncate"
          >
            {formatShortChecksum(activeSyncState.localChecksum)}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1 font-mono-num">
            Base sincronizada: v{activeSyncState.localBaseVersion}
            {activeSyncState.baseChecksum
              ? ` · ${formatShortChecksum(activeSyncState.baseChecksum)}`
              : ''}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--muted)]">
            Planilha de controle ({activeSyncState.controlSheetTable || 'tb_estado'})
          </div>
          <div
            title={activeSyncState.remoteChecksum || undefined}
            className={`font-mono-num text-[14px] font-bold mt-1 truncate ${
              isBlocked ? 'text-[var(--bad)]' : 'text-[var(--text)]'
            }`}
          >
            {formatShortChecksum(activeSyncState.remoteChecksum)}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1 font-mono-num truncate">
            {activeSyncState.remoteVersion !== null ? `v${activeSyncState.remoteVersion}` : 'v—'}
            {activeSyncState.remoteDevice ? ` · ${activeSyncState.remoteDevice}` : ''}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--muted)]">
            Trava pré-gravação
          </div>
          <div
            className={`text-[14px] font-bold mt-1 ${
              isBlocked
                ? 'text-[var(--bad)]'
                : isOfflineQueued
                  ? 'text-[var(--warning)]'
                  : 'text-[var(--good)]'
            }`}
          >
            {isBlocked
              ? 'Bloqueada (versão desatualizada)'
              : isOfflineQueued
                ? 'Em espera (sem conexão)'
                : 'Liberada (registro mais recente)'}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1 font-mono-num">
            {activeSyncState.writesProtectedCount > 0
              ? `${activeSyncState.writesProtectedCount} sobrescrita(s) evitada(s)`
              : `Verificado: ${formatDateTimeShort(activeSyncState.lastCheckedAt)}`}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--muted)]">
            Fila local (LocalStorage)
          </div>
          <div
            className={`font-mono-num text-[14px] font-bold mt-1 ${
              gasOperationQueue.length > 0 ? 'text-[var(--warning)]' : 'text-[var(--text)]'
            }`}
          >
            {gasOperationQueue.length} operação(ões) pendente(s)
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1">
            {waitingQueueCount > 0
              ? `${waitingQueueCount} aguardando restabelecimento da conexão`
              : 'Reenvio automático ao reconectar'}
          </div>
        </div>
      </div>
    </Panel>
  );
};
