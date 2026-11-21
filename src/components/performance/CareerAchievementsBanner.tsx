import React, { useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Flame,
  Lock,
  Medal,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import { StudyDatabase } from '../../types/study';
import { formatClock } from '../../lib/parsers';
import {
  MedalCategory,
  MedalTier,
  MeritMedal,
  computeCareerSummary,
} from '../../lib/careerGamification';
import { Panel } from '../ui/PageHeader';

interface CareerAchievementsBannerProps {
  db: StudyDatabase;
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
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.14)',
    border: 'rgba(148, 163, 184, 0.42)',
  },
  ouro: {
    label: 'Ouro',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.15)',
    border: 'rgba(234, 179, 8, 0.45)',
  },
  diamante: {
    label: 'Diamante',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.45)',
  },
  supremo: {
    label: 'Supremo',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.16)',
    border: 'rgba(168, 85, 247, 0.48)',
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

export const CareerAchievementsBanner: React.FC<CareerAchievementsBannerProps> = React.memo(({ db }) => {
  const summary = useMemo(() => computeCareerSummary(db), [db]);

  const [categoryFilter, setCategoryFilter] = useState<'todas' | MedalCategory>('todas');
  const [tierFilter, setTierFilter] = useState<'todos' | MedalTier>('todos');
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);
  const [showAllMedals, setShowAllMedals] = useState(false);
  const [showCareerTrack, setShowCareerTrack] = useState(false);

  const filteredMedals = useMemo<MeritMedal[]>(() => {
    const base = summary.medals.filter((m) => {
      if (categoryFilter !== 'todas' && m.category !== categoryFilter) return false;
      if (tierFilter !== 'todos' && m.tier !== tierFilter) return false;
      if (onlyUnlocked && !m.unlocked) return false;
      return true;
    });
    // Sort: unlocked first (highest tier first), then locked closest to completion
    const tierOrder: Record<MedalTier, number> = {
      supremo: 5,
      diamante: 4,
      ouro: 3,
      prata: 2,
      bronze: 1,
    };
    return [...base].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (a.unlocked && b.unlocked) {
        return tierOrder[b.tier] - tierOrder[a.tier];
      }
      if (b.progressPct !== a.progressPct) {
        return b.progressPct - a.progressPct;
      }
      return tierOrder[a.tier] - tierOrder[b.tier];
    });
  }, [categoryFilter, onlyUnlocked, summary.medals, tierFilter]);

  const visibleMedals = showAllMedals ? filteredMedals : filteredMedals.slice(0, 6);

  return (
    <Panel
      className="mb-4"
      title="Carreira do Concurseiro & Medalhas de Mérito"
      subtitle="Progressão automática baseada em metas batidas, horas líquidas acumuladas, consistência diária e evolução nas provas."
      action={
        <button
          type="button"
          onClick={() => setShowCareerTrack((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 transition-colors"
        >
          <Crown className="w-3.5 h-3.5 text-[var(--warning)]" />
          {showCareerTrack ? 'Ocultar trilha' : 'Ver trilha de carreira'}
          {showCareerTrack ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      }
    >
      {/* Top Career Rank + XP Progress Row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4 pb-4 border-b border-[var(--line)]">
        {/* Left: Rank Badge & Progress Bar */}
        <div className="flex flex-col justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl border border-[var(--accent)]/45 bg-[var(--accent-soft)] grid place-items-center shrink-0">
              <Trophy className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono-num text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                  Nível {summary.currentLevel.level} de {summary.allLevels.length}
                </span>
                <span className="text-[11px] text-[var(--muted)]">·</span>
                <span className="font-mono-num text-[11.5px] font-bold text-[var(--text)]">
                  {summary.totalXp.toLocaleString('pt-BR')} XP totais
                </span>
              </div>
              <h3 className="m-0 mt-0.5 font-display text-[19px] font-extrabold text-[var(--text)] leading-tight truncate">
                {summary.currentLevel.title}
              </h3>
              <p className="m-0 mt-0.5 text-[12px] text-[var(--muted)]">
                {summary.currentLevel.subtitle}
              </p>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] mb-1.5">
              {summary.nextLevel ? (
                <>
                  <span className="text-[var(--muted)]">
                    Próximo cargo:{' '}
                    <strong className="text-[var(--text)]">
                      Nv. {summary.nextLevel.level} · {summary.nextLevel.title}
                    </strong>
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
                    Topo da carreira alcançado!
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
        </div>

        {/* Right: 4 Achievement Pillars */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
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
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
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
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
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
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
              <Medal className="w-3.5 h-3.5 text-[var(--warning)]" />
              Medalhas
            </div>
            <div className="font-mono-num text-[20px] font-extrabold text-[var(--text)] mt-1">
              {summary.unlockedMedalsCount}
              <span className="text-[13px] font-bold text-[var(--muted)]">
                /{summary.medals.length}
              </span>
            </div>
            <div className="text-[11px] font-mono-num text-[var(--good)]">
              {Math.round((summary.unlockedMedalsCount / Math.max(1, summary.medals.length)) * 100)}% desbloqueadas
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Career Ladder & XP Rules */}
      {showCareerTrack && (
        <div className="py-3.5 border-b border-[var(--line)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <h4 className="m-0 text-[11.5px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
              Trilha Completa de Carreira (10 Níveis)
            </h4>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-num text-[var(--muted)]">
              <span>Horas: 60 XP/h</span>
              <span>Meta: 45 XP</span>
              <span>Questão: 2 XP (+2 acerto)</span>
              <span>Simulado: 120 XP</span>
              <span>Constância: 30 XP/dia recorde</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {summary.allLevels.map((lvl) => {
              const reached = summary.totalXp >= lvl.minXp;
              const isCurrent = summary.currentLevel.level === lvl.level;
              return (
                <div
                  key={lvl.level}
                  className={`rounded-lg border p-2.5 text-[11.5px] ${
                    isCurrent
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : reached
                        ? 'border-[var(--good)]/40 bg-[var(--panel-soft)]'
                        : 'border-[var(--line)] bg-[var(--panel-soft)] opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 font-mono-num text-[10.5px] font-extrabold">
                    <span className={isCurrent ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}>
                      NV. {lvl.level}
                    </span>
                    <span className={reached ? 'text-[var(--good)]' : 'text-[var(--muted)]'}>
                      {lvl.minXp.toLocaleString('pt-BR')} XP
                    </span>
                  </div>
                  <div className="font-bold text-[var(--text)] mt-0.5 truncate" title={lvl.title}>
                    {lvl.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Merit Medals Section */}
      <div className="pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="m-0 text-[12px] font-extrabold uppercase tracking-wider text-[var(--text)] inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
              Quadro de Medalhas de Mérito
            </h4>
            <div className="inline-flex flex-wrap rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
              {(['todas', 'metas', 'horas', 'consistencia', 'excelencia', 'dominio'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filtrar medalhas por grau"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as 'todos' | MedalTier)}
              className="h-[28px] px-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]"
            >
              <option value="todos">Todos os graus</option>
              <option value="bronze">Bronze</option>
              <option value="prata">Prata</option>
              <option value="ouro">Ouro</option>
              <option value="diamante">Diamante</option>
              <option value="supremo">Supremo</option>
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

            {filteredMedals.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllMedals((prev) => !prev)}
                className="text-[11.5px] font-bold text-[var(--accent)] hover:underline whitespace-nowrap"
              >
                {showAllMedals
                  ? 'Ver resumo (6)'
                  : `Ver todas (${filteredMedals.length})`}
              </button>
            )}
          </div>
        </div>

        {visibleMedals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-5 px-4 text-center text-[12px] text-[var(--muted)]">
            Nenhuma medalha conquistada nesta categoria ainda. Continue registrando horas, metas e questões para desbloquear sua primeira condecoração.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {visibleMedals.map((medal) => {
              const tierStyle = TIER_STYLES[medal.tier];
              return (
                <div
                  key={medal.id}
                  className={`rounded-xl border p-3 transition-colors ${
                    medal.unlocked
                      ? 'bg-[var(--panel-soft)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)]/55 opacity-80'
                  }`}
                  style={
                    medal.unlocked
                      ? { borderColor: tierStyle.border }
                      : undefined
                  }
                >
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
                        <div
                          className="text-[10px] font-extrabold uppercase tracking-wider"
                          style={{ color: medal.unlocked ? tierStyle.color : 'var(--muted)' }}
                        >
                          {tierStyle.label} · {CATEGORY_LABELS[medal.category]}
                        </div>
                      </div>
                    </div>

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

                  <p className="m-0 text-[11px] text-[var(--muted)] leading-snug mb-2">
                    {medal.description}
                  </p>

                  <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono-num mb-1">
                    <span className={medal.unlocked ? 'font-bold text-[var(--good)]' : 'text-[var(--muted)]'}>
                      {medal.unlocked ? 'Conquistada' : 'Progresso'}
                    </span>
                    <span className="font-bold text-[var(--text)]">{medal.progressLabel}</span>
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
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
});
