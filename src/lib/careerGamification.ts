import { ModuleName, StudyDatabase } from '../types/study';
import { localDateIso, normalizeSearch } from './parsers';

export type MedalCategory =
  | 'metas'
  | 'horas'
  | 'consistencia'
  | 'excelencia'
  | 'dominio';
export type MedalTier = 'bronze' | 'prata' | 'ouro' | 'diamante' | 'supremo';

export const MEDAL_TIER_BONUS_XP: Record<MedalTier, number> = {
  bronze: 50,
  prata: 120,
  ouro: 250,
  diamante: 500,
  supremo: 1000,
};

export const MEDAL_TIER_LABELS: Record<MedalTier, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  diamante: 'Diamante',
  supremo: 'Supremo',
};

export const WEEKLY_MISSION_XP_REWARD = 75;
export const MAX_PINNED_MEDALS = 3;

export interface CareerLevelDefinition {
  level: number;
  title: string;
  subtitle: string;
  minXp: number;
}

export interface MeritMedal {
  id: string;
  title: string;
  description: string;
  category: MedalCategory;
  tier: MedalTier;
  bonusXp: number;
  unlocked: boolean;
  unlockedAt?: string; // YYYY-MM-DD
  current: number;
  target: number;
  progressPct: number;
  progressLabel: string;
  remainingLabel: string;
  targetModule: ModuleName;
}

export interface WeeklyMission {
  id: string;
  weekKey: string;
  storageKey: string; // `${weekKey}:${id}`
  title: string;
  description: string;
  current: number;
  target: number;
  unit: string;
  progressPct: number;
  progressLabel: string;
  remainingLabel: string;
  completed: boolean;
  xpReward: number;
  targetModule: ModuleName;
}

export interface CareerXpBreakdown {
  hoursXp: number;
  goalsXp: number;
  questionsXp: number;
  simulationsXp: number;
  lawsXp: number;
  errorsCorrectedXp: number;
  streakXp: number;
  editalXp: number;
  caseLawXp: number;
  essaysXp: number;
  criticalPointsXp: number;
  medalsBonusXp: number;
  weeklyMissionsXp: number;
}

export interface CareerXpSourceItem {
  id: keyof CareerXpBreakdown;
  label: string;
  xp: number;
  sharePct: number;
  formula: string;
  detail: string;
  targetModule: ModuleName;
}

export interface CareerSummary {
  totalXp: number;
  xpBreakdown: CareerXpBreakdown;
  xpSources: CareerXpSourceItem[];
  currentLevel: CareerLevelDefinition;
  nextLevel: CareerLevelDefinition | null;
  levelProgressPct: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpRemaining: number;
  allLevels: CareerLevelDefinition[];
  medals: MeritMedal[];
  unlockedMedalsCount: number;
  almostThereMedals: MeritMedal[];
  pinnedMedals: MeritMedal[];
  showcaseMedals: MeritMedal[];
  hasCustomPinnedMedals: boolean;
  currentWeekKey: string;
  weekRangeLabel: string;
  daysLeftInWeek: number;
  weeklyMissions: WeeklyMission[];
  weeklyCompletedCount: number;
  totalCompletedWeeklyMissionsAllTime: number;
  metrics: {
    completedGoals: number;
    totalStudySeconds: number;
    totalStudyHours: number;
    maxDailyHours: number;
    currentStreak: number;
    bestStreak: number;
    activeDaysTotal: number;
    totalAnswered: number;
    accuracyPct: number;
    completedSimulations: number;
    bestSim20Pct: number;
    bestSim30Pct: number;
    bestFastSimPct: number;
    bestFastSimAvgSec: number | null;
    bestEliteSpeedSimPct: number;
    bestEliteSpeedSimAvgSec: number | null;
    bestCespeNetPct: number;
    bestCespeNetPoints: number;
    correctedErrors: number;
    pendingErrorsCount: number;
    spacedReviewCycles: number;
    lawReadings: number;
    masteredSubjectsCount: number;
    eliteSubjectsCount: number;
    editalStudiedCount: number;
    caseLawCount: number;
    essaysCount: number;
    criticalPointsCount: number;
  };
}

export const CAREER_LEVELS: CareerLevelDefinition[] = [
  {
    level: 1,
    title: 'Candidato Inscrito',
    subtitle: 'Edital aberto e primeiros passos na rotina',
    minXp: 0,
  },
  {
    level: 2,
    title: 'Estagiário de Gabinete',
    subtitle: 'Ritmo inicial de metas e questões estabelecido',
    minXp: 250,
  },
  {
    level: 3,
    title: 'Técnico em Formação',
    subtitle: 'Base teórica e constância semanal ganhando corpo',
    minXp: 700,
  },
  {
    level: 4,
    title: 'Técnico Judiciário',
    subtitle: 'Execução regular de metas, lei seca e baterias',
    minXp: 1500,
  },
  {
    level: 5,
    title: 'Analista de Controle',
    subtitle: 'Domínio consistente de horas líquidas e revisões',
    minXp: 2800,
  },
  {
    level: 6,
    title: 'Auditor Fiscal Júnior',
    subtitle: 'Alto volume de treino com disciplina diária',
    minXp: 4800,
  },
  {
    level: 7,
    title: 'Auditor Titular',
    subtitle: 'Desempenho competitivo em simulados e caderno de erros',
    minXp: 7500,
  },
  {
    level: 8,
    title: 'Procurador de Carreira',
    subtitle: 'Excelência sustentada nas disciplinas prioritárias',
    minXp: 11500,
  },
  {
    level: 9,
    title: 'Desembargador da Aprovação',
    subtitle: 'Consistência de alto rendimento nível prova final',
    minXp: 17000,
  },
  {
    level: 10,
    title: 'Ministro da Posse',
    subtitle: 'Patamar máximo de constância, horas e metas batidas',
    minXp: 25000,
  },
];

export function formatCareerDateBr(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function parseBrOrIsoDateToIso(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }
  return null;
}

