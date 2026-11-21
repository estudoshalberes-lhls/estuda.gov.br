import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  Moon,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { localDateIso } from '../../lib/parsers';
import {
  PushEnvironmentStatus,
  buildDailyGoalAlertPayload,
  disablePushNotificationsFlow,
  enablePushNotificationsFlow,
  getPushEnvironmentStatus,
  resolvePushPrefs,
  sendServiceWorkerNotification,
} from '../../lib/pushNotifications';
import { DailyPushNotificationPrefs } from '../../types/study';

interface DailyGoalPushModalProps {
  open: boolean;
  onClose: () => void;
}

export const DailyGoalPushModal: React.FC<DailyGoalPushModalProps> = ({ open, onClose }) => {
  const { db, allErrorEntries, updatePreferences, toast } = useStudy();
  const prefs = useMemo(
    () => resolvePushPrefs(db.preferences?.push_notifications),
    [db.preferences?.push_notifications],
  );

  const [envStatus, setEnvStatus] = useState<PushEnvironmentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [newTimeInput, setNewTimeInput] = useState('18:00');

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

  const refreshStatus = useCallback(async () => {
    const status = await getPushEnvironmentStatus();
    setEnvStatus(status);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshStatus();
  }, [open, refreshStatus]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const savePushPrefs = (patch: Partial<DailyPushNotificationPrefs>) => {
    updatePreferences({
      push_notifications: {
        ...prefs,
        ...patch,
      },
    });
  };

  const handleToggleEnabled = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (prefs.enabled) {
        await disablePushNotificationsFlow();
        savePushPrefs({ enabled: false, pushEndpoint: undefined });
        await refreshStatus();
        toast('Alertas Push de metas diárias desativados.');
        return;
      }

      const result = await enablePushNotificationsFlow();
      await refreshStatus();
      if (!result.ok) {
        toast(result.message, true);
        return;
      }

      savePushPrefs({
        enabled: true,
        ...(result.pushEndpoint ? { pushEndpoint: result.pushEndpoint } : {}),
      });
      toast(result.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddTime = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{2}:\d{2}$/.test(newTimeInput)) {
      toast('Informe um horário válido no formato HH:MM.', true);
      return;
    }
    if (prefs.reminderTimes.includes(newTimeInput)) {
      toast('Este horário já está na sua lista de lembretes.', true);
      return;
    }
    if (prefs.reminderTimes.length >= 8) {
      toast('Limite máximo de 8 horários diários atingido.', true);
      return;
    }
    savePushPrefs({
      reminderTimes: [...prefs.reminderTimes, newTimeInput].sort(),
    });
    toast(`Lembrete diário às ${newTimeInput} adicionado.`);
  };

  const handleRemoveTime = (hhmm: string) => {
    if (prefs.reminderTimes.length <= 1) {
      toast('Mantenha pelo menos 1 horário configurado enquanto os alertas estiverem ativos.', true);
      return;
    }
    savePushPrefs({
      reminderTimes: prefs.reminderTimes.filter((t) => t !== hhmm),
    });
  };

  const handleSendTest = async () => {
    if (sendingTest) return;
    setSendingTest(true);
    try {
      if (Notification.permission !== 'granted') {
        const res = await enablePushNotificationsFlow();
        await refreshStatus();
        if (!res.ok) {
          toast(res.message, true);
          return;
        }
        if (!prefs.enabled) {
          savePushPrefs({ enabled: true });
        }
      }

      const payload = buildDailyGoalAlertPayload(db, prefs, dueReviewsCount, 'test');
      if (!payload) return;
      const delivered = await sendServiceWorkerNotification(payload);
      await refreshStatus();
      if (delivered.ok) {
        toast(
          delivered.channel === 'service-worker'
            ? 'Notificação Push enviada via Service Worker! Verifique os alertas do sistema.'
            : 'Notificação enviada com sucesso!',
        );
      } else {
        toast(delivered.error || 'Não foi possível enviar a notificação de teste.', true);
      }
    } finally {
      setSendingTest(false);
    }
  };

  if (!open) return null;

  const isGranted = envStatus?.permission === 'granted';
  const isDenied = envStatus?.permission === 'denied';
  const isActive = prefs.enabled && isGranted;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-3 sm:p-5 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Central de Notificações Push de Metas Diárias"
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--line)] bg-[var(--panel-soft)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
              <BellRing className="w-3.5 h-3.5 shrink-0" />
              <span>Service Worker · Notificações Push de Metas Diárias</span>
            </div>
            <h3 className="m-0 mt-0.5 font-display text-[17px] font-extrabold text-[var(--text)]">
              Central de Alertas Automáticos de Estudo
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações de notificações"
            className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4">
          {/* Primary Activation Card */}
          <div
            className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
              isActive
                ? 'border-[var(--good)]/45 bg-[var(--good)]/8'
                : isDenied
                ? 'border-[var(--bad)]/40 bg-[var(--bad)]/8'
                : 'border-[var(--accent)]/40 bg-[var(--accent-soft)]/40'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--text)]">
                {isActive ? (
                  <CheckCircle2 className="w-4 h-4 text-[var(--good)] shrink-0" />
                ) : isDenied ? (
                  <AlertTriangle className="w-4 h-4 text-[var(--bad)] shrink-0" />
                ) : (
                  <Bell className="w-4 h-4 text-[var(--accent)] shrink-0" />
                )}
                <span>
                  {isActive
                    ? 'Notificações Push Ativas no Service Worker'
                    : isDenied
                    ? 'Permissão Bloqueada no Navegador'
                    : 'Ative os Alertas Push de Metas Diárias'}
                </span>
              </div>
              <p className="m-0 mt-1 text-[12px] text-[var(--muted)] leading-relaxed">
                {isDenied
                  ? 'Clique no ícone de cadeado/informações ao lado da barra de endereço do navegador, libere "Notificações" e clique em Ativar novamente.'
                  : 'Receba avisos discretos do sistema quando ainda faltarem horas, questões ou revisões para fechar sua meta diária, com ações rápidas para iniciar o treino ou adiar 30 min.'}
              </p>

              {/* SW Diagnostics Row */}
              {envStatus && (
                <div className="flex flex-wrap items-center gap-2 mt-2.5 text-[11px] font-semibold">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                      envStatus.swActive
                        ? 'border-[var(--good)]/40 bg-[var(--panel)] text-[var(--good)]'
                        : 'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)]'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Service Worker: {envStatus.swActive ? 'Ativo' : 'Registrando'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)]">
                    Permissão:{' '}
                    {envStatus.permission === 'granted'
                      ? 'Concedida'
                      : envStatus.permission === 'denied'
                      ? 'Bloqueada'
                      : envStatus.permission === 'unsupported'
                      ? 'Não suportada'
                      : 'Aguardando'}
                  </span>
                  {envStatus.pushSubscribed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--panel)] text-[var(--accent)]">
                      Web Push VAPID inscrito
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy || envStatus?.supported === false}
                onClick={() => void handleToggleEnabled()}
                className={`inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg border text-[12px] font-extrabold transition-colors cursor-pointer disabled:opacity-50 ${
                  isActive
                    ? 'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--bad)] hover:text-[var(--bad)]'
                    : 'border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-95'
                }`}
              >
                {isActive ? (
                  <>
                    <BellOff className="w-3.5 h-3.5" />
                    Desativar Alertas
                  </>
                ) : (
                  <>
                    <BellRing className="w-3.5 h-3.5" />
                    Ativar Push Agora
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={sendingTest || isDenied || envStatus?.supported === false}
                onClick={() => void handleSendTest()}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[12px] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer disabled:opacity-45"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingTest ? 'Enviando...' : 'Testar Alerta'}
              </button>
            </div>
          </div>

          {/* Daily Reminder Schedule */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-[var(--text)]">
                <Clock className="w-4 h-4 text-[var(--accent)]" />
                <span>Horários dos Lembretes Diários</span>
              </div>
              <span className="text-[11px] text-[var(--muted)]">
                Só dispara se alguma meta do dia ainda estiver pendente
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              {prefs.reminderTimes.map((hhmm) => (
                <span
                  key={hhmm}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--panel)] font-mono-num text-[12.5px] font-extrabold text-[var(--text)]"
                >
                  <span>{hhmm}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTime(hhmm)}
                    aria-label={`Remover horário ${hhmm}`}
                    className="grid place-items-center w-5 h-5 rounded text-[var(--muted)] hover:text-[var(--bad)] hover:bg-[var(--bad)]/10 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={handleAddTime} className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={newTimeInput}
                onChange={(e) => setNewTimeInput(e.target.value)}
                aria-label="Novo horário de lembrete"
                className="ce-input !w-auto h-8 rounded-lg px-2.5 font-mono-num text-[12px]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                Adicionar horário
              </button>
            </form>
          </div>

          {/* Triggers & Quiet Hours */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 flex flex-col gap-2.5">
              <strong className="text-[12.5px] font-extrabold text-[var(--text)]">
                O que incluir nos alertas
              </strong>

              {(
                [
                  {
                    key: 'alertDailyHoursGoal',
                    label: 'Meta diária de horas pendente',
                  },
                  {
                    key: 'alertDailyQuestionsGoal',
                    label: 'Meta diária de questões pendente',
                  },
                  {
                    key: 'alertDueReviews',
                    label: 'Revisões vencidas (Caderno de Erros)',
                  },
                  {
                    key: 'alertGoalAchieved',
                    label: 'Avisar ao atingir 100% da meta diária',
                  },
                  {
                    key: 'alertExamCountdown',
                    label: 'Incluir contagem regressiva (D-X) da prova',
                  },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2 text-[12px] text-[var(--text)] cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[item.key])}
                    onChange={(e) => savePushPrefs({ [item.key]: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-[var(--text)] mb-1">
                  <Moon className="w-4 h-4 text-[var(--accent)]" />
                  <span>Horário de Silêncio (Não Perturbe)</span>
                </div>
                <p className="m-0 text-[11.5px] text-[var(--muted)] leading-relaxed">
                  Nenhum lembrete agendado será disparado durante a sua janela de descanso.
                </p>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <label className="block text-[10.5px] font-bold uppercase text-[var(--muted)] mb-1">
                      Início
                    </label>
                    <input
                      type="time"
                      value={prefs.quietHoursStart || '22:30'}
                      onChange={(e) => savePushPrefs({ quietHoursStart: e.target.value })}
                      className="ce-input w-full h-8 rounded-lg px-2 font-mono-num text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-bold uppercase text-[var(--muted)] mb-1">
                      Término
                    </label>
                    <input
                      type="time"
                      value={prefs.quietHoursEnd || '07:00'}
                      onChange={(e) => savePushPrefs({ quietHoursEnd: e.target.value })}
                      className="ce-input w-full h-8 rounded-lg px-2 font-mono-num text-[12px]"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2.5 text-[11px] text-[var(--muted)]">
                Ao clicar no alerta do sistema, o portal abre automaticamente no módulo pendente (<strong>Treino Diário</strong>, <strong>Cronograma</strong> ou <strong>Caderno de Erros</strong>).
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
