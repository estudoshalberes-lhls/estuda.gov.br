import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  History,
  Search,
  Trash2,
} from 'lucide-react';
import { LawFolderData, LawReadingEntry } from '../../types/study';
import { formatIsoDateBr, localDateIso, visibleName } from '../../lib/parsers';
import { Panel } from '../ui/PageHeader';

interface LawReadingAnalyticsPanelProps {
  laws: Record<string, LawFolderData>;
  readLawItems: Record<string, string[]>;
  lawReadDates: Record<string, LawReadingEntry[]>;
  activeFolder: string;
  onOpenLaw: (folder: string) => void;
  onMarkLawReadToday: (folder: string) => void;
  onRemoveLawReadDate: (folder: string, entryId: string) => void;
  onRemoveArticleReadDate: (folder: string, itemId: string, entryId: string) => void;
}

interface LawSummaryRow {
  folder: string;
  label: string;
  totalDevices: number;
  readDevices: number;
  readPct: number;
  uniqueDates: string[];
  lastReadDate: string | null;
  daysSinceLastRead: number | null;
  totalArticleReadings: number;
  status: 'recent' | 'overdue' | 'unread';
}

interface HistoryTimelineEvent {
  id: string;
  date: string;
  folder: string;
  lawLabel: string;
  kind: 'law' | 'article';
  articleLabel?: string;
  itemId?: string;
  entryId: string;
  readingNumber?: number;
  totalReadingsForItem?: number;
  observacao?: string;
}

