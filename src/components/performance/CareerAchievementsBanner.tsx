import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Flame,
  Lock,
  Medal,
  Mountain,
  Pin,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { ModuleName, StudyDatabase } from '../../types/study';
import { formatClock } from '../../lib/parsers';
import {
  CareerLevelDefinition,
  LevelMilestone,
  MAX_PINNED_MEDALS,
  MEDAL_TIER_LABELS,
  MedalCategory,
  MedalTier,
  MeritMedal,
  computeCareerSummary,
  formatCareerDateBr,
} from '../../lib/careerGamification';
import { Panel } from '../ui/PageHeader';
import { ExponentialProgressionChart } from './ExponentialProgressionChart';

interface CareerAchievementsBannerProps {
  db: StudyDatabase;
  onNavigate?: (page: ModuleName) => void;
  onPrintOfficial?: () => void;
  pinnedMedalIds?: string[];
  onTogglePinMedal?: (medalId: string) => void;
  fullPage?: boolean;
}

const TIER_STYLES: Record<
  MedalTier,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
  }
> = {
  bronze: {
    label: 'Bronze',
    color: '#c26a2e',
    bg: 'rgba(194, 106, 46, 0.14)',
    border: 'rgba(194, 106, 46, 0.42)',
  },
  prata: {
    label: 'Prata',
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.14)',
    border: 'rgba(100, 116, 139, 0.42)',
  },
  ouro: {
    label: 'Ouro',
    color: '#ca8a04',
    bg: 'rgba(202, 138, 4, 0.15)',
    border: 'rgba(202, 138, 4, 0.45)',
  },
  diamante: {
    label: 'Diamante',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.15)',
    border: 'rgba(2, 132, 199, 0.45)',
  },
  supremo: {
    label: 'Supremo',
    color: '#9333ea',
    bg: 'rgba(147, 51, 234, 0.15)',
    border: 'rgba(147, 51, 234, 0.45)',
  },
  lendario: {
    label: 'Lendário',
    color: '#dc2626',
    bg: 'rgba(220, 38, 38, 0.14)',
    border: 'rgba(220, 38, 38, 0.46)',
  },
  imortal: {
    label: 'Imortal',
    color: '#059669',
    bg: 'rgba(5, 150, 105, 0.15)',
    border: 'rgba(5, 150, 105, 0.48)',
  },
};

const CATEGORY_LABELS: Record<'todas' | MedalCategory, string> = {
  todas: 'Todas',
  metas: 'Metas',
  horas: 'Horas',
  consistencia: 'Consistência',
  excelencia: 'Excelência',
  dominio: 'Domínio & Lei',
};

function renderCategoryIcon(category: MedalCategory, className = 'w-4 h-4') {
  if (category === 'metas') return <Target className={className} />;
  if (category === 'horas') return <Clock className={className} />;
  if (category === 'consistencia') return <Flame className={className} />;
  if (category === 'dominio') return <BookOpen className={className} />;
  return <Award className={className} />;
}

