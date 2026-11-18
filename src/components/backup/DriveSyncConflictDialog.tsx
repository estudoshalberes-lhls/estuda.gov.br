import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Cloud,
  Folder,
  HardDriveDownload,
  RotateCcw,
  ShieldCheck,
  Tag,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { DeletedDriveConflict } from '../../lib/driveTimestampSync';

function formatTimestampBr(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return 'Data não registrada';
  try {
    return new Date(ms).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Data inválida';
  }
}

function getNewerBadge(conflict: DeletedDriveConflict): { label: string; className: string } {
  if (conflict.newerSide === 'drive') {
    return {
      label: 'Drive mais recente',
      className: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35',
    };
  }
  if (conflict.newerSide === 'local-delete') {
    return {
      label: 'Exclusão local mais recente',
      className: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/35',
    };
  }
  return {
    label: 'Divergência de sincronização',
    className: 'bg-[var(--panel-raised)] text-[var(--muted)] border-[var(--line-strong)]',
  };
}

function getSyncTagBadge(conflict: DeletedDriveConflict): {
  label: string;
  hint: string;
  className: string;
  isInternal: boolean;
} {
  if (conflict.syncOrigin === 'internal') {
    return {
      label: 'Etiqueta: Criado no app',
      hint: 'Etiqueta interna confirmada — esta cópia foi salva pelo aplicativo antes da exclusão local.',
      className: 'bg-[var(--good)]/12 text-[var(--good)] border-[var(--good)]/30',
      isInternal: true,
    };
  }
  if (conflict.syncOrigin === 'external-modified') {
    return {
      label: 'Modificado externamente',
      hint: 'Possui etiqueta do app, porém foi modificado fora dele no Google Drive após a sincronização.',
      className: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/35',
      isInternal: false,
    };
  }
  return {
    label: 'Externo (sem etiqueta)',
    hint: 'Arquivo enviado diretamente no Google Drive ou anterior ao rastreamento por etiqueta de sincronização.',
    className: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30',
    isInternal: false,
  };
}

export const DriveSyncConflictDialog: React.FC = () => {
  const {
    driveSyncConflicts,
    resolvingDriveConflictId,
    resolveDriveConflictRemoveCloud,
    resolveDriveConflictRestoreLocal,
    resolveAllDriveConflictsRemoveCloud,
    resolveAllDriveConflictsRestoreLocal,
    dismissDriveSyncConflicts,
  } = useStudy();

  const [batchRunning, setBatchRunning] = useState<'remove' | 'restore' | null>(null);
  const busy = Boolean(resolvingDriveConflictId) || batchRunning !== null;

  useEffect(() => {
    if (driveSyncConflicts.length === 0 || busy) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissDriveSyncConflicts();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, dismissDriveSyncConflicts, driveSyncConflicts.length]);

  if (driveSyncConflicts.length === 0) return null;

  const isPlural = driveSyncConflicts.length > 1;

  const handleBatchRemove = async () => {
    setBatchRunning('remove');
    try {
      await resolveAllDriveConflictsRemoveCloud();
    } finally {
      setBatchRunning(null);
    }
  };

  const handleBatchRestore = async () => {
    setBatchRunning('restore');
    try {
      await resolveAllDriveConflictsRestoreLocal();
    } finally {
      setBatchRunning(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-conflict-dialog-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid place-items-center w-9 h-9 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/15 text-[var(--warning)] shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="drive-conflict-dialog-title"
              className="m-0 font-display text-[15px] font-bold text-[var(--text)] leading-snug"
            >
              {isPlural
                ? `${driveSyncConflicts.length} arquivos excluídos localmente ainda existem no Google Drive`
                : 'Arquivo excluído localmente encontrado no Google Drive'}
            </h3>
            <p className="mt-1.5 mb-0 text-[12.5px] leading-relaxed text-[var(--muted)]">
              Ao comparar as datas de modificação entre o dispositivo local e o Google Drive,{' '}
              {isPlural ? 'estes itens foram removidos' : 'este item foi removido'} localmente, mas{' '}
              {isPlural ? 'suas cópias permanecem' : 'a cópia permanece'} na nuvem. Escolha se deseja{' '}
              <strong className="text-[var(--text)]">remover a versão em nuvem</strong> ou{' '}
              <strong className="text-[var(--text)]">restaurar a cópia localmente</strong>.
            </p>
          </div>
        </div>

        <div className="mt-4 flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 pr-0.5">
          {driveSyncConflicts.map((conflict) => {
            const isItemBusy = resolvingDriveConflictId === conflict.id || batchRunning !== null;
            const newerBadge = getNewerBadge(conflict);
            const syncTagBadge = getSyncTagBadge(conflict);

            return (
              <div
                key={conflict.id}
                className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-2.5 min-w-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-[13px] font-bold text-[var(--text)] break-words">
                        {conflict.displayName}
                      </strong>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--line)] bg-[var(--panel-raised)] text-[10px] font-bold text-[var(--muted)]">
                        {conflict.moduleLabel}
                      </span>
                      {conflict.folderName && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--line)] bg-[var(--panel)] text-[10px] font-semibold text-[var(--muted)]">
                          <Folder className="w-3 h-3 shrink-0" />
                          {conflict.folderName}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${syncTagBadge.className}`}
                        title={conflict.syncOriginReason || syncTagBadge.hint}
                      >
                        {syncTagBadge.isInternal ? (
                          <ShieldCheck className="w-3 h-3 shrink-0" />
                        ) : (
                          <Tag className="w-3 h-3 shrink-0" />
                        )}
                        {syncTagBadge.label}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-extrabold shrink-0 ${newerBadge.className}`}
                  >
                    {newerBadge.label}
                  </span>
                </div>

                <p className="m-0 text-[11px] text-[var(--muted)] leading-snug">
                  {syncTagBadge.hint}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]">
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 flex items-center gap-2 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        Exclusão local
                      </span>
                      <span className="font-mono-num tabular-nums font-semibold text-[var(--text)]">
                        {formatTimestampBr(conflict.deletedAtMs)}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 flex items-center gap-2 min-w-0">
                    <Cloud className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                        Versão no Google Drive
                      </span>
                      <span className="font-mono-num tabular-nums font-semibold text-[var(--text)]">
                        {formatTimestampBr(conflict.driveModifiedMs)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={isItemBusy}
                    onClick={() => void resolveDriveConflictRemoveCloud(conflict.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--bad)] bg-[var(--bad)] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-55 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Remover versão em nuvem</span>
                  </button>
                  <button
                    type="button"
                    disabled={isItemBusy}
                    onClick={() => void resolveDriveConflictRestoreLocal(conflict.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-55 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Restaurar local</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-3.5 border-t border-[var(--line)]/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isPlural && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleBatchRemove()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--bad)]/50 bg-[var(--bad)]/10 text-[var(--bad)] text-[11.5px] font-bold hover:bg-[var(--bad)]/20 disabled:opacity-55 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Remover todas da nuvem</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleBatchRestore()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)] text-[11.5px] font-bold hover:opacity-90 disabled:opacity-55 cursor-pointer"
                >
                  <HardDriveDownload className="w-3.5 h-3.5 shrink-0" />
                  <span>Restaurar todas localmente</span>
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={dismissDriveSyncConflicts}
            className="inline-flex items-center justify-center px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-55 transition-colors cursor-pointer"
          >
            Decidir depois
          </button>
        </div>
      </div>
    </div>
  );
};
