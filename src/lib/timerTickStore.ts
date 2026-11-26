import { useSyncExternalStore } from 'react';
import { PomodoroMode } from '../types/study';

export interface TimerTickSnapshot {
  nowTick: number;
  timerSeconds: number;
  timerRunning: boolean;
  timerStartedAt: number;
  pomodoroMode: PomodoroMode;
  pomodoroPhase: 'focus' | 'break';
  pomodoroRemainingSeconds: number;
}

let snapshot: TimerTickSnapshot = {
  nowTick: Date.now(),
  timerSeconds: 0,
  timerRunning: false,
  timerStartedAt: 0,
  pomodoroMode: 'continuous',
  pomodoroPhase: 'focus',
  pomodoroRemainingSeconds: 0,
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function getTimerTickSnapshot(): TimerTickSnapshot {
  return snapshot;
}

export function subscribeTimerTickStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishTimerTickSnapshot(patch: Partial<TimerTickSnapshot>): void {
  const next: TimerTickSnapshot = { ...snapshot, ...patch };
  if (
    next.timerSeconds === snapshot.timerSeconds &&
    next.timerRunning === snapshot.timerRunning &&
    next.timerStartedAt === snapshot.timerStartedAt &&
    next.pomodoroMode === snapshot.pomodoroMode &&
    next.pomodoroPhase === snapshot.pomodoroPhase &&
    next.pomodoroRemainingSeconds === snapshot.pomodoroRemainingSeconds
  ) {
    return;
  }
  snapshot = next;
  notifyListeners();
}

/**
 * Subscribe ONLY the tiny clock/timer UI leaf components to 1Hz timer ticks,
 * completely preventing global StudyProvider & full-page re-render storms!
 */
export function useStudyTimer(): TimerTickSnapshot {
  return useSyncExternalStore(
    subscribeTimerTickStore,
    getTimerTickSnapshot,
    getTimerTickSnapshot,
  );
}
