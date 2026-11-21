import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, CheckCircle2, Crown, X } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { localDateIso } from '../../lib/parsers';
import {
  MEDAL_TIER_LABELS,
  MedalTier,
  computeCareerSummary,
} from '../../lib/careerGamification';

interface CelebrationNotice {
  id: string;
  kind: 'level-up' | 'medal' | 'mission';
  title: string;
  subtitle: string;
  xpText: string;
  tier?: MedalTier;
}

const TIER_ACCENT: Record<MedalTier, string> = {
  bronze: '#c26a2e',
  prata: '#64748b',
  ouro: '#ca8a04',
  diamante: '#0284c7',
  supremo: '#9333ea',
};

export const CareerAchievementWatcher: React.FC = () => {
  const { db, updatePreferences, setActivePage, examFocusMode } = useStudy();
  const summary = useMemo(() => computeCareerSummary(db), [db]);

  const [queue, setQueue] = useState<CelebrationNotice[]>([]);
  const seededRef = useRef(false);

  // Build stable signatures so the effect only fires when unlocked state actually changes
  const unlockedMedalIds = useMemo(
    () => summary.medals.filter((m) => m.unlocked).map((m) => m.id),
    [summary.medals],
  );
  const completedWeeklyKeys = useMemo(
    () => summary.weeklyMissions.filter((m) => m.completed).map((m) => m.storageKey),
    [summary.weeklyMissions],
  );
  const unlockedKey = unlockedMedalIds.join('|');
  const weeklyKey = completedWeeklyKeys.join('|');

  useEffect(() => {
    const todayIso = localDateIso();
    const meta = db.preferences?.career_meta;
    const prevUnlockedAt = meta?.unlocked_at || {};
    const prevWeeklyCompleted = meta?.completed_weekly_missions || {};
    const prevNotifiedMedals = meta?.last_notified_medals;
    const prevNotifiedLevel = meta?.last_notified_level;

    // First-time silent baseline seeding (no false popups for historical progress)
    if (!seededRef.current || prevNotifiedMedals === undefined || prevNotifiedLevel === undefined) {
      seededRef.current = true;
      const nextUnlockedAt: Record<string, string> = { ...prevUnlockedAt };
      let changed =
        prevNotifiedMedals === undefined || prevNotifiedLevel === undefined;

      unlockedMedalIds.forEach((id) => {
        if (!nextUnlockedAt[id]) {
          nextUnlockedAt[id] = todayIso;
          changed = true;
        }
      });

      const nextWeeklyCompleted: Record<string, string> = { ...prevWeeklyCompleted };
      completedWeeklyKeys.forEach((k) => {
        if (!nextWeeklyCompleted[k]) {
          nextWeeklyCompleted[k] = todayIso;
          changed = true;
        }
      });

      if (changed) {
        updatePreferences({
          career_meta: {
            ...(meta || {}),
            unlocked_at: nextUnlockedAt,
            completed_weekly_missions: nextWeeklyCompleted,
            last_notified_level: summary.currentLevel.level,
            last_notified_medals: unlockedMedalIds,
          },
        });
      }
      return;
    }

    // Subsequent updates during active session: detect genuine new achievements
    const prevMedalSet = new Set(prevNotifiedMedals);
    const newlyUnlockedMedals = summary.medals.filter(
      (m) => m.unlocked && !prevMedalSet.has(m.id),
    );
    const newlyCompletedMissions = summary.weeklyMissions.filter(
      (m) => m.completed && !prevWeeklyCompleted[m.storageKey],
    );
    const leveledUp = summary.currentLevel.level > prevNotifiedLevel;

    if (
      !leveledUp &&
      newlyUnlockedMedals.length === 0 &&
      newlyCompletedMissions.length === 0
    ) {
      return;
    }

    const nextUnlockedAt: Record<string, string> = { ...prevUnlockedAt };
    newlyUnlockedMedals.forEach((m) => {
      if (!nextUnlockedAt[m.id]) {
        nextUnlockedAt[m.id] = todayIso;
      }
    });

    const nextWeeklyCompleted: Record<string, string> = { ...prevWeeklyCompleted };
    newlyCompletedMissions.forEach((m) => {
      nextWeeklyCompleted[m.storageKey] = todayIso;
    });

    const mergedNotifiedMedals = Array.from(
      new Set([...prevNotifiedMedals, ...unlockedMedalIds]),
    );

    updatePreferences({
      career_meta: {
        ...(meta || {}),
        unlocked_at: nextUnlockedAt,
        completed_weekly_missions: nextWeeklyCompleted,
        last_notified_level: Math.max(prevNotifiedLevel, summary.currentLevel.level),
        last_notified_medals: mergedNotifiedMedals,
      },
    });

    const newNotices: CelebrationNotice[] = [];
    if (leveledUp) {
      newNotices.push({
        id: `lvl-${summary.currentLevel.level}-${Date.now()}`,
        kind: 'level-up',
        title: `Promoção de Carreira · Nível ${summary.currentLevel.level}`,
        subtitle: summary.currentLevel.title,
        xpText: `${summary.totalXp.toLocaleString('pt-BR')} XP acumulados`,
      });
    }
    newlyUnlockedMedals.slice(0, 3).forEach((m) => {
      newNotices.push({
        id: `medal-${m.id}-${Date.now()}`,
        kind: 'medal',
        title: `Nova Medalha · ${MEDAL_TIER_LABELS[m.tier]}`,
        subtitle: m.title,
        xpText: `+${m.bonusXp.toLocaleString('pt-BR')} XP de bônus`,
        tier: m.tier,
      });
    });
    newlyCompletedMissions.slice(0, 2).forEach((m) => {
      newNotices.push({
        id: `mission-${m.storageKey}-${Date.now()}`,
        kind: 'mission',
        title: 'Missão da Semana Concluída',
        subtitle: m.title,
        xpText: `+${m.xpReward} XP homologados`,
      });
    });

    if (newNotices.length > 0) {
      setQueue((prev) => [...prev, ...newNotices].slice(-4));
    }
  }, [
    completedWeeklyKeys,
    db.preferences?.career_meta,
    summary.currentLevel.level,
    summary.currentLevel.title,
    summary.medals,
    summary.totalXp,
    summary.weeklyMissions,
    unlockedKey,
    unlockedMedalIds,
    updatePreferences,
    weeklyKey,
  ]);

  // Auto-dismiss oldest visible notice after 9s (paused while in exam focus mode)
  const activeNotice = !examFocusMode && queue.length > 0 ? queue[0] : null;
  useEffect(() => {
    if (!activeNotice) return;
    const timer = window.setTimeout(() => {
      setQueue((prev) => prev.filter((item) => item.id !== activeNotice.id));
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [activeNotice]);

  if (!activeNotice) return null;

  const accentColor =
    activeNotice.kind === 'level-up'
      ? 'var(--accent)'
      : activeNotice.kind === 'mission'
        ? 'var(--good)'
        : activeNotice.tier
          ? TIER_ACCENT[activeNotice.tier]
          : 'var(--warning)';

  return (
    <div
      role="status"
      aria-live="polite"
      data-print-hide="true"
      className="fixed right-4 bottom-16 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-xl p-3.5 print:hidden transition-all"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg border grid place-items-center shrink-0"
          style={{
            borderColor: accentColor,
            color: accentColor,
            backgroundColor: 'var(--panel-soft)',
          }}
        >
          {activeNotice.kind === 'level-up' ? (
            <Crown className="w-5 h-5" />
          ) : activeNotice.kind === 'mission' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Award className="w-5 h-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[11px] font-extrabold tracking-wide truncate"
              style={{ color: accentColor }}
            >
              {activeNotice.title}
            </span>
            <button
              type="button"
              onClick={() =>
                setQueue((prev) => prev.filter((item) => item.id !== activeNotice.id))
              }
              aria-label="Fechar notificação de conquista"
              className="grid place-items-center w-6 h-6 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-[13.5px] font-extrabold text-[var(--text)] leading-snug mt-0.5 truncate">
            {activeNotice.subtitle}
          </div>
          <div className="flex items-center justify-between gap-2 mt-2">
            <span className="font-mono-num text-[11.5px] font-bold text-[var(--good)]">
              {activeNotice.xpText}
            </span>
            <button
              type="button"
              onClick={() => {
                setQueue((prev) => prev.filter((item) => item.id !== activeNotice.id));
                setActivePage('Monitor de Desempenho');
              }}
              className="text-[11.5px] font-bold text-[var(--accent)] hover:underline whitespace-nowrap cursor-pointer bg-transparent border-0 p-0"
            >
              Ver Carreira
            </button>
          </div>
        </div>
      </div>

      {queue.length > 1 && (
        <div className="mt-2 pt-1.5 border-t border-[var(--line)] text-[10.5px] text-[var(--muted)] font-mono-num">
          +{queue.length - 1} outra(s) conquista(s) na fila
        </div>
      )}
    </div>
  );
};
