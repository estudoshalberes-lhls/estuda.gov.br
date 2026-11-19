import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Filter,
  RefreshCcw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { getUserScopeKey, useStudy } from '../../context/StudyContext';
import { getPendingDriveDeletes } from '../../lib/googleDrive';
import {
  AffectedFileAction,
  SyncActivityCategory,
  SyncActivityLogEntry,
  SyncActivityStatus,
  SyncFileOrigin,
} from '../../lib/syncActivityLog';
import { Panel } from '../ui/PageHeader';

const CATEGORY_LABELS: Record<SyncActivityCategory, string> = {
  'drive-sync': 'Sincronização Drive',
  'drive-restore': 'Restauração Drive',
  'drive-backup': 'Backup Drive',
  'drive-upload': 'Envio ao Drive',
  'drive-delete': 'Lixeira do Drive',
  oauth: 'Sessão Nuvem',
};

const FILE_ACTION_META: Record<
  AffectedFileAction,
  { label: string; className: string }
> = {
  uploaded: {
    label: 'Enviado',
    className: 'bg-[var(--good)]/15 text-[var(--good)] border-[var(--good)]/30',
  },
  restored: {
    label: 'Restaurado',
    className: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30',
  },
  'imported-orphan': {
    label: 'Importado (órfão)',
    className: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30',
  },
  trashed: {
    label: 'Movido p/ lixeira',
    className: 'bg-[var(--good)]/15 text-[var(--good)] border-[var(--good)]/30',
  },
  'skipped-tombstone': {
    label: 'Ignorado (excluído)',
    className: 'bg-[var(--panel-raised)] text-[var(--muted)] border-[var(--line-strong)]',
  },
  'queued-delete': {
    label: 'Aguardando Drive',
    className: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/35',
  },
  failed: {
    label: 'Falha',
    className: 'bg-[var(--bad)]/15 text-[var(--bad)] border-[var(--bad)]/35',
  },
};

const FILE_ORIGIN_META: Record<
  SyncFileOrigin,
  { label: string; className: string }
