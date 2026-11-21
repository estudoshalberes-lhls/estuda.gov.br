import {
  DailyPushNotificationPrefs,
  ModuleName,
  StudyDatabase,
} from '../types/study';
import { formatScheduleDuration, localDateIso } from './parsers';
import { computeDailyGoalAndExamPace } from './studyTools';

export const DEFAULT_PUSH_NOTIFICATION_PREFS: DailyPushNotificationPrefs = {
  enabled: false,
  reminderTimes: ['09:00', '14:00', '20:00'],
  alertDailyHoursGoal: true,
  alertDailyQuestionsGoal: true,
  alertDueReviews: true,
  alertGoalAchieved: true,
  alertExamCountdown: true,
  quietHoursStart: '22:30',
  quietHoursEnd: '07:00',
};

export interface StudyPushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  page?: ModuleName;
  renotify?: boolean;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
}

export interface PushEnvironmentStatus {
  supported: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | 'unsupported';
  swActive: boolean;
  swScriptUrl?: string;
  pushSubscribed: boolean;
  pushEndpoint?: string;
  vapidConfigured: boolean;
}

export interface PushDeliveryResult {
  ok: boolean;
  channel: 'service-worker' | 'window-notification' | 'none';
  error?: string;
}

const PUSH_DISPATCH_LOG_KEY = 'estuda_push_dispatch_log_v1';
const PUSH_SNOOZE_KEY = 'estuda_push_snooze_v1';

export function resolvePushPrefs(
  raw?: Partial<DailyPushNotificationPrefs>,
): DailyPushNotificationPrefs {
  const times = Array.isArray(raw?.reminderTimes)
    ? raw.reminderTimes.filter((t) => /^\d{2}:\d{2}$/.test(t))
    : DEFAULT_PUSH_NOTIFICATION_PREFS.reminderTimes;

  return {
    ...DEFAULT_PUSH_NOTIFICATION_PREFS,
    ...(raw || {}),
    reminderTimes: times.length > 0 ? [...new Set(times)].sort() : ['09:00', '20:00'],
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function ensurePushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      if (existing.active) return existing;
      const ready = await Promise.race<ServiceWorkerRegistration>([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration>((resolve) =>
          window.setTimeout(() => resolve(existing), 3000),
        ),
      ]);
      return ready || existing;
    }

    // Fallback registration if SW hasn't been registered yet (e.g. dev preview)
    const reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
    const ready = await Promise.race<ServiceWorkerRegistration>([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((resolve) =>
        window.setTimeout(() => resolve(reg), 3000),
      ),
    ]);
    return ready || reg;
  } catch (err) {
    console.warn('[PushNotifications] Falha ao obter registro do Service Worker:', err);
    return null;
  }
}

export async function fetchServerPushStatus(): Promise<{
  vapidPublicKey: string | null;
  activeSubscriptions: number;
}> {
  const envKey =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_VAPID_PUBLIC_KEY === 'string' &&
    import.meta.env.VITE_VAPID_PUBLIC_KEY.trim()
      ? import.meta.env.VITE_VAPID_PUBLIC_KEY.trim()
      : null;

  try {
    const res = await fetch('/api/push/status', {
      headers: { 'x-study-client': 'central-estudos' },
    });
    if (!res.ok) {
      return { vapidPublicKey: envKey, activeSubscriptions: 0 };
    }
    const data = (await res.json()) as {
      vapidPublicKey?: string | null;
      activeSubscriptions?: number;
    };
    return {
      vapidPublicKey: data.vapidPublicKey || envKey,
      activeSubscriptions: Number(data.activeSubscriptions) || 0,
    };
  } catch {
    return { vapidPublicKey: envKey, activeSubscriptions: 0 };
  }
}

export async function getPushEnvironmentStatus(): Promise<PushEnvironmentStatus> {
  const isBrowser = typeof window !== 'undefined';
  const hasServiceWorker = isBrowser && 'serviceWorker' in navigator;
  const hasNotification = isBrowser && 'Notification' in window;
  const hasPushManager = isBrowser && 'PushManager' in window;

  if (!hasNotification) {
    return {
      supported: false,
      hasServiceWorker,
      hasPushManager,
      permission: 'unsupported',
      swActive: false,
      pushSubscribed: false,
      vapidConfigured: false,
    };
  }

  const [reg, serverStatus] = await Promise.all([
    hasServiceWorker ? ensurePushServiceWorkerRegistration() : Promise.resolve(null),
    fetchServerPushStatus(),
  ]);

  let pushSub: PushSubscription | null = null;
  if (reg && 'pushManager' in reg) {
    try {
      pushSub = await reg.pushManager.getSubscription();
    } catch {
      pushSub = null;
    }
  }

  const activeWorker = reg?.active || reg?.waiting || reg?.installing || null;

  return {
    supported: true,
    hasServiceWorker,
    hasPushManager,
    permission: Notification.permission,
    swActive: Boolean(reg?.active),
    swScriptUrl: activeWorker?.scriptURL,
    pushSubscribed: Boolean(pushSub),
    pushEndpoint: pushSub?.endpoint,
    vapidConfigured: Boolean(serverStatus.vapidPublicKey),
  };
}

