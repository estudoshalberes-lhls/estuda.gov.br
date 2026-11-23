import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  PenTool,
  Scale,
  Target,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { localDateIso, visibleName } from '../../lib/parsers';
import { Panel } from '../ui/PageHeader';

function parseContestDateIso(raw?: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return '';
}

function diffDaysFromToday(targetIso: string): number | null {
  if (!targetIso) return null;
  const todayIso = localDateIso();
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [py, pm, pd] = targetIso.split('-').map(Number);
  if (!ty || !py) return null;
  const a = Date.UTC(ty, tm - 1, td);
  const b = Date.UTC(py, pm - 1, pd);
  return Math.round((b - a) / 86400000);
}

export const PreExamChecklistPanel: React.FC = () => {
  const { db, setActivePage, openContestEdital, updatePreferences } = useStudy();

  const sortedContests = useMemo(() => {
    return [...(db.contests || [])].sort((a, b) => {
      const da = parseContestDateIso(a.data_abertura) || '9999-12-31';
      const dbStr = parseContestDateIso(b.data_abertura) || '9999-12-31';
      return da.localeCompare(dbStr);
    });
  }, [db.contests]);

  const [selectedId, setSelectedId] = useState<string>(
    () => db.preferences.target_exam_contest_id || sortedContests[0]?.id || '',
  );

  const activeContest = useMemo(() => {
    if (!sortedContests.length) return null;
    return (
      sortedContests.find((c) => c.id === selectedId) ||
      sortedContests.find((c) => c.id === db.preferences.target_exam_contest_id) ||
      sortedContests[0]
    );
  }, [db.preferences.target_exam_contest_id, selectedId, sortedContests]);

  const stats = useMemo(() => {
    const editalPoints = activeContest?.edital_pontos || [];
    const editalTotal = editalPoints.length;
    const editalStudied = editalPoints.filter((p) => p.estudado).length;
    const editalPct = editalTotal > 0 ? Math.round((editalStudied / editalTotal) * 100) : 0;

    // High-incidence unread law items (prefer laws linked in edital; fallback to all laws)
    const linkedLawFolders = new Set<string>();
    editalPoints.forEach((pt) => {
      (pt.artigos_vinculados || []).forEach((link) => {
        if (link.pastaLei) linkedLawFolders.add(link.pastaLei);
      });
    });

    const lawFoldersToScan =
      linkedLawFolders.size > 0 ? Array.from(linkedLawFolders) : Object.keys(db.laws || {});

    let highIncidenceTotal = 0;
    let highIncidenceUnread = 0;
    lawFoldersToScan.forEach((folder) => {
      const folderData = db.laws?.[folder];
      if (!folderData) return;
      const readSet = new Set(db.readLawItems?.[folder] || []);
      (folderData.items || []).forEach((it) => {
        if (it.grau === 'Muito Alto' || it.grau === 'Alto') {
          highIncidenceTotal += 1;
          if (!readSet.has(it.id)) highIncidenceUnread += 1;
        }
      });
    });

    const pendingErrors = (db.annotations || []).filter((e) => !e.corrigido).length;
    const criticalPointsCount = (db.criticalPoints || []).length;
    const completedSimsCount = (db.completedSimulations || []).length;
    const essaysCount = (db.essays || []).length;

    const examIso = parseContestDateIso(activeContest?.data_abertura);
    const daysLeft = diffDaysFromToday(examIso);

    return {
      editalTotal,
      editalStudied,
      editalPct,
      highIncidenceTotal,
      highIncidenceUnread,
      pendingErrors,
      criticalPointsCount,
      completedSimsCount,
      essaysCount,
      daysLeft,
      hasLinkedLaws: linkedLawFolders.size > 0,
    };
  }, [activeContest, db.annotations, db.completedSimulations, db.criticalPoints, db.essays, db.laws, db.readLawItems]);

  if (!activeContest) {
    return null;
  }

  const checklistItems = [
    {
      id: 'edital',
      title: 'Cobertura do Edital Verticalizado',
      detail:
        stats.editalTotal > 0
          ? `${stats.editalStudied}/${stats.editalTotal} pontos estudados (${stats.editalPct}%)`
          : 'Nenhum ponto cadastrado no edital deste concurso ainda',
      ok: stats.editalTotal > 0 && stats.editalPct >= 80,
      ctaLabel: 'Abrir Edital',
      icon: ClipboardCheck,
      onClick: () => openContestEdital(activeContest.id),
    },
    {
      id: 'leis',
      title: 'Lei Seca de Alta Incidência (Muito Alto / Alto)',
      detail:
        stats.highIncidenceTotal > 0
          ? stats.highIncidenceUnread === 0
            ? `Todos os ${stats.highIncidenceTotal} dispositivos críticos lidos`
            : `${stats.highIncidenceUnread} de ${stats.highIncidenceTotal} dispositivo(s) ainda não lido(s)`
          : 'Classifique dispositivos na aba Lei Seca para rastrear incidência',
      ok: stats.highIncidenceTotal > 0 && stats.highIncidenceUnread === 0,
      ctaLabel: 'Revisar Lei Seca',
      icon: Scale,
      onClick: () => setActivePage('Lei Seca'),
    },
    {
      id: 'erros',
      title: 'Zerar Pendências do Caderno de Erros',
      detail:
        stats.pendingErrors === 0
          ? 'Caderno de erros sem pendências em aberto'
          : `${stats.pendingErrors} erro(s) ainda marcado(s) como pendente(s)`,
      ok: stats.pendingErrors === 0,
      ctaLabel: 'Caderno de Erros',
      icon: AlertTriangle,
      onClick: () => setActivePage('Caderno de Erros'),
    },
    {
      id: 'simulados',
      title: 'Simulados Cronometrados Realizados',
      detail: `${stats.completedSimsCount} simulado(s) concluído(s) no histórico`,
      ok: stats.completedSimsCount >= 3,
      ctaLabel: 'Simulados',
      icon: FileCheck2,
      onClick: () => setActivePage('Simulados Realizados'),
    },
    {
      id: 'discursiva',
      title: 'Treino de Discursivas & Pontos Críticos',
      detail: `${stats.essaysCount} redação(ões) · ${stats.criticalPointsCount} ponto(s) crítico(s) catalogado(s)`,
      ok: stats.essaysCount >= 2,
      ctaLabel: 'Discursivas',
      icon: PenTool,
      onClick: () => setActivePage('Discursiva'),
    },
  ];

  const completedChecklistCount = checklistItems.filter((i) => i.ok).length;

  return (
    <Panel
      className="mb-4"
      title="Checklist de Pré-Prova · Reta Final por Concurso"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Selecionar concurso para checklist de pré-prova"
            value={activeContest.id}
            onChange={(e) => {
              setSelectedId(e.target.value);
              updatePreferences({ target_exam_contest_id: e.target.value });
            }}
            className="ce-select h-[32px] w-auto max-w-[230px] text-[11.5px] py-0.5 font-bold"
          >
            {sortedContests.map((c) => (
              <option key={c.id} value={c.id}>
                {visibleName(c.concurso)} {c.data_abertura ? `(${c.data_abertura})` : ''}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {/* Top Contest Readiness Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[var(--line)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[var(--text)]">
            <Target className="w-4 h-4 text-[var(--accent)]" />
            <span>{visibleName(activeContest.concurso)}</span>
          </div>
          <span className="text-[12px] text-[var(--muted)] font-mono-num tabular-nums">
            {stats.daysLeft === null
              ? 'Sem data de prova definida'
              : stats.daysLeft > 0
                ? `Faltam ${stats.daysLeft} dias (D-${stats.daysLeft})`
                : stats.daysLeft === 0
                  ? 'Prova HOJE'
                  : `Prova há ${Math.abs(stats.daysLeft)} dias`}
          </span>
          {activeContest.local_prova && (
            <span className="text-[12px] text-[var(--muted)]">· {activeContest.local_prova}</span>
          )}
        </div>

        <div className="text-[12px] font-mono-num tabular-nums font-bold text-[var(--accent)]">
          Prontidão: {completedChecklistCount}/{checklistItems.length} critérios
        </div>
      </div>

      {/* Checklist Rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {checklistItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 flex flex-col justify-between gap-2.5"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-[var(--text)]">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        item.ok ? 'text-[var(--good)]' : 'text-[var(--accent)]'
                      }`}
                    />
                    <span>{item.title}</span>
                  </div>
                  <span
                    className={`text-[10.5px] font-bold whitespace-nowrap ${
                      item.ok ? 'text-[var(--good)]' : 'text-[var(--warning)]'
                    }`}
                  >
                    {item.ok ? (
                      <span className="inline-flex items-center gap-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        OK
                      </span>
                    ) : (
                      'Atenção'
                    )}
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--muted)] mt-1 leading-snug">{item.detail}</p>
              </div>

              <button
                type="button"
                onClick={item.onClick}
                className="self-start inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--accent)] hover:underline"
              >
                <BookOpen className="w-3 h-3" />
                {item.ctaLabel}
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};