function getCurrentIsoWeekWindow(now = new Date()): {
  weekKey: string;
  weekNumber: number;
  startIso: string;
  endIso: string;
  rangeLabel: string;
  daysLeft: number;
} {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = local.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(local);
  monday.setDate(local.getDate() + offsetToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // ISO week number (Thursday-based)
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekKey = `${thursday.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;

  const fmtShort = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  const daysLeft = Math.max(0, Math.round((sunday.getTime() - local.getTime()) / 86400000));

  return {
    weekKey,
    weekNumber,
    startIso: localDateIso(monday),
    endIso: localDateIso(sunday),
    rangeLabel: `${fmtShort(monday)} a ${fmtShort(sunday)}`,
    daysLeft,
  };
}

function formatHoursGap(missingHours: number): string {
  const totalMin = Math.max(1, Math.ceil(missingHours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `Faltam ${m} min`;
  if (m === 0) return h === 1 ? 'Falta 1h' : `Faltam ${h}h`;
  return `Falta ${h}h ${String(m).padStart(2, '0')}m`;
}

function formatSecondsShort(sec: number): string {
  const rounded = Math.max(0, Math.round(sec));
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  if (m === 0) return `${s}s`;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

function computeActivityStreaks(activeIsoSet: Set<string>): {
  currentStreak: number;
  bestStreak: number;
} {
  if (activeIsoSet.size === 0) {
    return { currentStreak: 0, bestStreak: 0 };
  }

  const sorted = [...activeIsoSet].sort();
  let best = 0;
  let running = 0;
  let prevMs: number | null = null;

  for (const iso of sorted) {
    const ms = new Date(`${iso}T00:00:00`).getTime();
    if (!Number.isFinite(ms)) continue;
    if (prevMs !== null && Math.round((ms - prevMs) / 86400000) === 1) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > best) best = running;
    prevMs = ms;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = localDateIso(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayIso = localDateIso(yesterday);

  let cursor: Date | null = null;
  if (activeIsoSet.has(todayIso)) {
    cursor = new Date(today);
  } else if (activeIsoSet.has(yesterdayIso)) {
    cursor = new Date(yesterday);
  }

  let current = 0;
  while (cursor) {
    const iso = localDateIso(cursor);
    if (!activeIsoSet.has(iso)) break;
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { currentStreak: current, bestStreak: best };
}

function buildDefaultRemainingLabel(current: number, target: number, unit: string): string {
  const diff = Math.max(0, target - current);
  if (diff <= 0) return 'Conquistada';
  if (unit === 'h' || unit === 'h/dia') {
    return formatHoursGap(diff);
  }
  const roundedDiff = Math.ceil(diff);
  const singularUnits: Record<string, string> = {
    metas: 'meta',
    meta: 'meta',
    dias: 'dia',
    questões: 'questão',
    simulados: 'simulado',
    correções: 'correção',
    leituras: 'leitura',
    disciplinas: 'disciplina',
    tópicos: 'tópico',
    julgados: 'julgado',
    discursivas: 'discursiva',
    ciclos: 'ciclo',
    pontos: 'ponto',
    'pts líq.': 'pt líq.',
  };
  if (roundedDiff === 1 && singularUnits[unit]) {
    return `Falta 1 ${singularUnits[unit]}`;
  }
  return `Faltam ${roundedDiff.toLocaleString('pt-BR')} ${unit}`;
}

function buildMedal(params: {
  id: string;
  title: string;
  description: string;
  category: MedalCategory;
  tier: MedalTier;
  current: number;
  target: number;
  unit: string;
  targetModule: ModuleName;
  unlockedAtMap?: Record<string, string>;
  extraCondition?: boolean;
  customLabel?: string;
  customRemainingLabel?: string;
}): MeritMedal {
  const { current, target, extraCondition = true } = params;
  const unlocked = current >= target && extraCondition;
  const rawPct = Math.round((Math.min(Math.max(0, current), target) / Math.max(1, target)) * 100);
  const progressPct = unlocked ? 100 : Math.max(0, Math.min(99, rawPct));
  const formattedCur = Number.isInteger(current)
    ? current.toLocaleString('pt-BR')
    : current.toFixed(1).replace('.', ',');
  const formattedTarget = target.toLocaleString('pt-BR');
  return {
    id: params.id,
    title: params.title,
    description: params.description,
    category: params.category,
    tier: params.tier,
    bonusXp: MEDAL_TIER_BONUS_XP[params.tier],
    unlocked,
    unlockedAt: unlocked ? params.unlockedAtMap?.[params.id] : undefined,
    current,
    target,
    progressPct,
    progressLabel: params.customLabel || `${formattedCur} / ${formattedTarget} ${params.unit}`,
    remainingLabel: unlocked
      ? 'Conquistada'
      : params.customRemainingLabel || buildDefaultRemainingLabel(current, target, params.unit),
    targetModule: params.targetModule,
  };
}

export function computeCareerSummary(db: StudyDatabase): CareerSummary {
  const careerMeta = db.preferences?.career_meta;
  const unlockedAtMap = careerMeta?.unlocked_at || {};
  const persistedWeeklyMap = careerMeta?.completed_weekly_missions || {};

  const weekWindow = getCurrentIsoWeekWindow();
  const isInCurrentWeek = (iso: string | null): boolean =>
    Boolean(iso && iso >= weekWindow.startIso && iso <= weekWindow.endIso);

  const completedGoals = (db.completedGoals || []).length;

  let totalStudySeconds = 0;
  let weeklyStudySeconds = 0;
  const secondsByDay = new Map<string, number>();
  (db.studyTimeRecords || []).forEach((rec) => {
    const secs = (rec.allocations || []).reduce((s, a) => s + (a.seconds || 0), 0);
    totalStudySeconds += secs;
    const iso = parseBrOrIsoDateToIso(rec.date);
    if (iso && secs > 0) {
      secondsByDay.set(iso, (secondsByDay.get(iso) || 0) + secs);
      if (isInCurrentWeek(iso)) {
        weeklyStudySeconds += secs;
      }
    }
  });
  const totalStudyHours = totalStudySeconds / 3600;
  const maxDailySeconds = secondsByDay.size ? Math.max(...secondsByDay.values()) : 0;
  const maxDailyHours = Math.floor((maxDailySeconds / 3600) * 10) / 10;

  const totalAnswered = (db.history || []).length;
  const totalCorrect = (db.history || []).filter((h) => h.correct).length;
  const accuracyPct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  let weeklyQuestions = 0;
  (db.history || []).forEach((h) => {
    const iso = parseBrOrIsoDateToIso(h.date);
    if (isInCurrentWeek(iso)) weeklyQuestions += 1;
  });

  // Per-subject mastery stats
  const subjectStats = new Map<string, { total: number; correct: number }>();
  (db.history || []).forEach((h) => {
    const key = normalizeSearch(h.subject || '');
    if (!key) return;
    const prev = subjectStats.get(key) || { total: 0, correct: 0 };
    prev.total += 1;
    if (h.correct) prev.correct += 1;
    subjectStats.set(key, prev);
  });
  let masteredSubjectsCount = 0;
  let eliteSubjectsCount = 0;
  subjectStats.forEach((st) => {
    const pct = st.total > 0 ? (st.correct / st.total) * 100 : 0;
    if (st.total >= 30 && pct >= 75) masteredSubjectsCount += 1;
    if (st.total >= 50 && pct >= 80) eliteSubjectsCount += 1;
  });

  // Simulations analytics (accuracy, pacing/time per question, CESPE net score)
  const completedSims = db.completedSimulations || [];
  const completedSimulations = completedSims.length;
  let bestSim20Pct = 0;
  let bestSim30Pct = 0;
  let bestFastSimPct = 0;
  let bestFastSimAvgSec: number | null = null;
  let fastSimUnlocked = false;
  let bestEliteSpeedSimPct = 0;
  let bestEliteSpeedSimAvgSec: number | null = null;
  let eliteSpeedSimUnlocked = false;
  let bestCespeNetPct = 0;
  let bestCespeNetPoints = 0;
  let cespe20Unlocked = false;

  completedSims.forEach((sim) => {
    const qty = sim.total || sim.questoes?.length || 0;
    const acc = Math.round(sim.aproveitamento || 0);
    if (qty >= 20) bestSim20Pct = Math.max(bestSim20Pct, acc);
    if (qty >= 30) bestSim30Pct = Math.max(bestSim30Pct, acc);

    // Pacing / average seconds per question
    const perQuestionTimed = (sim.questoes || []).filter(
      (q) => typeof q.tempo_segundos === 'number' && q.tempo_segundos > 0,
    );
    const totalTimedSecs =
      perQuestionTimed.length > 0
        ? perQuestionTimed.reduce((sum, q) => sum + (q.tempo_segundos || 0), 0)
        : sim.tempo_segundos || 0;
    const denom = perQuestionTimed.length > 0 ? perQuestionTimed.length : qty;
    const avgSec = denom > 0 && totalTimedSecs > 0 ? totalTimedSecs / denom : null;

    if (qty >= 15 && avgSec !== null) {
      if (avgSec <= 120 && acc >= 75) {
        fastSimUnlocked = true;
      }
      if (avgSec <= 120 && acc >= bestFastSimPct) {
        bestFastSimPct = acc;
        bestFastSimAvgSec = avgSec;
      } else if (bestFastSimAvgSec === null && acc >= 75) {
        bestFastSimPct = acc;
        bestFastSimAvgSec = avgSec;
      }
    }

    if (qty >= 25 && avgSec !== null) {
      if (avgSec <= 90 && acc >= 85) {
        eliteSpeedSimUnlocked = true;
      }
      if (avgSec <= 90 && acc >= bestEliteSpeedSimPct) {
        bestEliteSpeedSimPct = acc;
        bestEliteSpeedSimAvgSec = avgSec;
      } else if (bestEliteSpeedSimAvgSec === null && acc >= 85) {
        bestEliteSpeedSimPct = acc;
        bestEliteSpeedSimAvgSec = avgSec;
      }
    }

    // CESPE / Cebraspe net scoring
    const ceCount = (sim.questoes || []).filter((q) => q.tipo === 'CE').length;
    const isCespeStyle =
      /cespe|cebraspe/i.test(sim.banca || '') || (qty > 0 && ceCount / qty >= 0.7);
    if (isCespeStyle && qty > 0) {
      const netPts =
        typeof sim.pontos_liquidos === 'number'
          ? sim.pontos_liquidos
          : (sim.acertos || 0) - (sim.erros || 0);
      const netPct = Math.max(0, Math.round((netPts / qty) * 100));
      if (netPts > bestCespeNetPoints) {
        bestCespeNetPoints = netPts;
      }
      if (qty >= 20) {
        if (netPct > bestCespeNetPct) {
          bestCespeNetPct = netPct;
        }
        if (netPct >= 70) {
          cespe20Unlocked = true;
        }
      }
    }
  });

  // Error notebook, spaced repetition cycles & pending count
  const annotations = db.annotations || [];
  const allProofCorrections = (db.proofFiles || []).flatMap((pf) => pf.correcoes || []);

  const correctedAnnotations = annotations.filter((a) => Boolean(a.corrigido)).length;
  const correctedProofItems = allProofCorrections.filter((c) => Boolean(c.corrigido)).length;
  const correctedErrors = correctedAnnotations + correctedProofItems;

  const pendingAnnotations = annotations.filter((a) => !a.corrigido).length;
  const pendingProofItems = allProofCorrections.filter((c) => !c.corrigido).length;
  const pendingErrorsCount = pendingAnnotations + pendingProofItems;

  const spacedReviewCycles =
    annotations.reduce((sum, a) => sum + Math.max(0, Number(a.nivel_revisao || 0)), 0) +
    allProofCorrections.reduce((sum, c) => sum + Math.max(0, Number(c.nivel_revisao || 0)), 0);

  let weeklyErrorsActions = 0;
  annotations.forEach((a) => {
    const cIso = parseBrOrIsoDateToIso(a.corrigido_em);
    const rIso = parseBrOrIsoDateToIso(a.revisado_em);
    if (isInCurrentWeek(cIso) || isInCurrentWeek(rIso)) weeklyErrorsActions += 1;
  });
  allProofCorrections.forEach((c) => {
    const cIso = parseBrOrIsoDateToIso(c.corrigido_em);
    const rIso = parseBrOrIsoDateToIso(c.revisado_em);
    if (isInCurrentWeek(cIso) || isInCurrentWeek(rIso)) weeklyErrorsActions += 1;
  });

  const editalStudiedCount = (db.contests || []).reduce(
    (sum, contest) => sum + (contest.edital_pontos || []).filter((p) => Boolean(p.estudado)).length,
    0,
  );
  const caseLawCount = (db.caseLaw || []).length;
  const essaysCount = (db.essays || []).length;
  const criticalPointsCount = (db.criticalPoints || []).length;

  // Active days across all study actions for consistency streaks & weekly active days
  const activeDates = new Set<string>();
  const registerIso = (raw?: string) => {
    const iso = parseBrOrIsoDateToIso(raw);
    if (iso) activeDates.add(iso);
  };

  (db.history || []).forEach((h) => registerIso(h.date));
  (db.studyTimeRecords || []).forEach((r) => {
    const secs = (r.allocations || []).reduce((s, a) => s + (a.seconds || 0), 0);
    if (secs > 0) registerIso(r.date);
  });

  let weeklyGoalsCompleted = 0;
  (db.completedGoals || []).forEach((g) => {
    registerIso(g.data);
    if (isInCurrentWeek(parseBrOrIsoDateToIso(g.data))) {
      weeklyGoalsCompleted += 1;
    }
  });

  completedSims.forEach((s) => registerIso(s.criado_em || s.data));
  annotations.forEach((a) => {
    registerIso(a.corrigido_em);
    registerIso(a.revisado_em);
  });
  allProofCorrections.forEach((c) => {
    registerIso(c.corrigido_em);
    registerIso(c.revisado_em);
  });

  let lawReadings = 0;
  let weeklyLawReadings = 0;
  Object.values(db.lawReadDates || {}).forEach((entries) => {
    (entries || []).forEach((entry) => {
      lawReadings += 1;
      registerIso(entry.data);
      if (isInCurrentWeek(parseBrOrIsoDateToIso(entry.data))) weeklyLawReadings += 1;
    });
  });
  Object.values(db.laws || {}).forEach((folder) => {
    (folder.items || []).forEach((item) => {
      (item.leituras || []).forEach((r) => {
        lawReadings += 1;
        registerIso(r.data);
        if (isInCurrentWeek(parseBrOrIsoDateToIso(r.data))) weeklyLawReadings += 1;
      });
    });
  });
  Object.values(db.readLawItems || {}).forEach((ids) => {
    lawReadings += (ids || []).length;
  });

  const { currentStreak, bestStreak } = computeActivityStreaks(activeDates);

  let weeklyActiveDays = 0;
  activeDates.forEach((iso) => {
    if (isInCurrentWeek(iso)) weeklyActiveDays += 1;
  });

  // === WEEKLY MISSIONS (Reset every Monday, deterministic rotation by ISO week) ===
  const weeklyHours = Math.floor((weeklyStudySeconds / 3600) * 10) / 10;
  const rotationSlot = weekWindow.weekNumber % 3;
  const questionsTarget = rotationSlot === 0 ? 60 : rotationSlot === 1 ? 80 : 100;
  const hoursTarget = rotationSlot === 0 ? 5 : rotationSlot === 1 ? 7 : 8;
  const daysTarget = 4;

  const makeWeeklyMission = (params: {
    id: string;
    title: string;
    description: string;
    current: number;
    target: number;
    unit: string;
    targetModule: ModuleName;
  }): WeeklyMission => {
    const completed = params.current >= params.target;
    const progressPct = completed
      ? 100
      : Math.max(0, Math.min(99, Math.round((params.current / Math.max(1, params.target)) * 100)));
    const formattedCur = Number.isInteger(params.current)
      ? params.current.toLocaleString('pt-BR')
      : params.current.toFixed(1).replace('.', ',');
    return {
      id: params.id,
      weekKey: weekWindow.weekKey,
      storageKey: `${weekWindow.weekKey}:${params.id}`,
      title: params.title,
      description: params.description,
      current: params.current,
      target: params.target,
      unit: params.unit,
      progressPct,
      progressLabel: `${formattedCur} / ${params.target.toLocaleString('pt-BR')} ${params.unit}`,
      remainingLabel: completed
        ? 'Missão concluída'
        : buildDefaultRemainingLabel(params.current, params.target, params.unit),
      completed,
      xpReward: WEEKLY_MISSION_XP_REWARD,
      targetModule: params.targetModule,
    };
  };

  const rotatingFourthMission: WeeklyMission =
    rotationSlot === 0
      ? makeWeeklyMission({
          id: 'ouvidoria-semanal',
          title: 'Saneamento da Ouvidoria',
          description: 'Corrija ou revise 5 questões/anotações no Caderno de Erros nesta semana.',
          current: weeklyErrorsActions,
          target: 5,
          unit: 'correções',
          targetModule: 'Caderno de Erros',
        })
      : rotationSlot === 1
        ? makeWeeklyMission({
            id: 'lei-seca-semanal',
            title: 'Leitura Semanal de Lei Seca',
            description: 'Registre 5 leituras datadas no módulo de Lei Seca nesta semana.',
            current: weeklyLawReadings,
            target: 5,
            unit: 'leituras',
            targetModule: 'Lei Seca',
          })
        : makeWeeklyMission({
            id: 'metas-semanal',
            title: 'Pauta Semanal Cumprida',
            description: 'Conclua 5 metas do seu Cronograma de Estudos nesta semana.',
            current: weeklyGoalsCompleted,
            target: 5,
            unit: 'metas',
            targetModule: 'Cronograma',
          });

  const weeklyMissions: WeeklyMission[] = [
    makeWeeklyMission({
      id: 'questoes-semanal',
      title: `Bateria Semanal (${questionsTarget}q)`,
      description: `Resolva ${questionsTarget} questões entre segunda e domingo no Treino ou Simulado.`,
      current: weeklyQuestions,
      target: questionsTarget,
      unit: 'questões',
      targetModule: 'Treino Diário',
    }),
    makeWeeklyMission({
      id: 'horas-semanal',
      title: `Carga Horária da Semana (${hoursTarget}h)`,
      description: `Acumule ${hoursTarget} horas líquidas registradas no Ponto Eletrônico nesta semana.`,
      current: weeklyHours,
      target: hoursTarget,
      unit: 'h',
      targetModule: 'Cronograma',
    }),
    makeWeeklyMission({
      id: 'constancia-semanal',
      title: 'Constância Semanal',
      description: 'Mantenha atividade de estudo registrada em pelo menos 4 dias desta semana.',
      current: weeklyActiveDays,
      target: daysTarget,
      unit: 'dias',
      targetModule: 'Início',
    }),
    rotatingFourthMission,
  ];

  const weeklyCompletedCount = weeklyMissions.filter((m) => m.completed).length;

  // Union persisted weekly completions with live completed missions in current week
  const allCompletedWeeklyKeys = new Set<string>(Object.keys(persistedWeeklyMap));
  weeklyMissions.forEach((m) => {
    if (m.completed) allCompletedWeeklyKeys.add(m.storageKey);
  });
  const totalCompletedWeeklyMissionsAllTime = allCompletedWeeklyKeys.size;

  const flooredHours = Math.floor(totalStudyHours * 10) / 10;

  // === MERIT MEDALS (43 medals across 5 categories) ===
  const medals: MeritMedal[] = [
    // === METAS BATIDAS ===
    buildMedal({
      id: 'meta-1',
      title: 'Primeira Meta Batida',
      description: 'Conclua sua primeira meta no cronograma de estudos.',
      category: 'metas',
      tier: 'bronze',
      current: completedGoals,
      target: 1,
      unit: 'meta',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'meta-10',
      title: 'Cumpridor de Pauta',
      description: 'Atinja 10 metas concluídas com disciplina.',
      category: 'metas',
      tier: 'prata',
      current: completedGoals,
      target: 10,
      unit: 'metas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'meta-30',
      title: 'Executor de Edital',
      description: 'Complete 30 metas registradas no seu planejamento.',
      category: 'metas',
      tier: 'ouro',
      current: completedGoals,
      target: 30,
      unit: 'metas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'meta-75',
      title: 'Mestre das Metas',
      description: 'Alcance 75 metas concluídas ao longo da preparação.',
      category: 'metas',
      tier: 'diamante',
      current: completedGoals,
      target: 75,
      unit: 'metas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'meta-150',
      title: 'Arquiteto do Cronograma',
      description: 'Conclua 150 metas com execução rigorosa do planejamento.',
      category: 'metas',
      tier: 'supremo',
      current: completedGoals,
      target: 150,
      unit: 'metas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'meta-300',
      title: 'Comenda da Disciplina',
      description: 'Marca extraordinária de 300 metas batidas na preparação.',
      category: 'metas',
      tier: 'supremo',
      current: completedGoals,
      target: 300,
      unit: 'metas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),

    // === HORAS ACUMULADAS & MARATONAS ===
    buildMedal({
      id: 'horas-5',
      title: 'Primeiro Turno',
      description: 'Acumule 5 horas líquidas no Ponto Eletrônico.',
      category: 'horas',
      tier: 'bronze',
      current: flooredHours,
      target: 5,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'horas-25',
      title: 'Carga Horária Sólida',
      description: 'Acumule 25 horas líquidas de estudo registradas.',
      category: 'horas',
      tier: 'prata',
      current: flooredHours,
      target: 25,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'horas-100',
      title: 'Centurião do Ponto',
      description: 'Rompa a marca histórica de 100 horas líquidas estudadas.',
      category: 'horas',
      tier: 'ouro',
      current: flooredHours,
      target: 100,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'horas-250',
      title: 'Maratonista de Elite',
      description: 'Complete 250 horas líquidas acumuladas de estudo.',
      category: 'horas',
      tier: 'diamante',
      current: flooredHours,
      target: 250,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'horas-500',
      title: 'Meio Milhar Líquido',
      description: 'Sustente a marca pesada de 500 horas líquidas registradas.',
      category: 'horas',
      tier: 'supremo',
      current: flooredHours,
      target: 500,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'horas-1000',
      title: 'Milênio da Posse',
      description: 'Patamar lendário de 1.000 horas líquidas acumuladas.',
      category: 'horas',
      tier: 'supremo',
      current: flooredHours,
      target: 1000,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'maratona-6h',
      title: 'Imersão de Turno Duplo',
      description: 'Registre 6 horas líquidas ou mais em um único dia de estudo.',
      category: 'horas',
      tier: 'ouro',
      current: maxDailyHours,
      target: 6,
      unit: 'h/dia',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'maratona-8h',
      title: 'Jornada Integral de Prova',
      description: 'Alcance 8 horas líquidas ou mais em um único dia de dedicação.',
      category: 'horas',
      tier: 'diamante',
      current: maxDailyHours,
      target: 8,
      unit: 'h/dia',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),

    // === CONSISTÊNCIA (STREAKS, DIAS ATIVOS & CURVA DE REVISÃO) ===
    buildMedal({
      id: 'streak-3',
      title: 'Ritmo Ativado',
      description: 'Estude por 3 dias consecutivos (questões, horas ou lei seca).',
      category: 'consistencia',
      tier: 'bronze',
      current: bestStreak,
      target: 3,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'streak-7',
      title: 'Semana Invicta',
      description: 'Mantenha 7 dias seguidos sem quebrar a constância.',
      category: 'consistencia',
      tier: 'prata',
      current: bestStreak,
      target: 7,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'streak-15',
      title: 'Disciplina de Ferro',
      description: 'Complete uma sequência de 15 dias consecutivos de estudo.',
      category: 'consistencia',
      tier: 'ouro',
      current: bestStreak,
      target: 15,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'streak-30',
      title: 'Constância Inabalável',
      description: 'Mantenha 30 dias seguidos de preparação ativa.',
      category: 'consistencia',
      tier: 'diamante',
      current: bestStreak,
      target: 30,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'streak-60',
      title: 'Bimestre Invicto',
      description: 'Sustente 60 dias consecutivos de estudo sem nenhuma falha.',
      category: 'consistencia',
      tier: 'supremo',
      current: bestStreak,
      target: 60,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'streak-100',
      title: 'Centenário Inquebrável',
      description: 'Desafio extremo: 100 dias seguidos de atividade registrada.',
      category: 'consistencia',
      tier: 'supremo',
      current: bestStreak,
      target: 100,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'dias-ativos-90',
      title: 'Trimestre em Campo',
      description: 'Acumule 90 dias distintos com estudo ativo no calendário.',
      category: 'consistencia',
      tier: 'ouro',
      current: activeDates.size,
      target: 90,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'dias-ativos-180',
      title: 'Semestre de Campanha',
      description: 'Acumule 180 dias distintos de preparação ao longo da jornada.',
      category: 'consistencia',
      tier: 'diamante',
      current: activeDates.size,
      target: 180,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'revisao-curva-10',
      title: 'Guardião da Memória (1–7–15–30d)',
      description: 'Conclua 10 ciclos de revisão espaçada na Ouvidoria de Erros.',
      category: 'consistencia',
      tier: 'prata',
      current: spacedReviewCycles,
      target: 10,
      unit: 'ciclos',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'revisao-curva-40',
      title: 'Mestre da Curva de Retenção',
      description: 'Complete 40 ciclos de revisão espaçada (1–7–15–30 dias) consolidados.',
      category: 'consistencia',
      tier: 'diamante',
      current: spacedReviewCycles,
      target: 40,
      unit: 'ciclos',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
    }),

    // === EXCELÊNCIA (VOLUME, PRECISÃO, SIMULADOS, RITMO, CESPE & OUVIDORIA) ===
    buildMedal({
      id: 'questoes-100',
      title: 'Bateria Centenária',
      description: 'Resolva pelo menos 100 questões no histórico.',
      category: 'excelencia',
      tier: 'bronze',
      current: totalAnswered,
      target: 100,
      unit: 'questões',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'questoes-500',
      title: 'Veterano de Bateria',
      description: 'Atinja a marca de 500 questões resolvidas na plataforma.',
      category: 'excelencia',
      tier: 'prata',
      current: totalAnswered,
      target: 500,
      unit: 'questões',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'questoes-1500',
      title: 'Arsenal de Questões',
      description: 'Complete 1.500 questões resolvidas e consolide repertório.',
      category: 'excelencia',
      tier: 'ouro',
      current: totalAnswered,
      target: 1500,
      unit: 'questões',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'questoes-3000',
      title: 'Acervo Monumental',
      description: 'Resolva 3.000 questões no banco de treino e simulados.',
      category: 'excelencia',
      tier: 'supremo',
      current: totalAnswered,
      target: 3000,
      unit: 'questões',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'simulados-3',
      title: 'Veterano de Simulados',
      description: 'Finalize 3 simulados fechados completos.',
      category: 'excelencia',
      tier: 'prata',
      current: completedSimulations,
      target: 3,
      unit: 'simulados',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'simulados-10',
      title: 'Prova de Fogo',
      description: 'Conclua 10 simulados fechados com controle de tempo.',
      category: 'excelencia',
      tier: 'ouro',
      current: completedSimulations,
      target: 10,
      unit: 'simulados',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'simulados-25',
      title: 'Titã dos Simulados',
      description: 'Complete 25 simulados fechados completos na plataforma.',
      category: 'excelencia',
      tier: 'supremo',
      current: completedSimulations,
      target: 25,
      unit: 'simulados',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'simulado-nota-85',
      title: 'Desempenho de Posse (85%+)',
      description: 'Alcance 85% ou mais de aproveitamento em um simulado (mín. 20 questões).',
      category: 'excelencia',
      tier: 'diamante',
      current: bestSim20Pct,
      target: 85,
      unit: '%',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      customLabel:
        completedSimulations === 0
          ? '0% · nenhum simulado (20+ q)'
          : `Melhor: ${bestSim20Pct}% / 85%`,
      customRemainingLabel:
        bestSim20Pct >= 85
          ? 'Conquistada'
          : `Faltam +${85 - bestSim20Pct}% em simulado (20+ q)`,
    }),
    buildMedal({
      id: 'simulado-nota-92',
      title: 'Nota de Corte Suprema (92%+)',
      description: 'Conquiste 92% ou mais em um simulado fechado com ao menos 30 questões.',
      category: 'excelencia',
      tier: 'supremo',
      current: bestSim30Pct,
      target: 92,
      unit: '%',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      customLabel:
        completedSimulations === 0
          ? '0% · nenhum simulado (30+ q)'
          : `Melhor: ${bestSim30Pct}% / 92%`,
      customRemainingLabel:
        bestSim30Pct >= 92
          ? 'Conquistada'
          : `Faltam +${92 - bestSim30Pct}% em simulado (30+ q)`,
    }),
    buildMedal({
      id: 'ritmo-prova',
      title: 'Ritmo de Prova (≤ 2 min/q)',
      description:
        'Conclua um Simulado Fechado (mín. 15 questões) com média ≤ 2 min/questão e 75%+ de acerto.',
      category: 'excelencia',
      tier: 'ouro',
      current: fastSimUnlocked ? 75 : Math.min(74, bestFastSimPct),
      target: 75,
      unit: '%',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      extraCondition: fastSimUnlocked,
      customLabel:
        bestFastSimAvgSec === null
          ? 'Sem simulado cronometrado (15+ q)'
          : `${bestFastSimPct}% · média ${formatSecondsShort(bestFastSimAvgSec)}/q`,
      customRemainingLabel:
        bestFastSimAvgSec === null
          ? 'Faça 1 simulado (15+ q) em ≤ 2m/q'
          : bestFastSimAvgSec > 120
            ? `Reduza a média para ≤ 2m/q (atual ${formatSecondsShort(bestFastSimAvgSec)})`
            : `Faltam +${Math.max(1, 75 - bestFastSimPct)}% mantendo ≤ 2m/q`,
    }),
    buildMedal({
      id: 'cronometro-cirurgico',
      title: 'Cronômetro Cirúrgico (≤ 1m30s/q)',
      description:
        'Finalize um Simulado Fechado (mín. 25 questões) com média ≤ 1m30s/questão e 85%+ de acerto.',
      category: 'excelencia',
      tier: 'diamante',
      current: eliteSpeedSimUnlocked ? 85 : Math.min(84, bestEliteSpeedSimPct),
      target: 85,
      unit: '%',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      extraCondition: eliteSpeedSimUnlocked,
      customLabel:
        bestEliteSpeedSimAvgSec === null
          ? 'Sem simulado cronometrado (25+ q)'
          : `${bestEliteSpeedSimPct}% · média ${formatSecondsShort(bestEliteSpeedSimAvgSec)}/q`,
      customRemainingLabel:
        bestEliteSpeedSimAvgSec === null
          ? 'Faça 1 simulado (25+ q) em ≤ 1m30s/q'
          : bestEliteSpeedSimAvgSec > 90
            ? `Reduza a média para ≤ 1m30s/q (atual ${formatSecondsShort(bestEliteSpeedSimAvgSec)})`
            : `Faltam +${Math.max(1, 85 - bestEliteSpeedSimPct)}% mantendo ≤ 1m30s/q`,
    }),
    buildMedal({
      id: 'estrategista-cespe',
      title: 'Estrategista CESPE / Cebraspe',
      description:
        'Alcance 70% ou mais de aproveitamento líquido em simulado estilo CESPE/Certo-Errado (mín. 20q).',
      category: 'excelencia',
      tier: 'ouro',
      current: bestCespeNetPct,
      target: 70,
      unit: '%',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      extraCondition: cespe20Unlocked,
      customLabel:
        bestCespeNetPct === 0
          ? '0% · nenhum simulado CESPE/CE (20+ q)'
          : `Melhor líquido: ${bestCespeNetPct}% / 70%`,
      customRemainingLabel:
        bestCespeNetPct === 0
          ? 'Realize 1 simulado CESPE/CE (20+ q)'
          : `Faltam +${Math.max(1, 70 - bestCespeNetPct)}% líquido em CESPE`,
    }),
    buildMedal({
      id: 'blindagem-cespe',
      title: 'Blindagem de Banca Líquida (+40 pts)',
      description:
        'Atinja saldo líquido de +40 pontos ou mais em um único simulado estilo CESPE/Certo-Errado.',
      category: 'excelencia',
      tier: 'diamante',
      current: Math.max(0, bestCespeNetPoints),
      target: 40,
      unit: 'pts líq.',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      customLabel:
        bestCespeNetPoints <= 0
          ? '0 / +40 pts líquidos'
          : `Melhor saldo: +${bestCespeNetPoints} / +40 pts`,
    }),
    buildMedal({
      id: 'precisao-80',
      title: 'Sniper de Banca (80%+)',
      description: 'Mantenha 80% ou mais de acerto geral com ao menos 50 questões.',
      category: 'excelencia',
      tier: 'ouro',
      current: totalAnswered >= 50 ? accuracyPct : Math.min(accuracyPct, 79),
      target: 80,
      unit: '%',
      targetModule: 'Treino Diário',
      unlockedAtMap,
      extraCondition: totalAnswered >= 50 && accuracyPct >= 80,
      customLabel:
        totalAnswered < 50
          ? `${accuracyPct}% · ${totalAnswered}/50 questões`
          : `${accuracyPct}% / 80%`,
      customRemainingLabel:
        totalAnswered < 50
          ? `Faltam ${50 - totalAnswered} questões (meta 80%)`
          : `Faltam +${Math.max(1, 80 - accuracyPct)}% de acerto geral`,
    }),
    buildMedal({
      id: 'precisao-85',
      title: 'Precisão Cirúrgica (85%+)',
      description: 'Sustente 85% ou mais de acerto global após 200 questões resolvidas.',
      category: 'excelencia',
      tier: 'diamante',
      current: totalAnswered >= 200 ? accuracyPct : Math.min(accuracyPct, 84),
      target: 85,
      unit: '%',
      targetModule: 'Treino Diário',
      unlockedAtMap,
      extraCondition: totalAnswered >= 200 && accuracyPct >= 85,
      customLabel:
        totalAnswered < 200
          ? `${accuracyPct}% · ${totalAnswered}/200 questões`
          : `${accuracyPct}% / 85%`,
      customRemainingLabel:
        totalAnswered < 200
          ? `Faltam ${200 - totalAnswered} questões (meta 85%)`
          : `Faltam +${Math.max(1, 85 - accuracyPct)}% de acerto geral`,
    }),
    buildMedal({
      id: 'precisao-90',
      title: 'Excelência de Corte (90%+)',
      description: 'Desafio máximo: mantenha 90%+ de acerto global com 500+ questões.',
      category: 'excelencia',
      tier: 'supremo',
      current: totalAnswered >= 500 ? accuracyPct : Math.min(accuracyPct, 89),
      target: 90,
      unit: '%',
      targetModule: 'Treino Diário',
      unlockedAtMap,
      extraCondition: totalAnswered >= 500 && accuracyPct >= 90,
      customLabel:
        totalAnswered < 500
          ? `${accuracyPct}% · ${totalAnswered}/500 questões`
          : `${accuracyPct}% / 90%`,
      customRemainingLabel:
        totalAnswered < 500
          ? `Faltam ${500 - totalAnswered} questões (meta 90%)`
          : `Faltam +${Math.max(1, 90 - accuracyPct)}% de acerto geral`,
    }),
    buildMedal({
      id: 'erros-10',
      title: 'Ouvidoria Superada',
      description: 'Marque 10 erros como corrigidos e dominados no Caderno.',
      category: 'excelencia',
      tier: 'ouro',
      current: correctedErrors,
      target: 10,
      unit: 'correções',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'ouvidoria-zerada',
      title: 'Ouvidoria Zerada',
      description:
        'Zere todas as pendências do Caderno de Erros após acumular pelo menos 15 erros corrigidos.',
      category: 'excelencia',
      tier: 'ouro',
      current: Math.min(15, correctedErrors),
      target: 15,
      unit: 'correções',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
      extraCondition: correctedErrors >= 15 && pendingErrorsCount === 0,
      customLabel:
        correctedErrors < 15
          ? `${correctedErrors}/15 corrigidos · ${pendingErrorsCount} pend.`
          : pendingErrorsCount === 0
            ? `${correctedErrors} corrigidos · 0 pendentes`
            : `${correctedErrors} corrigidos · ${pendingErrorsCount} pendente(s)`,
      customRemainingLabel:
        correctedErrors < 15
          ? `Corrija mais ${15 - correctedErrors} erro(s) e zere pendências`
          : pendingErrorsCount > 0
            ? `Falta zerar ${pendingErrorsCount} pendência(s) na Ouvidoria`
            : 'Conquistada',
    }),
    buildMedal({
      id: 'erros-50',
      title: 'Caderno Blindado',
      description: 'Neutralize 50 pontos falhos marcando-os como corrigidos no Caderno.',
      category: 'excelencia',
      tier: 'diamante',
      current: correctedErrors,
      target: 50,
      unit: 'correções',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
    }),

    // === DOMÍNIO & LEI SECA (OBJETIVOS MULTIDISCIPLINARES) ===
    buildMedal({
      id: 'lei-100',
      title: 'Leitor da Letra Fria',
      description: 'Registre 100 dispositivos lidos ou revisões no módulo de Lei Seca.',
      category: 'dominio',
      tier: 'bronze',
      current: lawReadings,
      target: 100,
      unit: 'leituras',
      targetModule: 'Lei Seca',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'lei-500',
      title: 'Codificador de Norma',
      description: 'Acumule 500 dispositivos lidos ou revisões na legislação.',
      category: 'dominio',
      tier: 'ouro',
      current: lawReadings,
      target: 500,
      unit: 'leituras',
      targetModule: 'Lei Seca',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'lei-1500',
      title: 'Guardião do Ordenamento',
      description: 'Alcance 1.500 leituras e dispositivos marcados na Lei Seca.',
      category: 'dominio',
      tier: 'supremo',
      current: lawReadings,
      target: 1500,
      unit: 'leituras',
      targetModule: 'Lei Seca',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'polimata-4',
      title: 'Polímata do Edital',
      description: 'Alcance 75%+ de acerto (mín. 30 questões) em 4 disciplinas diferentes.',
      category: 'dominio',
      tier: 'ouro',
      current: masteredSubjectsCount,
      target: 4,
      unit: 'disciplinas',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'polimata-8',
      title: 'Domínio Multidisciplinar',
      description: 'Sustente 80%+ de acerto (mín. 50 questões) em 8 disciplinas distintas.',
      category: 'dominio',
      tier: 'supremo',
      current: eliteSubjectsCount,
      target: 8,
      unit: 'disciplinas',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'edital-50',
      title: 'Edital Verticalizado',
      description: 'Marque 50 tópicos de edital como estudados na aba Editais.',
      category: 'dominio',
      tier: 'prata',
      current: editalStudiedCount,
      target: 50,
      unit: 'tópicos',
      targetModule: 'Editais',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'sumulas-20',
      title: 'Jurisconsulto',
      description: 'Catalogue 20 súmulas ou julgados relevantes em Jurisprudência.',
      category: 'dominio',
      tier: 'prata',
      current: caseLawCount,
      target: 20,
      unit: 'julgados',
      targetModule: 'Súmulas e Jurisprudência',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'discursiva-5',
      title: 'Pena Oficial',
      description: 'Registre 5 peças ou redações no módulo de Prova Discursiva.',
      category: 'dominio',
      tier: 'ouro',
      current: essaysCount,
      target: 5,
      unit: 'discursivas',
      targetModule: 'Discursiva',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'criticos-10',
      title: 'Radar de Novidades',
      description: 'Registre 10 Pontos Críticos ou alertas de novidades legislativas.',
      category: 'dominio',
      tier: 'bronze',
      current: criticalPointsCount,
      target: 10,
      unit: 'pontos',
      targetModule: 'Pontos Críticos',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'criticos-35',
      title: 'Sentinela de Banca',
      description: 'Acumule 35 Pontos Críticos catalogados para revisão estratégica de véspera.',
      category: 'dominio',
      tier: 'ouro',
      current: criticalPointsCount,
      target: 35,
      unit: 'pontos',
      targetModule: 'Pontos Críticos',
      unlockedAtMap,
    }),
  ];

  const unlockedMedals = medals.filter((m) => m.unlocked);
  const unlockedMedalsCount = unlockedMedals.length;
  const medalsBonusXp = unlockedMedals.reduce((sum, m) => sum + m.bonusXp, 0);
  const weeklyMissionsXp = totalCompletedWeeklyMissionsAllTime * WEEKLY_MISSION_XP_REWARD;

  // === COMPLETE XP BREAKDOWN ===
  const xpBreakdown: CareerXpBreakdown = {
    hoursXp: Math.round(totalStudySeconds / 60),
    goalsXp: completedGoals * 45,
    questionsXp: totalAnswered * 2 + totalCorrect * 2,
    simulationsXp: completedSimulations * 120,
    lawsXp: Math.min(3500, lawReadings * 10),
    errorsCorrectedXp: correctedErrors * 20,
    streakXp: bestStreak * 30,
    editalXp: editalStudiedCount * 12,
    caseLawXp: caseLawCount * 15,
    essaysXp: essaysCount * 80,
    criticalPointsXp: criticalPointsCount * 15,
    medalsBonusXp,
    weeklyMissionsXp,
  };

  const totalXp =
    xpBreakdown.hoursXp +
    xpBreakdown.goalsXp +
    xpBreakdown.questionsXp +
    xpBreakdown.simulationsXp +
    xpBreakdown.lawsXp +
    xpBreakdown.errorsCorrectedXp +
    xpBreakdown.streakXp +
    xpBreakdown.editalXp +
    xpBreakdown.caseLawXp +
    xpBreakdown.essaysXp +
    xpBreakdown.criticalPointsXp +
    xpBreakdown.medalsBonusXp +
    xpBreakdown.weeklyMissionsXp;

  const xpDenom = Math.max(1, totalXp);
  const xpSourcesUnsorted: CareerXpSourceItem[] = [
    {
      id: 'hoursXp',
      label: 'Horas Líquidas (Ponto)',
      xp: xpBreakdown.hoursXp,
      sharePct: Math.round((xpBreakdown.hoursXp / xpDenom) * 100),
      formula: '60 XP / hora',
      detail: `${flooredHours.toLocaleString('pt-BR')}h acumuladas`,
      targetModule: 'Cronograma',
    },
    {
      id: 'questionsXp',
      label: 'Questões & Acertos',
      xp: xpBreakdown.questionsXp,
      sharePct: Math.round((xpBreakdown.questionsXp / xpDenom) * 100),
      formula: '2 XP/q + 2 XP/acerto',
      detail: `${totalAnswered.toLocaleString('pt-BR')} resp. (${totalCorrect.toLocaleString('pt-BR')} acertos)`,
      targetModule: 'Treino Diário',
    },
    {
      id: 'medalsBonusXp',
      label: 'Bônus de Medalhas',
      xp: xpBreakdown.medalsBonusXp,
      sharePct: Math.round((xpBreakdown.medalsBonusXp / xpDenom) * 100),
      formula: '50 a 1.000 XP/grau',
      detail: `${unlockedMedalsCount} condecoração(ões)`,
      targetModule: 'Monitor de Desempenho',
    },
    {
      id: 'goalsXp',
      label: 'Metas Batidas',
      xp: xpBreakdown.goalsXp,
      sharePct: Math.round((xpBreakdown.goalsXp / xpDenom) * 100),
      formula: '45 XP / meta',
      detail: `${completedGoals.toLocaleString('pt-BR')} meta(s) concluída(s)`,
      targetModule: 'Cronograma',
    },
    {
      id: 'lawsXp',
      label: 'Lei Seca & Dispositivos',
      xp: xpBreakdown.lawsXp,
      sharePct: Math.round((xpBreakdown.lawsXp / xpDenom) * 100),
      formula: '10 XP / leitura (teto 3.500)',
      detail: `${lawReadings.toLocaleString('pt-BR')} leitura(s)`,
      targetModule: 'Lei Seca',
    },
    {
      id: 'simulationsXp',
      label: 'Simulados Fechados',
      xp: xpBreakdown.simulationsXp,
      sharePct: Math.round((xpBreakdown.simulationsXp / xpDenom) * 100),
      formula: '120 XP / simulado',
      detail: `${completedSimulations.toLocaleString('pt-BR')} simulado(s)`,
      targetModule: 'Simulado Fechado',
    },
    {
      id: 'errorsCorrectedXp',
      label: 'Ouvidoria (Erros Corrigidos)',
      xp: xpBreakdown.errorsCorrectedXp,
      sharePct: Math.round((xpBreakdown.errorsCorrectedXp / xpDenom) * 100),
      formula: '20 XP / correção',
      detail: `${correctedErrors.toLocaleString('pt-BR')} erro(s) sanado(s)`,
      targetModule: 'Caderno de Erros',
    },
    {
      id: 'streakXp',
      label: 'Constância (Maior Sequência)',
      xp: xpBreakdown.streakXp,
      sharePct: Math.round((xpBreakdown.streakXp / xpDenom) * 100),
      formula: '30 XP / dia recorde',
      detail: `Recorde de ${bestStreak} dia(s) seguidos`,
      targetModule: 'Início',
    },
    {
      id: 'editalXp',
      label: 'Tópicos do Edital',
      xp: xpBreakdown.editalXp,
      sharePct: Math.round((xpBreakdown.editalXp / xpDenom) * 100),
      formula: '12 XP / tópico estudado',
      detail: `${editalStudiedCount.toLocaleString('pt-BR')} tópico(s)`,
      targetModule: 'Editais',
    },
    {
      id: 'weeklyMissionsXp',
      label: 'Missões da Semana',
      xp: xpBreakdown.weeklyMissionsXp,
      sharePct: Math.round((xpBreakdown.weeklyMissionsXp / xpDenom) * 100),
      formula: `${WEEKLY_MISSION_XP_REWARD} XP / missão`,
      detail: `${totalCompletedWeeklyMissionsAllTime} missão(ões) concluída(s)`,
      targetModule: 'Monitor de Desempenho',
    },
    {
      id: 'caseLawXp',
      label: 'Súmulas & Jurisprudência',
      xp: xpBreakdown.caseLawXp,
      sharePct: Math.round((xpBreakdown.caseLawXp / xpDenom) * 100),
      formula: '15 XP / julgado',
      detail: `${caseLawCount.toLocaleString('pt-BR')} julgado(s)`,
      targetModule: 'Súmulas e Jurisprudência',
    },
    {
      id: 'essaysXp',
      label: 'Provas Discursivas',
      xp: xpBreakdown.essaysXp,
      sharePct: Math.round((xpBreakdown.essaysXp / xpDenom) * 100),
      formula: '80 XP / peça ou redação',
      detail: `${essaysCount.toLocaleString('pt-BR')} discursiva(s)`,
      targetModule: 'Discursiva',
    },
    {
      id: 'criticalPointsXp',
      label: 'Pontos Críticos',
      xp: xpBreakdown.criticalPointsXp,
      sharePct: Math.round((xpBreakdown.criticalPointsXp / xpDenom) * 100),
      formula: '15 XP / ponto crítico',
      detail: `${criticalPointsCount.toLocaleString('pt-BR')} ponto(s)`,
      targetModule: 'Pontos Críticos',
    },
  ];
  const xpSources: CareerXpSourceItem[] = [...xpSourcesUnsorted].sort((a, b) => b.xp - a.xp);

  // Determine current and next career level
  let currentLevel = CAREER_LEVELS[0];
  let nextLevel: CareerLevelDefinition | null = CAREER_LEVELS[1] || null;
  for (let i = 0; i < CAREER_LEVELS.length; i++) {
    if (totalXp >= CAREER_LEVELS[i].minXp) {
      currentLevel = CAREER_LEVELS[i];
      nextLevel = CAREER_LEVELS[i + 1] || null;
    } else {
      break;
    }
  }

  const xpIntoLevel = totalXp - currentLevel.minXp;
  const xpForNextLevel = nextLevel ? nextLevel.minXp - currentLevel.minXp : 0;
  const xpRemaining = nextLevel ? Math.max(0, nextLevel.minXp - totalXp) : 0;
  const levelProgressPct = nextLevel
    ? Math.max(0, Math.min(100, Math.round((xpIntoLevel / Math.max(1, xpForNextLevel)) * 100)))
    : 100;

  // "Quase Lá" — Top 3 locked medals closest to unlocking
  const tierWeight: Record<MedalTier, number> = {
    bronze: 1,
    prata: 2,
    ouro: 3,
    diamante: 4,
    supremo: 5,
  };
  const almostThereMedals = medals
    .filter((m) => !m.unlocked)
    .sort((a, b) => {
      if (b.progressPct !== a.progressPct) return b.progressPct - a.progressPct;
      if (tierWeight[a.tier] !== tierWeight[b.tier]) return tierWeight[a.tier] - tierWeight[b.tier];
      return a.target - b.target;
    })
    .slice(0, 3);

  // Vitrine de Honra (pinned medals up to 3, fallback to top 3 unlocked by tier)
  const medalById = new Map<string, MeritMedal>(medals.map((m) => [m.id, m]));
  const rawPinnedIds = Array.isArray(careerMeta?.pinned_medals) ? careerMeta.pinned_medals : [];
  const pinnedMedals = rawPinnedIds
    .map((id) => medalById.get(id))
    .filter((m): m is MeritMedal => Boolean(m && m.unlocked))
    .slice(0, MAX_PINNED_MEDALS);

  const hasCustomPinnedMedals = pinnedMedals.length > 0;
  const showcaseMedals = hasCustomPinnedMedals
    ? pinnedMedals
    : [...unlockedMedals]
        .sort((a, b) => tierWeight[b.tier] - tierWeight[a.tier] || b.bonusXp - a.bonusXp)
        .slice(0, MAX_PINNED_MEDALS);

  return {
    totalXp,
    xpBreakdown,
    xpSources,
    currentLevel,
    nextLevel,
    levelProgressPct,
    xpIntoLevel,
    xpForNextLevel,
    xpRemaining,
    allLevels: CAREER_LEVELS,
    medals,
    unlockedMedalsCount,
    almostThereMedals,
    pinnedMedals,
    showcaseMedals,
    hasCustomPinnedMedals,
    currentWeekKey: weekWindow.weekKey,
    weekRangeLabel: weekWindow.rangeLabel,
    daysLeftInWeek: weekWindow.daysLeft,
    weeklyMissions,
    weeklyCompletedCount,
    totalCompletedWeeklyMissionsAllTime,
    metrics: {
      completedGoals,
      totalStudySeconds,
      totalStudyHours,
      maxDailyHours,
      currentStreak,
      bestStreak,
      activeDaysTotal: activeDates.size,
      totalAnswered,
      accuracyPct,
      completedSimulations,
      bestSim20Pct,
      bestSim30Pct,
      bestFastSimPct,
      bestFastSimAvgSec,
      bestEliteSpeedSimPct,
      bestEliteSpeedSimAvgSec,
      bestCespeNetPct,
      bestCespeNetPoints,
      correctedErrors,
      pendingErrorsCount,
      spacedReviewCycles,
      lawReadings,
      masteredSubjectsCount,
      eliteSubjectsCount,
      editalStudiedCount,
      caseLawCount,
      essaysCount,
      criticalPointsCount,
    },
  };
}
