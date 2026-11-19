import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  Lock,
  RefreshCw,
  Settings,
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { GasConnectionStatus, useStudy } from '../../context/StudyContext';
import { Panel } from '../ui/PageHeader';

function formatClockTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getStatusVisual(status: GasConnectionStatus, isReconnecting: boolean) {
  if (isReconnecting || status === 'checking') {
    return {
      label: isReconnecting ? 'Reconectando…' : 'Verificando…',
      shortLabel: isReconnecting ? 'Reconectando…' : 'Verificando…',
      dotClass: 'bg-[var(--accent)] animate-pulse',
      badgeClass:
        'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]',
      isOnline: false,
    };
  }
  if (status === 'online') {
    return {
      label: 'Online',
      shortLabel: 'Online',
      dotClass: 'bg-[var(--good)]',
      badgeClass:
        'border-[var(--good)]/45 bg-[var(--good)]/10 text-[var(--good)]',
      isOnline: true,
    };
  }
  if (status === 'session-expired') {
    return {
      label: 'Sessão expirada',
      shortLabel: 'Reconectar',
      dotClass: 'bg-[var(--warning)] animate-pulse',
      badgeClass:
        'border-[var(--warning)]/55 bg-[var(--warning)]/15 text-[var(--warning)]',
      isOnline: false,
    };
  }
  if (status === 'disconnected') {
    return {
      label: 'Desconectado',
      shortLabel: 'Offline',
      dotClass: 'bg-[var(--muted)]',
      badgeClass:
        'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)]',
      isOnline: false,
    };
  }
  return {
    label: 'Offline',
    shortLabel: 'Offline',
    dotClass: 'bg-[var(--bad)] animate-pulse',
    badgeClass:
      'border-[var(--bad)]/50 bg-[var(--bad)]/12 text-[var(--bad)]',
    isOnline: false,
  };
}

/**
 * Widget compacto na barra superior: exibe Online/Offline em tempo real
 * e abre popover com botão de reconexão forçada (sem atualizar a página).
 */
