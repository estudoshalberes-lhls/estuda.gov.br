import { StudyDatabase } from '../types/study';
import { localDateIso, normalizeSearch } from './parsers';

export type MedalCategory =
  | 'metas'
  | 'horas'
  | 'consistencia'
  | 'excelencia'
  | 'dominio';
export type MedalTier = 'bronze' | 'prata' | 'ouro' | 'diamante' | 'supremo';

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
    maxDailyHours: number;
    currentStreak: number;
    bestStreak: number;
    activeDaysTotal: number;
    totalAnswered: number;
    accuracyPct: number;
    completedSimulations: number;
    bestSim20Pct: number;
    bestSim30Pct: number;
    correctedErrors: number;
    lawReadings: number;
    masteredSubjectsCount: number;
    eliteSubjectsCount: number;
    editalStudiedCount: number;
    caseLawCount: number;
    essaysCount: number;
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

  let totalStudySeconds = 0;
  const secondsByDay = new Map<string, number>();
  (db.studyTimeRecords || []).forEach((rec) => {
    const secs = (rec.allocations || []).reduce((s, a) => s + (a.seconds || 0), 0);
    totalStudySeconds += secs;
    const iso = parseBrOrIsoDateToIso(rec.date);
    if (iso && secs > 0) {
      secondsByDay.set(iso, (secondsByDay.get(iso) || 0) + secs);
    }
  });
  const totalStudyHours = totalStudySeconds / 3600;
  const maxDailySeconds = secondsByDay.size ? Math.max(...secondsByDay.values()) : 0;
  const maxDailyHours = Math.floor((maxDailySeconds / 3600) * 10) / 10;

  const totalAnswered = (db.history || []).length;
  const totalCorrect = (db.history || []).filter((h) => h.correct).length;
  const accuracyPct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

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

  const completedSims = db.completedSimulations || [];
  const completedSimulations = completedSims.length;
  const bestSim20Pct = completedSims.reduce((max, sim) => {
    const qty = sim.total || sim.questoes?.length || 0;
    return qty >= 20 ? Math.max(max, Math.round(sim.aproveitamento || 0)) : max;
  }, 0);
  const bestSim30Pct = completedSims.reduce((max, sim) => {
    const qty = sim.total || sim.questoes?.length || 0;
    return qty >= 30 ? Math.max(max, Math.round(sim.aproveitamento || 0)) : max;
  }, 0);

  const correctedAnnotations = (db.annotations || []).filter((a) => Boolean(a.corrigido)).length;
  const correctedProofItems = (db.proofFiles || []).reduce(
    (sum, pf) => sum + (pf.correcoes || []).filter((c) => Boolean(c.corrigido)).length,
    0,
  );
  const correctedErrors = correctedAnnotations + correctedProofItems;

  const editalStudiedCount = (db.contests || []).reduce(
    (sum, contest) => sum + (contest.edital_pontos || []).filter((p) => Boolean(p.estudado)).length,
    0,
  );
  const caseLawCount = (db.caseLaw || []).length;
  const essaysCount = (db.essays || []).length;

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
  completedSims.forEach((s) => registerIso(s.criado_em || s.data));

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
    hoursXp: Math.round(totalStudySeconds / 60),
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

  const flooredHours = Math.floor(totalStudyHours * 10) / 10;

  // Merit Medals (Metas, Horas, Consistência, Excelência, Domínio & Lei)
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
    buildMedal({
      id: 'meta-150',
      title: 'Arquiteto do Cronograma',
      description: 'Conclua 150 metas com execução rigorosa do planejamento.',
      category: 'metas',
      tier: 'supremo',
      current: completedGoals,
      target: 150,
      unit: 'metas',
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
    }),

    // === CONSISTÊNCIA (STREAKS & DIAS ATIVOS) ===
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
    buildMedal({
      id: 'streak-60',
      title: 'Bimestre Invicto',
      description: 'Sustente 60 dias consecutivos de estudo sem nenhuma falha.',
      category: 'consistencia',
      tier: 'supremo',
      current: bestStreak,
      target: 60,
      unit: 'dias',
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
    }),

    // === EXCELÊNCIA (VOLUME, PRECISÃO, SIMULADOS E ERROS) ===
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
      id: 'questoes-500',
      title: 'Veterano de Bateria',
      description: 'Atinja a marca de 500 questões resolvidas na plataforma.',
      category: 'excelencia',
      tier: 'prata',
      current: totalAnswered,
      target: 500,
      unit: 'questões',
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
      id: 'simulados-10',
      title: 'Prova de Fogo',
      description: 'Conclua 10 simulados fechados com controle de tempo.',
      category: 'excelencia',
      tier: 'ouro',
      current: completedSimulations,
      target: 10,
      unit: 'simulados',
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
      customLabel:
        completedSimulations === 0
          ? '0% · nenhum simulado (20+ q)'
          : `Melhor: ${bestSim20Pct}% / 85%`,
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
      customLabel:
        completedSimulations === 0
          ? '0% · nenhum simulado (30+ q)'
          : `Melhor: ${bestSim30Pct}% / 92%`,
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
      id: 'precisao-85',
      title: 'Precisão Cirúrgica (85%+)',
      description: 'Sustente 85% ou mais de acerto global após 200 questões resolvidas.',
      category: 'excelencia',
      tier: 'diamante',
      current: totalAnswered >= 200 ? accuracyPct : Math.min(accuracyPct, 84),
      target: 85,
      unit: '%',
      extraCondition: totalAnswered >= 200 && accuracyPct >= 85,
      customLabel:
        totalAnswered < 200
          ? `${accuracyPct}% · ${totalAnswered}/200 questões`
          : `${accuracyPct}% / 85%`,
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
      extraCondition: totalAnswered >= 500 && accuracyPct >= 90,
      customLabel:
        totalAnswered < 500
          ? `${accuracyPct}% · ${totalAnswered}/500 questões`
          : `${accuracyPct}% / 90%`,
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
    buildMedal({
      id: 'erros-50',
      title: 'Caderno Blindado',
      description: 'Neutralize 50 pontos falhos marcando-os como corrigidos no Caderno.',
      category: 'excelencia',
      tier: 'diamante',
      current: correctedErrors,
      target: 50,
      unit: 'correções',
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
      maxDailyHours,
      currentStreak,
      bestStreak,
      activeDaysTotal: activeDates.size,
      totalAnswered,
      accuracyPct,
      completedSimulations,
      bestSim20Pct,
      bestSim30Pct,
      correctedErrors,
      lawReadings,
      masteredSubjectsCount,
      eliteSubjectsCount,
      editalStudiedCount,
      caseLawCount,
      essaysCount,
    },
  };
}
