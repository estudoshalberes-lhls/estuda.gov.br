import { ModuleName, StudyDatabase } from '../types/study';
import { localDateIso, normalizeSearch } from './parsers';

export type MedalCategory =
  | 'metas'
  | 'horas'
  | 'consistencia'
  | 'excelencia'
  | 'dominio';
export type MedalTier =
  | 'bronze'
  | 'prata'
  | 'ouro'
  | 'diamante'
  | 'supremo'
  | 'lendario'
  | 'imortal';

export const MEDAL_TIER_BONUS_XP: Record<MedalTier, number> = {
  bronze: 50,
  prata: 120,
  ouro: 250,
  diamante: 500,
  supremo: 1000,
  lendario: 2500,
  imortal: 5000,
};

export const MEDAL_TIER_LABELS: Record<MedalTier, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  diamante: 'Diamante',
  supremo: 'Supremo',
  lendario: 'Lendário',
  imortal: 'Imortal',
};

export const WEEKLY_MISSION_XP_REWARD = 75;
export const ELITE_WEEKLY_MISSION_XP_REWARD = 200;
export const MAX_PINNED_MEDALS = 3;

export interface CareerRankGroupMeta {
  tierIndex: number; // 1..10
  roman: string;
  name: string;
  shortName: string;
  subtitle: string;
  difficultyLabel: string;
  startLevel: number;
  endLevel: number;
}

export type MilestonePillar =
  | 'metas'
  | 'horas'
  | 'questoes'
  | 'constancia'
  | 'simulados'
  | 'leis'
  | 'revisao'
  | 'erros'
  | 'edital'
  | 'promocao';

export interface LevelMilestoneCriterion {
  label: string;
  currentLabel: string;
  targetLabel: string;
  met: boolean;
  progressPct: number;
}

export interface LevelMilestone {
  level: number; // 1..100
  id: string;
  pillar: MilestonePillar;
  isPromotionGate: boolean;
  title: string;
  requirementLabel: string;
  detail: string;
  current: number;
  target: number;
  unit: string;
  progressPct: number;
  progressLabel: string;
  remainingLabel: string;
  completed: boolean;
  bonusXp: number;
  difficultyMultiplier: number;
  targetModule: ModuleName;
  subCriteria?: LevelMilestoneCriterion[];
}

export interface CareerLevelDefinition {
  level: number; // 1..100
  tierIndex: number; // 1..10
  rankGroup: string;
  difficultyLabel: string;
  title: string;
  subtitle: string;
  minXp: number;
  xpDelta: number; // Exponential XP step from previous level
  difficultyMultiplier: number; // Exponential factor relative to Lv. 2 step
  isPromotionGate: boolean; // True for Lv. 10, 20, ..., 100
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
  isElite?: boolean;
  targetModule: ModuleName;
}

export interface CareerXpBreakdown {
  hoursXp: number;
  goalsXp: number;
  questionsXp: number;
  simulationsXp: number;
  lawsXp: number;
  errorsCorrectedXp: number;
  spacedReviewsXp: number;
  streakXp: number;
  editalXp: number;
  caseLawXp: number;
  essaysXp: number;
  criticalPointsXp: number;
  milestonesBonusXp: number;
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
  overallLevel100Pct: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpRemaining: number;
  xpToLevel100: number;
  level100MinXp: number;
  xpGrowthRatePct: number;
  allLevels: CareerLevelDefinition[];
  rankGroups: CareerRankGroupMeta[];
  levelMilestones: LevelMilestone[];
  completedMilestonesCount: number;
  nextPendingMilestone: LevelMilestone | null;
  nextPromotionMilestone: LevelMilestone | null;
  medals: MeritMedal[];
  unlockedMedalsCount: number;
  almostThereMedals: MeritMedal[];
  highDifficultyTargets: MeritMedal[];
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
    highVolumeWeeksCount: number;
    currentStreak: number;
    bestStreak: number;
    activeDaysTotal: number;
    totalAnswered: number;
    accuracyPct: number;
    completedSimulations: number;
    eliteSimulationsCount: number;
    bestSim20Pct: number;
    bestSim30Pct: number;
    bestSim50Pct: number;
    bestFastSimPct: number;
    bestFastSimAvgSec: number | null;
    bestEliteSpeedSimPct: number;
    bestEliteSpeedSimAvgSec: number | null;
    bestSupersonicSimPct: number;
    bestSupersonicSimAvgSec: number | null;
    bestCespeNetPct: number;
    bestCespe50NetPct: number;
    bestCespeNetPoints: number;
    correctedErrors: number;
    pendingErrorsCount: number;
    spacedReviewCycles: number;
    lawReadings: number;
    masteredSubjectsCount: number;
    eliteSubjectsCount: number;
    grandMasterSubjectsCount: number;
    editalStudiedCount: number;
    caseLawCount: number;
    essaysCount: number;
    criticalPointsCount: number;
  };
}

const ROMAN_CLASSES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