> = {
  internal: {
    label: 'Etiqueta: App',
    className: 'bg-[var(--panel-raised)] text-[var(--muted)] border-[var(--line-strong)]',
  },
  external: {
    label: 'Externo',
    className: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30',
  },
  'external-modified': {
    label: 'Alterado fora do app',
    className: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/35',
  },
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getStatusMeta(status: SyncActivityStatus): {
  label: string;
  badgeClass: string;
  borderClass: string;
  icon: React.ReactNode;
} {
  if (status === 'error') {
    return {
      label: 'Falha',
      badgeClass: 'bg-[var(--bad)]/15 text-[var(--bad)] border-[var(--bad)]/35',
      borderClass: 'border-[var(--bad)]/35',
      icon: <AlertCircle className="w-3.5 h-3.5 text-[var(--bad)] shrink-0" />,
    };
  }
  if (status === 'warning') {
    return {
      label: 'Aviso',
      badgeClass: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/35',
      borderClass: 'border-[var(--warning)]/35',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />,
    };
  }
  return {
    label: 'Sucesso',
    badgeClass: 'bg-[var(--good)]/15 text-[var(--good)] border-[var(--good)]/30',
    borderClass: 'border-[var(--line)]',
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-[var(--good)] shrink-0" />,
  };
}

const COLLAPSED_FILES_LIMIT = 4;

const LogEntryCard: React.FC<{ entry: SyncActivityLogEntry }> = ({ entry }) => {
  const [expandedFiles, setExpandedFiles] = useState(false);
  const statusMeta = getStatusMeta(entry.status);
  const categoryLabel = CATEGORY_LABELS[entry.category] || entry.category;
  const totalFiles = entry.affectedFiles.length;
  const visibleFiles = expandedFiles
    ? entry.affectedFiles
    : entry.affectedFiles.slice(0, COLLAPSED_FILES_LIMIT);
  const hiddenCount = Math.max(0, totalFiles - COLLAPSED_FILES_LIMIT);

  const statBadges: string[] = [];
  if (entry.stats?.trashed) statBadges.push(`${entry.stats.trashed} na lixeira`);
  if (entry.stats?.queuedDeletes) statBadges.push(`${entry.stats.queuedDeletes} na fila de exclusão`);
  if (entry.stats?.skippedTombstones) statBadges.push(`${entry.stats.skippedTombstones} ignorado(s) por tombstone`);
  if (entry.stats?.restored) statBadges.push(`${entry.stats.restored} restaurado(s)`);
  if (entry.stats?.imported) statBadges.push(`${entry.stats.imported} órfão(s)`);
  if (entry.stats?.uploaded) statBadges.push(`${entry.stats.uploaded} enviado(s)`);
  if (entry.stats?.chunks) statBadges.push(`${entry.stats.chunks} parte(s)`);

  return (
    <article
      className={`rounded-xl border ${statusMeta.borderClass} bg-[var(--panel-soft)] p-3 flex flex-col gap-2 min-w-0`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 min-w-0">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span className="mt-0.5">{statusMeta.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <strong className="text-[12.5px] font-bold text-[var(--text)]">
                {entry.operation}
              </strong>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-extrabold uppercase tracking-wide ${statusMeta.badgeClass}`}
              >
                {statusMeta.label}
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--line)] bg-[var(--panel-raised)] text-[10px] font-bold text-[var(--muted)]">
                {categoryLabel}
              </span>
              {entry.errorCode && (
                <code className="px-1.5 py-0.5 rounded bg-[var(--bad)]/10 border border-[var(--bad)]/25 text-[var(--bad)] text-[10px] font-mono">
                  {entry.errorCode}
                </code>
              )}
            </div>
            <p className="m-0 mt-1 text-[11.5px] text-[var(--muted)] leading-relaxed break-words">
              {entry.message}
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-mono-num tabular-nums text-[var(--muted)] shrink-0">
          <Clock className="w-3 h-3 shrink-0" />
          {formatDateTime(entry.timestamp)}
        </span>
      </div>

      {statBadges.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-5">
          {statBadges.map((label) => (
            <span
              key={label}
              className="px-2 py-0.5 rounded-md border border-[var(--line)] bg-[var(--panel)] text-[10.5px] font-semibold text-[var(--text)] font-mono-num tabular-nums"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {totalFiles > 0 && (
        <div className="pl-5 flex flex-col gap-1.5 min-w-0">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Arquivos afetados ({totalFiles})
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            {visibleFiles.map((file, idx) => {
              const actionMeta = FILE_ACTION_META[file.action];
              return (
                <div
                  key={`${entry.id}_${file.action}_${file.driveFileId || file.name}_${idx}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 min-w-0"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <FileText className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                    <span className="text-[11.5px] font-semibold text-[var(--text)] truncate" title={file.name}>
                      {file.name}
                    </span>
                    {file.module && (
                      <span className="text-[10.5px] text-[var(--muted)] shrink-0">
                        · {file.module}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {file.detail && (
                      <span className="text-[10.5px] text-[var(--muted)] break-all">
                        {file.detail}
                      </span>
                    )}
                    {file.syncOrigin && (
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${FILE_ORIGIN_META[file.syncOrigin].className}`}
                      >
                        {FILE_ORIGIN_META[file.syncOrigin].label}
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-extrabold ${actionMeta.className}`}
                    >
                      {actionMeta.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpandedFiles((prev) => !prev)}
              className="self-start inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
            >
              {expandedFiles ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Recolher arquivos
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Ver mais {hiddenCount} arquivo(s)
                </>
              )}
            </button>
          )}
        </div>
      )}
    </article>
  );
};

