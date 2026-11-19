import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  GitCompare,
  History,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import type { DatabaseVersionSummary, SyncConflictHistoryEntry } from '../../lib/conflictHistory';
import { Panel } from '../ui/PageHeader';

type ConflictFilter = 'all' | 'pending' | 'failures' | 'resolved';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceLabel(source: SyncConflictHistoryEntry['source']): string {
  switch (source) {
    case 'apps-script':
      return 'Google Apps Script';
    case 'google-drive':
      return 'Google Drive';
    case 'firebase':
      return 'Firebase';
    case 'drive-file':
      return 'Arquivo do Drive';
    case 'oauth':
      return 'Autenticação';
    default:
      return 'Sincronização';
  }
}

function statusMeta(status: SyncConflictHistoryEntry['status']): { label: string; colorClass: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pendente', colorClass: 'text-[var(--warning)]' };
    case 'resolved-local':
      return { label: 'Resolvido (Local mantido)', colorClass: 'text-[var(--good)]' };
    case 'resolved-drive':
      return { label: 'Resolvido (Drive mantido)', colorClass: 'text-[var(--accent)]' };
    case 'dismissed':
      return { label: 'Dispensado', colorClass: 'text-[var(--muted)]' };
  }
}

const VersionMetricsRow: React.FC<{
  label: string;
  summary: DatabaseVersionSummary;
  highlight?: boolean;
}> = ({ label, summary, highlight }) => (
  <div className="py-2.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
        <span>{label}</span>
        {typeof summary.version === 'number' && summary.version > 0 && (
          <span className="font-mono-num text-[11px] font-semibold text-[var(--accent)]">
            v{summary.version}
          </span>
        )}
      </div>
      <div className="text-[11px] text-[var(--muted)] font-mono-num">
        Atualizado em: {formatDateTime(summary.updatedAt)}
      </div>
    </div>

    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-mono-num ${
        highlight ? 'text-[var(--text)] font-semibold' : 'text-[var(--muted)]'
      }`}
    >
      <span>{summary.scheduleTopics} tópico(s)</span>
      <span className="text-[var(--subtle)]">·</span>
      <span>{summary.laws} lei(s)</span>
      <span className="text-[var(--subtle)]">·</span>
      <span>{summary.questions} questão(ões)</span>
      <span className="text-[var(--subtle)]">·</span>
      <span>{summary.annotations} anotação(ões)</span>
      <span className="text-[var(--subtle)]">·</span>
      <span>{summary.pdfs} PDF(s)</span>
    </div>
  </div>
);

export const ConflictHistoryPanel: React.FC = () => {
  const {
    conflictHistory,
    latestVersionComparison,
    isCheckingDivergence,
    resolvingConflictAction,
    checkLocalVsDriveDivergence,
    resolveVersionDivergenceKeepLocal,
    resolveVersionDivergenceKeepDrive,
    dismissConflictHistoryEntry,
    clearResolvedConflictHistory,
    driveSyncConflicts,
    resolvingDriveConflictId,
    resolveDriveConflictRemoveCloud,
    resolveDriveConflictRestoreLocal,
    ignoreDriveConflict,
    driveConnected,
    gasConnected,
    requestConfirm,
  } = useStudy();

  const [filter, setFilter] = useState<ConflictFilter>('all');

  const counts = useMemo(() => {
    let pending = 0;
    let failures = 0;
    let resolved = 0;
    for (const item of conflictHistory) {
      if (item.status === 'pending') pending++;
      else resolved++;
      if (item.kind === 'sync-failure' || item.kind === 'auth-failure') failures++;
    }
    return {
      total: conflictHistory.length,
      pending,
      failures,
      resolved,
    };
  }, [conflictHistory]);

  const filteredEntries = useMemo(() => {
    return conflictHistory.filter((item) => {
      if (filter === 'pending') return item.status === 'pending';
      if (filter === 'failures') return item.kind === 'sync-failure' || item.kind === 'auth-failure';
      if (filter === 'resolved') return item.status !== 'pending';
      return true;
    });
  }, [conflictHistory, filter]);

  const handleConfirmKeepLocal = async (entryId?: string) => {
    const ok = await requestConfirm({
      title: 'Manter versão Local e sobrescrever o Google Drive?',
      description:
        'A versão atual deste dispositivo será enviada como versão oficial para o Google Drive, substituindo a versão divergente na nuvem. Um ponto de restauração local será salvo antes. Confirmar?',
      confirmLabel: 'Manter versão Local',
      danger: true,
    });
    if (!ok) return;
    await resolveVersionDivergenceKeepLocal(entryId);
  };

  const handleConfirmKeepDrive = async (entryId?: string) => {
    const ok = await requestConfirm({
      title: 'Manter versão do Google Drive e substituir dados locais?',
      description:
        'Os dados atuais deste dispositivo serão substituídos pela versão salva no Google Drive. Antes da troca, um ponto de restauração local de segurança será criado automaticamente caso queira desfazer. Confirmar?',
      confirmLabel: 'Manter versão do Drive',
      danger: true,
    });
    if (!ok) return;
    await resolveVersionDivergenceKeepDrive(entryId);
  };

  const isBusy = resolvingConflictAction !== null;

  return (
    <Panel
      title="Histórico de Conflitos & Resolução Manual (Local × Drive)"
      subtitle="Registro transparente de falhas de sincronização e divergências entre dispositivos, permitindo escolher manualmente qual versão manter."
      className="mb-4"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void checkLocalVsDriveDivergence()}
            disabled={isCheckingDivergence || isBusy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
          >
            <GitCompare className={`w-3.5 h-3.5 ${isCheckingDivergence ? 'animate-spin' : ''}`} />
            <span>{isCheckingDivergence ? 'Comparando…' : 'Comparar Local × Drive agora'}</span>
          </button>
          {counts.resolved > 0 && (
            <button
              type="button"
              onClick={clearResolvedConflictHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)] text-[12px] font-semibold whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar resolvidos ({counts.resolved})</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Métricas inline limpas + filtro segmentado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-mono-num">
            <span className="text-[var(--muted)]">
              Total: <strong className="text-[var(--text)]">{counts.total}</strong>
            </span>
            <span className="text-[var(--subtle)]">·</span>
            <span className={counts.pending > 0 ? 'text-[var(--warning)] font-bold' : 'text-[var(--muted)]'}>
              Pendentes: <strong>{counts.pending}</strong>
            </span>
            <span className="text-[var(--subtle)]">·</span>
            <span className="text-[var(--muted)]">
              Falhas: <strong className="text-[var(--text)]">{counts.failures}</strong>
            </span>
            <span className="text-[var(--subtle)]">·</span>
            <span className="text-[var(--muted)]">
              Resolvidos: <strong className="text-[var(--good)]">{counts.resolved}</strong>
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Filtrar histórico de conflitos"
            className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-0.5 self-start sm:self-auto"
          >
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'pending', label: `Pendentes (${counts.pending})` },
                { id: 'failures', label: 'Falhas' },
                { id: 'resolved', label: 'Resolvidos' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors whitespace-nowrap cursor-pointer border-0 ${
                  filter === tab.id
                    ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                    : 'bg-transparent text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resultado da Comparação ao Vivo Local × Drive */}
        {latestVersionComparison && (
          <div className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12.5px] font-bold">
                {latestVersionComparison.error ? (
                  <>
                    <ShieldAlert className="w-4 h-4 text-[var(--bad)]" />
                    <span className="text-[var(--bad)]">Falha na comparação</span>
                  </>
                ) : latestVersionComparison.hasDivergence ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
                    <span className="text-[var(--warning)]">Divergência detectada entre Local e Drive</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[var(--good)]" />
                    <span className="text-[var(--good)]">Local e Google Drive estão sincronizados</span>
                  </>
                )}
              </div>
              <span className="text-[11px] font-mono-num text-[var(--muted)]">
                Verificado às {formatDateTime(latestVersionComparison.checkedAt)}
              </span>
            </div>

            {latestVersionComparison.error ? (
              <p className="m-0 px-3.5 py-2.5 text-[12px] text-[var(--bad)]">
                {latestVersionComparison.error}
              </p>
            ) : (
              <>
                {latestVersionComparison.divergenceReason && (
                  <p className="m-0 px-3.5 pt-2.5 text-[12px] text-[var(--muted)]">
                    {latestVersionComparison.divergenceReason}
                  </p>
                )}
                <div className="divide-y divide-[var(--line)]">
                  <VersionMetricsRow
                    label="Versão Local (este dispositivo)"
                    summary={latestVersionComparison.localSummary}
                    highlight={latestVersionComparison.hasDivergence}
                  />
                  {latestVersionComparison.driveSummary ? (
                    <VersionMetricsRow
                      label="Versão do Google Drive (nuvem)"
                      summary={latestVersionComparison.driveSummary}
                      highlight={latestVersionComparison.hasDivergence}
                    />
                  ) : (
                    <div className="px-3 py-2.5 text-[12px] text-[var(--muted)]">
                      Nenhuma cópia salva ainda na pasta do Google Drive.
                    </div>
                  )}
                </div>

                {(driveConnected || gasConnected) && (
                  <div className="px-3.5 py-2.5 border-t border-[var(--line)] bg-[var(--panel)] flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11.5px] text-[var(--muted)]">
                      Escolha manual (cria ponto de restauração de segurança automaticamente antes de substituir):
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmKeepLocal()}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <CloudUpload className="w-3.5 h-3.5" />
                        <span>
                          {resolvingConflictAction === 'keep-local'
                            ? 'Enviando Local…'
                            : 'Manter versão Local'}
                        </span>
                      </button>
                      {latestVersionComparison.driveSummary && (
                        <button
                          type="button"
                          onClick={() => void handleConfirmKeepDrive()}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                        >
                          <CloudDownload className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span>
                            {resolvingConflictAction === 'keep-drive'
                              ? 'Restaurando Drive…'
                              : 'Manter versão do Drive'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Conflitos ativos em nível de arquivo (se houver) */}
        {driveSyncConflicts.length > 0 && (
          <div className="rounded-lg border border-[var(--warning)]/45 bg-[var(--warning)]/5 overflow-hidden">
            <div className="px-3.5 py-2 border-b border-[var(--warning)]/30 flex items-center justify-between gap-2">
              <strong className="text-[12px] font-bold text-[var(--warning)]">
                Conflitos em arquivos individuais ({driveSyncConflicts.length})
              </strong>
              <span className="text-[11px] text-[var(--muted)]">
                Arquivos excluídos localmente que ainda constam no Drive
              </span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {driveSyncConflicts.map((c) => {
                const busyFile = resolvingDriveConflictId === c.id;
                return (
                  <div
                    key={c.id}
                    className="px-3.5 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-[12px]"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[var(--text)] truncate">{c.displayName}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {c.moduleLabel} · {c.syncOriginReason}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyFile}
                        onClick={() => void resolveDriveConflictRemoveCloud(c.id)}
                        className="px-2.5 py-1 rounded-md border border-[var(--bad)]/50 bg-[var(--bad)]/10 text-[var(--bad)] text-[11.5px] font-bold hover:bg-[var(--bad)] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {busyFile ? 'Removendo…' : 'Manter exclusão (apagar do Drive)'}
                      </button>
                      <button
                        type="button"
                        disabled={busyFile}
                        onClick={() => void resolveDriveConflictRestoreLocal(c.id)}
                        className="px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[11.5px] font-semibold hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Restaurar do Drive
                      </button>
                      {c.driveFile.webViewLink && (
                        <a
                          href={c.driveFile.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--accent)] text-[11px]"
                        >
                          Drive <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => ignoreDriveConflict(c.id)}
                        title="Ignorar aviso"
                        className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] bg-transparent border-0 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lista Cronológica de Logs de Falhas & Divergências */}
        {filteredEntries.length === 0 ? (
          <div className="py-6 px-4 text-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel-soft)]">
            <History className="w-5 h-5 text-[var(--muted)] mx-auto mb-1.5" aria-hidden="true" />
            <p className="m-0 text-[12.5px] font-semibold text-[var(--text)]">
              {counts.total === 0
                ? 'Nenhuma falha de sincronização ou conflito registrado.'
                : 'Nenhum registro corresponde ao filtro selecionado.'}
            </p>
            <p className="m-0 mt-1 text-[11.5px] text-[var(--muted)]">
              Sempre que uma sincronização falhar ou dois computadores divergirem, o detalhe completo aparecerá aqui para você escolher qual versão manter.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
            {filteredEntries.map((entry) => {
              const st = statusMeta(entry.status);
              const isPending = entry.status === 'pending';

              return (
                <article key={entry.id} className="p-3.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-num text-[var(--muted)]">
                        <span>{formatDateTime(entry.timestamp)}</span>
                        <span className="text-[var(--subtle)]">·</span>
                        <span>{sourceLabel(entry.source)}</span>
                        {entry.errorCode && (
                          <>
                            <span className="text-[var(--subtle)]">·</span>
                            <span className="text-[var(--text)] font-semibold">{entry.errorCode}</span>
                          </>
                        )}
                        <span className="text-[var(--subtle)]">·</span>
                        <span className={`font-bold ${st.colorClass}`}>{st.label}</span>
                      </div>

                      <h4 className="m-0 text-[13px] font-bold text-[var(--text)] leading-snug">
                        {entry.title}
                      </h4>
                      <p className="m-0 text-[12px] text-[var(--muted)] leading-relaxed">
                        {entry.reason}
                      </p>
                    </div>

                    {isPending && (
                      <button
                        type="button"
                        onClick={() => dismissConflictHistoryEntry(entry.id)}
                        title="Dispensar registro"
                        className="self-start p-1 rounded text-[var(--muted)] hover:text-[var(--text)] bg-transparent border-0 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Resumo comparativo Local vs Drive quando disponível */}
                  {(entry.localSummary || entry.driveSummary) && (
                    <div className="rounded-md border border-[var(--line)] bg-[var(--panel-soft)] divide-y divide-[var(--line)]">
                      {entry.localSummary && (
                        <VersionMetricsRow label="Local no momento do evento" summary={entry.localSummary} />
                      )}
                      {entry.driveSummary && (
                        <VersionMetricsRow label="Drive no momento do evento" summary={entry.driveSummary} />
                      )}
                    </div>
                  )}

                  {/* Ações manuais para itens pendentes */}
                  {isPending && (driveConnected || gasConnected) && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleConfirmKeepLocal(entry.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <CloudUpload className="w-3.5 h-3.5" />
                        <span>Manter versão Local</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleConfirmKeepDrive(entry.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[11.5px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <CloudDownload className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Manter versão do Drive</span>
                      </button>
                      <button
                        type="button"
                        disabled={isCheckingDivergence || isBusy}
                        onClick={() => void checkLocalVsDriveDivergence()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-transparent text-[var(--muted)] hover:text-[var(--text)] text-[11.5px] font-semibold whitespace-nowrap cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Recomparar</span>
                      </button>
                    </div>
                  )}

                  {entry.resolutionNote && !isPending && (
                    <div className="text-[11px] text-[var(--muted)] font-mono-num">
                      Resolução ({formatDateTime(entry.resolvedAt)}): {entry.resolutionNote}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
};
