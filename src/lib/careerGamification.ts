import { StudyDatabase } from '../types/study';
import { localDateIso } from './parsers';

export type MedalCategory = 'metas' | 'horas' | 'consistencia' | 'excelencia';
export type MedalTier = 'bronze' | 'prata' | 'ouro' | 'diamante';

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
  unlocked: boolean;
  current: number;
  target: number;
  progressPct: number;
  progressLabel: string;
}

export interface CareerXpBreakdown {
  hoursXp: number;
  goalsXp: number;
  questionsXp: number;
  simulationsXp: number;
  lawsXp: number;
  errorsCorrectedXp: number;
  streakXp: number;
}

export interface CareerSummary {
  totalXp: number;
  xpBreakdown: CareerXpBreakdown;
  currentLevel: CareerLevelDefinition;
  nextLevel: CareerLevelDefinition | null;
  levelProgressPct: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpRemaining: number;
  allLevels: CareerLevelDefinition[];
  medals: MeritMedal[];
  unlockedMedalsCount: number;
  metrics: {
    completedGoals: number;
    totalStudySeconds: number;
    totalStudyHours: number;
    currentStreak: number;
    bestStreak: number;
    activeDaysTotal: number;
    totalAnswered: number;
    accuracyPct: number;
    completedSimulations: number;
    correctedErrors: number;
    lawReadings: number;
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

  // Current streak counting backwards from today (or yesterday if today not logged yet)
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

function buildMedal(params: {
  id: string;
  title: string;
  description: string;
  category: MedalCategory;
  tier: MedalTier;
  current: number;
  target: number;
  unit: string;
  extraCondition?: boolean;
  customLabel?: string;
}): MeritMedal {
  const { current, target, extraCondition = true } = params;
  const unlocked = current >= target && extraCondition;
  const progressPct = Math.max(
    0,
    Math.min(100, Math.round((Math.min(current, target) / Math.max(1, target)) * 100)),
  );
  const formattedCur =
    Number.isInteger(current) ? current.toLocaleString('pt-BR') : current.toFixed(1).replace('.', ',');
  const formattedTarget = target.toLocaleString('pt-BR');
  return {
    id: params.id,
    title: params.title,
    description: params.description,
    category: params.category,
    tier: params.tier,
    unlocked,
    current,
    target,
    progressPct: unlocked ? 100 : progressPct,
    progressLabel: params.customLabel || `${formattedCur} / ${formattedTarget} ${params.unit}`,
  };
}

export function computeCareerSummary(db: StudyDatabase): CareerSummary {
  const completedGoals = (db.completedGoals || []).length;

  const totalStudySeconds = (db.studyTimeRecords || []).reduce(
    (sum, rec) => sum + (rec.allocations || []).reduce((s, a) => s + (a.seconds || 0), 0),
    0,
  );
  const totalStudyHours = totalStudySeconds / 3600;

  const totalAnswered = (db.history || []).length;
  const totalCorrect = (db.history || []).filter((h) => h.correct).length;
  const accuracyPct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const completedSimulations = (db.completedSimulations || []).length;

  const correctedAnnotations = (db.annotations || []).filter((a) => Boolean(a.corrigido)).length;
  const correctedProofItems = (db.proofFiles || []).reduce(
    (sum, pf) => sum + (pf.correcoes || []).filter((c) => Boolean(c.corrigido)).length,
    0,
  );
  const correctedErrors = correctedAnnotations + correctedProofItems;

  // Active days across all study actions for consistency streaks
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
  (db.completedGoals || []).forEach((g) => registerIso(g.data));
  (db.completedSimulations || []).forEach((s) => registerIso(s.criado_em || s.data));

  let lawReadings = 0;
  Object.values(db.lawReadDates || {}).forEach((entries) => {
    (entries || []).forEach((entry) => {
      lawReadings += 1;
      registerIso(entry.data);
    });
  });
  Object.values(db.laws || {}).forEach((folder) => {
    (folder.items || []).forEach((item) => {
      (item.leituras || []).forEach((r) => {
        lawReadings += 1;
        registerIso(r.data);
      });
    });
  });
  Object.values(db.readLawItems || {}).forEach((ids) => {
    lawReadings += (ids || []).length;
  });

  const { currentStreak, bestStreak } = computeActivityStreaks(activeDates);

  // XP Breakdown
  const xpBreakdown: CareerXpBreakdown = {
    hoursXp: Math.round(totalStudySeconds / 60), // 1 XP per studied minute (60 XP/h)
    goalsXp: completedGoals * 45,
    questionsXp: totalAnswered * 2 + totalCorrect * 2,
    simulationsXp: completedSimulations * 120,
    lawsXp: Math.min(3500, lawReadings * 10),
    errorsCorrectedXp: correctedErrors * 20,
    streakXp: bestStreak * 30,
  };

  const totalXp =
    xpBreakdown.hoursXp +
    xpBreakdown.goalsXp +
    xpBreakdown.questionsXp +
    xpBreakdown.simulationsXp +
    xpBreakdown.lawsXp +
    xpBreakdown.errorsCorrectedXp +
    xpBreakdown.streakXp;

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

  // Merit Medals (Metas, Horas, Consistência, Excelência)
  const medals: MeritMedal[] = [
    // Metas Batidas
    buildMedal({
      id: 'meta-1',
      title: 'Primeira Meta Batida',
      description: 'Conclua sua primeira meta no cronograma de estudos.',
      category: 'metas',
      tier: 'bronze',
      current: completedGoals,
      target: 1,
      unit: 'meta',
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
    }),

    // Horas Acumuladas
    buildMedal({
      id: 'horas-5',
      title: 'Primeiro Turno',
      description: 'Acumule 5 horas líquidas no Ponto Eletrônico.',
      category: 'horas',
      tier: 'bronze',
      current: Math.floor(totalStudyHours * 10) / 10,
      target: 5,
      unit: 'h',
    }),
    buildMedal({
      id: 'horas-25',
      title: 'Carga Horária Sólida',
      description: 'Acumule 25 horas líquidas de estudo registradas.',
      category: 'horas',
      tier: 'prata',
      current: Math.floor(totalStudyHours * 10) / 10,
      target: 25,
      unit: 'h',
    }),
    buildMedal({
      id: 'horas-100',
      title: 'Centurião do Ponto',
      description: 'Rompa a marca histórica de 100 horas líquidas estudadas.',
      category: 'horas',
      tier: 'ouro',
      current: Math.floor(totalStudyHours * 10) / 10,
      target: 100,
      unit: 'h',
    }),
    buildMedal({
      id: 'horas-250',
      title: 'Maratonista de Elite',
      description: 'Complete 250 horas líquidas acumuladas de estudo.',
      category: 'horas',
      tier: 'diamante',
      current: Math.floor(totalStudyHours * 10) / 10,
      target: 250,
      unit: 'h',
    }),

    // Consistência (Streaks)
    buildMedal({
      id: 'streak-3',
      title: 'Ritmo Ativado',
      description: 'Estude por 3 dias consecutivos (questões, horas ou lei seca).',
      category: 'consistencia',
      tier: 'bronze',
      current: bestStreak,
      target: 3,
      unit: 'dias',
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
    }),

    // Excelência (Precisão, Simulados e Caderno de Erros)
    buildMedal({
      id: 'questoes-100',
      title: 'Bateria Centenária',
      description: 'Resolva pelo menos 100 questões no histórico.',
      category: 'excelencia',
      tier: 'bronze',
      current: totalAnswered,
      target: 100,
      unit: 'questões',
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
      extraCondition: totalAnswered >= 50 && accuracyPct >= 80,
      customLabel:
        totalAnswered < 50
          ? `${accuracyPct}% · ${totalAnswered}/50 questões`
          : `${accuracyPct}% / 80%`,
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
    }),
  ];

  const unlockedMedalsCount = medals.filter((m) => m.unlocked).length;

  return {
    totalXp,
    xpBreakdown,
    currentLevel,
    nextLevel,
    levelProgressPct,
    xpIntoLevel,
    xpForNextLevel,
    xpRemaining,
    allLevels: CAREER_LEVELS,
    medals,
    unlockedMedalsCount,
    metrics: {
      completedGoals,
      totalStudySeconds,
      totalStudyHours,
      currentStreak,
      bestStreak,
      activeDaysTotal: activeDates.size,
      totalAnswered,
      accuracyPct,
      completedSimulations,
      correctedErrors,
      lawReadings,
    },
  };
}