export async function enablePushNotificationsFlow(): Promise<{
  ok: boolean;
  permission: NotificationPermission | 'unsupported';
  swActive: boolean;
  pushEndpoint?: string;
  message: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      ok: false,
      permission: 'unsupported',
      swActive: false,
      message: 'Este navegador não oferece suporte à API de Notificações.',
    };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return {
      ok: false,
      permission,
      swActive: false,
      message:
        permission === 'denied'
          ? 'As notificações estão bloqueadas nas configurações do navegador para este site. Libere a permissão no cadeado da barra de endereços.'
          : 'Permissão de notificações não concedida.',
    };
  }

  const reg = await ensurePushServiceWorkerRegistration();
  let pushEndpoint: string | undefined;

  if (reg && 'pushManager' in reg) {
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        pushEndpoint = existing.endpoint;
      } else {
        const { vapidPublicKey } = await fetchServerPushStatus();
        if (vapidPublicKey) {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
          pushEndpoint = sub.endpoint;
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-study-client': 'central-estudos',
            },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          }).catch(() => undefined);
        }
      }
    } catch (err) {
      console.warn('[PushNotifications] PushManager.subscribe indisponível, usando SW showNotification:', err);
    }
  }

  return {
    ok: true,
    permission,
    swActive: Boolean(reg?.active),
    pushEndpoint,
    message: reg?.active
      ? 'Notificações Push ativadas via Service Worker!'
      : 'Notificações ativadas com sucesso!',
  };
}

export async function disablePushNotificationsFlow(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg || !('pushManager' in reg)) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-study-client': 'central-estudos',
        },
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);
    }
  } catch {
    // ignore cleanup failures
  }
}

export async function sendServiceWorkerNotification(
  payload: StudyPushPayload,
): Promise<PushDeliveryResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, channel: 'none', error: 'Notificações não suportadas neste navegador.' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, channel: 'none', error: 'Permissão de notificação não concedida.' };
  }

  const reg = await ensurePushServiceWorkerRegistration();
  if (reg && typeof reg.showNotification === 'function') {
    try {
      const swOptions: NotificationOptions & {
        actions?: Array<{ action: string; title: string }>;
        renotify?: boolean;
        vibrate?: number[];
      } = {
        body: payload.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.tag || 'estuda-daily-goal',
        renotify: payload.renotify ?? true,
        requireInteraction: payload.requireInteraction ?? false,
        vibrate: [160, 80, 160],
        actions: payload.actions || [
          { action: 'open-training', title: 'Iniciar Treino' },
          { action: 'snooze-30m', title: 'Adiar 30min' },
        ],
        data: {
          url: payload.url || '/',
          page: payload.page || 'Página Inicial',
          title: payload.title,
          body: payload.body,
          tag: payload.tag || 'estuda-daily-goal',
        },
      };

      await reg.showNotification(payload.title, swOptions);
      return { ok: true, channel: 'service-worker' };
    } catch (err) {
      // Fallback to SW postMessage if direct showNotification fails in some browser contexts
      if (reg.active) {
        try {
          reg.active.postMessage({
            type: 'SHOW_STUDY_NOTIFICATION',
            payload,
          });
          return { ok: true, channel: 'service-worker' };
        } catch {
          // continue to window Notification fallback
        }
      }
      console.warn('[PushNotifications] Fallback para Notification API:', err);
    }
  }

  try {
    const notif = new Notification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      tag: payload.tag || 'estuda-daily-goal',
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return { ok: true, channel: 'window-notification' };
  } catch (err) {
    return {
      ok: false,
      channel: 'none',
      error: err instanceof Error ? err.message : 'Falha ao exibir notificação.',
    };
  }
}

export function isWithinQuietHours(
  now: Date,
  startHHMM?: string,
  endHHMM?: string,
): boolean {
  if (!startHHMM || !endHHMM) return false;
  const parseMin = (hhmm: string) => {
    const m = hhmm.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = parseMin(startHHMM);
  const end = parseMin(endHHMM);
  if (start === null || end === null || start === end) return false;

  const cur = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return cur >= start && cur < end;
  }
  // Overnight range, e.g. 22:30 -> 07:00
  return cur >= start || cur < end;
}

export function readPushDispatchLog(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PUSH_DISPATCH_LOG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const today = localDateIso();
    // Prune older days to keep storage tiny
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === today) cleaned[k] = v;
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function markPushSlotDispatched(slotKey: string, dateIso = localDateIso()): void {
  try {
    const current = readPushDispatchLog();
    current[slotKey] = dateIso;
    localStorage.setItem(PUSH_DISPATCH_LOG_KEY, JSON.stringify(current));
  } catch {
    // ignore storage errors
  }
}