export const SyncActivityLogPanel: React.FC = () => {
  const {
    syncActivityLogs,
    clearSyncActivityLogs,
    googleUser,
    driveConnected,
    driveTokenReady,
    isRenewingDriveToken,
    isSyncingDrive,
    connectGoogleDrive,
    checkDriveTimestampConflictsNow,
  } = useStudy();

  const [statusFilter, setStatusFilter] = useState<'all' | SyncActivityStatus>('all');

  const counts = useMemo(() => {
    let success = 0;
    let warning = 0;
    let error = 0;
    for (const item of syncActivityLogs) {
      if (item.status === 'success') success += 1;
      else if (item.status === 'warning') warning += 1;
      else if (item.status === 'error') error += 1;
    }
    return {
      all: syncActivityLogs.length,
      success,
      warning,
      error,
    };
  }, [syncActivityLogs]);

  const filteredLogs = useMemo(() => {
    if (statusFilter === 'all') return syncActivityLogs;
    return syncActivityLogs.filter((item) => item.status === statusFilter);
  }, [statusFilter, syncActivityLogs]);

  const pendingDeleteLabels = useMemo(() => {
    const userScope = getUserScopeKey(googleUser);
    const items = [
      ...getPendingDriveDeletes(userScope),
      ...(userScope !== 'offline_guest' ? getPendingDriveDeletes('offline_guest') : []),
    ];
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const item of items) {
      const candidates = [
        ...(item.names || []),
        ...(item.folderNames || []).map((f) => `Pasta: ${f}`),
        ...(!item.names?.length && !item.folderNames?.length ? item.fileIds || [] : []),
      ];
      for (const raw of candidates) {
        const clean = raw.trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        labels.push(clean);
      }
    }
    return labels;
  }, [googleUser, syncActivityLogs]);

  const showSessionDiagnosticBanner =
    driveConnected && !driveTokenReady && !isRenewingDriveToken;

  return (
    <Panel
      title="Log de atividades e diagnóstico de sincronização"
      subtitle="Histórico recente de sincronizações, restaurações, exclusões na lixeira do Drive e sessão OAuth para diagnosticar arquivos restaurados ou falhas."
      className="mb-4"
    >
      <div className="flex flex-col gap-3 min-w-0">
        {showSessionDiagnosticBanner && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl border border-[var(--warning)]/45 bg-[var(--warning)]/10 min-w-0">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <ShieldAlert className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
              <div className="min-w-0 text-[11.5px] leading-relaxed text-[var(--text)]">
                <strong className="font-bold block">
                  Sessão OAuth do Google Drive pendente nesta aba ({pendingDeleteLabels.length} exclusão(ões) aguardando envio)
                </strong>
                <span className="text-[var(--muted)]">
                  Por segurança do navegador, a permissão temporária do Google Drive precisa ser confirmada quando uma nova aba é aberta ou após expirar (~1h). Enquanto não reconectar, exclusões ficam na fila local e o Drive remoto ainda mantém os arquivos antigos.
                </span>
                {pendingDeleteLabels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {pendingDeleteLabels.slice(0, 6).map((label, idx) => (
                      <span
                        key={`${label}_${idx}`}
                        className="px-1.5 py-0.5 rounded border border-[var(--warning)]/35 bg-[var(--panel)] text-[10.5px] font-semibold text-[var(--text)]"
                      >
                        {label}
                      </span>
                    ))}
                    {pendingDeleteLabels.length > 6 && (
                      <span className="text-[10.5px] text-[var(--muted)] font-semibold self-center">
                        +{pendingDeleteLabels.length - 6} outro(s)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void connectGoogleDrive()}
              disabled={isSyncingDrive}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Reconectar Conta Google</span>
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--line)]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--muted)] mr-1">
              <Filter className="w-3.5 h-3.5" />
              Filtrar:
            </span>
            {(
              [
                { id: 'all', label: `Todos (${counts.all})` },
                { id: 'success', label: `Sucesso (${counts.success})` },
                { id: 'warning', label: `Avisos (${counts.warning})` },
                { id: 'error', label: `Falhas (${counts.error})` },
              ] as const
            ).map((btn) => {
              const active = statusFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setStatusFilter(btn.id)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold font-mono-num tabular-nums transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto justify-end">
            {driveConnected && (
              <button
                type="button"
                onClick={() => void checkDriveTimestampConflictsNow()}
                disabled={isSyncingDrive}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] hover:opacity-90 disabled:opacity-45 cursor-pointer whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Comparar datas com Drive</span>
              </button>
            )}
            <button
              type="button"
              onClick={clearSyncActivityLogs}
              disabled={syncActivityLogs.length === 0}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 disabled:opacity-45 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Limpar histórico</span>
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-5 text-center text-[12px] text-[var(--muted)]">
            {syncActivityLogs.length === 0
              ? 'Nenhuma atividade registrada ainda nesta conta. As próximas sincronizações, exclusões e verificações de sessão aparecerão aqui com os arquivos afetados.'
              : 'Nenhum evento encontrado para o filtro selecionado.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-0.5">
            {filteredLogs.map((entry) => (
              <LogEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
};