export const CAREER_RANK_GROUPS: CareerRankGroupMeta[] = [
  {
    tierIndex: 1,
    roman: 'I',
    name: 'Candidato Inscrito',
    shortName: 'Candidato',
    subtitle: 'Edital aberto, rotina iniciada e primeiras metas homologadas',
    difficultyLabel: 'Iniciação',
    startLevel: 1,
    endLevel: 10,
  },
  {
    tierIndex: 2,
    roman: 'II',
    name: 'Estagiário de Gabinete',
    shortName: 'Estagiário',
    subtitle: 'Ritmo regular de questões, revisões e horas líquidas semanais',
    difficultyLabel: 'Base',
    startLevel: 11,
    endLevel: 20,
  },
  {
    tierIndex: 3,
    roman: 'III',
    name: 'Técnico em Formação',
    shortName: 'Téc. Formação',
    subtitle: 'Consolidação teórica, Lei Seca frequente e baterias estruturadas',
    difficultyLabel: 'Intermediário',
    startLevel: 21,
    endLevel: 30,
  },
  {
    tierIndex: 4,
    roman: 'IV',
    name: 'Técnico Judiciário',
    shortName: 'Téc. Judiciário',
    subtitle: 'Execução disciplinada de edital, caderno de erros e simulados',
    difficultyLabel: 'Intermediário II',
    startLevel: 31,
    endLevel: 40,
  },
  {
    tierIndex: 5,
    roman: 'V',
    name: 'Analista de Controle',
    shortName: 'Analista',
    subtitle: 'Alto domínio de carga horária líquida e curva de retenção',
    difficultyLabel: 'Avançado',
    startLevel: 41,
    endLevel: 50,
  },
  {
    tierIndex: 6,
    roman: 'VI',
    name: 'Auditor Fiscal Júnior',
    shortName: 'Auditor Jr.',
    subtitle: 'Volume pesado de treino com consistência competitiva em provas',
    difficultyLabel: 'Avançado II',
    startLevel: 51,
    endLevel: 60,
  },
  {
    tierIndex: 7,
    roman: 'VII',
    name: 'Auditor Titular',
    shortName: 'Auditor Titular',
    subtitle: 'Desempenho de nota de corte, ritmo cirúrgico e domínio multidisciplinar',
    difficultyLabel: 'Alta Dificuldade',
    startLevel: 61,
    endLevel: 70,
  },
  {
    tierIndex: 8,
    roman: 'VIII',
    name: 'Procurador de Carreira',
    shortName: 'Procurador',
    subtitle: 'Excelência sustentada em maratonas, discursivas e provas complexas',
    difficultyLabel: 'Elite',
    startLevel: 71,
    endLevel: 80,
  },
  {
    tierIndex: 9,
    roman: 'IX',
    name: 'Desembargador da Aprovação',
    shortName: 'Desembargador',
    subtitle: 'Constância implacável e rendimento de topo em editais extensos',
    difficultyLabel: 'Extremo',
    startLevel: 81,
    endLevel: 90,
  },
  {
    tierIndex: 10,
    roman: 'X',
    name: 'Ministro Supremo da Posse',
    shortName: 'Ministro Supremo',
    subtitle: 'Patamar máximo de horas, precisão, constância e objetivos lendários',
    difficultyLabel: 'Lendário · Nv. 100',
    startLevel: 91,
    endLevel: 100,
  },
];

export const CAREER_XP_BASE_DELTA = 150;
export const CAREER_XP_GROWTH_RATE = 1.055; // +5,5% composto a cada nível

function roundExponentialStep(raw: number): number {
  if (raw < 500) return Math.max(10, Math.round(raw / 10) * 10);
  if (raw < 2000) return Math.round(raw / 25) * 25;
  if (raw < 10000) return Math.round(raw / 50) * 50;
  return Math.round(raw / 100) * 100;
}

function buildExponentialCareerLevels(): CareerLevelDefinition[] {
  const levels: CareerLevelDefinition[] = [];
  let cumulativeXp = 0;

  for (let idx = 0; idx < 100; idx++) {
    const level = idx + 1;
    const tierIdx = Math.floor(idx / 10); // 0..9
    const classIdx = idx % 10; // 0..9
    const group = CAREER_RANK_GROUPS[tierIdx];
    const isMax = level === 100;
    const isPromotionGate = level % 10 === 0;

    const xpDelta =
      level === 1
        ? 0
        : roundExponentialStep(
            CAREER_XP_BASE_DELTA * Math.pow(CAREER_XP_GROWTH_RATE, level - 2),
          );
    cumulativeXp += xpDelta;

    const difficultyMultiplier =
      level === 1
        ? 1
        : Number((xpDelta / CAREER_XP_BASE_DELTA).toFixed(1));

    levels.push({
      level,
      tierIndex: group.tierIndex,
      rankGroup: `${group.roman} · ${group.name}`,
      difficultyLabel: group.difficultyLabel,
      title: isMax
        ? 'Ministro Supremo da Posse · Grau Máximo'
        : `${group.name} ${ROMAN_CLASSES[classIdx]}`,
      subtitle: group.subtitle,
      minXp: cumulativeXp,
      xpDelta,
      difficultyMultiplier,
      isPromotionGate,
    });
  }

  return levels;
}

export const CAREER_LEVELS: CareerLevelDefinition[] = buildExponentialCareerLevels();

const MILESTONE_BAND_TARGETS = {
  metas: [1, 2, 5, 10, 22, 46, 95, 200, 440, 950],
  horas: [2, 4, 9, 20, 44, 96, 210, 460, 1020, 2300],
  questoes: [15, 35, 80, 180, 400, 880, 1900, 4100, 8800, 18500],
  constancia: [2, 4, 7, 13, 24, 45, 84, 155, 290, 540],
  simulados: [1, 2, 3, 5, 8, 13, 21, 34, 55, 88],
  leis: [10, 22, 48, 105, 230, 500, 1080, 2350, 5100, 7800],
  revisao: [1, 2, 4, 7, 13, 24, 44, 80, 145, 260],
  erros: [2, 4, 7, 13, 24, 44, 80, 145, 260, 460],
  edital: [2, 4, 8, 15, 28, 52, 96, 180, 330, 600],
} as const;

const PROMOTION_GATE_SPECS: Array<{
  level: number;
  title: string;
  hours: number;
  questions: number;
  minAccuracy: number;
}> = [
  { level: 10, title: 'Exame de Promoção · Patente I → II', hours: 8, questions: 80, minAccuracy: 0 },
  { level: 20, title: 'Exame de Promoção · Patente II → III', hours: 20, questions: 220, minAccuracy: 60 },
  { level: 30, title: 'Exame de Promoção · Patente III → IV', hours: 50, questions: 550, minAccuracy: 65 },
  { level: 40, title: 'Exame de Promoção · Patente IV → V', hours: 120, questions: 1300, minAccuracy: 70 },
  { level: 50, title: 'Exame de Promoção · Patente V → VI', hours: 260, questions: 2800, minAccuracy: 74 },
  { level: 60, title: 'Exame de Promoção · Patente VI → VII', hours: 540, questions: 5600, minAccuracy: 78 },
  { level: 70, title: 'Exame de Promoção · Patente VII → VIII', hours: 1000, questions: 10000, minAccuracy: 81 },
  { level: 80, title: 'Exame de Promoção · Patente VIII → IX', hours: 1700, questions: 16000, minAccuracy: 84 },
  { level: 90, title: 'Exame de Promoção · Patente IX → X', hours: 2700, questions: 24000, minAccuracy: 87 },
  { level: 100, title: 'Coroação Suprema · Grau Máximo (Nv. 100)', hours: 4000, questions: 35000, minAccuracy: 90 },
];

function computeMilestoneBonusXp(level: number, isPromotionGate: boolean): number {
  const base = 25 * Math.pow(CAREER_XP_GROWTH_RATE, level - 1);
  const multiplied = isPromotionGate ? base * 2 : base;
  if (multiplied < 100) return Math.round(multiplied / 5) * 5;
  if (multiplied < 500) return Math.round(multiplied / 10) * 10;
  if (multiplied < 2000) return Math.round(multiplied / 25) * 25;
  return Math.round(multiplied / 50) * 50;
}