export interface SnoozedPushEntry {
  snoozeUntil: number;
  payload: StudyPushPayload;
}

export function saveSnoozedPush(entry: SnoozedPushEntry | null): void {
  try {
    if (!entry) {
      localStorage.removeItem(PUSH_SNOOZE_KEY);
    } else {
      localStorage.setItem(PUSH_SNOOZE_KEY, JSON.stringify(entry));
    }
  } catch {
    // ignore storage errors
  }
}

export function readSnoozedPush(): SnoozedPushEntry | null {
  try {
    const raw = localStorage.getItem(PUSH_SNOOZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnoozedPushEntry;
    if (!parsed || typeof parsed.snoozeUntil !== 'number' || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildDailyGoalAlertPayload(
  db: StudyDatabase,
  prefs: DailyPushNotificationPrefs,
  dueReviewsCount: number,
  mode: 'scheduled' | 'test' | 'goal-hours-reached' | 'goal-questions-reached',
): StudyPushPayload | null {
  const pace = computeDailyGoalAndExamPace(db);
  const remainingSeconds = Math.max(0, Math.round(pace.dailyHoursGoal * 3600 - pace.todaySeconds));
  const remainingQuestions = Math.max(0, pace.dailyQuestionsGoal - pace.todayQuestions);

  if (mode === 'goal-hours-reached') {
    return {
      title: 'Meta Diária de Horas Batida! 🎯',
      body: `Parabéns! Você atingiu ${formatScheduleDuration(pace.todaySeconds)} hoje (meta de ${pace.dailyHoursGoal}h concluída).${
        remainingQuestions > 0
          ? ` Restam apenas ${remainingQuestions} questão(ões) para fechar o dia 100%.`
          : ' Todas as metas do dia estão em dia!'
      }`,
      tag: 'estuda-goal-hours-done',
      page: remainingQuestions > 0 ? 'Treino Diário' : 'Monitor de Desempenho',
      actions: [
        { action: 'open-training', title: 'Fazer Questões' },
        { action: 'open-schedule', title: 'Ver Cronograma' },
      ],
    };
  }

  if (mode === 'goal-questions-reached') {
    return {
      title: 'Meta Diária de Questões Concluída! ✅',
      body: `Excelente constância! Você já resolveu ${pace.todayQuestions}/${pace.dailyQuestionsGoal} questões hoje.${
        remainingSeconds > 300
          ? ` Ainda faltam ${formatScheduleDuration(remainingSeconds)} para completar sua meta de horas.`
          : ' Meta diária completa!'
      }`,
      tag: 'estuda-goal-questions-done',
      page: 'Monitor de Desempenho',
      actions: [
        { action: 'open-errors', title: 'Revisar Erros' },
        { action: 'open-schedule', title: 'Cronograma' },
      ],
    };
  }

  const parts: string[] = [];
  if (prefs.alertDailyHoursGoal && remainingSeconds > 0) {
    parts.push(`faltam ${formatScheduleDuration(remainingSeconds)} de estudo`);
  }
  if (prefs.alertDailyQuestionsGoal && remainingQuestions > 0) {
    parts.push(`${remainingQuestions} questão(ões)`);
  }
  if (prefs.alertDueReviews && dueReviewsCount > 0) {
    parts.push(`${dueReviewsCount} revisão(ões) pendente(s)`);
  }

  if (mode === 'scheduled' && parts.length === 0) {
    // Student already completed every enabled goal for today — don't nag!
    return null;
  }

  const examSuffix =
    prefs.alertExamCountdown && pace.trackedContest && pace.daysUntilExam !== null
      ? ` · D-${pace.daysUntilExam} (${pace.trackedContest.concurso})`
      : '';

  const body =
    parts.length > 0
      ? `Hoje ainda ${parts.join(', ')}. Progresso atual: ${pace.hoursPct}% horas e ${pace.questionsPct}% questões${examSuffix}.`
      : `Situação em dia! Você já cumpriu ${pace.hoursPct}% das horas (${formatScheduleDuration(pace.todaySeconds)}) e ${pace.questionsPct}% das questões (${pace.todayQuestions}/${pace.dailyQuestionsGoal})${examSuffix}.`;

  const primaryPage: ModuleName =
    remainingQuestions > 0
      ? 'Treino Diário'
      : dueReviewsCount > 0
      ? 'Caderno de Erros'
      : 'Cronograma';

  return {
    title:
      mode === 'test'
        ? 'estuda.gov.br · Teste de Alerta Push'
        : `estuda.gov.br · Lembrete de Meta Diária`,
    body,
    tag: mode === 'test' ? `estuda-test-${Date.now()}` : 'estuda-daily-goal-reminder',
    page: primaryPage,
    actions: [
      { action: 'open-training', title: 'Iniciar Treino' },
      { action: 'snooze-30m', title: 'Adiar 30min' },
    ],
  };
}
