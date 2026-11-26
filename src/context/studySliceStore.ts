import { useSyncExternalStore } from 'react';
import { ActiveTimerLink, ModuleName, PomodoroMode } from '../types/study';

export interface StudySyncSlice {
  totalPendingSyncCount: number;
  pendingLocalChangesCount: number;
  hasPendingCloudChanges: boolean;
  gasQueueCount: number;
  driveOutboxCount: number;
  isSyncing: boolean;
  driveConnected: boolean;
  gasConnected: boolean;
  lastCloudSyncAt: string | null;
}

export interface StudyNavSlice {
  activePage: ModuleName;
}

export interface StudyTimerSlice {
  timerRunning: boolean;
  activeTimerTopic: ActiveTimerLink | null;
  pomodoroMode: PomodoroMode;
  pomodoroPhase: 'focus' | 'break';
}

export interface StudySliceSnapshot {
  sync: StudySyncSlice;
  nav: StudyNavSlice;
  timer: StudyTimerSlice;
}

const DEFAULT_SNAPSHOT: StudySliceSnapshot = {
  sync: {
    totalPendingSyncCount: 0,
    pendingLocalChangesCount: 0,
    hasPendingCloudChanges: false,
    gasQueueCount: 0,
    driveOutboxCount: 0,
    isSyncing: false,
    driveConnected: false,
    gasConnected: false,
    lastCloudSyncAt: null,
  },
  nav: {
    activePage: 'Início',
  },
  timer: {
    timerRunning: false,
    activeTimerTopic: null,
    pomodoroMode: 'continuous',
    pomodoroPhase: 'focus',
  },
};

let currentSnapshot: StudySliceSnapshot = DEFAULT_SNAPSHOT;
const listeners = new Set<() => void>();

function shallowEqualObj<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a) as Array<keyof T>;
  const keysB = Object.keys(b) as Array<keyof T>;
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

export function publishStudySlices(next: {
  sync?: StudySyncSlice;
  nav?: StudyNavSlice;
  timer?: StudyTimerSlice;
}): void {
  let changed = false;
  const nextSync = next.sync && !shallowEqualObj(currentSnapshot.sync, next.sync)
    ? ((changed = true), next.sync)
    : currentSnapshot.sync;
  const nextNav = next.nav && !shallowEqualObj(currentSnapshot.nav, next.nav)
    ? ((changed = true), next.nav)
    : currentSnapshot.nav;
  const nextTimer = next.timer && !shallowEqualObj(currentSnapshot.timer, next.timer)
    ? ((changed = true), next.timer)
    : currentSnapshot.timer;

  if (!changed) return;
  currentSnapshot = {
    sync: nextSync,
    nav: nextNav,
    timer: nextTimer,
  };
  listeners.forEach((cb) => cb());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStudySyncSlice(): StudySyncSlice {
  return useSyncExternalStore(
    subscribe,
    () => currentSnapshot.sync,
    () => DEFAULT_SNAPSHOT.sync,
  );
}

export function useStudyNavSlice(): StudyNavSlice {
  return useSyncExternalStore(
    subscribe,
    () => currentSnapshot.nav,
    () => DEFAULT_SNAPSHOT.nav,
  );
}

export function useStudyTimerSlice(): StudyTimerSlice {
  return useSyncExternalStore(
    subscribe,
    () => currentSnapshot.timer,
    () => DEFAULT_SNAPSHOT.timer,
  );
}
