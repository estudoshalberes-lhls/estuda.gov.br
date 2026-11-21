import React, { useEffect, useMemo, useRef } from 'react';
import { useStudy } from '../../context/StudyContext';
import { localDateIso } from '../../lib/parsers';
import { computeDailyGoalAndExamPace } from '../../lib/studyTools';
import {
  buildDailyGoalAlertPayload,
  isWithinQuietHours,
  markPushSlotDispatched,
  readPushDispatchLog,
  readSnoozedPush,
  resolvePushPrefs,
  saveSnoozedPush,
  sendServiceWorkerNotification,
  StudyPushPayload,
} from '../../lib/pushNotifications';
import { ModuleName } from '../../types/study';

/**
 * Silent background watcher mounted in AppShell:
 * - Listens to Service Worker notification clicks (`STUDY_NOTIFICATION_NAVIGATE`) and snooze actions (`STUDY_NOTIFICATION_SNOOZED`)
 * - Evaluates daily goal reminder slots via Service Worker `showNotification`
 * - Sends instant SW celebration notifications when daily hours or questions reach 100%
 */
export const DailyGoalPushWatcher: React.FC = () => {
  const { db, allErrorEntries, setActivePage, toast } = useStudy();

  const pushPrefs = useMemo(
    () => resolvePushPrefs(db.preferences?.push_notifications),
    [db.preferences?.push_notifications],
  );

  const todayIso = localDateIso();
  const dueReviewsCount = useMemo(
    () =>
      allErrorEntries.filter(
        (entry) =>
          (entry.proxima_revisao && entry.proxima_revisao <= todayIso) ||
          (!entry.corrigido && !entry.correcao_prova),
      ).length,
    [allErrorEntries, todayIso],
  );

  const pace = useMemo(() => computeDailyGoalAndExamPace(db), [db]);

  const latestRef = useRef({ db, pushPrefs, dueReviewsCount, pace });
  latestRef.current = { db, pushPrefs, dueReviewsCount, pace };

  // 1. Listen for Service Worker postMessage events (navigation & 30m snooze)
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'STUDY_NOTIFICATION_NAVIGATE' && typeof msg.page === 'string') {
        setActivePage(msg.page as ModuleName);
      } else if (
        msg.type === 'STUDY_NOTIFICATION_SNOOZED' &&
        typeof msg.snoozeUntil === 'number' &&
        msg.payload
      ) {
        saveSnoozedPush({
          snoozeUntil: msg.snoozeUntil,
          payload: msg.payload as StudyPushPayload,
        });
        toast('Lembrete de meta diária adiado por 30 minutos.');
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [setActivePage, toast]);

  // 2. Scheduled daily reminder slots & snooze timer (30s interval + tab focus)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const evaluateAlerts = async () => {
      const { db: curDb, pushPrefs: curPrefs, dueReviewsCount: curDue } = latestRef.current;
      if (!curPrefs.enabled) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const now = new Date();
      const today = localDateIso(now);

      // Check pending 30-min snoozed alert first
      const snoozed = readSnoozedPush();
      if (snoozed && now.getTime() >= snoozed.snoozeUntil) {
        saveSnoozedPush(null);
        await sendServiceWorkerNotification(snoozed.payload);
      }

      if (isWithinQuietHours(now, curPrefs.quietHoursStart, curPrefs.quietHoursEnd)) {
        return;
      }

      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const dispatchLog = readPushDispatchLog();

      for (const hhmm of curPrefs.reminderTimes) {
        const m = hhmm.match(/^(\d{2}):(\d{2})$/);
        if (!m) continue;
        const slotMinutes = Number(m[1]) * 60 + Number(m[2]);
        const slotKey = `slot:${hhmm}`;

        // Fire within a 15-minute grace window after the scheduled time if not yet sent today
        if (
          nowMinutes >= slotMinutes &&
          nowMinutes <= slotMinutes + 15 &&
          dispatchLog[slotKey] !== today
        ) {
          const payload = buildDailyGoalAlertPayload(curDb, curPrefs, curDue, 'scheduled');
          markPushSlotDispatched(slotKey, today);
          if (payload) {
            await sendServiceWorkerNotification(payload);
          }
          break;
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void evaluateAlerts();
    }, 30_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void evaluateAlerts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    void evaluateAlerts();

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [pushPrefs.enabled]);

  // 3. Instant celebration notification when student reaches 100% of daily hours or questions goal
  const prevPctRef = useRef<{ hours: number; questions: number; date: string }>({
    hours: pace.hoursPct,
    questions: pace.questionsPct,
    date: todayIso,
  });

  useEffect(() => {
    if (prevPctRef.current.date !== todayIso) {
      prevPctRef.current = { hours: pace.hoursPct, questions: pace.questionsPct, date: todayIso };
      return;
    }

    const prevHours = prevPctRef.current.hours;
    const prevQuestions = prevPctRef.current.questions;
    prevPctRef.current = { hours: pace.hoursPct, questions: pace.questionsPct, date: todayIso };

    if (!pushPrefs.enabled || !pushPrefs.alertGoalAchieved) return;
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const log = readPushDispatchLog();

    if (prevHours < 100 && pace.hoursPct >= 100 && log['goal:hours'] !== todayIso) {
      markPushSlotDispatched('goal:hours', todayIso);
      const payload = buildDailyGoalAlertPayload(
        db,
        pushPrefs,
        dueReviewsCount,
        'goal-hours-reached',
      );
      if (payload) {
        void sendServiceWorkerNotification(payload);
      }
    }

    if (prevQuestions < 100 && pace.questionsPct >= 100 && log['goal:questions'] !== todayIso) {
      markPushSlotDispatched('goal:questions', todayIso);
      const payload = buildDailyGoalAlertPayload(
        db,
        pushPrefs,
        dueReviewsCount,
        'goal-questions-reached',
      );
      if (payload) {
        void sendServiceWorkerNotification(payload);
      }
    }
  }, [db, dueReviewsCount, pace.hoursPct, pace.questionsPct, pushPrefs, todayIso]);

  return null;
};