export const GasConnectionTopbarWidget: React.FC = () => {
  const {
    gasSession,
    gasConnectionHealth,
    isSyncingDrive,
    hasPendingCloudChanges,
    checkGasConnectionNow,
    forceReconnectAppsScript,
    setActivePage,
  } = useStudy();

  const [open, setOpen] = useState(false);
  const [showQuickLogin, setShowQuickLogin] = useState(false);
  const [username, setUsername] = useState(() => gasSession?.username || '');
  const [password, setPassword] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gasSession?.username && !username) {
      setUsername(gasSession.username);
    }
  }, [gasSession?.username, username]);

  useEffect(() => {
    if (
      gasConnectionHealth.status === 'session-expired' ||
      gasConnectionHealth.status === 'disconnected'
    ) {
      setShowQuickLogin(true);
    } else if (gasConnectionHealth.status === 'online') {
      setShowQuickLogin(false);
      setInlineError(null);
      setPassword('');
    }
  }, [gasConnectionHealth.status]);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const visual = getStatusVisual(
    gasConnectionHealth.status,
    gasConnectionHealth.isReconnecting,
  );
  const busy =
    gasConnectionHealth.isReconnecting ||
    gasConnectionHealth.status === 'checking' ||
    isSyncingDrive;

  const handleForcedReconnect = async () => {
    setInlineError(null);
    const res = await forceReconnectAppsScript();
    if (!res.ok) {
      setInlineError(res.message);
      if (res.needsLogin) setShowQuickLogin(true);
    }
  };

  const handleQuickLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setInlineError('Preencha Usuário e Senha para reconectar.');
      return;
    }
    setInlineError(null);
    const res = await forceReconnectAppsScript({
      username: username.trim(),
      password: password.trim(),
    });
    if (!res.ok) {
      setInlineError(res.message);
    } else {
      setPassword('');
      setShowQuickLogin(false);
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Status do Google Apps Script: ${visual.label}`}
        aria-expanded={open}
        title={`Google Apps Script: ${visual.label}${
          gasConnectionHealth.latencyMs ? ` (${gasConnectionHealth.latencyMs} ms)` : ''
        } — Clique para verificar ou forçar reconexão`}
        className={`relative inline-flex items-center justify-center gap-1.5 h-9 sm:h-10 px-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer ${visual.badgeClass} hover:border-[var(--accent)]`}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className={`inline-flex h-2 w-2 rounded-full ${visual.dotClass}`} />
        </span>
        {busy ? (
          <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
        ) : visual.isOnline ? (
          <Cloud className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <CloudOff className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="hidden md:inline text-[11px] font-bold whitespace-nowrap">
          {isSyncingDrive && visual.isOnline ? 'Salvando…' : visual.shortLabel}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Monitor de conexão Google Apps Script"
          className="absolute right-0 top-[calc(100%+8px)] w-[min(340px,calc(100vw-24px))] rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl p-3.5 z-50 text-left"
        >
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[var(--line)]">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span className="text-[12px] font-extrabold text-[var(--text)] truncate">
                  Conexão Google Apps Script
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10.5px] font-bold ${visual.badgeClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${visual.dotClass}`} />
                  {visual.label}
                </span>
                {gasConnectionHealth.latencyMs !== null && (
                  <span className="text-[10.5px] font-mono-num text-[var(--muted)]">
                    {gasConnectionHealth.latencyMs} ms
                  </span>
                )}
                {gasConnectionHealth.serverVersion !== null && (
                  <span className="text-[10.5px] font-mono-num text-[var(--muted)]">
                    · v{gasConnectionHealth.serverVersion}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar painel de conexão"
              className="grid place-items-center w-6 h-6 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-raised)] cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="py-2.5 space-y-1.5 text-[11px] text-[var(--muted)]">
            <div className="flex items-center justify-between gap-2">
              <span>Conta ativa</span>
              <strong className="text-[var(--text)] truncate max-w-[180px]">
                {gasSession?.username || 'Não conectado'}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Pasta no Drive</span>
              <strong className="text-[var(--text)] truncate max-w-[180px]">
                {gasConnectionHealth.folderName || gasSession?.folderName || '—'}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Última verificação</span>
              <span className="font-mono-num text-[var(--text)]">
                {formatClockTime(gasConnectionHealth.lastCheckedAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Sincronização</span>
              <span className="font-semibold text-[var(--text)]">
                {hasPendingCloudChanges ? 'Alterações pendentes' : 'Tudo salvo na nuvem'}
              </span>
            </div>
          </div>

          {(inlineError || gasConnectionHealth.errorMessage) && !visual.isOnline && (
            <div className="mb-2.5 rounded-xl border border-[var(--warning)]/45 bg-[var(--warning)]/10 px-2.5 py-2 text-[11px] text-[var(--text)] leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0 mt-0.5" />
              <span className="min-w-0">{inlineError || gasConnectionHealth.errorMessage}</span>
            </div>
          )}

          {showQuickLogin && (
            <form onSubmit={handleQuickLoginSubmit} className="mb-2.5 space-y-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5">
              <div className="text-[11px] font-bold text-[var(--text)]">
                Reautenticação rápida (sem sair da página)
              </div>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Usuário"
                  autoComplete="username"
                  className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha"
                  autoComplete="current-password"
                  className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <button
                type="submit"
                disabled={gasConnectionHealth.isReconnecting}
                className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
              >
                {gasConnectionHealth.isReconnecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Reconectar sessão</span>
              </button>
            </form>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => void handleForcedReconnect()}
              disabled={gasConnectionHealth.isReconnecting}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
            >
              {gasConnectionHealth.isReconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Forçar Reconexão</span>
            </button>

            <button
              type="button"
              onClick={() => void checkGasConnectionNow({ silent: false })}
              disabled={gasConnectionHealth.isReconnecting || gasConnectionHealth.status === 'checking'}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[11.5px] font-bold hover:border-[var(--accent)] disabled:opacity-60 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Testar Agora</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setActivePage('Backup e Restauração');
            }}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-raised)] transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Gerenciar em Backup e Restauração</span>
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Painel completo de monitoramento na aba Backup e Restauração.
 */
export const GasConnectionMonitorPanel: React.FC = () => {
  const {
    gasSession,
    gasConnectionHealth,
    hasPendingCloudChanges,
    checkGasConnectionNow,
    forceReconnectAppsScript,
  } = useStudy();

  const [username, setUsername] = useState(() => gasSession?.username || '');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (gasSession?.username && !username) {
      setUsername(gasSession.username);
    }
  }, [gasSession?.username, username]);

  const visual = getStatusVisual(
    gasConnectionHealth.status,
    gasConnectionHealth.isReconnecting,
  );

  const needsInlineLogin =
    gasConnectionHealth.status === 'session-expired' ||
    gasConnectionHealth.status === 'disconnected';

  const handleForcedReconnect = async () => {
    setFeedback(null);
    const res = await forceReconnectAppsScript();
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleManualCheck = async () => {
    setFeedback(null);
    const res = await checkGasConnectionNow({ silent: false });
    if (res.status === 'online') {
      setFeedback({
        ok: true,
        text: `Google Apps Script Online (${res.latencyMs ?? 0} ms) · Estado v${res.serverVersion ?? 0}.`,
      });
    } else {
      setFeedback({
        ok: false,
        text: res.errorMessage || 'Google Apps Script indisponível no momento.',
      });
    }
  };

  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setFeedback({ ok: false, text: 'Informe Usuário e Senha para reconectar.' });
      return;
    }
    setFeedback(null);
    const res = await forceReconnectAppsScript({
      username: username.trim(),
      password: password.trim(),
    });
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) setPassword('');
  };

  return (
    <Panel
      title="Monitor de Conexão — Google Apps Script (Tempo Real)"
      subtitle="Verifica automaticamente a saúde da conexão e da sessão a cada 60 segundos (e ao voltar para a aba), permitindo reconexão forçada sem atualizar a página."
      className="mb-4"
    >
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span
              className={`grid place-items-center w-10 h-10 rounded-xl border shrink-0 ${visual.badgeClass}`}
            >
              {gasConnectionHealth.isReconnecting || gasConnectionHealth.status === 'checking' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : visual.isOnline ? (
                <Wifi className="w-5 h-5" />
              ) : (
                <WifiOff className="w-5 h-5" />
              )}
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[13.5px] font-extrabold text-[var(--text)]">
                  Status: {visual.label}
                </strong>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10.5px] font-bold ${visual.badgeClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${visual.dotClass}`} />
                  {visual.isOnline ? 'Sessão Validada' : visual.label}
                </span>
              </div>
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)] leading-relaxed">
                {visual.isOnline
                  ? `Conectado como ${gasSession?.username || 'usuário'} na pasta "${
                      gasConnectionHealth.folderName || gasSession?.folderName || 'Central de Estudos'
                    }". Verificação automática ativa a cada 60s.`
                  : gasConnectionHealth.errorMessage ||
                    'A conexão com o Google Apps Script não está ativa. Use "Forçar Reconexão" sem recarregar a página.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleForcedReconnect()}
              disabled={gasConnectionHealth.isReconnecting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer shadow-xs"
            >
              {gasConnectionHealth.isReconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{gasConnectionHealth.isReconnecting ? 'Reconectando…' : 'Forçar Reconexão'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleManualCheck()}
              disabled={gasConnectionHealth.isReconnecting || gasConnectionHealth.status === 'checking'}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Verificar agora</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-raised)] px-3 py-2">
            <div className="text-[10.5px] font-semibold text-[var(--muted)]">Latência</div>
            <div className="font-mono-num text-[14px] font-extrabold text-[var(--text)] mt-0.5">
              {gasConnectionHealth.latencyMs !== null ? `${gasConnectionHealth.latencyMs} ms` : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-raised)] px-3 py-2">
            <div className="text-[10.5px] font-semibold text-[var(--muted)]">Última verificação</div>
            <div className="font-mono-num text-[14px] font-extrabold text-[var(--text)] mt-0.5">
              {formatClockTime(gasConnectionHealth.lastCheckedAt)}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-raised)] px-3 py-2">
            <div className="text-[10.5px] font-semibold text-[var(--muted)]">Último Online</div>
            <div className="font-mono-num text-[14px] font-extrabold text-[var(--text)] mt-0.5">
              {formatClockTime(gasConnectionHealth.lastOnlineAt)}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-raised)] px-3 py-2">
            <div className="text-[10.5px] font-semibold text-[var(--muted)]">Fila pendente</div>
            <div className="text-[13px] font-extrabold text-[var(--text)] mt-0.5">
              {hasPendingCloudChanges ? 'Aguardando envio' : 'Em dia'}
            </div>
          </div>
        </div>

        {needsInlineLogin && (
          <form
            onSubmit={handleInlineLogin}
            className="rounded-xl border border-[var(--warning)]/45 bg-[var(--warning)]/8 p-3 flex flex-col sm:flex-row sm:items-end gap-2.5"
          >
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-bold text-[var(--text)] mb-1">
                Usuário
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Seu usuário do Apps Script"
                autoComplete="username"
                className="w-full h-9 px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] font-bold text-[var(--text)] mb-1">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                autoComplete="current-password"
                className="w-full h-9 px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[12px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <button
              type="submit"
              disabled={gasConnectionHealth.isReconnecting}
              className="w-full sm:w-auto h-9 px-4 rounded-lg bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              Reconectar agora
            </button>
          </form>
        )}

        {feedback && (
          <div
            className={`rounded-xl border px-3 py-2 text-[11.5px] font-semibold flex items-center gap-2 ${
              feedback.ok
                ? 'border-[var(--good)]/45 bg-[var(--good)]/10 text-[var(--good)]'
                : 'border-[var(--bad)]/45 bg-[var(--bad)]/10 text-[var(--bad)]'
            }`}
          >
            {feedback.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>
    </Panel>
  );
};
