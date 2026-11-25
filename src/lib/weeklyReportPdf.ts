import { StudyDatabase } from '../types/study';
import {
  formatClock,
  formatIsoDateBr,
  localDateIso,
  localDateTimeBrazilian,
  visibleName,
} from './parsers';

function safePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAnyDateToIso(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }
  return null;
}

function parseLocalIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

function addDaysIso(baseIso: string, delta: number): string {
  const dt = parseLocalIsoDate(baseIso);
  dt.setDate(dt.getDate() + delta);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentMondayIso(referenceIso: string): string {
  const dt = parseLocalIsoDate(referenceIso);
  const offsetFromMonday = (dt.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return addDaysIso(referenceIso, -offsetFromMonday);
}

const SHORT_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'] as const;

export interface WeeklyReportSummary {
  filename: string;
  weekStartIso: string;
  weekEndIso: string;
  totalStudySeconds: number;
  weeklyGoalHours: number;
  goalPct: number;
  totalQuestions: number;
  accuracyPct: number;
  simulationsCount: number;
  lawReadingsCount: number;
}

export async function exportWeeklyCycleReportPdf(
  db: StudyDatabase,
  options?: { studentName?: string; referenceIso?: string },
): Promise<WeeklyReportSummary> {
  const { jsPDF } = await import('jspdf');

  const todayIso = options?.referenceIso || localDateIso();
  const weekStartIso = getCurrentMondayIso(todayIso);
  const weekDaysIso = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStartIso, i));
  const weekEndIso = weekDaysIso[6];
  const weekSet = new Set(weekDaysIso);

  // 1. Weekly goal resolution (matches WeeklyGoalProgressD3Dashboard)
  const prefs = db.preferences || ({} as StudyDatabase['preferences']);
  const explicitWeekly = Number(prefs.weekly_hours_goal || 0);
  const subjectWeeklySum = Object.values(prefs.weekly_subject_hours || {}).reduce(
    (acc, val) => acc + (Number(val) > 0 ? Number(val) : 0),
    0,
  );
  const dailyGoal = Number(prefs.daily_hours_goal || 3);
  const weeklyGoalHours =
    explicitWeekly > 0 ? explicitWeekly : subjectWeeklySum > 0 ? subjectWeeklySum : Math.max(1, dailyGoal * 7);
  const dailyTargetHours = weeklyGoalHours / 7;

  // 2. Net study time by day & discipline
  const secondsByDay: Record<string, number> = {};
  weekDaysIso.forEach((iso) => {
    secondsByDay[iso] = 0;
  });
  const secondsBySubject: Record<string, number> = {};
  let totalStudySeconds = 0;
  let studySessionsCount = 0;

  (db.studyTimeRecords || []).forEach((rec) => {
    const iso = normalizeAnyDateToIso(rec.date);
    if (!iso || !weekSet.has(iso)) return;
    studySessionsCount += 1;
    (rec.allocations || []).forEach((alloc) => {
      const sec = Math.max(0, Number(alloc.seconds || 0));
      if (sec <= 0) return;
      totalStudySeconds += sec;
      secondsByDay[iso] = (secondsByDay[iso] || 0) + sec;
      const subj = safePdfText(alloc.subject || 'Sem disciplina');
      secondsBySubject[subj] = (secondsBySubject[subj] || 0) + sec;
    });
  });

  const totalStudyHours = totalStudySeconds / 3600;
  const activeStudyDays = weekDaysIso.filter((iso) => (secondsByDay[iso] || 0) > 0).length;
  const goalPct = weeklyGoalHours > 0 ? Math.round((totalStudyHours / weeklyGoalHours) * 100) : 0;

  const subjectTimeRows = Object.entries(secondsBySubject)
    .map(([subject, seconds]) => ({ subject, seconds }))
    .sort((a, b) => b.seconds - a.seconds);

  // 3. Questions & accuracy in week
  const weekHistory = (db.history || []).filter((h) => {
    const iso = normalizeAnyDateToIso(h.date);
    return Boolean(iso && weekSet.has(iso));
  });
  const totalQuestions = weekHistory.length;
  const correctQuestions = weekHistory.filter((h) => h.correct).length;
  const wrongQuestions = totalQuestions - correctQuestions;
  const accuracyPct = totalQuestions > 0 ? Math.round((correctQuestions / totalQuestions) * 100) : 0;

  const qBySubjectMap: Record<string, { total: number; correct: number; wrong: number }> = {};
  weekHistory.forEach((h) => {
    const subj = safePdfText(h.subject || 'Sem disciplina');
    if (!qBySubjectMap[subj]) qBySubjectMap[subj] = { total: 0, correct: 0, wrong: 0 };
    qBySubjectMap[subj].total += 1;
    if (h.correct) qBySubjectMap[subj].correct += 1;
    else qBySubjectMap[subj].wrong += 1;
  });
  const subjectQuestionRows = Object.entries(qBySubjectMap)
    .map(([subject, stats]) => ({
      subject,
      ...stats,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.accuracy - b.accuracy);

  // 4. Simulations completed in week
  const weekSimulations = (db.completedSimulations || []).filter((sim) => {
    const iso = normalizeAnyDateToIso(sim.data) || normalizeAnyDateToIso(sim.criado_em);
    return Boolean(iso && weekSet.has(iso));
  });

  // 5. Lei Seca readings in week
  const seenReadingKeys = new Set<string>();
  const lawCountsByFolder: Record<string, { readings: number; articles: Set<string> }> = {};
  let lawReadingsCount = 0;

  Object.entries(db.laws || {}).forEach(([folderKey, folder]) => {
    const displayFolder = safePdfText(visibleName(folder.name || folderKey));
    const itemById = new Map((folder.items || []).map((it) => [it.id, it]));

    (folder.items || []).forEach((item) => {
      (item.leituras || []).forEach((entry) => {
        const iso = normalizeAnyDateToIso(entry.data);
        if (!iso || !weekSet.has(iso)) return;
        const dedupKey = `${folderKey}::${item.id}::${iso}::${entry.id || ''}`;
        if (seenReadingKeys.has(dedupKey)) return;
        seenReadingKeys.add(dedupKey);
        lawReadingsCount += 1;
        if (!lawCountsByFolder[displayFolder]) {
          lawCountsByFolder[displayFolder] = { readings: 0, articles: new Set<string>() };
        }
        lawCountsByFolder[displayFolder].readings += 1;
        lawCountsByFolder[displayFolder].articles.add(item.id);
      });
    });

    // Also inspect db.lawReadDates map (supports keys formatted as folder::itemId or itemId)
    Object.entries(db.lawReadDates || {}).forEach(([key, entries]) => {
      if (!Array.isArray(entries) || entries.length === 0) return;
      const matchesFolder = key.startsWith(`${folderKey}::`) || itemById.has(key);
      if (!matchesFolder) return;
      const itemId = key.includes('::') ? key.split('::').slice(1).join('::') : key;
      entries.forEach((entry) => {
        const iso = normalizeAnyDateToIso(entry.data);
        if (!iso || !weekSet.has(iso)) return;
        const dedupKey = `${folderKey}::${itemId}::${iso}::${entry.id || ''}`;
        if (seenReadingKeys.has(dedupKey)) return;
        seenReadingKeys.add(dedupKey);
        lawReadingsCount += 1;
        if (!lawCountsByFolder[displayFolder]) {
          lawCountsByFolder[displayFolder] = { readings: 0, articles: new Set<string>() };
        }
        lawCountsByFolder[displayFolder].readings += 1;
        lawCountsByFolder[displayFolder].articles.add(itemId);
      });
    });
  });

  const lawRows = Object.entries(lawCountsByFolder)
    .map(([lawName, info]) => ({
      lawName,
      readings: info.readings,
      uniqueArticles: info.articles.size,
    }))
    .sort((a, b) => b.readings - a.readings);

  // 6. Goals & Error Notebook in week
  const weekCompletedGoals = (db.completedGoals || []).filter((g) => {
    const iso = normalizeAnyDateToIso(g.data);
    return Boolean(iso && weekSet.has(iso));
  });
  const weekIncompleteGoals = (db.incompleteGoals || []).filter((g) => {
    const iso = normalizeAnyDateToIso(g.data) || normalizeAnyDateToIso(g.arquivado_em);
    return Boolean(iso && weekSet.has(iso));
  });
  const weekNewErrors = (db.annotations || []).filter((e) => {
    const iso = normalizeAnyDateToIso(e.data);
    return Boolean(iso && weekSet.has(iso));
  });
  const weekReviewedErrors = (db.annotations || []).filter((e) => {
    const revIso = normalizeAnyDateToIso(e.revisado_em);
    const corIso = normalizeAnyDateToIso(e.corrigido_em);
    return Boolean((revIso && weekSet.has(revIso)) || (corIso && weekSet.has(corIso)));
  });

  // ─── PDF GENERATION ────────────────────────────────────────────────────────
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentW = pageW - marginX * 2;
  let y = 14;

  const NAVY: [number, number, number] = [7, 29, 65];
  const BLUE: [number, number, number] = [19, 81, 180];
  const GREEN: [number, number, number] = [22, 136, 33];
  const GOLD: [number, number, number] = [255, 205, 7];
  const RED: [number, number, number] = [185, 28, 28];
  const INK: [number, number, number] = [22, 32, 48];
  const MUTED: [number, number, number] = [90, 106, 128];
  const LINE: [number, number, number] = [212, 222, 236];
  const PANEL: [number, number, number] = [245, 248, 252];

  const drawContinuationHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, 12, 'F');
    doc.setFillColor(...GREEN);
    doc.rect(0, 12, pageW / 3, 1.2, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(pageW / 3, 12, pageW / 3, 1.2, 'F');
    doc.setFillColor(...BLUE);
    doc.rect((pageW / 3) * 2, 12, pageW / 3, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('ESTUDA.GOV.BR  |  BOLETIM DE FECHAMENTO SEMANAL', marginX, 7.6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(208, 222, 244);
    doc.text(
      `Ciclo ${formatIsoDateBr(weekStartIso)} a ${formatIsoDateBr(weekEndIso)}`,
      pageW - marginX,
      7.6,
      { align: 'right' },
    );
    y = 20;
  };

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageH - 18) {
      doc.addPage();
      drawContinuationHeader();
    }
  };

  const drawSectionTitle = (num: string, title: string, subtitle?: string) => {
    ensureSpace(14);
    doc.setFillColor(...BLUE);
    doc.rect(marginX, y, 2.2, 5.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(`${num}. ${safePdfText(title)}`, marginX + 5, y + 4.1);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...MUTED);
      doc.text(safePdfText(subtitle), pageW - marginX, y + 4.0, { align: 'right' });
    }
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(marginX, y + 6.8, pageW - marginX, y + 6.8);
    y += 10.5;
  };

  // ── Page 1 Official Banner ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 33, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(0, 33, pageW / 3, 1.8, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(pageW / 3, 33, pageW / 3, 1.8, 'F');
  doc.setFillColor(...BLUE);
  doc.rect((pageW / 3) * 2, 33, pageW / 3, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 205, 7);
  doc.text('ESTUDA.GOV.BR  ·  FECHAMENTO DE CICLO SEMANAL', marginX, 10.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('Boletim Semanal de Estudos', marginX, 19.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(214, 226, 245);
  const periodCaption = `Período do ciclo: ${formatIsoDateBr(weekStartIso)} a ${formatIsoDateBr(weekEndIso)} (Seg a Dom)`;
  doc.text(safePdfText(periodCaption), marginX, 26.5);

  const issuedRight = options?.studentName
    ? `${safePdfText(options.studentName)} · Emitido em ${localDateTimeBrazilian()}`
    : `Emitido em ${localDateTimeBrazilian()}`;
  doc.setFontSize(8);
  doc.text(issuedRight, pageW - marginX, 26.5, { align: 'right' });

  y = 42;

  // ── 4 KPI Summary Strip ──
  const kpiGap = 3.2;
  const kpiW = (contentW - kpiGap * 3) / 4;
  const kpiH = 22;
  const kpis = [
    {
      label: 'HORAS LÍQUIDAS',
      value: `${totalStudyHours.toFixed(1).replace('.', ',')}h`,
      sub: `Meta: ${weeklyGoalHours.toFixed(1).replace('.', ',')}h (${goalPct}%)`,
      accent: goalPct >= 100 ? GREEN : BLUE,
    },
    {
      label: 'QUESTÕES NO CICLO',
      value: String(totalQuestions),
      sub: totalQuestions > 0 ? `${accuracyPct}% acerto (${correctQuestions}C / ${wrongQuestions}E)` : 'Sem questões no ciclo',
      accent: accuracyPct >= 75 ? GREEN : totalQuestions > 0 ? BLUE : MUTED,
    },
    {
      label: 'LEI SECA LIDA',
      value: `${lawReadingsCount}`,
      sub: `${lawRows.length} lei(s) trabalhada(s)`,
      accent: BLUE,
    },
    {
      label: 'METAS & SIMULADOS',
      value: `${weekCompletedGoals.length} / ${weekSimulations.length}`,
      sub: `${weekCompletedGoals.length} meta(s) · ${weekSimulations.length} simulado(s)`,
      accent: NAVY,
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = marginX + idx * (kpiW + kpiGap);
    doc.setFillColor(...PANEL);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, kpiH, 2, 2, 'FD');

    doc.setFillColor(...kpi.accent);
    doc.rect(x, y, kpiW, 1.3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...MUTED);
    doc.text(safePdfText(kpi.label), x + 3, y + 6.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(safePdfText(kpi.value), x + 3, y + 13.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(...MUTED);
    const subLines = doc.splitTextToSize(safePdfText(kpi.sub), kpiW - 5);
    doc.text(subLines[0] || '', x + 3, y + 19);
  });

  y += kpiH + 8;

  // ── Section 1: Daily Hours Vector Chart vs Weekly Goal ──
  drawSectionTitle(
    '1',
    'Ritmo Diário de Horas Líquidas (Seg a Dom)',
    `${activeStudyDays}/7 dias ativos · ${studySessionsCount} sessão(ões) registrada(s)`,
  );

  ensureSpace(48);
  const chartBoxH = 42;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y, contentW, chartBoxH, 2, 2, 'FD');

  const chartLeft = marginX + 10;
  const chartRight = marginX + contentW - 8;
  const chartTop = y + 8;
  const chartBottom = y + chartBoxH - 9;
  const chartInnerW = chartRight - chartLeft;
  const chartInnerH = chartBottom - chartTop;

  const dayHoursList = weekDaysIso.map((iso) => (secondsByDay[iso] || 0) / 3600);
  const maxDayHours = Math.max(dailyTargetHours * 1.25, ...dayHoursList, 1);

  // Baseline
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(chartLeft, chartBottom, chartRight, chartBottom);

  // Daily goal dashed reference line
  const targetRatio = Math.min(1, dailyTargetHours / maxDayHours);
  const targetY = chartBottom - targetRatio * chartInnerH;
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.35);
  for (let dx = chartLeft; dx < chartRight; dx += 3.2) {
    doc.line(dx, targetY, Math.min(dx + 1.8, chartRight), targetY);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(180, 83, 9);
  doc.text(`Meta dia: ${dailyTargetHours.toFixed(1).replace('.', ',')}h`, chartRight, targetY - 1.3, {
    align: 'right',
  });

  const slotW = chartInnerW / 7;
  const barW = Math.min(14, slotW * 0.56);

  weekDaysIso.forEach((iso, idx) => {
    const hrs = dayHoursList[idx];
    const barH = hrs > 0 ? Math.max(1.4, (hrs / maxDayHours) * chartInnerH) : 0;
    const cx = chartLeft + slotW * idx + slotW / 2;
    const bx = cx - barW / 2;
    const by = chartBottom - barH;

    if (barH > 0) {
      const hitDaily = hrs >= dailyTargetHours;
      doc.setFillColor(...(hitDaily ? GREEN : BLUE));
      doc.roundedRect(bx, by, barW, barH, 1, 1, 'F');
    } else {
      doc.setFillColor(232, 238, 246);
      doc.rect(bx, chartBottom - 0.8, barW, 0.8, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...(hrs > 0 ? INK : MUTED));
    doc.text(hrs > 0 ? `${hrs.toFixed(1).replace('.', ',')}h` : '0h', cx, Math.max(chartTop - 1.5, by - 1.5), {
      align: 'center',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(SHORT_WEEKDAYS[idx], cx, chartBottom + 4.2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text(iso.slice(8, 10) + '/' + iso.slice(5, 7), cx, chartBottom + 7.4, { align: 'center' });
  });

  y += chartBoxH + 8;

  // ── Section 2: Horas por Disciplina ──
  drawSectionTitle(
    '2',
    'Distribuição de Tempo por Disciplina',
    `Total acumulado: ${formatClock(totalStudySeconds)}`,
  );

  if (subjectTimeRows.length === 0) {
    ensureSpace(10);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(...MUTED);
    doc.text('Nenhuma sessão de cronômetro registrada nesta semana.', marginX, y + 3);
    y += 10;
  } else {
    // Header row
    ensureSpace(10);
    doc.setFillColor(...PANEL);
    doc.rect(marginX, y, contentW, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...NAVY);
    doc.text('DISCIPLINA', marginX + 2.5, y + 4.4);
    doc.text('TEMPO LÍQUIDO', marginX + contentW - 40, y + 4.4, { align: 'right' });
    doc.text('% DO CICLO', marginX + contentW - 2.5, y + 4.4, { align: 'right' });
    y += 7.5;

    subjectTimeRows.slice(0, 14).forEach((row, idx) => {
      ensureSpace(7);
      if (idx % 2 === 1) {
        doc.setFillColor(250, 252, 255);
        doc.rect(marginX, y - 0.5, contentW, 6.2, 'F');
      }
      const share = totalStudySeconds > 0 ? Math.round((row.seconds / totalStudySeconds) * 100) : 0;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      const subjLabel = doc.splitTextToSize(row.subject, contentW - 55)[0] || row.subject;
      doc.text(subjLabel, marginX + 2.5, y + 3.8);

      doc.setFont('helvetica', 'bold');
      doc.text(formatClock(row.seconds), marginX + contentW - 40, y + 3.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(`${share}%`, marginX + contentW - 2.5, y + 3.8, { align: 'right' });
      y += 6.2;
    });
    y += 4;
  }

  // ── Section 3: Rendimento em Questões por Disciplina ──
  drawSectionTitle(
    '3',
    'Rendimento em Questões no Ciclo',
    totalQuestions > 0
      ? `${totalQuestions} questão(ões) · ${accuracyPct}% de aproveitamento geral`
      : 'Nenhuma questão resolvida no ciclo',
  );

  if (subjectQuestionRows.length === 0) {
    ensureSpace(10);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(...MUTED);
    doc.text('Nenhuma resolução de questões registrada no histórico desta semana.', marginX, y + 3);
    y += 10;
  } else {
    ensureSpace(10);
    doc.setFillColor(...PANEL);
    doc.rect(marginX, y, contentW, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...NAVY);
    doc.text('DISCIPLINA', marginX + 2.5, y + 4.4);
    doc.text('TOTAL', marginX + contentW - 58, y + 4.4, { align: 'right' });
    doc.text('ACERTOS', marginX + contentW - 38, y + 4.4, { align: 'right' });
    doc.text('ERROS', marginX + contentW - 20, y + 4.4, { align: 'right' });
    doc.text('TAXA', marginX + contentW - 2.5, y + 4.4, { align: 'right' });
    y += 7.5;

    subjectQuestionRows.slice(0, 14).forEach((row, idx) => {
      ensureSpace(7);
      if (idx % 2 === 1) {
        doc.setFillColor(250, 252, 255);
        doc.rect(marginX, y - 0.5, contentW, 6.2, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      const subjLabel = doc.splitTextToSize(row.subject, contentW - 72)[0] || row.subject;
      doc.text(subjLabel, marginX + 2.5, y + 3.8);

      doc.text(String(row.total), marginX + contentW - 58, y + 3.8, { align: 'right' });
      doc.setTextColor(...GREEN);
      doc.text(String(row.correct), marginX + contentW - 38, y + 3.8, { align: 'right' });
      doc.setTextColor(...RED);
      doc.text(String(row.wrong), marginX + contentW - 20, y + 3.8, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...(row.accuracy >= 75 ? GREEN : row.accuracy >= 55 ? BLUE : RED));
      doc.text(`${row.accuracy}%`, marginX + contentW - 2.5, y + 3.8, { align: 'right' });
      y += 6.2;
    });
    y += 4;
  }

  // ── Section 4: Simulados, Lei Seca, Metas e Caderno de Erros ──
  drawSectionTitle(
    '4',
    'Simulados, Lei Seca e Fechamento de Metas',
    `${weekCompletedGoals.length} meta(s) concluída(s) · ${weekReviewedErrors.length} erro(s) revisado(s)`,
  );

  // Simulations sub-block
  if (weekSimulations.length > 0) {
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...NAVY);
    doc.text(`Simulados Concluídos (${weekSimulations.length})`, marginX, y + 3.2);
    y += 5.5;

    weekSimulations.slice(0, 8).forEach((sim) => {
      ensureSpace(7);
      const dateIso = normalizeAnyDateToIso(sim.data) || normalizeAnyDateToIso(sim.criado_em) || '';
      const label = safePdfText(
        `${sim.titulo || 'Simulado'}${sim.banca ? ` (${sim.banca})` : ''} · ${dateIso ? formatIsoDateBr(dateIso) : sim.data}`,
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(label, contentW - 42)[0] || label, marginX + 2.5, y + 3.4);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...(sim.aproveitamento >= 70 ? GREEN : BLUE));
      doc.text(
        `${sim.acertos}/${sim.total} (${Math.round(sim.aproveitamento)}%)`,
        marginX + contentW - 2.5,
        y + 3.4,
        { align: 'right' },
      );
      y += 5.6;
    });
    y += 3;
  }

  // Lei Seca sub-block
  ensureSpace(12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...NAVY);
  doc.text(`Leitura de Lei Seca (${lawReadingsCount} registro(s) no ciclo)`, marginX, y + 3.2);
  y += 5.5;

  if (lawRows.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.3);
    doc.setTextColor(...MUTED);
    doc.text('Nenhuma leitura de dispositivo legal registrada nesta semana.', marginX + 2.5, y + 3);
    y += 7;
  } else {
    lawRows.slice(0, 10).forEach((row) => {
      ensureSpace(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(row.lawName, contentW - 52)[0] || row.lawName, marginX + 2.5, y + 3.2);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLUE);
      doc.text(
        `${row.readings} leitura(s) · ${row.uniqueArticles} art.`,
        marginX + contentW - 2.5,
        y + 3.2,
        { align: 'right' },
      );
      y += 5.5;
    });
    y += 3;
  }

  // Goals & Error notebook executive box
  ensureSpace(24);
  doc.setFillColor(...PANEL);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y, contentW, 20, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...NAVY);
  doc.text('Síntese Operacional da Semana', marginX + 4, y + 5.8);

  const summaryLines = [
    `• Cronograma: ${weekCompletedGoals.length} meta(s) concluída(s) e ${weekIncompleteGoals.length} não concluída(s) no ciclo.`,
    `• Caderno de Erros: ${weekNewErrors.length} novo(s) registro(s) e ${weekReviewedErrors.length} revisão(ões)/correção(ões) na semana.`,
    subjectQuestionRows.length > 0
      ? (() => {
          const weakest = [...subjectQuestionRows].sort((a, b) => a.accuracy - b.accuracy)[0];
          return `• Ponto de atenção: ${weakest.subject} (${weakest.accuracy}% em ${weakest.total} questão(ões)) merece reforço no próximo ciclo.`;
        })()
      : `• Próximo ciclo: mantenha constância diária de ${dailyTargetHours.toFixed(1).replace('.', ',')}h para bater a meta semanal de ${weeklyGoalHours.toFixed(1).replace('.', ',')}h.`,
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  summaryLines.forEach((line, idx) => {
    const wrapped = doc.splitTextToSize(safePdfText(line), contentW - 8);
    doc.text(wrapped[0] || '', marginX + 4, y + 10.6 + idx * 3.8);
  });

  // ── Page Footers ──
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageH - 12, pageW - marginX, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('estuda.gov.br · Boletim Semanal de Estudos (uso pessoal)', marginX, pageH - 7.5);
    doc.text(`Página ${p} de ${totalPages}`, pageW - marginX, pageH - 7.5, { align: 'right' });
  }

  const filename = `boletim_semanal_estudos_${weekStartIso}_a_${weekEndIso}.pdf`;
  doc.save(filename);

  return {
    filename,
    weekStartIso,
    weekEndIso,
    totalStudySeconds,
    weeklyGoalHours,
    goalPct,
    totalQuestions,
    accuracyPct,
    simulationsCount: weekSimulations.length,
    lawReadingsCount,
  };
}