function diffDaysFromToday(dateIso: string, todayIso: string): number {
  const a = new Date(`${dateIso}T00:00:00`).getTime();
  const b = new Date(`${todayIso}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function formatRelativeDays(days: number | null): string {
  if (days === null) return 'Nunca lida';
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `Há ${days} dias`;
}

function formatWeekdayBr(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { weekday: 'long' });
}

function formatShortDayBr(dateIso: string): string {
  const parts = dateIso.split('-');
  if (parts.length !== 3) return dateIso;
  return `${parts[2]}/${parts[1]}`;
}

export const LawReadingAnalyticsPanel: React.FC<LawReadingAnalyticsPanelProps> = ({
  laws,
  readLawItems,
  lawReadDates,
  activeFolder,
  onOpenLaw,
  onMarkLawReadToday,
  onRemoveLawReadDate,
  onRemoveArticleReadDate,
}) => {
  const todayIso = localDateIso();
  const [chartFilter, setChartFilter] = useState<'all' | 'read' | 'unread' | 'overdue'>('all');
  const [chartSort, setChartSort] = useState<'lastDate' | 'unreadFirst' | 'daysCount' | 'pct'>(
    'lastDate',
  );
  const [historyLawFilter, setHistoryLawFilter] = useState<string>('__ALL__');
  const [historyKindFilter, setHistoryKindFilter] = useState<'all' | 'article' | 'law'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [visibleDateGroups, setVisibleDateGroups] = useState(14);

  const { lawRows, events, timeline30Days, totals } = useMemo(() => {
    const folders = Object.keys(laws).sort((a, b) =>
      visibleName(a).localeCompare(visibleName(b), 'pt-BR'),
    );

    const rows: LawSummaryRow[] = [];
    const allEvents: HistoryTimelineEvent[] = [];
    const dayActivityMap = new Map<
      string,
      { laws: Set<string>; articlesCount: number; lawLogsCount: number }
    >();

    const touchDay = (date: string, lawLabel: string, kind: 'law' | 'article') => {
      if (!date) return;
      let bucket = dayActivityMap.get(date);
      if (!bucket) {
        bucket = { laws: new Set<string>(), articlesCount: 0, lawLogsCount: 0 };
        dayActivityMap.set(date, bucket);
      }
      bucket.laws.add(lawLabel);
      if (kind === 'article') bucket.articlesCount += 1;
      else bucket.lawLogsCount += 1;
    };

    let totalDevicesAll = 0;
    let readDevicesAll = 0;
    let totalAccumulatedReadings = 0;

    for (const folder of folders) {
      const folderData = laws[folder];
      const label = visibleName(folder);
      const items = folderData?.items || [];
      const readSet = new Set(readLawItems[folder] || []);
      const folderDates = lawReadDates[folder] || [];

      const uniqueDatesSet = new Set<string>();
      let lawArticleReadings = 0;
      let readCount = 0;

      for (const entry of folderDates) {
        if (!entry.data) continue;
        uniqueDatesSet.add(entry.data);
        touchDay(entry.data, label, 'law');
        allEvents.push({
          id: `law-${folder}-${entry.id}`,
          date: entry.data,
          folder,
          lawLabel: label,
          kind: 'law',
          entryId: entry.id,
          observacao: entry.observacao,
        });
      }

      for (const item of items) {
        const leituras = item.leituras || [];
        if (readSet.has(item.id) || leituras.length > 0) {
          readCount += 1;
        }
        lawArticleReadings += leituras.length;

        // Sort ascending to compute chronological reading index (1ª leitura, 2ª leitura...)
        const asc = [...leituras].sort((a, b) => a.data.localeCompare(b.data));
        asc.forEach((entry, idx) => {
          if (!entry.data) return;
          uniqueDatesSet.add(entry.data);
          touchDay(entry.data, label, 'article');
          allEvents.push({
            id: `art-${folder}-${item.id}-${entry.id}`,
            date: entry.data,
            folder,
            lawLabel: label,
            kind: 'article',
            articleLabel: (item.dispositivo || item.artigo_base || 'Dispositivo').trim(),
            itemId: item.id,
            entryId: entry.id,
            readingNumber: idx + 1,
            totalReadingsForItem: asc.length,
            observacao: entry.observacao,
          });
        });
      }

      totalDevicesAll += items.length;
      readDevicesAll += readCount;
      totalAccumulatedReadings += lawArticleReadings;

      const uniqueDates = Array.from(uniqueDatesSet).sort((a, b) => b.localeCompare(a));
      const lastReadDate = uniqueDates[0] || null;
      const daysSinceLastRead = lastReadDate ? diffDaysFromToday(lastReadDate, todayIso) : null;
      const hasAnyRead = uniqueDates.length > 0 || readCount > 0;
      const status: LawSummaryRow['status'] = !hasAnyRead
        ? 'unread'
        : daysSinceLastRead !== null && daysSinceLastRead <= 7
          ? 'recent'
          : 'overdue';

      rows.push({
        folder,
        label,
        totalDevices: items.length,
        readDevices: readCount,
        readPct: items.length > 0 ? Math.round((readCount / items.length) * 100) : hasAnyRead ? 100 : 0,
        uniqueDates,
        lastReadDate,
        daysSinceLastRead,
        totalArticleReadings: lawArticleReadings,
        status,
      });
    }

    allEvents.sort((a, b) => {
      const dateDiff = b.date.localeCompare(a.date);
      if (dateDiff !== 0) return dateDiff;
      if (a.kind !== b.kind) return a.kind === 'article' ? -1 : 1;
      return a.lawLabel.localeCompare(b.lawLabel, 'pt-BR');
    });

    // Build last 30 days timeline
    const days30: Array<{
      date: string;
      short: string;
      articlesCount: number;
      lawsCount: number;
      lawNames: string[];
      score: number;
    }> = [];
    const todayDate = new Date(`${todayIso}T12:00:00`);
    for (let offset = 29; offset >= 0; offset--) {
      const d = new Date(todayDate);
      d.setDate(todayDate.getDate() - offset);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      const bucket = dayActivityMap.get(iso);
      const lawsCount = bucket ? bucket.laws.size : 0;
      const articlesCount = bucket ? bucket.articlesCount : 0;
      const score = articlesCount > 0 ? articlesCount : lawsCount;
      days30.push({
        date: iso,
        short: formatShortDayBr(iso),
        articlesCount,
        lawsCount,
        lawNames: bucket ? Array.from(bucket.laws) : [],
        score,
      });
    }

    const recentLawsCount = rows.filter((r) => r.status === 'recent').length;
    const overdueLawsCount = rows.filter((r) => r.status === 'overdue').length;
    const unreadLawsCount = rows.filter((r) => r.status === 'unread').length;
    const readLawsCount = recentLawsCount + overdueLawsCount;
    const latestReadLaw = [...rows]
      .filter((r) => r.lastReadDate)
      .sort((a, b) => (b.lastReadDate || '').localeCompare(a.lastReadDate || ''))[0] || null;

    return {
      lawRows: rows,
      events: allEvents,
      timeline30Days: days30,
      totals: {
        totalLaws: rows.length,
        readLawsCount,
        recentLawsCount,
        overdueLawsCount,
        unreadLawsCount,
        totalDevicesAll,
        readDevicesAll,
        totalAccumulatedReadings,
        uniqueActiveDays: dayActivityMap.size,
        latestReadLaw,
      },
    };
  }, [lawReadDates, laws, readLawItems, todayIso]);

  const filteredChartRows = useMemo(() => {
    const base = lawRows.filter((row) => {
      if (chartFilter === 'read') return row.status !== 'unread';
      if (chartFilter === 'unread') return row.status === 'unread';
      if (chartFilter === 'overdue') return row.status === 'overdue';
      return true;
    });

    return [...base].sort((a, b) => {
      if (chartSort === 'unreadFirst') {
        const order = { unread: 0, overdue: 1, recent: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return a.label.localeCompare(b.label, 'pt-BR');
      }
      if (chartSort === 'daysCount') {
        if (b.uniqueDates.length !== a.uniqueDates.length) {
          return b.uniqueDates.length - a.uniqueDates.length;
        }
        return (b.lastReadDate || '').localeCompare(a.lastReadDate || '');
      }
      if (chartSort === 'pct') {
        if (b.readPct !== a.readPct) return b.readPct - a.readPct;
        return (b.lastReadDate || '').localeCompare(a.lastReadDate || '');
      }
      // Default: lastDate (most recently read first, then unread alphabetically)
      if (a.lastReadDate && b.lastReadDate) {
        const diff = b.lastReadDate.localeCompare(a.lastReadDate);
        if (diff !== 0) return diff;
      } else if (a.lastReadDate && !b.lastReadDate) {
        return -1;
      } else if (!a.lastReadDate && b.lastReadDate) {
        return 1;
      }
      return a.label.localeCompare(b.label, 'pt-BR');
    });
  }, [chartFilter, chartSort, lawRows]);

  const maxUniqueDays = useMemo(
    () => Math.max(1, ...lawRows.map((r) => r.uniqueDates.length)),
    [lawRows],
  );

  const maxTimelineScore = useMemo(
    () => Math.max(1, ...timeline30Days.map((d) => d.score)),
    [timeline30Days],
  );

  const groupedHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const filtered = events.filter((ev) => {
      if (historyLawFilter !== '__ALL__' && ev.folder !== historyLawFilter) return false;
      if (historyKindFilter !== 'all' && ev.kind !== historyKindFilter) return false;
      if (!q) return true;
      const hay = `${ev.lawLabel} ${ev.articleLabel || ''} ${ev.observacao || ''} ${formatIsoDateBr(ev.date)}`.toLowerCase();
      return hay.includes(q);
    });

    const map = new Map<string, HistoryTimelineEvent[]>();
    for (const ev of filtered) {
      const list = map.get(ev.date) || [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [events, historyKindFilter, historyLawFilter, historySearch]);

  const unreadLaws = useMemo(
    () => lawRows.filter((r) => r.status === 'unread'),
    [lawRows],
  );

  const hoveredDayInfo = useMemo(
    () => timeline30Days.find((d) => d.date === hoveredDay) || null,
    [hoveredDay, timeline30Days],
  );

  const readRatioPct =
    totals.totalLaws > 0 ? Math.round((totals.readLawsCount / totals.totalLaws) * 100) : 0;
  const recentPct =
    totals.totalLaws > 0 ? Math.round((totals.recentLawsCount / totals.totalLaws) * 100) : 0;
  const overduePct =
    totals.totalLaws > 0 ? Math.round((totals.overdueLawsCount / totals.totalLaws) * 100) : 0;
  const unreadPct = Math.max(0, 100 - recentPct - overduePct);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3.5">
          <div className="text-[11px] font-bold text-[var(--muted)]">Leis lidas vs. não lidas</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono-num text-[22px] font-extrabold text-[var(--text)]">
              {totals.readLawsCount}/{totals.totalLaws}
            </span>
            <span className="text-[12px] font-bold text-[var(--accent)] tabular-nums">
              ({readRatioPct}%)
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-[var(--muted)] tabular-nums">
            <strong className="text-[var(--good)]">{totals.recentLawsCount}</strong> em dia ·{' '}
            <strong className="text-[var(--warning)]">{totals.overdueLawsCount}</strong> revisar ·{' '}
            <strong className="text-[var(--bad)]">{totals.unreadLawsCount}</strong> não lidas
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3.5">
          <div className="text-[11px] font-bold text-[var(--muted)]">Última lei lida</div>
          <div className="mt-1 text-[14.5px] font-extrabold text-[var(--text)] truncate" title={totals.latestReadLaw?.label}>
            {totals.latestReadLaw ? totals.latestReadLaw.label : 'Nenhuma lei lida ainda'}
          </div>
          <div className="mt-1 text-[11.5px] text-[var(--muted)] tabular-nums">
            {totals.latestReadLaw?.lastReadDate ? (
              <>
                <strong className="text-[var(--good)]">
                  {formatIsoDateBr(totals.latestReadLaw.lastReadDate)}
                </strong>{' '}
                ({formatRelativeDays(totals.latestReadLaw.daysSinceLastRead)})
              </>
            ) : (
              'Marque um artigo ou lei para iniciar o histórico'
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3.5">
          <div className="text-[11px] font-bold text-[var(--muted)]">Dias ativos de leitura</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono-num text-[22px] font-extrabold text-[var(--accent)]">
              {totals.uniqueActiveDays}
            </span>
            <span className="text-[11.5px] text-[var(--muted)]">dia(s) registrados</span>
          </div>
          <div className="mt-1 text-[11.5px] text-[var(--muted)] tabular-nums">
            <strong className="text-[var(--text)]">{totals.totalAccumulatedReadings}</strong>{' '}
            leituras acumuladas de artigos
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3.5">
          <div className="text-[11px] font-bold text-[var(--muted)]">Cobertura de dispositivos</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono-num text-[22px] font-extrabold text-[var(--good)]">
              {totals.readDevicesAll}
            </span>
            <span className="text-[12px] text-[var(--muted)] font-mono-num">
              / {totals.totalDevicesAll}
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-[var(--muted)] tabular-nums">
            {totals.totalDevicesAll > 0
              ? `${Math.round((totals.readDevicesAll / totals.totalDevicesAll) * 100)}% do Vade Mecum já lido`
              : 'Sem dispositivos extraídos'}
          </div>
        </div>
      </div>

      {/* Comparative Chart: Read Laws (with Dates & Days) vs Unread Laws */}
      <Panel
        title="Gráfico comparativo: últimas leis lidas, datas e leis não lidas"
        subtitle="Compare rapidamente quando cada norma foi lida pela última vez, quantos dias distintos você a estudou e quais leis ainda estão sem leitura."
        stackHeader
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Todas (${totals.totalLaws})` },
                { id: 'read', label: `Lidas (${totals.readLawsCount})` },
                { id: 'overdue', label: `Revisar >7d (${totals.overdueLawsCount})` },
                { id: 'unread', label: `Não lidas (${totals.unreadLawsCount})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setChartFilter(opt.id)}
                className={`h-[30px] px-2.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  chartFilter === opt.id
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                {opt.label}
              </button>
            ))}

            <select
              aria-label="Ordenar gráfico comparativo"
              value={chartSort}
              onChange={(e) =>
                setChartSort(e.target.value as 'lastDate' | 'unreadFirst' | 'daysCount' | 'pct')
              }
              className="ce-select h-[30px] w-auto text-[11.5px] py-0"
            >
              <option value="lastDate">Mais recentes primeiro</option>
              <option value="unreadFirst">Não lidas primeiro</option>
              <option value="daysCount">Mais dias lidos</option>
              <option value="pct">Maior % lido</option>
            </select>
          </div>
        }
      >
        {/* Proportional Status Bar */}
        {totals.totalLaws > 0 && (
          <div className="mb-4">
            <div className="h-3 w-full rounded-full bg-[var(--panel-soft)] border border-[var(--line)] overflow-hidden flex">
              {totals.recentLawsCount > 0 && (
                <div
                  style={{ width: `${recentPct}%` }}
                  className="h-full bg-[var(--good)] transition-all duration-300"
                  title={`Lidas recentemente (≤7 dias): ${totals.recentLawsCount}`}
                />
              )}
              {totals.overdueLawsCount > 0 && (
                <div
                  style={{ width: `${overduePct}%` }}
                  className="h-full bg-[var(--warning)] transition-all duration-300"
                  title={`Para revisar (>7 dias): ${totals.overdueLawsCount}`}
                />
              )}
              {totals.unreadLawsCount > 0 && (
                <div
                  style={{ width: `${unreadPct}%` }}
                  className="h-full bg-[var(--bad)]/65 transition-all duration-300"
                  title={`Não lidas: ${totals.unreadLawsCount}`}
                />
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[var(--good)]" />
                Lidas nos últimos 7 dias ({totals.recentLawsCount})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[var(--warning)]" />
                Lidas há mais de 7 dias ({totals.overdueLawsCount})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[var(--bad)]/65" />
                Ainda não lidas ({totals.unreadLawsCount})
              </span>
            </div>
          </div>
        )}

        {/* Per-law Comparative Horizontal Bars */}
        {filteredChartRows.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {filteredChartRows.map((row) => {
              const isCurrent = row.folder === activeFolder;
              const daysBarWidth =
                row.uniqueDates.length > 0
                  ? Math.max(10, Math.round((row.uniqueDates.length / maxUniqueDays) * 100))
                  : 0;
              const barColor =
                row.status === 'recent'
                  ? 'bg-[var(--good)]'
                  : row.status === 'overdue'
                    ? 'bg-[var(--warning)]'
                    : 'bg-[var(--bad)]/50';
              const statusTextClass =
                row.status === 'recent'
                  ? 'text-[var(--good)]'
                  : row.status === 'overdue'
                    ? 'text-[var(--warning)]'
                    : 'text-[var(--bad)]';

              return (
                <div
                  key={row.folder}
                  className={`rounded-xl border p-3 transition-colors ${
                    isCurrent
                      ? 'border-[var(--accent)]/60 bg-[var(--accent-soft)]/30'
                      : row.status === 'unread'
                        ? 'border-[var(--line)] bg-[var(--panel-soft)]/70'
                        : 'border-[var(--line)] bg-[var(--panel-soft)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <button
                        type="button"
                        onClick={() => onOpenLaw(row.folder)}
                        className="text-left text-[13px] font-bold text-[var(--text)] hover:text-[var(--accent)] truncate max-w-full cursor-pointer"
                      >
                        {row.label}
                      </button>
                      <span className={`text-[11px] font-bold tabular-nums ${statusTextClass}`}>
                        {row.lastReadDate
                          ? `Última leitura: ${formatIsoDateBr(row.lastReadDate)} (${formatRelativeDays(row.daysSinceLastRead)})`
                          : 'Não lida'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 text-[11.5px] tabular-nums">
                      <span className="font-mono-num text-[var(--muted)]">
                        <strong className="text-[var(--text)]">{row.uniqueDates.length}</strong>{' '}
                        dia(s) ·{' '}
                        <strong className="text-[var(--text)]">
                          {row.readDevices}/{row.totalDevices}
                        </strong>{' '}
                        ({row.readPct}%)
                      </span>
                      <button
                        type="button"
                        onClick={() => onMarkLawReadToday(row.folder)}
                        title="Registrar leitura de hoje para esta lei"
                        className="inline-flex items-center gap-1 h-[26px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                      >
                        <CalendarCheck2 className="w-3 h-3 text-[var(--accent)]" />
                        + Hoje
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenLaw(row.folder)}
                        title="Abrir esta lei no leitor"
                        className="inline-flex items-center gap-1 h-[26px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--accent)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Abrir
                      </button>
                    </div>
                  </div>

                  {/* Dual Visual Comparison Bars: Progress % + Frequency of Reading Days */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-center">
                    <div>
                      <div className="flex items-center justify-between text-[10.5px] text-[var(--muted)] mb-1">
                        <span>Avanço na norma</span>
                        <span className="font-mono-num font-bold text-[var(--text)]">
                          {row.readPct}%
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-[var(--panel)] border border-[var(--line)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{ width: `${row.status === 'unread' ? 0 : Math.max(4, row.readPct)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[10.5px] text-[var(--muted)] mb-1">
                        <span>Dias distintos lidos</span>
                        <span className="font-mono-num font-bold text-[var(--text)]">
                          {row.uniqueDates.length > 0
                            ? `${row.uniqueDates.length} dia(s)`
                            : '0 dias'}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-[var(--panel)] border border-[var(--line)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            row.uniqueDates.length > 0 ? 'bg-[var(--accent)]' : 'bg-transparent'
                          }`}
                          style={{ width: `${daysBarWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recent Reading Dates Strip */}
                  {row.uniqueDates.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-[10.5px] text-[var(--muted)]">
                      <span className="font-semibold">Datas lidas:</span>
                      {row.uniqueDates.slice(0, 6).map((d) => (
                        <span
                          key={d}
                          className="px-1.5 py-0.5 rounded bg-[var(--panel)] border border-[var(--line)] font-mono-num font-semibold text-[var(--text)]"
                        >
                          {formatIsoDateBr(d)}
                        </span>
                      ))}
                      {row.uniqueDates.length > 6 && (
                        <span className="font-bold text-[var(--accent)]">
                          +{row.uniqueDates.length - 6} data(s)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-[12.5px] text-[var(--muted)]">
            Nenhuma lei corresponde a este filtro.
          </div>
        )}
      </Panel>

      {/* 30-Day Activity Chart + Unread Laws Quick List */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-4 items-start">
        <Panel
          title="Atividade diária de leitura (últimos 30 dias)"
          subtitle="Passe o mouse ou clique em um dia para ver quais leis e quantos artigos foram lidos naquela data."
        >
          <div className="flex flex-col gap-3">
            <div className="h-[155px] flex items-end gap-1 sm:gap-1.5 pt-4 px-1">
              {timeline30Days.map((day) => {
                const heightPct =
                  day.score > 0 ? Math.max(14, Math.round((day.score / maxTimelineScore) * 100)) : 4;
                const isSelected = hoveredDay === day.date;
                const isToday = day.date === todayIso;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onMouseEnter={() => setHoveredDay(day.date)}
                    onFocus={() => setHoveredDay(day.date)}
                    onClick={() => setHoveredDay(day.date)}
                    title={`${formatIsoDateBr(day.date)}: ${day.articlesCount} artigo(s) em ${day.lawsCount} lei(s)`}
                    className="flex-1 h-full flex flex-col justify-end items-center gap-1 group cursor-pointer focus:outline-none"
                  >
                    <div
                      className={`w-full rounded-t-sm transition-all ${
                        day.score > 0
                          ? isSelected
                            ? 'bg-[var(--accent)]'
                            : 'bg-[var(--good)] group-hover:bg-[var(--accent)]'
                          : isToday
                            ? 'bg-[var(--accent)]/25'
                            : 'bg-[var(--line)]'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[10.5px] font-mono-num text-[var(--muted)] border-t border-[var(--line)] pt-1.5">
              <span>{timeline30Days[0]?.short}</span>
              <span>{timeline30Days[14]?.short}</span>
              <span>Hoje ({timeline30Days[29]?.short})</span>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-[12px] min-h-[44px] flex flex-wrap items-center justify-between gap-2">
              {hoveredDayInfo ? (
                <>
                  <div>
                    <strong className="font-mono-num text-[var(--text)]">
                      {formatIsoDateBr(hoveredDayInfo.date)}
                    </strong>{' '}
                    <span className="text-[var(--muted)] capitalize">
                      ({formatWeekdayBr(hoveredDayInfo.date)})
                    </span>
                  </div>
                  <div className="text-[var(--text)] tabular-nums">
                    {hoveredDayInfo.lawsCount > 0 ? (
                      <>
                        <strong className="text-[var(--good)]">
                          {hoveredDayInfo.articlesCount} artigo(s)
                        </strong>{' '}
                        em{' '}
                        <strong className="text-[var(--accent)]">
                          {hoveredDayInfo.lawsCount} lei(s)
                        </strong>
                        {hoveredDayInfo.lawNames.length > 0 && (
                          <span className="text-[var(--muted)]">
                            {' '}
                            — {hoveredDayInfo.lawNames.slice(0, 3).join(', ')}
                            {hoveredDayInfo.lawNames.length > 3
                              ? ` +${hoveredDayInfo.lawNames.length - 3}`
                              : ''}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[var(--muted)]">Nenhuma leitura registrada neste dia.</span>
                    )}
                  </div>
                </>
              ) : (
                <span className="text-[var(--muted)]">
                  Selecione ou passe o cursor sobre qualquer barra para inspecionar as leis lidas na data.
                </span>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title={`Leis ainda não lidas (${unreadLaws.length})`}
          subtitle="Normas do seu Vade Mecum sem nenhum registro de leitura até o momento."
        >
          {unreadLaws.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-[245px] overflow-y-auto pr-0.5">
              {unreadLaws.map((law) => (
                <div
                  key={law.folder}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-[var(--text)] truncate" title={law.label}>
                      {law.label}
                    </div>
                    <div className="text-[11px] text-[var(--muted)] font-mono-num">
                      {law.totalDevices} dispositivo(s) · 0 leituras
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenLaw(law.folder)}
                    className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-3 h-3" />
                    Iniciar leitura
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--good)]/35 bg-[var(--good)]/10 p-3 flex items-center gap-2 text-[12.5px] text-[var(--text)]">
              <CheckCircle2 className="w-4 h-4 text-[var(--good)] shrink-0" />
              <span>Todas as leis cadastradas já possuem pelo menos uma leitura registrada!</span>
            </div>
          )}
        </Panel>
      </div>

      {/* Full Chronological Reading History */}
      <Panel
        title={`Histórico cronológico de leitura (${events.length} registro(s))`}
        subtitle="Cada dia em que você marca um artigo ou uma lei é acrescentado aqui sem substituir leituras anteriores."
        stackHeader
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Filtrar lei, artigo ou data..."
                className="ce-input pl-8 h-[32px] w-[190px] text-[12px]"
              />
            </div>

            <select
              aria-label="Filtrar histórico por lei"
              value={historyLawFilter}
              onChange={(e) => setHistoryLawFilter(e.target.value)}
              className="ce-select h-[32px] w-auto max-w-[210px] text-[12px] py-0"
            >
              <option value="__ALL__">Todas as leis</option>
              {lawRows.map((r) => (
                <option key={r.folder} value={r.folder}>
                  {r.label} ({r.uniqueDates.length}d)
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar tipo de registro"
              value={historyKindFilter}
              onChange={(e) => setHistoryKindFilter(e.target.value as 'all' | 'article' | 'law')}
              className="ce-select h-[32px] w-auto text-[12px] py-0"
            >
              <option value="all">Artigos e Leis</option>
              <option value="article">Somente artigos</option>
              <option value="law">Somente registros de lei</option>
            </select>
          </div>
        }
      >
        {groupedHistory.length > 0 ? (
          <div className="flex flex-col gap-3">
            {groupedHistory.slice(0, visibleDateGroups).map(([dateIso, dayEvents]) => {
              const uniqueLawsCount = new Set(dayEvents.map((e) => e.folder)).size;
              const articlesCount = dayEvents.filter((e) => e.kind === 'article').length;
              return (
                <div
                  key={dateIso}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden"
                >
                  <div className="px-3.5 py-2 border-b border-[var(--line)] bg-[var(--panel)] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <strong className="font-mono-num text-[13px] text-[var(--text)]">
                        {formatIsoDateBr(dateIso)}
                      </strong>
                      <span className="text-[11.5px] text-[var(--muted)] capitalize">
                        · {formatWeekdayBr(dateIso)}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-[var(--muted)] tabular-nums">
                      {uniqueLawsCount} lei(s) · {articlesCount} artigo(s)
                    </span>
                  </div>

                  <div className="divide-y divide-[var(--line)]/60">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-[var(--panel)]/60 transition-colors"
                      >
                        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
                          <button
                            type="button"
                            onClick={() => onOpenLaw(ev.folder)}
                            className="font-bold text-[var(--text)] hover:text-[var(--accent)] cursor-pointer text-left"
                          >
                            {ev.lawLabel}
                          </button>
                          {ev.kind === 'article' ? (
                            <>
                              <span aria-hidden="true" className="text-[var(--muted)]">·</span>
                              <span className="font-semibold text-[var(--accent)]">
                                {ev.articleLabel}
                              </span>
                              {ev.readingNumber && (
                                <span className="text-[11px] font-mono-num font-bold text-[var(--good)]">
                                  ({ev.readingNumber}ª leitura
                                  {ev.totalReadingsForItem && ev.totalReadingsForItem > 1
                                    ? ` de ${ev.totalReadingsForItem}`
                                    : ''}
                                  )
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span aria-hidden="true" className="text-[var(--muted)]">·</span>
                              <span className="text-[11.5px] font-semibold text-[var(--muted)]">
                                Leitura da norma
                              </span>
                            </>
                          )}
                          {ev.observacao && (
                            <span className="text-[11.5px] text-[var(--muted)] truncate max-w-[320px]">
                              — {ev.observacao}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (ev.kind === 'article' && ev.itemId) {
                              onRemoveArticleReadDate(ev.folder, ev.itemId, ev.entryId);
                            } else {
                              onRemoveLawReadDate(ev.folder, ev.entryId);
                            }
                          }}
                          title="Remover apenas este registro de data"
                          aria-label={`Remover leitura de ${formatIsoDateBr(ev.date)}`}
                          className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {groupedHistory.length > visibleDateGroups && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setVisibleDateGroups((n) => n + 14)}
                  className="h-[34px] px-4 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                >
                  Carregar mais datas ({groupedHistory.length - visibleDateGroups} restante(s))
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center gap-1.5 text-center text-[12.5px] text-[var(--muted)]">
            <History className="w-5 h-5 text-[var(--muted)]/70" />
            <span>Nenhum registro de leitura encontrado para este filtro.</span>
          </div>
        )}
      </Panel>
    </div>
  );
};
