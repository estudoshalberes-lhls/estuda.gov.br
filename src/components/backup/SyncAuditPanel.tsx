import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Download,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import {
  GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS,
  GasAuditLogEntry,
  GasAuditOperationType,
  GasAuditStatus,
  clearLocalGasAuditLogs,
} from '../../lib/gasOperationQueue';
import { Panel } from '../ui/PageHeader';

function formatAuditTimestamp(iso: string): string {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return iso || '—';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatRelativeCountdown(targetMs: number, nowMs: number): string {
  const diffSec = Math.ceil((targetMs - nowMs) / 1000);
  if (diffSec <= 0) return 'agora';
  if (diffSec < 60) return `em ${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return secs > 0 ? `em ${mins}m ${secs}s` : `em ${mins}m`;
}

function mergeAuditLogs(
  remoteLogs: GasAuditLogEntry[],
  localLogs: GasAuditLogEntry[],
): GasAuditLogEntry[] {
  const combined: GasAuditLogEntry[] = [...remoteLogs];
  const remoteKeys = new Set(
    remoteLogs.map((r) => `${r.action}::${r.status}::${Math.floor((Date.parse(r.timestamp) || 0) / 3000)}`),
  );

  for (const loc of localLogs) {
    const bucket = Math.floor((Date.parse(loc.timestamp) || 0) / 3000);
    const key = `${loc.action}::${loc.status}::${bucket}`;
    // Evita duplicar exatamente o mesmo evento já confirmado no log do Drive,
    // preservando sempre falhas offline/locais que não chegaram ao servidor.
    if (loc.status === 'SUCCESS' && remoteKeys.has(key)) continue;
    combined.push(loc);
  }

  return combined.sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
}

export const SyncAuditPanel: React.FC = () => {
  const {
    gasConnected,
    gasConnectionHealth,
    gasOperationQueue,
    gasQueueProcessing,
    localGasAuditLogs,
    processGasQueueNow,
    removeGasQueueItem,
    clearFailedGasQueueItems,
    fetchGasAuditLogs,
    toast,
  } = useStudy();

  const [remoteLogs, setRemoteLogs] = useState<GasAuditLogEntry[]>([]);
  const [remoteSource, setRemoteSource] = useState<'drive-json' | 'sheet' | 'unavailable'>('unavailable');
  const [remoteUpdatedAt, setRemoteUpdatedAt] = useState<string | null>(null);
  const [unsupportedByScript, setUnsupportedByScript] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);

  const [typeFilter, setTypeFilter] = useState<'ALL' | GasAuditOperationType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | GasAuditStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const loadRemoteAudit = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!gasConnected) {
        setRemoteLogs([]);
        setRemoteSource('unavailable');
        setUnsupportedByScript(false);
        setFetchError(null);
        return;
      }
      setLoadingRemote(true);
      setFetchError(null);
      try {
        const res = await fetchGasAuditLogs(200);
        if (res.ok) {
          setRemoteLogs(res.logs);
          setRemoteSource(res.source);
          setRemoteUpdatedAt(res.updatedAt || new Date().toISOString());
          setUnsupportedByScript(false);
          if (!options?.silent) {
            toast(`Log de auditoria atualizado (${res.logs.length} registro(s) do Google Drive).`);
          }
        } else {
          setRemoteLogs([]);
          setRemoteSource('unavailable');
          setUnsupportedByScript(Boolean(res.unsupportedByScript));
          setFetchError(res.error || 'Não foi possível ler o log remoto no Drive.');
        }
      } finally {
        setLoadingRemote(false);
      }
    },
    [fetchGasAuditLogs, gasConnected, toast],
  );

  useEffect(() => {
    void loadRemoteAudit({ silent: true });
  }, [loadRemoteAudit]);

  // Atualiza a contagem regressiva de backoff exponencial somente quando há itens na fila
  useEffect(() => {
    if (gasOperationQueue.length === 0) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [gasOperationQueue.length]);

  const mergedLogs = useMemo(
    () => mergeAuditLogs(remoteLogs, localGasAuditLogs),
    [remoteLogs, localGasAuditLogs],
  );

  const stats = useMemo(() => {
    let reads = 0;
    let writes = 0;
    let failures = 0;
    for (const item of mergedLogs) {
      if (item.operationType === 'READ') reads += 1;
      else writes += 1;
      if (item.status === 'FAILURE') failures += 1;
    }
    return {
      total: mergedLogs.length,
      reads,
      writes,
      failures,
    };
  }, [mergedLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedLogs.filter((entry) => {
      if (typeFilter !== 'ALL' && entry.operationType !== typeFilter) return false;
      if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${entry.action} ${entry.actionLabel} ${entry.reason} ${entry.details || ''} ${entry.deviceId || ''} ${entry.username || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [mergedLogs, searchQuery, statusFilter, typeFilter]);

  const persistentFailureCount = useMemo(
    () => gasOperationQueue.filter((it) => it.attempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS).length,
    [gasOperationQueue],
  );

  const handleExportAuditJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      connectionStatus: gasConnectionHealth.status,
      remoteSource,
      queuePending: gasOperationQueue,
      logs: filteredLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_sincronizacao_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Relatório de auditoria exportado em JSON.');
  };

  return (
    <div className="space-y-4">
      {/* Seção 1: Fila de Operações (Queue LocalStorage + Retry ao Restabelecer Conexão) */}
      <Panel
        title="Fila de Operações do Google Apps Script (LocalStorage + Reenvio ao Reconectar)"
        subtitle="Toda requisição que falha é salva no LocalStorage com ID único e timestamp. Durante oscilações ou quedas de rede, o reenvio fica pausado e é disparado automaticamente em ordem cronológica assim que a conexão for restabelecida."
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)] font-mono-num">
              {gasOperationQueue.length} operação(ões) na fila
            </span>
            <span aria-hidden="true">·</span>
            <span className={persistentFailureCount > 0 ? 'font-semibold text-[var(--bad)] font-mono-num' : 'font-mono-num'}>
              {persistentFailureCount} falha(s) persistente(s) (&gt; 3 tentativas)
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Conexão:{' '}
              <strong
                className={
                  gasConnectionHealth.status === 'online'
                    ? 'text-[var(--good)]'
                    : gasConnectionHealth.status === 'offline' || gasConnectionHealth.status === 'session-expired'
                      ? 'text-[var(--bad)]'
                      : 'text-[var(--text)]'
                }
              >
                {gasConnectionHealth.status === 'online'
                  ? 'Online'
                  : gasConnectionHealth.status === 'offline'
                    ? 'Offline (retry pausado)'
                    : gasConnectionHealth.status === 'session-expired'
                      ? 'Sessão expirada'
                      : gasConnectionHealth.status === 'checking'
                        ? 'Verificando…'
                        : 'Desconectado'}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void processGasQueueNow({ forceAll: true })}
              disabled={gasQueueProcessing || gasOperationQueue.length === 0}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              <span>{gasQueueProcessing ? 'Processando fila…' : 'Processar fila agora'}</span>
            </button>
            {persistentFailureCount > 0 && (
              <button
                type="button"
                onClick={() => clearFailedGasQueueItems()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--bad)] hover:border-[var(--bad)]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Limpar falhas (&gt; 3)</span>
              </button>
            )}
          </div>
        </div>

        {gasOperationQueue.length === 0 ? (
          <div className="py-5 text-[12.5px] text-[var(--muted)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--good)] shrink-0" aria-hidden="true" />
            <span>
              Nenhuma operação pendente na fila local — todas as alterações recentes foram confirmadas na nuvem.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mt-3">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-[11px] font-semibold text-[var(--muted)]">
                  <th className="py-2 pr-3 whitespace-nowrap">Operação / ID</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Timestamp</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Tentativas</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Estado do reenvio</th>
                  <th className="py-2 pr-3">Último diagnóstico</th>
                  <th className="py-2 text-right whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {gasOperationQueue.map((item) => {
                  const isPersistent = item.attempts > GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS;
                  const isWaitingConnection =
                    item.status === 'waiting-connection' || gasConnectionHealth.status === 'offline';
                  return (
                    <tr key={item.id} className="hover:bg-[var(--panel-soft)]/70 transition-colors">
                      <td className="py-2.5 pr-3 align-top">
                        <div className="font-semibold text-[var(--text)]">{item.label}</div>
                        <div className="text-[11px] text-[var(--muted)] font-mono-num">
                          ID: {item.id}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 align-top whitespace-nowrap font-mono-num text-[11.5px] text-[var(--text)]">
                        {formatAuditTimestamp(item.timestamp || item.createdAt)}
                      </td>
                      <td className="py-2.5 pr-3 align-top whitespace-nowrap font-mono-num">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isPersistent ? 'text-[var(--bad)]' : 'text-[var(--warning)]'
                          }`}
                        >
                          {isPersistent ? (
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span>
                            {item.attempts} {isPersistent ? '(alerta emitido)' : `/ ${GAS_QUEUE_NOTIFY_AFTER_ATTEMPTS}`}
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 align-top whitespace-nowrap font-mono-num text-[var(--text)]">
                        {isWaitingConnection ? (
                          <span className="font-sans font-semibold text-[var(--warning)]">
                            Aguardando reconexão
                          </span>
                        ) : (
                          formatRelativeCountdown(item.nextRetryAt, nowMs)
                        )}
                      </td>
                      <td className="py-2.5 pr-3 align-top text-[var(--muted)] max-w-[340px]">
                        <span className="line-clamp-2 break-words">{item.lastError}</span>
                      </td>
                      <td className="py-2.5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void processGasQueueNow({ onlyItemId: item.id })}
                            disabled={gasQueueProcessing}
                            className="px-2.5 py-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            Reenviar
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGasQueueItem(item.id)}
                            title="Descartar operação da fila"
                            className="p-1.5 rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Seção 2: Log Estruturado de Auditoria (Leitura / Escrita + Sucesso / Falha) */}
      <Panel
        title="Auditoria de Sincronização (Log Estruturado do Drive)"
        subtitle="Histórico cronológico de leituras e escritas registradas pelo Google Apps Script no Drive e pelo cliente local, com diagnóstico detalhado para rastrear quando e por que uma alteração falhou ou foi rejeitada."
      >
        {/* Resumo quantitativo limpo (4 colunas, tabular-nums, sem pills) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4 mb-4 border-b border-[var(--line)]">
          <div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">Eventos registrados</div>
            <div className="font-mono-num text-[22px] font-extrabold text-[var(--text)] mt-0.5">
              {stats.total}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">Operações de Leitura</div>
            <div className="font-mono-num text-[22px] font-extrabold text-[var(--text)] mt-0.5">
              {stats.reads}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">Operações de Escrita</div>
            <div className="font-mono-num text-[22px] font-extrabold text-[var(--text)] mt-0.5">
              {stats.writes}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[var(--muted)]">Falhas / Bloqueios</div>
            <div
              className={`font-mono-num text-[22px] font-extrabold mt-0.5 ${
                stats.failures > 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'
              }`}
            >
              {stats.failures}
            </div>
          </div>
        </div>

        {/* Metadados da fonte + Aviso se Code.gs ainda não foi atualizado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 text-[11.5px] text-[var(--muted)]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Fonte remota:{' '}
              <strong className="text-[var(--text)]">
                {remoteSource === 'drive-json'
                  ? 'Log estruturado no Drive (_sync_audit_log.json)'
                  : remoteSource === 'sheet'
                    ? 'Planilha oculta (tb_logs_acesso)'
                    : 'Apenas espelho local deste navegador'}
              </strong>
            </span>
            {remoteUpdatedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">Atualizado em {formatAuditTimestamp(remoteUpdatedAt)}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadRemoteAudit()}
              disabled={loadingRemote || !gasConnected}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCcw className={`w-3.5 h-3.5 shrink-0 ${loadingRemote ? 'animate-spin' : ''}`} />
              <span>{loadingRemote ? 'Carregando…' : 'Atualizar do Drive'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportAuditJson}
              disabled={filteredLogs.length === 0}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Exportar JSON</span>
            </button>
            {localGasAuditLogs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearLocalGasAuditLogs();
                  toast('Espelho local de auditoria limpo.');
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Limpar local
              </button>
            )}
          </div>
        </div>

        {unsupportedByScript && (
          <div className="mb-4 p-3 rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[12px] text-[var(--text)] flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="leading-relaxed">
              <strong className="font-bold">Atualização opcional do script recomendada:</strong> a versão atual implantada no seu Google Apps Script ainda não expõe o log remoto do Drive. Abaixo você já vê o espelho estruturado deste dispositivo; para enxergar também os logs multi-dispositivo salvos pelo script no Drive, cole a versão atualizada de <strong>Code.gs</strong> e implante como <strong>Nova versão</strong>.
            </div>
          </div>
        )}

        {fetchError && !unsupportedByScript && (
          <div className="mb-4 p-3 rounded-lg border border-[var(--bad)]/45 bg-[var(--bad)]/10 text-[12px] text-[var(--text)] flex items-start gap-2.5">
            <XCircle className="w-4 h-4 text-[var(--bad)] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="leading-relaxed">
              <strong>Não foi possível ler o log remoto agora:</strong> {fetchError}. Exibindo eventos capturados localmente.
            </div>
          </div>
        )}

        {/* Controles interativos de filtro (segmented controls + busca) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filtrar por tipo de operação"
              className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]"
            >
              {(
                [
                  { id: 'ALL', label: 'Todos os tipos' },
                  { id: 'READ', label: 'Leitura' },
                  { id: 'WRITE', label: 'Escrita' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeFilter(opt.id)}
                  className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    typeFilter === opt.id
                      ? 'bg-[var(--panel-raised)] text-[var(--text)] shadow-xs border border-[var(--line-strong)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)] border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label="Filtrar por resultado"
              className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]"
            >
              {(
                [
                  { id: 'ALL', label: 'Todos status' },
                  { id: 'SUCCESS', label: 'Sucesso' },
                  { id: 'FAILURE', label: 'Falha' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id)}
                  className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === opt.id
                      ? 'bg-[var(--panel-raised)] text-[var(--text)] shadow-xs border border-[var(--line-strong)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)] border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full md:w-[270px]">
            <Search
              className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar operação, erro ou motivo…"
              aria-label="Buscar no log de auditoria"
              className="ce-input pl-8 text-[12px] h-[34px] w-full"
            />
          </div>
        </div>

        {/* Tabela de auditoria estruturada */}
        {loadingRemote && mergedLogs.length === 0 ? (
          <div className="space-y-2 py-2" aria-busy="true" aria-label="Carregando log de auditoria">
            {[0, 1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="h-10 rounded-md bg-[var(--panel-soft)] border border-[var(--line)] animate-pulse"
              />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-8 text-center border-t border-[var(--line)]">
            <p className="text-[13px] font-semibold text-[var(--text)]">
              Nenhum evento de auditoria encontrado para os filtros atuais.
            </p>
            <p className="text-[12px] text-[var(--muted)] mt-1">
              Cada leitura ou escrita realizada via Google Apps Script aparecerá aqui automaticamente com horário, status e diagnóstico.
            </p>
            {(typeFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
                  setSearchQuery('');
                }}
                className="mt-3 px-3.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 border-t border-[var(--line)]">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-[11px] font-semibold text-[var(--muted)]">
                  <th className="py-2.5 pr-3 whitespace-nowrap">Timestamp</th>
                  <th className="py-2.5 pr-3 whitespace-nowrap">Tipo</th>
                  <th className="py-2.5 pr-3 whitespace-nowrap">Operação</th>
                  <th className="py-2.5 pr-3 whitespace-nowrap">Resultado</th>
                  <th className="py-2.5 pr-3">Motivo / Diagnóstico</th>
                  <th className="py-2.5 text-right whitespace-nowrap">Origem / Latência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {filteredLogs.map((entry) => {
                  const isSuccess = entry.status === 'SUCCESS';
                  const isRead = entry.operationType === 'READ';
                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-[var(--panel-soft)]/70 transition-colors ${
                        !isSuccess ? 'bg-[var(--bad)]/[0.04]' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-3 align-top whitespace-nowrap font-mono-num text-[11.5px] text-[var(--text)]">
                        {formatAuditTimestamp(entry.timestamp)}
                      </td>
                      <td className="py-2.5 pr-3 align-top whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--text)]">
                          {isRead ? (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text)] shrink-0" aria-hidden="true" />
                          )}
                          <span>{isRead ? 'Leitura' : 'Escrita'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 align-top">
                        <div className="font-semibold text-[var(--text)] leading-snug">
                          {entry.actionLabel}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] font-mono-num">
                          {entry.action}
                          {typeof entry.serverVersion === 'number' && entry.serverVersion > 0
                            ? ` · v${entry.serverVersion}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 align-top whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[11.5px] font-bold ${
                            isSuccess ? 'text-[var(--good)]' : 'text-[var(--bad)]'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span>{isSuccess ? 'Sucesso' : 'Falha'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 align-top max-w-[380px]">
                        <div className={`leading-snug break-words ${isSuccess ? 'text-[var(--muted)]' : 'text-[var(--text)] font-medium'}`}>
                          {entry.reason}
                        </div>
                        {entry.details && (
                          <div className="text-[11px] text-[var(--muted)] mt-0.5 font-mono-num break-words">
                            {entry.details}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 align-top text-right whitespace-nowrap text-[11px] text-[var(--muted)] font-mono-num">
                        <div>{entry.source === 'drive-script' ? 'Drive (Script)' : 'Cliente local'}</div>
                        <div>
                          {entry.durationMs != null ? `${entry.durationMs} ms` : '—'}
                          {entry.deviceId ? ` · ${entry.deviceId.slice(0, 12)}` : ''}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};