export const CareerAchievementsBanner: React.FC<CareerAchievementsBannerProps> = React.memo(
  ({
    db,
    onNavigate,
    onPrintOfficial,
    pinnedMedalIds = [],
    onTogglePinMedal,
    fullPage = false,
  }) => {
    const summary = useMemo(() => computeCareerSummary(db), [db]);

    const [categoryFilter, setCategoryFilter] = useState<'todas' | MedalCategory>('todas');
    const [tierFilter, setTierFilter] = useState<'todos' | 'alta' | MedalTier>('todos');
    const [medalSearch, setMedalSearch] = useState('');
    const [onlyUnlocked, setOnlyUnlocked] = useState(false);
    const [onlyPinned, setOnlyPinned] = useState(false);
    const [showAllMedals, setShowAllMedals] = useState(fullPage);
    const [showCareerTrack, setShowCareerTrack] = useState(fullPage);
    const [showXpBreakdown, setShowXpBreakdown] = useState(false);
    const [selectedTierIdx, setSelectedTierIdx] = useState<number>(summary.currentLevel.tierIndex);
    const [trackViewMode, setTrackViewMode] = useState<'patente' | 'proximos' | 'promocoes' | 'conquistados'>('patente');
    const [levelSearch, setLevelSearch] = useState('');
    const [highlightedLevel, setHighlightedLevel] = useState<number | null>(null);

    const pinnedSet = useMemo(() => new Set(pinnedMedalIds), [pinnedMedalIds]);

    const milestoneByLevel = useMemo(
      () => new Map<number, LevelMilestone>(summary.levelMilestones.map((m) => [m.level, m])),
      [summary.levelMilestones],
    );

    const activeRankGroup = useMemo(
      () =>
        summary.rankGroups.find((g) => g.tierIndex === selectedTierIdx) || summary.rankGroups[0],
      [selectedTierIdx, summary.rankGroups],
    );

    const displayedLevels = useMemo<CareerLevelDefinition[]>(() => {
      const q = levelSearch.trim().toLowerCase();
      if (q) {
        return summary.allLevels.filter((lvl) => {
          const m = milestoneByLevel.get(lvl.level);
          const hay = `nv ${lvl.level} nivel ${lvl.level} ${lvl.title} ${lvl.rankGroup} ${m?.title || ''} ${m?.requirementLabel || ''}`.toLowerCase();
          return hay.includes(q);
        });
      }
      if (trackViewMode === 'promocoes') {
        return summary.allLevels.filter((lvl) => lvl.isPromotionGate);
      }
      if (trackViewMode === 'proximos') {
        return summary.allLevels
          .filter((lvl) => {
            const m = milestoneByLevel.get(lvl.level);
            return m ? !m.completed : summary.totalXp < lvl.minXp;
          })
          .slice(0, 12);
      }
      if (trackViewMode === 'conquistados') {
        return summary.allLevels.filter((lvl) => {
          const m = milestoneByLevel.get(lvl.level);
          return Boolean(m?.completed);
        });
      }
      return summary.allLevels.filter((lvl) => lvl.tierIndex === selectedTierIdx);
    }, [levelSearch, milestoneByLevel, selectedTierIdx, summary.allLevels, summary.totalXp, trackViewMode]);

    const handleSelectLevelFromChart = (level: number) => {
      const targetLvl = summary.allLevels[level - 1];
      if (!targetLvl) return;
      setTrackViewMode('patente');
      setLevelSearch('');
      setSelectedTierIdx(targetLvl.tierIndex);
      setHighlightedLevel(level);
      setShowCareerTrack(true);
    };

    const filteredMedals = useMemo<MeritMedal[]>(() => {
      const q = medalSearch.trim().toLowerCase();
      const base = summary.medals.filter((m) => {
        if (categoryFilter !== 'todas' && m.category !== categoryFilter) return false;
        if (tierFilter === 'alta') {
          if (m.tier !== 'supremo' && m.tier !== 'lendario' && m.tier !== 'imortal') return false;
        } else if (tierFilter !== 'todos' && m.tier !== tierFilter) {
          return false;
        }
        if (onlyUnlocked && !m.unlocked) return false;
        if (onlyPinned && !pinnedSet.has(m.id)) return false;
        if (q) {
          const hay = `${m.title} ${m.description} ${MEDAL_TIER_LABELS[m.tier]}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      const tierOrder: Record<MedalTier, number> = {
        imortal: 7,
        lendario: 6,
        supremo: 5,
        diamante: 4,
        ouro: 3,
        prata: 2,
        bronze: 1,
      };
      return [...base].sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        if (a.unlocked && b.unlocked) {
          const aPinned = pinnedSet.has(a.id) ? 1 : 0;
          const bPinned = pinnedSet.has(b.id) ? 1 : 0;
          if (aPinned !== bPinned) return bPinned - aPinned;
          return tierOrder[b.tier] - tierOrder[a.tier];
        }
        if (b.progressPct !== a.progressPct) {
          return b.progressPct - a.progressPct;
        }
        return tierOrder[a.tier] - tierOrder[b.tier];
      });
    }, [categoryFilter, medalSearch, onlyPinned, onlyUnlocked, pinnedSet, summary.medals, tierFilter]);

    const initialLimit = fullPage ? 12 : 6;
    const visibleMedals = showAllMedals ? filteredMedals : filteredMedals.slice(0, initialLimit);
    const maxXpSource = Math.max(1, ...summary.xpSources.map((s) => s.xp));
    const highDifficultyUnlockedCount = useMemo(
      () =>
        summary.medals.filter(
          (m) =>
            m.unlocked && (m.tier === 'supremo' || m.tier === 'lendario' || m.tier === 'imortal'),
        ).length,
      [summary.medals],
    );
    const highDifficultyTotalCount = useMemo(
      () =>
        summary.medals.filter(
          (m) => m.tier === 'supremo' || m.tier === 'lendario' || m.tier === 'imortal',
        ).length,
      [summary.medals],
    );

    return (
      <Panel
        className="mb-4"
        title="Carreira do Concurseiro & Medalhas de Mérito"
        subtitle={`Progressão exponencial (+${summary.xpGrowthRatePct}% compostos/nível) até o Nível 100, com 100 marcos de conquista exclusivos, 10 exames de promoção e 80 medalhas.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {onPrintOfficial && (
              <button
                type="button"
                onClick={onPrintOfficial}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                title="Imprimir Portaria Oficial de Promoção e Quadro de Condecorações em folha A4"
              >
                <Printer className="w-3.5 h-3.5 text-[var(--accent)]" />
                Imprimir Portaria (A4)
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowXpBreakdown((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showXpBreakdown
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[var(--accent)]" />
              Raio-X do XP
              {showXpBreakdown ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowCareerTrack((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showCareerTrack
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-[var(--warning)]" />
              Trilha (100 níveis)
              {showCareerTrack ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        }
      >
        {/* Top Career Rank + XP Progress Row */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4 pb-4 border-b border-[var(--line)]">
          {/* Left: Rank Badge & Dual Progress Bars */}
          <div className="flex flex-col justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl border border-[var(--accent)]/45 bg-[var(--accent-soft)] grid place-items-center shrink-0">
                <Trophy className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                  <span className="font-mono-num font-extrabold text-[var(--accent)]">
                    Nível {summary.currentLevel.level} de {summary.allLevels.length}
                  </span>
                  <span className="text-[var(--muted)]" aria-hidden="true">·</span>
                  <span className="font-semibold text-[var(--text)]">
                    Patente {summary.currentLevel.rankGroup}
                  </span>
                  <span className="text-[var(--muted)]" aria-hidden="true">·</span>
                  <span className="font-mono-num font-bold text-[var(--text)]">
                    {summary.totalXp.toLocaleString('pt-BR')} XP
                  </span>
                  <span className="text-[var(--muted)]" aria-hidden="true">·</span>
                  <span className="font-mono-num font-semibold text-[var(--muted)]">
                    Fator {summary.currentLevel.difficultyMultiplier.toLocaleString('pt-BR')}×
                  </span>
                  {summary.xpBreakdown.milestonesBonusXp > 0 && (
                    <>
                      <span className="text-[var(--muted)]" aria-hidden="true">·</span>
                      <span className="font-mono-num font-semibold text-[var(--good)]">
                        +{summary.xpBreakdown.milestonesBonusXp.toLocaleString('pt-BR')} XP em marcos
                      </span>
                    </>
                  )}
                </div>
                <h3 className="m-0 mt-0.5 font-display text-[19px] font-extrabold text-[var(--text)] leading-tight truncate">
                  {summary.currentLevel.title}
                </h3>
                <p className="m-0 mt-0.5 text-[12px] text-[var(--muted)]">
                  {summary.currentLevel.subtitle} · Grau de exigência:{' '}
                  <strong className="text-[var(--text)]">{summary.currentLevel.difficultyLabel}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {/* Next Level Progress */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] mb-1">
                  {summary.nextLevel ? (
                    <>
                      <span className="text-[var(--muted)]">
                        Próximo nível:{' '}
                        <strong className="text-[var(--text)]">
                          Nv. {summary.nextLevel.level} · {summary.nextLevel.title}
                        </strong>
                        <span className="font-mono-num text-[var(--muted)] ml-1">
                          (Δ +{summary.nextLevel.xpDelta.toLocaleString('pt-BR')} XP · {summary.nextLevel.difficultyMultiplier.toLocaleString('pt-BR')}×)
                        </span>
                      </span>
                      <span className="font-mono-num font-bold text-[var(--accent)]">
                        {summary.levelProgressPct}% · faltam{' '}
                        {summary.xpRemaining.toLocaleString('pt-BR')} XP
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[var(--good)] font-bold inline-flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        Nível 100 alcançado — Topo supremo da carreira!
                      </span>
                      <span className="font-mono-num font-bold text-[var(--good)]">100%</span>
                    </>
                  )}
                </div>
                <div
                  className="h-2.5 w-full rounded-full border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden"
                  role="progressbar"
                  aria-valuenow={summary.levelProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progresso para o próximo nível de carreira"
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                    style={{ width: `${Math.max(3, summary.levelProgressPct)}%` }}
                  />
                </div>
              </div>

              {/* Overall Journey to Level 100 */}
              <div className="pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-num mb-1">
                  <span className="text-[var(--muted)]">
                    Jornada exponencial até o{' '}
                    <strong className="text-[var(--text)]">
                      Nível 100 ({summary.level100MinXp.toLocaleString('pt-BR')} XP)
                    </strong>
                    {' · '}
                    <strong className="text-[var(--text)]">
                      {summary.completedMilestonesCount}/100 marcos
                    </strong>
                  </span>
                  <span className="font-bold text-[var(--text)]">
                    {summary.overallLevel100Pct}%{' '}
                    {summary.xpToLevel100 > 0 && (
                      <span className="font-normal text-[var(--muted)]">
                        · faltam {summary.xpToLevel100.toLocaleString('pt-BR')} XP
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--panel-soft)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--good)] transition-all duration-300"
                    style={{ width: `${Math.max(2, summary.overallLevel100Pct)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right: 4 Achievement Pillars */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]">
                <Target className="w-3.5 h-3.5 text-[var(--good)]" />
                Metas Batidas
              </div>
              <div className="font-mono-num text-[20px] font-extrabold text-[var(--text)] mt-1">
                {summary.metrics.completedGoals.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] font-mono-num text-[var(--muted)]">
                +{summary.xpBreakdown.goalsXp.toLocaleString('pt-BR')} XP
              </div>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]">
                <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                Horas Acumuladas
              </div>
              <div className="font-mono-num text-[20px] font-extrabold text-[var(--text)] mt-1">
                {formatClock(summary.metrics.totalStudySeconds)}
              </div>
              <div className="text-[11px] font-mono-num text-[var(--muted)]">
                +{summary.xpBreakdown.hoursXp.toLocaleString('pt-BR')} XP
              </div>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]">
                <Flame className="w-3.5 h-3.5 text-[var(--warning)]" />
                Consistência
              </div>
              <div className="font-mono-num text-[20px] font-extrabold text-[var(--text)] mt-1">
                {summary.metrics.currentStreak}d
                <span className="text-[11.5px] font-semibold text-[var(--muted)] ml-1.5">
                  (máx {summary.metrics.bestStreak}d)
                </span>
              </div>
              <div className="text-[11px] font-mono-num text-[var(--muted)]">
                {summary.metrics.activeDaysTotal} dia(s) ativo(s)
              </div>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)]">
                <Medal className="w-3.5 h-3.5 text-[var(--warning)]" />
                Medalhas &amp; Elite
              </div>
              <div className="font-mono-num text-[20px] font-extrabold text-[var(--text)] mt-1">
                {summary.unlockedMedalsCount}
                <span className="text-[13px] font-bold text-[var(--muted)]">
                  /{summary.medals.length}
                </span>
              </div>
              <div className="text-[11px] font-mono-num text-[var(--good)]">
                {highDifficultyUnlockedCount}/{highDifficultyTotalCount} de alta dificuldade
              </div>
            </div>
          </div>
        </div>

        {/* Expandable XP Breakdown (Raio-X do XP) */}
        {showXpBreakdown && (
          <div className="py-4 border-b border-[var(--line)]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="m-0 text-[12.5px] font-extrabold text-[var(--text)]">
                  Raio-X de Origem do XP
                </h4>
                <p className="m-0 text-[11.5px] text-[var(--muted)]">
                  Composição integral dos {summary.totalXp.toLocaleString('pt-BR')} XP acumulados
                  entre estudos, revisões espaçadas, missões semanais e bônus de medalhas.
                </p>
              </div>
              <div className="text-[11px] font-mono-num text-[var(--muted)]">
                Bônus: Bronze +50 · Prata +120 · Ouro +250 · Diamante +500 · Supremo +1.000 · Lendário +2.500 · Imortal +5.000
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-2.5">
              {summary.xpSources.map((src) => {
                const widthPct = src.xp > 0 ? Math.max(4, Math.round((src.xp / maxXpSource) * 100)) : 0;
                return (
                  <div
                    key={src.id}
                    className="flex flex-col gap-1 py-1.5 border-b border-[var(--line)]/60"
                  >
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <div className="min-w-0 flex items-center gap-1.5">
                        <strong className="text-[var(--text)] truncate">{src.label}</strong>
                        <span className="text-[11px] text-[var(--subtle)] hidden sm:inline">
                          · {src.formula}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono-num">
                        <span className="font-extrabold text-[var(--text)]">
                          +{src.xp.toLocaleString('pt-BR')} XP
                        </span>
                        <span className="text-[11px] text-[var(--muted)] w-8 text-right">
                          {src.sharePct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--panel-soft)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                      <span>{src.detail}</span>
                      {onNavigate && src.targetModule !== 'Carreira & Mérito' && (
                        <button
                          type="button"
                          onClick={() => onNavigate(src.targetModule)}
                          className="text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0 whitespace-nowrap"
                        >
                          Ir para {src.targetModule}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Exponential Progression Chart + 100 Per-Level Milestones Track */}
        {showCareerTrack && (
          <>
            <ExponentialProgressionChart
              levels={summary.allLevels}
              milestones={summary.levelMilestones}
              currentLevel={summary.currentLevel.level}
              totalXp={summary.totalXp}
              xpGrowthRatePct={summary.xpGrowthRatePct}
              onSelectLevel={handleSelectLevelFromChart}
            />

            <div className="py-4 border-b border-[var(--line)]">
              <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
                <div>
                  <h4 className="m-0 text-[12.5px] font-extrabold text-[var(--text)] inline-flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-[var(--warning)]" />
                    Marcos de Conquista por Nível (1 a 100 · Escala Exponencial)
                  </h4>
                  <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
                    Cada nível possui um marco objetivo cuja exigência e recompensa crescem exponencialmente até o Nível 100 ({summary.completedMilestonesCount}/100 conquistados · +{summary.xpBreakdown.milestonesBonusXp.toLocaleString('pt-BR')} XP).
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={levelSearch}
                      onChange={(e) => setLevelSearch(e.target.value)}
                      placeholder="Buscar nível ou marco..."
                      aria-label="Buscar nível ou marco de conquista"
                      className="h-[28px] pl-7 pr-2.5 w-[165px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="inline-flex flex-wrap rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                    {(
                      [
                        { id: 'patente', label: 'Por Patente' },
                        { id: 'proximos', label: 'Próximos' },
                        { id: 'promocoes', label: 'Promoções (10–100)' },
                        { id: 'conquistados', label: `Conquistados (${summary.completedMilestonesCount})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setTrackViewMode(tab.id);
                          setLevelSearch('');
                        }}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                          trackViewMode === tab.id && !levelSearch.trim()
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Spotlight: Next Pending Level Milestone + Next Patente Promotion Gate */}
              {(summary.nextPendingMilestone || summary.nextPromotionMilestone) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
                  {summary.nextPendingMilestone && (
                    <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 flex flex-col justify-between gap-2">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono-num font-extrabold text-[var(--accent)]">
                            Próximo Marco · Nível {summary.nextPendingMilestone.level} ({summary.nextPendingMilestone.difficultyMultiplier.toLocaleString('pt-BR')}×)
                          </span>
                          <span className="font-mono-num font-bold text-[var(--good)]">
                            +{summary.nextPendingMilestone.bonusXp.toLocaleString('pt-BR')} XP
                          </span>
                        </div>
                        <div className="text-[13px] font-bold text-[var(--text)] mt-0.5">
                          {summary.nextPendingMilestone.title}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] mt-0.5">
                          {summary.nextPendingMilestone.remainingLabel}
                        </div>
                      </div>
                      <div>
                        <div className="h-1.5 w-full rounded-full bg-[var(--panel)] overflow-hidden mb-1.5">
                          <div
                            className="h-full rounded-full bg-[var(--accent)] transition-all"
                            style={{ width: `${Math.max(3, summary.nextPendingMilestone.progressPct)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono-num text-[var(--muted)]">
                            {summary.nextPendingMilestone.progressLabel} ({summary.nextPendingMilestone.progressPct}%)
                          </span>
                          {onNavigate && summary.nextPendingMilestone.targetModule !== 'Carreira & Mérito' && (
                            <button
                              type="button"
                              onClick={() => onNavigate(summary.nextPendingMilestone!.targetModule)}
                              className="inline-flex items-center gap-1 font-bold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0 whitespace-nowrap"
                            >
                              <span>Ir para {summary.nextPendingMilestone.targetModule}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {summary.nextPromotionMilestone && (
                    <div className="rounded-xl border border-[var(--warning)]/55 bg-[var(--panel-soft)] p-3 flex flex-col justify-between gap-2">
                      <div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono-num font-extrabold text-[var(--warning)]">
                            Próximo Exame de Promoção · Nível {summary.nextPromotionMilestone.level} ({summary.nextPromotionMilestone.difficultyMultiplier.toLocaleString('pt-BR')}×)
                          </span>
                          <span className="font-mono-num font-bold text-[var(--good)]">
                            +{summary.nextPromotionMilestone.bonusXp.toLocaleString('pt-BR')} XP
                          </span>
                        </div>
                        <div className="text-[13px] font-bold text-[var(--text)] mt-0.5">
                          {summary.nextPromotionMilestone.title}
                        </div>
                        {summary.nextPromotionMilestone.subCriteria && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] font-mono-num">
                            {summary.nextPromotionMilestone.subCriteria.map((c) => (
                              <span
                                key={c.label}
                                className={c.met ? 'text-[var(--good)] font-bold' : 'text-[var(--muted)]'}
                              >
                                {c.met ? '✓' : '○'} {c.label}: {c.currentLabel}/{c.targetLabel}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="h-1.5 w-full rounded-full bg-[var(--panel)] overflow-hidden mb-1.5">
                          <div
                            className="h-full rounded-full bg-[var(--warning)] transition-all"
                            style={{ width: `${Math.max(3, summary.nextPromotionMilestone.progressPct)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono-num text-[var(--muted)]">
                            {summary.nextPromotionMilestone.progressLabel} ({summary.nextPromotionMilestone.progressPct}%)
                          </span>
                          {onNavigate && (
                            <button
                              type="button"
                              onClick={() => onNavigate(summary.nextPromotionMilestone!.targetModule)}
                              className="inline-flex items-center gap-1 font-bold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0 whitespace-nowrap"
                            >
                              <span>Avançar em {summary.nextPromotionMilestone.targetModule}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 10 Patentes Selector (visible when viewing by Patente) */}
              {trackViewMode === 'patente' && !levelSearch.trim() && (
                <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5 mb-3">
                  {summary.rankGroups.map((group) => {
                    const groupLevels = summary.allLevels.filter((l) => l.tierIndex === group.tierIndex);
                    const reachedCount = groupLevels.filter((l) => summary.totalXp >= l.minXp).length;
                    const milestonesDone = groupLevels.filter((l) => milestoneByLevel.get(l.level)?.completed).length;
                    const isSelected = selectedTierIdx === group.tierIndex;
                    const isCurrentGroup = summary.currentLevel.tierIndex === group.tierIndex;
                    const isCompletedGroup = reachedCount === groupLevels.length && milestonesDone === groupLevels.length;

                    return (
                      <button
                        key={group.tierIndex}
                        type="button"
                        onClick={() => {
                          setSelectedTierIdx(group.tierIndex);
                          setHighlightedLevel(null);
                        }}
                        className={`rounded-lg border px-2 py-2 text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : isCurrentGroup
                              ? 'border-[var(--accent)]/50 bg-[var(--panel-soft)] hover:border-[var(--accent)]'
                              : isCompletedGroup
                                ? 'border-[var(--good)]/45 bg-[var(--panel-soft)] hover:border-[var(--accent)]'
                                : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 font-mono-num text-[10px] font-extrabold">
                          <span className={isSelected || isCurrentGroup ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}>
                            {group.roman}
                          </span>
                          <span className={milestonesDone === 10 ? 'text-[var(--good)]' : 'text-[var(--muted)]'}>
                            {milestonesDone}/10
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-[var(--text)] truncate mt-0.5" title={group.name}>
                          {group.shortName}
                        </div>
                        <div className="font-mono-num text-[9.5px] text-[var(--muted)] mt-0.5">
                          Nv. {group.startLevel}–{group.endLevel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active View Header & Detailed Level + Milestone Cards */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                {trackViewMode === 'patente' && !levelSearch.trim() && activeRankGroup && (
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 pb-2 border-b border-[var(--line)]">
                    <div>
                      <span className="font-mono-num text-[11px] font-extrabold text-[var(--accent)]">
                        Patente {activeRankGroup.roman} · Níveis {activeRankGroup.startLevel} a {activeRankGroup.endLevel}
                      </span>
                      <span className="text-[var(--muted)] mx-1.5" aria-hidden="true">·</span>
                      <strong className="text-[13px] font-extrabold text-[var(--text)]">
                        {activeRankGroup.name}
                      </strong>
                      <span className="text-[11.5px] text-[var(--muted)] block sm:inline sm:ml-2">
                        — {activeRankGroup.subtitle}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-[var(--muted)] whitespace-nowrap">
                      Exigência: <strong className="text-[var(--text)]">{activeRankGroup.difficultyLabel}</strong>
                    </span>
                  </div>
                )}

                {displayedLevels.length === 0 ? (
                  <div className="py-5 text-center text-[12px] text-[var(--muted)]">
                    Nenhum nível ou marco encontrado para o filtro atual.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {displayedLevels.map((lvl) => {
                      const reachedXp = summary.totalXp >= lvl.minXp;
                      const isCurrent = summary.currentLevel.level === lvl.level;
                      const isHighlighted = highlightedLevel === lvl.level;
                      const milestone = milestoneByLevel.get(lvl.level);
                      const milestoneDone = Boolean(milestone?.completed);

                      return (
                        <div
                          key={lvl.level}
                          className={`rounded-lg border p-3 text-[11.5px] flex flex-col justify-between gap-2 transition-colors ${
                            isHighlighted
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
                              : isCurrent
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                                : lvl.isPromotionGate
                                  ? milestoneDone
                                    ? 'border-[var(--good)]/60 bg-[var(--panel)]'
                                    : 'border-[var(--warning)]/55 bg-[var(--panel)]'
                                  : reachedXp && milestoneDone
                                    ? 'border-[var(--good)]/45 bg-[var(--panel)]'
                                    : 'border-[var(--line)] bg-[var(--panel)]/85'
                          }`}
                        >
                          <div>
                            {/* Row 1: Level, Multiplier, Cumulative XP & Exponential Step */}
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 font-mono-num text-[10.5px]">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`font-extrabold ${
                                    isCurrent
                                      ? 'text-[var(--accent)]'
                                      : lvl.isPromotionGate
                                        ? 'text-[var(--warning)]'
                                        : 'text-[var(--text)]'
                                  }`}
                                >
                                  NV. {lvl.level}
                                </span>
                                <span className="text-[var(--muted)]" aria-hidden="true">·</span>
                                <span className="text-[var(--muted)]">
                                  {lvl.difficultyMultiplier.toLocaleString('pt-BR')}×
                                </span>
                                {lvl.isPromotionGate && (
                                  <>
                                    <span className="text-[var(--muted)]" aria-hidden="true">·</span>
                                    <span className="font-bold text-[var(--warning)]">
                                      Promoção de Patente
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={reachedXp ? 'font-bold text-[var(--good)]' : 'font-bold text-[var(--text)]'}>
                                  {lvl.minXp.toLocaleString('pt-BR')} XP
                                </span>
                                {lvl.xpDelta > 0 && (
                                  <span className="text-[10px] text-[var(--muted)]">
                                    (+{lvl.xpDelta.toLocaleString('pt-BR')})
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Rank Title */}
                            <div className="font-bold text-[12.5px] text-[var(--text)] mt-0.5 truncate" title={lvl.title}>
                              {lvl.title}
                            </div>

                            {/* Row 3: Exponential Milestone for this Level */}
                            {milestone && (
                              <div className="mt-2 pt-2 border-t border-[var(--line)]">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-[11.5px] font-semibold text-[var(--text)] leading-snug">
                                    {milestone.title}
                                  </div>
                                  <span
                                    className={`font-mono-num text-[10.5px] font-extrabold shrink-0 ${
                                      milestoneDone ? 'text-[var(--good)]' : 'text-[var(--accent)]'
                                    }`}
                                  >
                                    +{milestone.bonusXp.toLocaleString('pt-BR')} XP
                                  </span>
                                </div>

                                {milestone.subCriteria && (
                                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[10.5px] font-mono-num">
                                    {milestone.subCriteria.map((c) => (
                                      <span
                                        key={c.label}
                                        className={c.met ? 'text-[var(--good)] font-bold' : 'text-[var(--muted)]'}
                                      >
                                        {c.met ? '✓' : '○'} {c.currentLabel}/{c.targetLabel}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {milestone && (
                            <div>
                              <div className="h-1.5 w-full rounded-full bg-[var(--panel-soft)] overflow-hidden mb-1">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.max(milestoneDone ? 100 : 3, milestone.progressPct)}%`,
                                    backgroundColor: milestoneDone
                                      ? 'var(--good)'
                                      : lvl.isPromotionGate
                                        ? 'var(--warning)'
                                        : 'var(--accent)',
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono-num">
                                <span
                                  className={
                                    milestoneDone
                                      ? 'font-bold text-[var(--good)] inline-flex items-center gap-1'
                                      : 'text-[var(--muted)]'
                                  }
                                >
                                  {milestoneDone && <CheckCircle2 className="w-3 h-3" />}
                                  {milestoneDone
                                    ? 'Marco conquistado'
                                    : `${milestone.progressLabel} · ${milestone.progressPct}%`}
                                </span>
                                {!milestoneDone && onNavigate && milestone.targetModule !== 'Carreira & Mérito' && (
                                  <button
                                    type="button"
                                    onClick={() => onNavigate(milestone.targetModule)}
                                    className="font-sans font-bold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0 whitespace-nowrap"
                                  >
                                    Abrir {milestone.targetModule}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Missões da Semana (4 Regular + 1 Desafio de Elite de Alta Dificuldade) */}
        <div className="py-4 border-b border-[var(--line)]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="m-0 text-[12.5px] font-extrabold text-[var(--text)] inline-flex items-center gap-1.5">
                <CalendarCheck2 className="w-4 h-4 text-[var(--accent)]" />
                Missões da Semana &amp; Desafio de Elite
              </h4>
              <span className="text-[11.5px] text-[var(--muted)] font-mono-num">
                {summary.weekRangeLabel} ·{' '}
                {summary.daysLeftInWeek === 0
                  ? 'Encerra hoje'
                  : summary.daysLeftInWeek === 1
                    ? 'Falta 1 dia'
                    : `Faltam ${summary.daysLeftInWeek} dias`}
              </span>
            </div>
            <div className="text-[11.5px] font-mono-num text-[var(--muted)]">
              <strong className="text-[var(--text)]">
                {summary.weeklyCompletedCount}/{summary.weeklyMissions.length}
              </strong>{' '}
              concluídas esta semana ·{' '}
              <span className="text-[var(--good)] font-bold">
                +{summary.xpBreakdown.weeklyMissionsXp.toLocaleString('pt-BR')} XP acumulados
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {summary.weeklyMissions.map((mission) => (
              <div
                key={mission.id}
                className={`rounded-xl border p-3 flex flex-col justify-between gap-2 ${
                  mission.completed
                    ? 'border-[var(--good)]/55 bg-[var(--panel-soft)]'
                    : mission.isElite
                      ? 'border-[var(--warning)]/55 bg-[var(--panel-soft)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-[12px] font-bold text-[var(--text)] leading-snug">
                      {mission.title}
                    </strong>
                    {mission.completed ? (
                      <CheckCircle2
                        className="w-4 h-4 text-[var(--good)] shrink-0"
                        aria-label="Missão concluída"
                      />
                    ) : (
                      <span
                        className={`font-mono-num text-[11px] font-extrabold shrink-0 ${
                          mission.isElite ? 'text-[var(--warning)]' : 'text-[var(--accent)]'
                        }`}
                      >
                        +{mission.xpReward} XP
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-1 text-[11px] text-[var(--muted)] leading-snug">
                    {mission.description}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono-num mb-1">
                    <span
                      className={
                        mission.completed ? 'font-bold text-[var(--good)]' : 'text-[var(--muted)]'
                      }
                    >
                      {mission.completed ? `Concluída (+${mission.xpReward} XP)` : mission.remainingLabel}
                    </span>
                    <span className="font-bold text-[var(--text)] shrink-0">{mission.progressLabel}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--panel)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(mission.completed ? 100 : 3, mission.progressPct)}%`,
                        backgroundColor: mission.completed
                          ? 'var(--good)'
                          : mission.isElite
                            ? 'var(--warning)'
                            : 'var(--accent)',
                      }}
                    />
                  </div>
                  {!mission.completed && onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate(mission.targetModule)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0"
                    >
                      <span>Abrir {mission.targetModule}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rota para o Nível 100 · Objetivos de Alta Dificuldade (Supremo / Lendário / Imortal) */}
        {summary.highDifficultyTargets.length > 0 && (
          <div className="py-4 border-b border-[var(--line)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <div>
                <h4 className="m-0 text-[12.5px] font-extrabold text-[var(--text)] inline-flex items-center gap-1.5">
                  <Mountain className="w-4 h-4 text-[var(--accent)]" />
                  Rota para o Nível 100 · Objetivos de Alta Dificuldade
                </h4>
                <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
                  Grandes marcos Supremo (+1.000 XP), Lendário (+2.500 XP) e Imortal (+5.000 XP) que impulsionam sua subida às patentes superiores.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTierFilter('alta');
                  setCategoryFilter('todas');
                  setOnlyUnlocked(false);
                  setShowAllMedals(true);
                }}
                className="text-[11.5px] font-bold text-[var(--accent)] hover:underline whitespace-nowrap cursor-pointer bg-transparent border-0 p-0"
              >
                Filtrar todos ({highDifficultyTotalCount})
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {summary.highDifficultyTargets.map((medal) => {
                const tierStyle = TIER_STYLES[medal.tier];
                return (
                  <div
                    key={medal.id}
                    className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-bold text-[var(--text)] truncate">
                            {medal.title}
                          </div>
                          <div className="text-[11px] text-[var(--muted)] mt-0.5">
                            <span style={{ color: tierStyle.color }} className="font-extrabold">
                              {MEDAL_TIER_LABELS[medal.tier]}
                            </span>
                            <span aria-hidden="true"> · </span>
                            <span>{CATEGORY_LABELS[medal.category]}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono-num font-bold text-[var(--text)]">
                              +{medal.bonusXp.toLocaleString('pt-BR')} XP
                            </span>
                          </div>
                        </div>
                        <span className="font-mono-num text-[12px] font-extrabold text-[var(--accent)] shrink-0">
                          {medal.progressPct}%
                        </span>
                      </div>
                      <p className="m-0 mt-1.5 text-[11px] text-[var(--muted)] leading-snug">
                        {medal.description}
                      </p>
                    </div>

                    <div>
                      <div className="h-1.5 w-full rounded-full bg-[var(--panel)] overflow-hidden mb-1.5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(3, medal.progressPct)}%`,
                            backgroundColor: tierStyle.color,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono-num text-[var(--muted)] truncate">
                          {medal.progressLabel}
                        </span>
                        {onNavigate && medal.targetModule !== 'Carreira & Mérito' && (
                          <button
                            type="button"
                            onClick={() => onNavigate(medal.targetModule)}
                            className="inline-flex items-center gap-1 font-bold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0 whitespace-nowrap shrink-0"
                          >
                            <span>Ir para {medal.targetModule}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Seção "Quase Lá" — Próximas de Desbloquear */}
        {summary.almostThereMedals.length > 0 && (
          <div className="py-4 border-b border-[var(--line)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h4 className="m-0 text-[12.5px] font-extrabold text-[var(--text)] inline-flex items-center gap-1.5">
                <Target className="w-4 h-4 text-[var(--warning)]" />
                Quase Lá · Próximas Condecorações
              </h4>
              <span className="text-[11.5px] text-[var(--muted)]">
                As 3 medalhas bloqueadas mais próximas de serem conquistadas agora
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {summary.almostThereMedals.map((medal) => {
                const tierStyle = TIER_STYLES[medal.tier];
                return (
                  <div
                    key={medal.id}
                    className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-bold text-[var(--text)] truncate">
                            {medal.title}
                          </div>
                          <div className="text-[11px] text-[var(--muted)] mt-0.5">
                            <span style={{ color: tierStyle.color }} className="font-bold">
                              {MEDAL_TIER_LABELS[medal.tier]}
                            </span>
                            <span aria-hidden="true"> · </span>
                            <span>{CATEGORY_LABELS[medal.category]}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono-num font-bold text-[var(--text)]">
                              +{medal.bonusXp.toLocaleString('pt-BR')} XP
                            </span>
                          </div>
                        </div>
                        <span className="font-mono-num text-[12px] font-extrabold text-[var(--accent)] shrink-0">
                          {medal.progressPct}%
                        </span>
                      </div>
                      <div className="mt-2 text-[11.5px] font-semibold text-[var(--text)]">
                        {medal.remainingLabel}
                      </div>
                    </div>

                    <div>
                      <div className="h-1.5 w-full rounded-full bg-[var(--panel)] overflow-hidden mb-2">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-all"
                          style={{ width: `${Math.max(4, medal.progressPct)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono-num text-[var(--muted)]">
                          {medal.progressLabel}
                        </span>
                        {onNavigate && medal.targetModule !== 'Carreira & Mérito' && (
                          <button
                            type="button"
                            onClick={() => onNavigate(medal.targetModule)}
                            className="inline-flex items-center gap-1 font-bold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0 whitespace-nowrap"
                          >
                            <span>Ir para {medal.targetModule}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Merit Medals Section (80 Medals across 7 Tiers) */}
        <div className="pt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="m-0 text-[12.5px] font-extrabold text-[var(--text)] inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
                Quadro de Medalhas de Mérito ({summary.medals.length})
              </h4>
              <span className="text-[11.5px] text-[var(--muted)] font-mono-num">
                Vitrine: {summary.pinnedMedals.length}/{MAX_PINNED_MEDALS} fixada(s)
              </span>
              <div className="inline-flex flex-wrap rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                {(['todas', 'metas', 'horas', 'consistencia', 'excelencia', 'dominio'] as const).map(
                  (cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        categoryFilter === cat
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={medalSearch}
                  onChange={(e) => setMedalSearch(e.target.value)}
                  placeholder="Buscar objetivo..."
                  aria-label="Buscar medalha ou objetivo"
                  className="h-[28px] pl-7 pr-2.5 w-[155px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <select
                aria-label="Filtrar medalhas por grau"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as 'todos' | 'alta' | MedalTier)}
                className="h-[28px] px-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]"
              >
                <option value="todos">Todos os graus</option>
                <option value="alta">Alta Dificuldade (Supremo+)</option>
                <option value="bronze">Bronze (+50 XP)</option>
                <option value="prata">Prata (+120 XP)</option>
                <option value="ouro">Ouro (+250 XP)</option>
                <option value="diamante">Diamante (+500 XP)</option>
                <option value="supremo">Supremo (+1.000 XP)</option>
                <option value="lendario">Lendário (+2.500 XP)</option>
                <option value="imortal">Imortal (+5.000 XP)</option>
              </select>

              <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--muted)] cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={onlyUnlocked}
                  onChange={(e) => setOnlyUnlocked(e.target.checked)}
                  className="accent-[var(--accent)] w-3.5 h-3.5"
                />
                Só conquistadas ({summary.unlockedMedalsCount})
              </label>

              {summary.pinnedMedals.length > 0 && (
                <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--muted)] cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={onlyPinned}
                    onChange={(e) => setOnlyPinned(e.target.checked)}
                    className="accent-[var(--accent)] w-3.5 h-3.5"
                  />
                  Vitrine ({summary.pinnedMedals.length})
                </label>
              )}

              {filteredMedals.length > initialLimit && (
                <button
                  type="button"
                  onClick={() => setShowAllMedals((prev) => !prev)}
                  className="text-[11.5px] font-bold text-[var(--accent)] hover:underline whitespace-nowrap cursor-pointer bg-transparent border-0 p-0"
                >
                  {showAllMedals
                    ? `Ver resumo (${initialLimit})`
                    : `Ver todas (${filteredMedals.length})`}
                </button>
              )}
            </div>
          </div>

          {visibleMedals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-5 px-4 text-center text-[12px] text-[var(--muted)]">
              Nenhuma medalha encontrada com os filtros atuais. Ajuste os filtros ou continue registrando horas, metas, questões e revisões para desbloquear novas condecorações.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {visibleMedals.map((medal) => {
                const tierStyle = TIER_STYLES[medal.tier];
                const isPinned = pinnedSet.has(medal.id);
                const formattedAwardDate = formatCareerDateBr(medal.unlockedAt);

                return (
                  <div
                    key={medal.id}
                    className={`rounded-xl border p-3 flex flex-col justify-between transition-colors ${
                      medal.unlocked
                        ? 'bg-[var(--panel-soft)]'
                        : 'border-[var(--line)] bg-[var(--panel-soft)]/55 opacity-85'
                    }`}
                    style={medal.unlocked ? { borderColor: tierStyle.border } : undefined}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-8 h-8 rounded-lg border grid place-items-center shrink-0"
                            style={
                              medal.unlocked
                                ? {
                                    backgroundColor: tierStyle.bg,
                                    borderColor: tierStyle.border,
                                    color: tierStyle.color,
                                  }
                                : {
                                    backgroundColor: 'var(--panel)',
                                    borderColor: 'var(--line)',
                                    color: 'var(--muted)',
                                  }
                            }
                          >
                            {medal.unlocked ? (
                              renderCategoryIcon(medal.category, 'w-4 h-4')
                            ) : (
                              <Lock className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-bold text-[var(--text)] truncate">
                              {medal.title}
                            </div>
                            <div className="text-[10.5px] font-semibold text-[var(--muted)] truncate">
                              <span
                                className="font-extrabold"
                                style={{ color: medal.unlocked ? tierStyle.color : tierStyle.color }}
                              >
                                {tierStyle.label}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span>{CATEGORY_LABELS[medal.category]}</span>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono-num">
                                +{medal.bonusXp.toLocaleString('pt-BR')} XP
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {medal.unlocked && onTogglePinMedal && (
                            <button
                              type="button"
                              onClick={() => onTogglePinMedal(medal.id)}
                              title={
                                isPinned
                                  ? 'Remover da Vitrine de Honra (tela inicial)'
                                  : 'Fixar na Vitrine de Honra (até 3 medalhas na tela inicial)'
                              }
                              aria-label={
                                isPinned
                                  ? `Remover ${medal.title} da Vitrine de Honra`
                                  : `Fixar ${medal.title} na Vitrine de Honra`
                              }
                              aria-pressed={isPinned}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                                isPinned
                                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                                  : 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)]'
                              }`}
                            >
                              <Pin className="w-3 h-3" />
                              {isPinned ? 'Vitrine' : 'Fixar'}
                            </button>
                          )}
                          {medal.unlocked ? (
                            <CheckCircle2
                              className="w-4 h-4 shrink-0"
                              style={{ color: tierStyle.color }}
                              aria-label="Medalha conquistada"
                            />
                          ) : (
                            <span className="font-mono-num text-[10.5px] font-bold text-[var(--muted)] shrink-0">
                              {medal.progressPct}%
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="m-0 text-[11px] text-[var(--muted)] leading-snug mb-2">
                        {medal.description}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono-num mb-1">
                        <span
                          className={
                            medal.unlocked ? 'font-bold text-[var(--good)]' : 'text-[var(--muted)]'
                          }
                        >
                          {medal.unlocked
                            ? formattedAwardDate
                              ? `Concedida em ${formattedAwardDate}`
                              : 'Conquistada'
                            : medal.remainingLabel}
                        </span>
                        <span className="font-bold text-[var(--text)] shrink-0">
                          {medal.progressLabel}
                        </span>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-[var(--panel)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(medal.unlocked ? 100 : 3, medal.progressPct)}%`,
                            backgroundColor: medal.unlocked ? tierStyle.color : 'var(--accent)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>
    );
  },
);