function buildExponentialLevelMilestones(metrics: {
  completedGoals: number;
  flooredHours: number;
  totalAnswered: number;
  accuracyPct: number;
  activeDaysTotal: number;
  completedSimulations: number;
  lawReadings: number;
  spacedReviewCycles: number;
  correctedErrors: number;
  editalStudiedCount: number;
}): LevelMilestone[] {
  const result: LevelMilestone[] = [];

  for (const lvlDef of CAREER_LEVELS) {
    const level = lvlDef.level;
    const band = Math.floor((level - 1) / 10); // 0..9
    const slot = level % 10; // 1..9 regular pillars, 0 = Promotion Gate
    const bonusXp = computeMilestoneBonusXp(level, lvlDef.isPromotionGate);

    if (slot === 0) {
      const spec = PROMOTION_GATE_SPECS[band];
      const hoursPct = Math.min(100, Math.round((metrics.flooredHours / spec.hours) * 100));
      const questionsPct = Math.min(100, Math.round((metrics.totalAnswered / spec.questions) * 100));
      const hoursMet = metrics.flooredHours >= spec.hours;
      const questionsMet = metrics.totalAnswered >= spec.questions;
      const accMet =
        spec.minAccuracy === 0
          ? true
          : metrics.totalAnswered >= spec.questions && metrics.accuracyPct >= spec.minAccuracy;
      const accPct =
        spec.minAccuracy === 0
          ? 100
          : Math.min(100, Math.round((metrics.accuracyPct / spec.minAccuracy) * 100));

      const subCriteria: LevelMilestoneCriterion[] = [
        {
          label: 'Horas líquidas',
          currentLabel: `${metrics.flooredHours.toLocaleString('pt-BR')}h`,
          targetLabel: `${spec.hours.toLocaleString('pt-BR')}h`,
          met: hoursMet,
          progressPct: hoursPct,
        },
        {
          label: 'Questões resolvidas',
          currentLabel: metrics.totalAnswered.toLocaleString('pt-BR'),
          targetLabel: spec.questions.toLocaleString('pt-BR'),
          met: questionsMet,
          progressPct: questionsPct,
        },
      ];

      if (spec.minAccuracy > 0) {
        subCriteria.push({
          label: 'Precisão acumulada',
          currentLabel: `${metrics.accuracyPct}%`,
          targetLabel: `≥ ${spec.minAccuracy}%`,
          met: accMet,
          progressPct: accPct,
        });
      }

      const completed = subCriteria.every((c) => c.met);
      const progressPct = completed
        ? 100
        : Math.min(
            99,
            Math.round(
              subCriteria.reduce((acc, c) => acc + c.progressPct, 0) / subCriteria.length,
            ),
          );
      const metCount = subCriteria.filter((c) => c.met).length;
      const requirementLabel =
        spec.minAccuracy > 0
          ? `${spec.hours.toLocaleString('pt-BR')}h · ${spec.questions.toLocaleString('pt-BR')} questões · ≥ ${spec.minAccuracy}% acerto`
          : `${spec.hours.toLocaleString('pt-BR')}h líquidas · ${spec.questions.toLocaleString('pt-BR')} questões`;

      result.push({
        level,
        id: `milestone-lvl-${level}`,
        pillar: 'promocao',
        isPromotionGate: true,
        title: spec.title,
        requirementLabel,
        detail: `Marco de Promoção de Patente com exigência exponencial (${lvlDef.difficultyMultiplier.toLocaleString('pt-BR')}×).`,
        current: metCount,
        target: subCriteria.length,
        unit: 'requisitos',
        progressPct,
        progressLabel: `${metCount}/${subCriteria.length} requisitos`,
        remainingLabel: completed
          ? 'Promoção homologada!'
          : `Falta(m) ${subCriteria.length - metCount} requisito(s)`,
        completed,
        bonusXp,
        difficultyMultiplier: lvlDef.difficultyMultiplier,
        targetModule: !hoursMet ? 'Cronograma' : 'Treino Diário',
        subCriteria,
      });
      continue;
    }

    let pillar: MilestonePillar = 'metas';
    let title = '';
    let current = 0;
    let target = 1;
    let unit = '';
    let targetModule: ModuleName = 'Cronograma';

    switch (slot) {
      case 1:
        pillar = 'metas';
        target = MILESTONE_BAND_TARGETS.metas[band];
        current = metrics.completedGoals;
        unit = target === 1 ? 'meta' : 'metas';
        title = `Cumprir ${target.toLocaleString('pt-BR')} ${unit} do cronograma`;
        targetModule = 'Cronograma';
        break;
      case 2:
        pillar = 'horas';
        target = MILESTONE_BAND_TARGETS.horas[band];
        current = metrics.flooredHours;
        unit = 'h';
        title = `Acumular ${target.toLocaleString('pt-BR')}h líquidas registradas`;
        targetModule = 'Cronograma';
        break;
      case 3:
        pillar = 'questoes';
        target = MILESTONE_BAND_TARGETS.questoes[band];
        current = metrics.totalAnswered;
        unit = 'questões';
        title = `Resolver ${target.toLocaleString('pt-BR')} questões acumuladas`;
        targetModule = 'Treino Diário';
        break;
      case 4:
        pillar = 'constancia';
        target = MILESTONE_BAND_TARGETS.constancia[band];
        current = metrics.activeDaysTotal;
        unit = 'dias ativos';
        title = `Sustentar ${target.toLocaleString('pt-BR')} dias ativos de estudo`;
        targetModule = 'Início';
        break;
      case 5:
        pillar = 'simulados';
        target = MILESTONE_BAND_TARGETS.simulados[band];
        current = metrics.completedSimulations;
        unit = target === 1 ? 'simulado' : 'simulados';
        title = `Finalizar ${target.toLocaleString('pt-BR')} ${unit} fechados`;
        targetModule = 'Simulado Fechado';
        break;
      case 6:
        pillar = 'leis';
        target = MILESTONE_BAND_TARGETS.leis[band];
        current = metrics.lawReadings;
        unit = 'dispositivos';
        title = `Registrar ${target.toLocaleString('pt-BR')} leituras de Lei Seca`;
        targetModule = 'Lei Seca';
        break;
      case 7:
        pillar = 'revisao';
        target = MILESTONE_BAND_TARGETS.revisao[band];
        current = metrics.spacedReviewCycles;
        unit = target === 1 ? 'ciclo' : 'ciclos';
        title = `Concluir ${target.toLocaleString('pt-BR')} ${unit} de revisão espaçada`;
        targetModule = 'Início';
        break;
      case 8:
        pillar = 'erros';
        target = MILESTONE_BAND_TARGETS.erros[band];
        current = metrics.correctedErrors;
        unit = 'erros';
        title = `Sanar ${target.toLocaleString('pt-BR')} erros no Caderno de Erros`;
        targetModule = 'Caderno de Erros';
        break;
      case 9:
      default:
        pillar = 'edital';
        target = MILESTONE_BAND_TARGETS.edital[band];
        current = metrics.editalStudiedCount;
        unit = 'tópicos';
        title = `Estudar ${target.toLocaleString('pt-BR')} tópicos de edital`;
        targetModule = 'Editais';
        break;
    }

    const completed = current >= target;
    const progressPct = Math.max(0, Math.min(100, Math.round((current / Math.max(1, target)) * 100)));
    const remaining = Math.max(0, target - current);
    const fmt = (n: number) =>
      unit === 'h' ? `${n.toLocaleString('pt-BR')}h` : n.toLocaleString('pt-BR');

    result.push({
      level,
      id: `milestone-lvl-${level}`,
      pillar,
      isPromotionGate: false,
      title,
      requirementLabel:
        unit === 'h'
          ? `${target.toLocaleString('pt-BR')}h líquidas`
          : `${target.toLocaleString('pt-BR')} ${unit}`,
      detail: `Marco do Nível ${level} · Dificuldade exponencial ${lvlDef.difficultyMultiplier.toLocaleString('pt-BR')}×.`,
      current,
      target,
      unit,
      progressPct,
      progressLabel:
        unit === 'h'
          ? `${fmt(Math.min(current, target))} / ${fmt(target)}`
          : `${fmt(Math.min(current, target))} / ${fmt(target)} ${unit}`,
      remainingLabel: completed
        ? 'Marco conquistado!'
        : unit === 'h'
          ? `Faltam ${remaining.toLocaleString('pt-BR')}h`
          : `Faltam ${remaining.toLocaleString('pt-BR')} ${unit}`,
      completed,
      bonusXp,
      difficultyMultiplier: lvlDef.difficultyMultiplier,
      targetModule,
    });
  }

  return result;
}

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
    semanas: 'semana',
    missões: 'missão',
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
  const secondsByIsoWeek = new Map<string, number>();
  (db.studyTimeRecords || []).forEach((rec) => {
    const secs = (rec.allocations || []).reduce((s, a) => s + (a.seconds || 0), 0);
    totalStudySeconds += secs;
    const iso = parseBrOrIsoDateToIso(rec.date);
    if (iso && secs > 0) {
      secondsByDay.set(iso, (secondsByDay.get(iso) || 0) + secs);
      const [y, m, d] = iso.split('-').map(Number);
      if (y && m && d) {
        const wk = getCurrentIsoWeekWindow(new Date(y, m - 1, d)).weekKey;
        secondsByIsoWeek.set(wk, (secondsByIsoWeek.get(wk) || 0) + secs);
      }
      if (isInCurrentWeek(iso)) {
        weeklyStudySeconds += secs;
      }
    }
  });
  const totalStudyHours = totalStudySeconds / 3600;
  const maxDailySeconds = secondsByDay.size ? Math.max(...secondsByDay.values()) : 0;
  const maxDailyHours = Math.floor((maxDailySeconds / 3600) * 10) / 10;
  let highVolumeWeeksCount = 0;
  secondsByIsoWeek.forEach((secs) => {
    if (secs >= 30 * 3600) highVolumeWeeksCount += 1;
  });

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
  let grandMasterSubjectsCount = 0;
  subjectStats.forEach((st) => {
    const pct = st.total > 0 ? (st.correct / st.total) * 100 : 0;
    if (st.total >= 30 && pct >= 75) masteredSubjectsCount += 1;
    if (st.total >= 50 && pct >= 80) eliteSubjectsCount += 1;
    if (st.total >= 100 && pct >= 85) grandMasterSubjectsCount += 1;
  });

  // Simulations analytics (accuracy, pacing/time per question, CESPE net score)
  const completedSims = db.completedSimulations || [];
  const completedSimulations = completedSims.length;
  let eliteSimulationsCount = 0;
  let bestSim20Pct = 0;
  let bestSim30Pct = 0;
  let bestSim50Pct = 0;
  let bestFastSimPct = 0;
  let bestFastSimAvgSec: number | null = null;
  let fastSimUnlocked = false;
  let bestEliteSpeedSimPct = 0;
  let bestEliteSpeedSimAvgSec: number | null = null;
  let eliteSpeedSimUnlocked = false;
  let bestSupersonicSimPct = 0;
  let bestSupersonicSimAvgSec: number | null = null;
  let supersonicSimUnlocked = false;
  let bestCespeNetPct = 0;
  let bestCespe50NetPct = 0;
  let bestCespeNetPoints = 0;
  let cespe20Unlocked = false;
  let cespe50Unlocked = false;

  completedSims.forEach((sim) => {
    const qty = sim.total || sim.questoes?.length || 0;
    const acc = Math.round(sim.aproveitamento || 0);
    if (qty >= 20) {
      bestSim20Pct = Math.max(bestSim20Pct, acc);
      if (acc >= 85) eliteSimulationsCount += 1;
    }
    if (qty >= 30) bestSim30Pct = Math.max(bestSim30Pct, acc);
    if (qty >= 50) bestSim50Pct = Math.max(bestSim50Pct, acc);

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

    if (qty >= 30 && avgSec !== null) {
      if (avgSec <= 70 && acc >= 90) {
        supersonicSimUnlocked = true;
      }
      if (avgSec <= 70 && acc >= bestSupersonicSimPct) {
        bestSupersonicSimPct = acc;
        bestSupersonicSimAvgSec = avgSec;
      } else if (bestSupersonicSimAvgSec === null && acc >= 90) {
        bestSupersonicSimPct = acc;
        bestSupersonicSimAvgSec = avgSec;
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
      if (qty >= 50) {
        if (netPct > bestCespe50NetPct) {
          bestCespe50NetPct = netPct;
        }
        if (netPct >= 80) {
          cespe50Unlocked = true;
        }
      }
    }
  });

  // Error notebook, spaced repetition cycles (Ouvidoria + Revisão Espaçada 24h/7d/15d/30d) & pending count
  const annotations = db.annotations || [];
  const allProofCorrections = (db.proofFiles || []).flatMap((pf) => pf.correcoes || []);
  const topicReviews = db.topicReviews || [];

  const correctedAnnotations = annotations.filter((a) => Boolean(a.corrigido)).length;
  const correctedProofItems = allProofCorrections.filter((c) => Boolean(c.corrigido)).length;
  const correctedErrors = correctedAnnotations + correctedProofItems;

  const pendingAnnotations = annotations.filter((a) => !a.corrigido).length;
  const pendingProofItems = allProofCorrections.filter((c) => !c.corrigido).length;
  const pendingErrorsCount = pendingAnnotations + pendingProofItems;

  const topicSpacedCycles = topicReviews.reduce(
    (sum, r) => sum + (r.done ? 4 : Math.max(0, Number(r.stageIndex || 0))),
    0,
  );
  const spacedReviewCycles =
    annotations.reduce((sum, a) => sum + Math.max(0, Number(a.nivel_revisao || 0)), 0) +
    allProofCorrections.reduce((sum, c) => sum + Math.max(0, Number(c.nivel_revisao || 0)), 0) +
    topicSpacedCycles;

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
  topicReviews.forEach((r) => {
    const rIso = parseBrOrIsoDateToIso(r.lastReviewedIso);
    if (isInCurrentWeek(rIso)) weeklyErrorsActions += 1;
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

  // === WEEKLY MISSIONS (Reset every Monday, deterministic rotation + 5th Elite High-Difficulty Mission) ===
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
    xpReward?: number;
    isElite?: boolean;
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
      xpReward: params.xpReward ?? WEEKLY_MISSION_XP_REWARD,
      isElite: params.isElite,
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

  const eliteWeeklyMission: WeeklyMission =
    rotationSlot === 0
      ? makeWeeklyMission({
          id: 'elite-semanal-horas',
          title: 'Desafio de Elite · 20h Líquidas',
          description: 'Alta dificuldade: acumule 20 horas líquidas no Ponto Eletrônico nesta semana.',
          current: weeklyHours,
          target: 20,
          unit: 'h',
          targetModule: 'Cronograma',
          xpReward: ELITE_WEEKLY_MISSION_XP_REWARD,
          isElite: true,
        })
      : rotationSlot === 1
        ? makeWeeklyMission({
            id: 'elite-semanal-questoes',
            title: 'Desafio de Elite · 250 Questões',
            description: 'Alta dificuldade: resolva 250 questões entre segunda e domingo no Treino ou Simulado.',
            current: weeklyQuestions,
            target: 250,
            unit: 'questões',
            targetModule: 'Treino Diário',
            xpReward: ELITE_WEEKLY_MISSION_XP_REWARD,
            isElite: true,
          })
        : makeWeeklyMission({
            id: 'elite-semanal-constancia',
            title: 'Desafio de Elite · Semana 7/7 + Pauta',
            description: 'Alta dificuldade: registre estudo ativo todos os 7 dias da semana sem falhar.',
            current: weeklyActiveDays,
            target: 7,
            unit: 'dias',
            targetModule: 'Início',
            xpReward: ELITE_WEEKLY_MISSION_XP_REWARD,
            isElite: true,
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
    eliteWeeklyMission,
  ];

  const weeklyCompletedCount = weeklyMissions.filter((m) => m.completed).length;

  // Union persisted weekly completions with live completed missions in current week
  const allCompletedWeeklyKeys = new Set<string>(Object.keys(persistedWeeklyMap));
  weeklyMissions.forEach((m) => {
    if (m.completed) allCompletedWeeklyKeys.add(m.storageKey);
  });
  const totalCompletedWeeklyMissionsAllTime = allCompletedWeeklyKeys.size;
  let weeklyMissionsXp = 0;
  allCompletedWeeklyKeys.forEach((storageKey) => {
    weeklyMissionsXp += storageKey.includes(':elite-semanal-')
      ? ELITE_WEEKLY_MISSION_XP_REWARD
      : WEEKLY_MISSION_XP_REWARD;
  });

  const flooredHours = Math.floor(totalStudyHours * 10) / 10;

  // === MERIT MEDALS (80 medals across 5 categories · Bronze to Imortal) ===
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

    // =========================================================================
    // OBJETIVOS DE ALTA DIFICULDADE RUMO AO NÍVEL 100 (LENDÁRIO & IMORTAL)
    // =========================================================================
    buildMedal({
      id: 'meta-500',
      title: 'Estrategista Federal (500 Metas)',
      description: 'Conclua 500 metas no Expediente com disciplina de longo prazo.',
      category: 'metas',
      tier: 'lendario',
      current: completedGoals,
      target: 500,
      unit: 'metas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'meta-1000',
      title: 'Milhar de Metas Cumpridas',
      description: 'Desafio extremo: alcance 1.000 metas concluídas no seu cronograma.',
      category: 'metas',
      tier: 'imortal',
      current: completedGoals,
      target: 1000,
      unit: 'metas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'meta-1500',
      title: 'Soberano do Expediente (1.500 Metas)',
      description: 'Patamar máximo de execução: 1.500 metas concluídas ao longo da jornada.',
      category: 'metas',
      tier: 'imortal',
      current: completedGoals,
      target: 1500,
      unit: 'metas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'horas-1500',
      title: 'Coluna de Aço (1.500h)',
      description: 'Sustente 1.500 horas líquidas registradas no Ponto Eletrônico.',
      category: 'horas',
      tier: 'lendario',
      current: flooredHours,
      target: 1500,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'horas-2500',
      title: 'Vanguarda de Longo Curso (2.500h)',
      description: 'Desafio de elite: acumule 2.500 horas líquidas de estudo real.',
      category: 'horas',
      tier: 'imortal',
      current: flooredHours,
      target: 2500,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'horas-4000',
      title: 'Legião das 4.000 Horas',
      description: 'Marca monumental de preparação para carreiras de Estado: 4.000 horas líquidas.',
      category: 'horas',
      tier: 'imortal',
      current: flooredHours,
      target: 4000,
      unit: 'h',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'maratona-10h',
      title: 'Imersão Extrema (10h/dia)',
      description: 'Registre 10 horas líquidas ou mais em um único dia de estudo intensivo.',
      category: 'horas',
      tier: 'lendario',
      current: maxDailyHours,
      target: 10,
      unit: 'h/dia',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'semanas-30h',
      title: 'Semanas de Alto Rendimento (12× 30h+)',
      description: 'Complete 12 semanas distintas com pelo menos 30 horas líquidas estudadas.',
      category: 'horas',
      tier: 'lendario',
      current: highVolumeWeeksCount,
      target: 12,
      unit: 'semanas',
      targetModule: 'Cronograma',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'streak-180',
      title: 'Semestre Ininterrupto (180d)',
      description: 'Mantenha 180 dias consecutivos com estudo ativo registrado sem falhas.',
      category: 'consistencia',
      tier: 'lendario',
      current: bestStreak,
      target: 180,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'streak-365',
      title: 'Ano Invicto · 365 Dias Seguidos',
      description: 'Desafio máximo de disciplina: 365 dias consecutivos de preparação ativa.',
      category: 'consistencia',
      tier: 'imortal',
      current: bestStreak,
      target: 365,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'dias-ativos-365',
      title: 'Um Ano em Campanha (365d)',
      description: 'Acumule 365 dias distintos com atividade de estudo no calendário.',
      category: 'consistencia',
      tier: 'lendario',
      current: activeDates.size,
      target: 365,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'dias-ativos-730',
      title: 'Biênio de Ouro (730d)',
      description: 'Acumule 730 dias distintos de estudo consistente rumo à nomeação.',
      category: 'consistencia',
      tier: 'imortal',
      current: activeDates.size,
      target: 730,
      unit: 'dias',
      targetModule: 'Início',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'revisao-curva-100',
      title: 'Arquivista da Memória (100 Ciclos)',
      description: 'Complete 100 ciclos de revisão espaçada (24h · 7d · 15d · 30d e Ouvidoria).',
      category: 'consistencia',
      tier: 'lendario',
      current: spacedReviewCycles,
      target: 100,
      unit: 'ciclos',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'revisao-curva-250',
      title: 'Memória Fotográfica (250 Ciclos)',
      description: 'Consolide 250 ciclos completos de revisão espaçada ao longo da carreira.',
      category: 'consistencia',
      tier: 'imortal',
      current: spacedReviewCycles,
      target: 250,
      unit: 'ciclos',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'missoes-semanais-40',
      title: 'Regularidade Anual (40 Missões)',
      description: 'Conclua 40 missões semanais acumuladas ao longo da preparação.',
      category: 'consistencia',
      tier: 'lendario',
      current: totalCompletedWeeklyMissionsAllTime,
      target: 40,
      unit: 'missões',
      targetModule: 'Carreira & Mérito',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'missoes-semanais-120',
      title: 'Disciplina Vitalícia (120 Missões)',
      description: 'Conclua 120 missões semanais homologadas em sua trajetória.',
      category: 'consistencia',
      tier: 'imortal',
      current: totalCompletedWeeklyMissionsAllTime,
      target: 120,
      unit: 'missões',
      targetModule: 'Carreira & Mérito',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'questoes-6000',
      title: 'Legião das 6.000 Questões',
      description: 'Resolva 6.000 questões no Banco Oficial e em Simulados Fechados.',
      category: 'excelencia',
      tier: 'lendario',
      current: totalAnswered,
      target: 6000,
      unit: 'questões',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'questoes-12000',
      title: 'Domínio Absoluto (12.000q)',
      description: 'Resolva 12.000 questões e torne-se imune às armadilhas de banca.',
      category: 'excelencia',
      tier: 'imortal',
      current: totalAnswered,
      target: 12000,
      unit: 'questões',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'questoes-25000',
      title: 'Enciclopédia de Banca (25.000q)',
      description: 'Desafio lendário: ultrapasse 25.000 questões resolvidas no histórico.',
      category: 'excelencia',
      tier: 'imortal',
      current: totalAnswered,
      target: 25000,
      unit: 'questões',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'simulados-50',
      title: 'Cinquentenário de Provas (50)',
      description: 'Conclua 50 simulados fechados completos sob condição real de exame.',
      category: 'excelencia',
      tier: 'lendario',
      current: completedSimulations,
      target: 50,
      unit: 'simulados',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'simulados-100',
      title: 'Centurião dos Simulados (100)',
      description: 'Marca suprema de resistência em prova: 100 simulados fechados concluídos.',
      category: 'excelencia',
      tier: 'imortal',
      current: completedSimulations,
      target: 100,
      unit: 'simulados',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'simulados-elite-10',
      title: 'Consistência de Aprovado (10× 85%+)',
      description: 'Alcance 85% ou mais de acerto em 10 simulados fechados distintos (mín. 20q cada).',
      category: 'excelencia',
      tier: 'lendario',
      current: eliteSimulationsCount,
      target: 10,
      unit: 'simulados',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'simulado-nota-95-50',
      title: 'Primeiro Lugar Nacional (95%+ em 50q)',
      description: 'Alta dificuldade: conquiste 95% ou mais em um simulado com ao menos 50 questões.',
      category: 'excelencia',
      tier: 'imortal',
      current: bestSim50Pct,
      target: 95,
      unit: '%',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      customLabel:
        bestSim50Pct === 0
          ? '0% · nenhum simulado (50+ q)'
          : `Melhor (50+ q): ${bestSim50Pct}% / 95%`,
      customRemainingLabel:
        bestSim50Pct >= 95
          ? 'Conquistada'
          : bestSim50Pct === 0
            ? 'Faça 1 simulado (50+ q) com 95%+'
            : `Faltam +${95 - bestSim50Pct}% em simulado (50+ q)`,
    }),
    buildMedal({
      id: 'cronometro-relampago',
      title: 'Precisão Supersônica (≤ 1m10s/q & 90%+)',
      description:
        'Finalize um Simulado Fechado (mín. 30 questões) com média ≤ 1m10s/questão e 90%+ de acerto.',
      category: 'excelencia',
      tier: 'imortal',
      current: supersonicSimUnlocked ? 90 : Math.min(89, bestSupersonicSimPct),
      target: 90,
      unit: '%',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      extraCondition: supersonicSimUnlocked,
      customLabel:
        bestSupersonicSimAvgSec === null
          ? 'Sem simulado cronometrado (30+ q)'
          : `${bestSupersonicSimPct}% · média ${formatSecondsShort(bestSupersonicSimAvgSec)}/q`,
      customRemainingLabel:
        bestSupersonicSimAvgSec === null
          ? 'Faça 1 simulado (30+ q) em ≤ 1m10s/q'
          : bestSupersonicSimAvgSec > 70
            ? `Reduza a média para ≤ 1m10s/q (atual ${formatSecondsShort(bestSupersonicSimAvgSec)})`
            : `Faltam +${Math.max(1, 90 - bestSupersonicSimPct)}% mantendo ≤ 1m10s/q`,
    }),
    buildMedal({
      id: 'cespe-mestre-80',
      title: 'Mestre Cebraspe (80%+ líq. em 50q)',
      description:
        'Atinja 80% ou mais de aproveitamento líquido em simulado estilo CESPE/CE com 50+ questões.',
      category: 'excelencia',
      tier: 'imortal',
      current: bestCespe50NetPct,
      target: 80,
      unit: '%',
      targetModule: 'Simulado Fechado',
      unlockedAtMap,
      extraCondition: cespe50Unlocked,
      customLabel:
        bestCespe50NetPct === 0
          ? '0% · nenhum CESPE/CE (50+ q)'
          : `Melhor líquido (50+ q): ${bestCespe50NetPct}% / 80%`,
      customRemainingLabel:
        bestCespe50NetPct === 0
          ? 'Faça 1 simulado CESPE/CE (50+ q)'
          : `Faltam +${Math.max(1, 80 - bestCespe50NetPct)}% líquido em CESPE (50+ q)`,
    }),
    buildMedal({
      id: 'precisao-92-2000',
      title: 'Precisão de Ministro (92%+ em 2.000q)',
      description: 'Desafio extremo: sustente 92%+ de acerto global após 2.000+ questões resolvidas.',
      category: 'excelencia',
      tier: 'imortal',
      current: totalAnswered >= 2000 ? accuracyPct : Math.min(accuracyPct, 91),
      target: 92,
      unit: '%',
      targetModule: 'Treino Diário',
      unlockedAtMap,
      extraCondition: totalAnswered >= 2000 && accuracyPct >= 92,
      customLabel:
        totalAnswered < 2000
          ? `${accuracyPct}% · ${totalAnswered.toLocaleString('pt-BR')}/2.000 questões`
          : `${accuracyPct}% / 92%`,
      customRemainingLabel:
        totalAnswered < 2000
          ? `Faltam ${(2000 - totalAnswered).toLocaleString('pt-BR')} questões (meta 92%)`
          : `Faltam +${Math.max(1, 92 - accuracyPct)}% de acerto geral`,
    }),
    buildMedal({
      id: 'erros-150',
      title: 'Ouvidoria Blindada (150 Erros)',
      description: 'Neutralize e domine 150 questões erradas no Caderno de Erros.',
      category: 'excelencia',
      tier: 'lendario',
      current: correctedErrors,
      target: 150,
      unit: 'correções',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'erros-400',
      title: 'Imunidade de Banca (400 Erros)',
      description: 'Transforme 400 falhas históricas em domínio sólido comprovado.',
      category: 'excelencia',
      tier: 'imortal',
      current: correctedErrors,
      target: 400,
      unit: 'correções',
      targetModule: 'Caderno de Erros',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'lei-3500',
      title: 'Vade Mecum Vivo (3.500 Leituras)',
      description: 'Acumule 3.500 dispositivos lidos ou revisados no Diário Oficial (Lei Seca).',
      category: 'dominio',
      tier: 'lendario',
      current: lawReadings,
      target: 3500,
      unit: 'leituras',
      targetModule: 'Lei Seca',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'lei-8000',
      title: 'Oráculo Legislativo (8.000 Leituras)',
      description: 'Domínio absoluto da literalidade legal com 8.000 dispositivos lidos/revisados.',
      category: 'dominio',
      tier: 'imortal',
      current: lawReadings,
      target: 8000,
      unit: 'leituras',
      targetModule: 'Lei Seca',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'polimata-12',
      title: 'Polímata Supremo (12 Matérias 85%+)',
      description: 'Sustente 85%+ de acerto (mín. 100 questões cada) em 12 disciplinas distintas.',
      category: 'dominio',
      tier: 'imortal',
      current: grandMasterSubjectsCount,
      target: 12,
      unit: 'disciplinas',
      targetModule: 'Treino Diário',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'edital-200',
      title: 'Varredura de Edital (200 Tópicos)',
      description: 'Conclua 200 tópicos programáticos marcados como estudados em Editais.',
      category: 'dominio',
      tier: 'lendario',
      current: editalStudiedCount,
      target: 200,
      unit: 'tópicos',
      targetModule: 'Editais',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'edital-500',
      title: 'Conquistador de Editais (500 Tópicos)',
      description: 'Marque 500 tópicos de edital como estudados e revisados em sua carreira.',
      category: 'dominio',
      tier: 'imortal',
      current: editalStudiedCount,
      target: 500,
      unit: 'tópicos',
      targetModule: 'Editais',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'sumulas-80',
      title: 'Ministro das Súmulas (80 Julgados)',
      description: 'Catalogue e domine 80 súmulas, teses ou informativos STF/STJ.',
      category: 'dominio',
      tier: 'lendario',
      current: caseLawCount,
      target: 80,
      unit: 'julgados',
      targetModule: 'Súmulas e Jurisprudência',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'discursiva-20',
      title: 'Caneta de Ouro (20 Discursivas)',
      description: 'Produza e avalie 20 peças técnicas ou dissertações oficiais.',
      category: 'dominio',
      tier: 'lendario',
      current: essaysCount,
      target: 20,
      unit: 'discursivas',
      targetModule: 'Discursiva',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'discursiva-50',
      title: 'Tratadista Oficial (50 Discursivas)',
      description: 'Domínio redacional absoluto: 50 peças ou dissertações concluídas.',
      category: 'dominio',
      tier: 'imortal',
      current: essaysCount,
      target: 50,
      unit: 'discursivas',
      targetModule: 'Discursiva',
      unlockedAtMap,
    }),
    buildMedal({
      id: 'criticos-100',
      title: 'Radar Supremo (100 Pontos Críticos)',
      description: 'Catalogue 100 pegadinhas, prazos fatais e alertas legislativos.',
      category: 'dominio',
      tier: 'lendario',
      current: criticalPointsCount,
      target: 100,
      unit: 'pontos',
      targetModule: 'Pontos Críticos',
      unlockedAtMap,
    }),
  ];

  const unlockedMedals = medals.filter((m) => m.unlocked);
  const unlockedMedalsCount = unlockedMedals.length;
  const medalsBonusXp = unlockedMedals.reduce((sum, m) => sum + m.bonusXp, 0);

  // === 100 EXPONENTIAL PER-LEVEL MILESTONES ===
  const levelMilestones = buildExponentialLevelMilestones({
    completedGoals,
    flooredHours,
    totalAnswered,
    accuracyPct,
    activeDaysTotal: activeDates.size,
    completedSimulations,
    lawReadings,
    spacedReviewCycles,
    correctedErrors,
    editalStudiedCount,
  });
  const completedMilestonesCount = levelMilestones.filter((m) => m.completed).length;
  const milestonesBonusXp = levelMilestones
    .filter((m) => m.completed)
    .reduce((sum, m) => sum + m.bonusXp, 0);
  const nextPendingMilestone = levelMilestones.find((m) => !m.completed) || null;
  const nextPromotionMilestone =
    levelMilestones.find((m) => m.isPromotionGate && !m.completed) || null;

  // === COMPLETE XP BREAKDOWN ===
  const xpBreakdown: CareerXpBreakdown = {
    hoursXp: Math.round(totalStudySeconds / 60),
    goalsXp: completedGoals * 45,
    questionsXp: totalAnswered * 2 + totalCorrect * 2,
    simulationsXp: completedSimulations * 120,
    lawsXp: Math.min(25000, lawReadings * 10),
    errorsCorrectedXp: correctedErrors * 20,
    spacedReviewsXp: spacedReviewCycles * 15,
    streakXp: bestStreak * 30,
    editalXp: editalStudiedCount * 12,
    caseLawXp: caseLawCount * 15,
    essaysXp: essaysCount * 80,
    criticalPointsXp: criticalPointsCount * 15,
    milestonesBonusXp,
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
    xpBreakdown.spacedReviewsXp +
    xpBreakdown.streakXp +
    xpBreakdown.editalXp +
    xpBreakdown.caseLawXp +
    xpBreakdown.essaysXp +
    xpBreakdown.criticalPointsXp +
    xpBreakdown.milestonesBonusXp +
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
      id: 'milestonesBonusXp',
      label: 'Marcos de Nível (1 a 100)',
      xp: xpBreakdown.milestonesBonusXp,
      sharePct: Math.round((xpBreakdown.milestonesBonusXp / xpDenom) * 100),
      formula: '+25 a +10.000 XP exponencial',
      detail: `${completedMilestonesCount}/100 marcos conquistados`,
      targetModule: 'Carreira & Mérito',
    },
    {
      id: 'medalsBonusXp',
      label: 'Bônus de Medalhas',
      xp: xpBreakdown.medalsBonusXp,
      sharePct: Math.round((xpBreakdown.medalsBonusXp / xpDenom) * 100),
      formula: '50 a 5.000 XP/grau',
      detail: `${unlockedMedalsCount} condecoração(ões)`,
      targetModule: 'Carreira & Mérito',
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
      formula: '10 XP / leitura (teto 25.000)',
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
      id: 'spacedReviewsXp',
      label: 'Revisão Espaçada (24h–30d)',
      xp: xpBreakdown.spacedReviewsXp,
      sharePct: Math.round((xpBreakdown.spacedReviewsXp / xpDenom) * 100),
      formula: '15 XP / ciclo concluído',
      detail: `${spacedReviewCycles.toLocaleString('pt-BR')} ciclo(s) de retenção`,
      targetModule: 'Início',
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
      formula: `${WEEKLY_MISSION_XP_REWARD} XP (Elite: ${ELITE_WEEKLY_MISSION_XP_REWARD} XP)`,
      detail: `${totalCompletedWeeklyMissionsAllTime} missão(ões) concluída(s)`,
      targetModule: 'Carreira & Mérito',
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

  // Determine current and next career level (1..100)
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

  const level100MinXp = CAREER_LEVELS[CAREER_LEVELS.length - 1].minXp;
  const xpIntoLevel = totalXp - currentLevel.minXp;
  const xpForNextLevel = nextLevel ? nextLevel.minXp - currentLevel.minXp : 0;
  const xpRemaining = nextLevel ? Math.max(0, nextLevel.minXp - totalXp) : 0;
  const xpToLevel100 = Math.max(0, level100MinXp - totalXp);
  const levelProgressPct = nextLevel
    ? Math.max(0, Math.min(100, Math.round((xpIntoLevel / Math.max(1, xpForNextLevel)) * 100)))
    : 100;
  const overallLevel100Pct = Math.max(
    0,
    Math.min(100, Math.round((totalXp / Math.max(1, level100MinXp)) * 100)),
  );

  // "Quase Lá" — Top 3 locked medals closest to unlocking
  const tierWeight: Record<MedalTier, number> = {
    bronze: 1,
    prata: 2,
    ouro: 3,
    diamante: 4,
    supremo: 5,
    lendario: 6,
    imortal: 7,
  };
  const almostThereMedals = medals
    .filter((m) => !m.unlocked)
    .sort((a, b) => {
      if (b.progressPct !== a.progressPct) return b.progressPct - a.progressPct;
      if (tierWeight[a.tier] !== tierWeight[b.tier]) return tierWeight[a.tier] - tierWeight[b.tier];
      return a.target - b.target;
    })
    .slice(0, 3);

  // "Rota para o Nível 100" — Top 6 locked high-difficulty objectives (Supremo, Lendário, Imortal)
  const highDifficultyTargets = medals
    .filter(
      (m) =>
        !m.unlocked &&
        (m.tier === 'lendario' || m.tier === 'imortal' || m.tier === 'supremo'),
    )
    .sort((a, b) => {
      if (b.progressPct !== a.progressPct) return b.progressPct - a.progressPct;
      if (tierWeight[b.tier] !== tierWeight[a.tier]) return tierWeight[b.tier] - tierWeight[a.tier];
      return b.bonusXp - a.bonusXp;
    })
    .slice(0, 6);

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
    overallLevel100Pct,
    xpIntoLevel,
    xpForNextLevel,
    xpRemaining,
    xpToLevel100,
    level100MinXp,
    xpGrowthRatePct: Number(((CAREER_XP_GROWTH_RATE - 1) * 100).toFixed(1)),
    allLevels: CAREER_LEVELS,
    rankGroups: CAREER_RANK_GROUPS,
    levelMilestones,
    completedMilestonesCount,
    nextPendingMilestone,
    nextPromotionMilestone,
    medals,
    unlockedMedalsCount,
    almostThereMedals,
    highDifficultyTargets,
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
      highVolumeWeeksCount,
      currentStreak,
      bestStreak,
      activeDaysTotal: activeDates.size,
      totalAnswered,
      accuracyPct,
      completedSimulations,
      eliteSimulationsCount,
      bestSim20Pct,
      bestSim30Pct,
      bestSim50Pct,
      bestFastSimPct,
      bestFastSimAvgSec,
      bestEliteSpeedSimPct,
      bestEliteSpeedSimAvgSec,
      bestSupersonicSimPct,
      bestSupersonicSimAvgSec,
      bestCespeNetPct,
      bestCespe50NetPct,
      bestCespeNetPoints,
      correctedErrors,
      pendingErrorsCount,
      spacedReviewCycles,
      lawReadings,
      masteredSubjectsCount,
      eliteSubjectsCount,
      grandMasterSubjectsCount,
      editalStudiedCount,
      caseLawCount,
      essaysCount,
      criticalPointsCount,
    },
  };
}
