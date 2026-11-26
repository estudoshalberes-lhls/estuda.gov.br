import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  BookOpenText,
  Check,
  CloudOff,
  CloudUpload,
  Focus,
  Home,
  Keyboard,
  Link2,
  Menu,
  Minimize2,
  Moon,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sun,
  Timer,
  X,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { useStudyTimer } from '../../lib/timerTickStore';
import { MODULES, getGovModuleLabel } from '../../data/seedData';
import { WEEKDAYS, formatClock, formatScheduleDuration, visibleName } from '../../lib/parsers';
import { ModuleName, ThemeId, WeekdayName } from '../../types/study';
import { DailyGoalWidget } from './DailyGoalWidget';
import { PostItWidget } from './PostItWidget';
import { ModuleIcon } from '../ui/ModuleIcon';
import { PWAInstallButton } from '../ui/PWAInstallButton';
import { GasConnectionTopbarWidget } from '../backup/GasConnectionMonitor';
import { DailyGoalPushModal } from '../study/DailyGoalPushModal';

interface TopbarProps {
  onExitToLogin?: () => void;
  studyFocusMode?: boolean;
  onToggleStudyFocus?: () => void;
  onOpenShortcuts?: () => void;
  onOpenCommandPalette?: () => void;
}

const DEFAULT_QUICK_MODULES: [ModuleName, ModuleName, ModuleName] = [
  'Cronograma',
  'Lei Seca',
  'Matriz de Incidência',
];

const WALL_TIME_FMT = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const WALL_DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
});
const WALL_FULL_DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const TopbarWallClock: React.FC = React.memo(() => {
  const [wallSecond, setWallSecond] = useState<number>(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = Math.floor(Date.now() / 1000);
      setWallSecond((prev) => (prev !== next ? next : prev));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const { clockText, dateText, fullDateTitle } = useMemo(() => {
    const now = new Date(wallSecond * 1000);
    return {
      clockText: WALL_TIME_FMT.format(now),
      dateText: WALL_DATE_FMT.format(now),
      fullDateTitle: WALL_FULL_DATE_FMT.format(now),
    };
  }, [wallSecond]);

  return (
    <div
      title={fullDateTitle}
      className="hidden xl:flex flex-col justify-center leading-none pr-2.5 border-r border-[var(--line)] h-7"
    >
      <span className="text-[9.5px] font-semibold text-[var(--muted)] whitespace-nowrap leading-none mb-1 tabular-nums">
        {dateText}
      </span>
      <strong className="font-mono-num text-[12.5px] font-bold text-[var(--text)] tabular-nums leading-none">
        {clockText}
      </strong>
    </div>
  );
});

const TopbarTimerReadout: React.FC = React.memo(() => {
  const {
    timerSeconds,
    timerRunning,
    timerStartedAt,
    pomodoroMode,
    pomodoroPhase,
    pomodoroRemainingSeconds,
  } = useStudyTimer();

  const startedAtClock =
    timerRunning && timerStartedAt > 0
      ? new Date(timerStartedAt).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

  return (
    <div
      title={
        startedAtClock
          ? `Sessão atual iniciada às ${startedAtClock} (será registrada no Portal da Transparência ao pausar)`
          : 'Cronômetro de estudo'
      }
      className={`flex flex-col justify-center leading-none h-8 px-2.5 rounded-lg transition-colors shrink-0 ${
        timerRunning
          ? 'border border-[var(--accent)] bg-[var(--accent)] shadow-xs'
          : 'border border-transparent'
      }`}
    >
      <span
        className={`text-[9.5px] font-semibold whitespace-nowrap leading-none mb-0.5 transition-colors tabular-nums ${
          timerRunning ? 'text-white/90' : 'text-[var(--muted)]'
        }`}
      >
        {pomodoroMode === 'continuous'
          ? startedAtClock
            ? `Cronômetro · ${startedAtClock}`
            : 'Cronômetro'
          : pomodoroPhase === 'focus'
          ? `Pomo ${pomodoroMode === 'custom' ? 'Pers.' : pomodoroMode}${startedAtClock ? ` · ${startedAtClock}` : ''}`
          : 'Pausa'}
      </span>
      <strong
        className={`font-mono-num text-[13px] font-extrabold tabular-nums leading-none transition-colors ${
          timerRunning ? 'text-white' : 'text-[var(--text)]'
        }`}
      >
        {pomodoroMode === 'continuous'
          ? formatClock(timerSeconds)
          : formatClock(pomodoroRemainingSeconds)}
      </strong>
    </div>
  );
});

const TopbarSaveTimerButton: React.FC<{ onClick: () => void }> = React.memo(({ onClick }) => {
  const { timerSeconds } = useStudyTimer();
  if (timerSeconds <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Contabilizar tempo"
      className="grid place-items-center w-7 h-7 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[10.5px] font-bold shrink-0"
    >
      <Check className="w-3.5 h-3.5 shrink-0" />
    </button>
  );
});

const FocusCompactTimer: React.FC<{ onToggleTimer: () => void }> = React.memo(({ onToggleTimer }) => {
  const { timerSeconds, timerRunning, pomodoroMode, pomodoroRemainingSeconds } = useStudyTimer();
  const displayClock =
    pomodoroMode === 'continuous'
      ? formatClock(timerSeconds)
      : formatClock(pomodoroRemainingSeconds);

  return (
    <div className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] shrink-0">
      <Timer className={`w-3.5 h-3.5 shrink-0 ${timerRunning ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`} />
      <span className="font-mono-num tabular-nums text-[12px] font-bold text-[var(--text)]">
        {displayClock}
      </span>
      <button
        type="button"
        onClick={onToggleTimer}
        className={`h-5 px-2 rounded text-[10.5px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
          timerRunning
            ? 'bg-[var(--accent)] text-white'
            : 'bg-[var(--panel-raised)] text-[var(--text)] border border-[var(--line-strong)] hover:border-[var(--accent)]'
        }`}
      >
        {timerRunning ? 'Pausar' : 'Iniciar'}
      </button>
    </div>
  );
});

export const Topbar: React.FC<TopbarProps> = React.memo(
  ({
    onExitToLogin,
    studyFocusMode = false,
    onToggleStudyFocus,
    onOpenShortcuts,
    onOpenCommandPalette,
  }) => {
  const {
    db,
    activePage,
    setActivePage,
    setMobileOpen,
    updatePreferences,
    getCurrentTimerSeconds,
    timerRunning,
    toggleTimer,
    resetTimer,
    pomodoroMode,
    setPomodoroMode,
    activeTimerTopic,
    linkTimerToScheduleTopic,
    clearTimerLink,
    commitTimerToSchedule,
    driveConnected,
    gasConnected,
    isRenewingDriveToken,
    isSyncingDrive,
    hasPendingCloudChanges,
    pendingLocalChangesCount,
    totalPendingSyncCount,
    gasOperationQueue,
    driveUploadOutboxItems,
    lastCloudSyncAt,
    saveCloudBackup,
    triggerActiveSyncPushNow,
    processGasQueueNow,
    drivePermissionNeedsPicker,
    authorizeDriveFolderViaPicker,
    toast,
  } = useStudy();

  const [pomoMenuOpen, setPomoMenuOpen] = useState(false);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const pushAlertsActive = Boolean(db.preferences?.push_notifications?.enabled);
  const [pomoFocusInput, setPomoFocusInput] = useState<string>(
    String(db.preferences?.pomodoro_focus_minutes || 40),
  );
  const [pomoBreakInput, setPomoBreakInput] = useState<string>(
    String(db.preferences?.pomodoro_break_minutes || 10),
  );
  const pomoAutoCommit = db.preferences?.pomodoro_auto_commit !== false;

  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const todayWeekday: WeekdayName = WEEKDAYS[(new Date().getDay() + 6) % 7];
  const [pickerDay, setPickerDay] = useState<WeekdayName>(todayWeekday);
  const linkPopoverRef = useRef<HTMLDivElement | null>(null);

  // Quick access 3 customizable modules state & unified utilities menu
  const [quickConfigOpen, setQuickConfigOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const morePopoverRef = useRef<HTMLDivElement | null>(null);

  // Unsynced pending changes popover
  const [pendingSyncOpen, setPendingSyncOpen] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const pendingPopoverRef = useRef<HTMLDivElement | null>(null);

  const quickModules = useMemo<[ModuleName, ModuleName, ModuleName]>(() => {
    const saved = db.preferences?.quick_access_modules;
    const validModuleNames = new Set<ModuleName>(MODULES.map((m) => m.name));
    if (Array.isArray(saved) && saved.length > 0) {
      const m0 = validModuleNames.has(saved[0]) ? saved[0] : DEFAULT_QUICK_MODULES[0];
      const m1 = validModuleNames.has(saved[1]) ? saved[1] : DEFAULT_QUICK_MODULES[1];
      const m2 = validModuleNames.has(saved[2]) ? saved[2] : DEFAULT_QUICK_MODULES[2];
      return [m0, m1, m2];
    }
    return DEFAULT_QUICK_MODULES;
  }, [db.preferences?.quick_access_modules]);

  const setQuickModuleAtSlot = (slotIndex: 0 | 1 | 2, moduleName: ModuleName) => {
    const next: [ModuleName, ModuleName, ModuleName] = [
      quickModules[0],
      quickModules[1],
      quickModules[2],
    ];
    next[slotIndex] = moduleName;
    updatePreferences({ quick_access_modules: next });
  };

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (linkPopoverRef.current && !linkPopoverRef.current.contains(e.target as Node)) {
        setLinkMenuOpen(false);
        setPomoMenuOpen(false);
      }
      if (morePopoverRef.current && !morePopoverRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
        setQuickConfigOpen(false);
      }
      if (pendingPopoverRef.current && !pendingPopoverRef.current.contains(e.target as Node)) {
        setPendingSyncOpen(false);
      }
    };
    if (linkMenuOpen || pomoMenuOpen || moreMenuOpen || quickConfigOpen || pendingSyncOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [linkMenuOpen, pomoMenuOpen, moreMenuOpen, quickConfigOpen, pendingSyncOpen]);

  const handleSyncPendingNow = async () => {
    if (manualSyncing) return;
    setManualSyncing(true);
    try {
      if (gasConnected) {
        if (gasOperationQueue.length > 0) {
          await processGasQueueNow({ forceAll: true });
        }
        await triggerActiveSyncPushNow();
      } else if (driveConnected) {
        await saveCloudBackup();
      } else {
        setPendingSyncOpen(false);
        setActivePage('Backup e Restauração');
      }
    } finally {
      setManualSyncing(false);
    }
  };

  const dayTopics = db.schedule[pickerDay] || [];

  const handleSaveTimerClick = () => {
    if (activeTimerTopic) {
      commitTimerToSchedule();
    } else {
      setPickerDay(todayWeekday);
      setLinkMenuOpen(true);
    }
  };

  if (studyFocusMode) {
    return (
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-7 h-11 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur-xs w-full">
        <div className="flex items-center gap-2 min-w-0">
          <Focus className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
          <span className="text-[12.5px] font-bold text-[var(--text)] truncate">
            {getGovModuleLabel(activePage)}
          </span>
          <span className="hidden sm:inline text-[11px] text-[var(--muted)] whitespace-nowrap">
            · Modo Foco
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <FocusCompactTimer onToggleTimer={toggleTimer} />

          {onToggleStudyFocus && (
            <button
              type="button"
              onClick={onToggleStudyFocus}
              aria-pressed="true"
              title="Sair do Modo Foco (Alt+Shift+F)"
              className="inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5 shrink-0" />
              <span>Sair do Modo Foco</span>
            </button>
          )}
        </div>
      </header>
    );
  }

  const QUICK_THEME_OPTIONS: ReadonlyArray<{ id: ThemeId; label: string }> = [
    { id: 'gov-padrao', label: 'Claro' },
    { id: 'gov-escuro', label: 'Escuro' },
    { id: 'reading-comfort', label: 'Leitura' },
  ];
  const currentThemeId = db.preferences?.tema || 'gov-padrao';
  const handleSelectQuickTheme = (themeId: ThemeId, label: string) => {
    updatePreferences({ tema: themeId });
    toast(`Tema alterado para ${label}.`);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between flex-nowrap gap-3 px-3 sm:px-5 h-[56px] border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur-xs w-full">
      {/* Zona 1: Menu Mobile + Contexto do Módulo */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0 h-9">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="mobile-menu-btn w-9 h-9 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)] transition-colors shrink-0 grid place-items-center"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="min-w-0 hidden sm:flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-[var(--panel-soft)] border border-[var(--line)] shrink-0">
            <ModuleIcon
              name={MODULES.find((m) => m.name === activePage)?.icon || 'home'}
              className="w-[17px] h-[17px] shrink-0"
            />
          </span>
          <div className="min-w-0 flex flex-col justify-center">
            <div className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--muted)] leading-none mb-0.5">
              <span className="text-[var(--accent)] font-bold">estuda.gov.br</span>
              <span className="text-[var(--subtle)]">/</span>
              <span className="truncate">Portal Único</span>
            </div>
            <h1 className="m-0 font-display text-[14px] font-extrabold tracking-[-0.015em] leading-none text-[var(--text)] truncate max-w-[200px]">
              {getGovModuleLabel(activePage)}
            </h1>
          </div>
        </div>
      </div>

      {/* Zona 2: Meta do Dia, Post-it e Cronômetro */}
      <div className="flex items-center justify-center gap-2 flex-1 min-w-0">
        <div className="flex-1 min-w-[130px] sm:min-w-[200px] max-w-[360px] h-9 flex items-center gap-1.5">
          <div className="flex-1 min-w-0 h-full">
            <DailyGoalWidget />
          </div>
          <PostItWidget />
        </div>

        <div
          ref={linkPopoverRef}
          className="relative flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 min-h-9 px-2 sm:px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] shrink-0"
          aria-label="Cronômetro"
        >
        <TopbarWallClock />

        <TopbarTimerReadout />

        <div className="flex items-center gap-1 sm:gap-1.5 pl-2 sm:pl-2.5 border-l border-[var(--line)] h-7 shrink-0">
          <button
            type="button"
            onClick={() => {
              setLinkMenuOpen(false);
              setPomoFocusInput(String(db.preferences?.pomodoro_focus_minutes || 40));
              setPomoBreakInput(String(db.preferences?.pomodoro_break_minutes || 10));
              setPomoMenuOpen((v) => !v);
            }}
            title="Configurar Pomodoro (25/5, 45/10, 50/10 ou Personalizado)"
            className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg border text-[10.5px] font-bold whitespace-nowrap leading-none transition-colors cursor-pointer ${
              pomodoroMode !== 'continuous'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <Timer className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">
              {pomodoroMode === 'continuous'
                ? 'Pomo'
                : pomodoroMode === 'custom'
                ? `${db.preferences?.pomodoro_focus_minutes || 40}/${db.preferences?.pomodoro_break_minutes || 10}`
                : pomodoroMode}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPomoMenuOpen(false);
              setPickerDay(todayWeekday);
              setLinkMenuOpen((v) => !v);
            }}
            title="Vincular ao cronograma"
            className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg border text-[10.5px] font-bold whitespace-nowrap leading-none transition-colors ${
              activeTimerTopic
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <Link2 className="w-3 h-3 shrink-0" />
            <span className="hidden md:inline truncate max-w-[90px]">
              {activeTimerTopic ? visibleName(activeTimerTopic.disciplinaFixa || activeTimerTopic.materia) : 'Vincular'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleTimer}
            className={`inline-flex items-center justify-center h-7 px-2.5 rounded-lg border text-[10.5px] font-bold whitespace-nowrap leading-none shadow-xs transition-colors ${
              timerRunning
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            {timerRunning ? 'Pausar' : 'Iniciar'}
          </button>

          <TopbarSaveTimerButton onClick={handleSaveTimerClick} />

          <button
            type="button"
            onClick={resetTimer}
            aria-label="Zerar cronômetro"
            title="Zerar cronômetro"
            className="grid place-items-center w-7 h-7 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {pomoMenuOpen && (
          <div className="ce-popover-enter absolute right-0 top-[calc(100%+8px)] z-40 w-[300px] max-w-[92vw] rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--panel)] p-3.5 shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-[var(--line)]">
              <strong className="text-[12px] font-extrabold text-[var(--text)] leading-none">
                Modo Pomodoro &amp; Ponto Eletrônico
              </strong>
              <button
                type="button"
                onClick={() => setPomoMenuOpen(false)}
                className="grid place-items-center w-6 h-6 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] cursor-pointer"
                aria-label="Fechar Pomodoro"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {(
                [
                  { id: 'continuous', label: 'Livre (Contínuo)' },
                  { id: '25-5', label: '25 / 5 min' },
                  { id: '45-10', label: '45 / 10 min' },
                  { id: '50-10', label: '50 / 10 min' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setPomodoroMode(preset.id);
                    setPomoMenuOpen(false);
                  }}
                  className={`h-8 px-2.5 rounded-lg border text-[11.5px] font-bold transition-colors cursor-pointer ${
                    pomodoroMode === preset.id
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5 mb-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                Personalizado (Foco / Pausa em min)
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={pomoFocusInput}
                  onChange={(e) => setPomoFocusInput(e.target.value)}
                  className="ce-input w-16 h-8 rounded-lg px-2 text-center font-mono-num text-[12px]"
                  aria-label="Minutos de foco"
                />
                <span className="text-[11px] font-bold text-[var(--muted)]">/</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={pomoBreakInput}
                  onChange={(e) => setPomoBreakInput(e.target.value)}
                  className="ce-input w-14 h-8 rounded-lg px-2 text-center font-mono-num text-[12px]"
                  aria-label="Minutos de pausa"
                />
                <button
                  type="button"
                  onClick={() => {
                    const f = Math.max(5, Math.min(180, Math.round(Number(pomoFocusInput) || 40)));
                    const b = Math.max(1, Math.min(60, Math.round(Number(pomoBreakInput) || 10)));
                    updatePreferences({ pomodoro_focus_minutes: f, pomodoro_break_minutes: b });
                    window.setTimeout(() => setPomodoroMode('custom'), 0);
                    setPomoMenuOpen(false);
                  }}
                  className="flex-1 h-8 px-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-extrabold hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </div>

            <label className="flex items-start gap-2 text-[11px] text-[var(--text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pomoAutoCommit}
                onChange={(e) =>
                  updatePreferences({ pomodoro_auto_commit: e.target.checked })
                }
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>
                <strong>Lançar automaticamente</strong> na Matéria Fixa vinculada ao concluir cada ciclo de foco
              </span>
            </label>
          </div>
        )}

        {linkMenuOpen && (
          <div className="ce-popover-enter absolute right-0 top-[calc(100%+8px)] z-40 w-[320px] max-w-[92vw] rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--panel)] p-3.5 shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--line)]">
              <strong className="text-[12px] font-extrabold text-[var(--text)] leading-none">
                Vincular ao Cronograma
              </strong>
              <button
                type="button"
                onClick={() => setLinkMenuOpen(false)}
                className="grid place-items-center w-6 h-6 rounded-lg border border-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors"
                aria-label="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeTimerTopic && (
              <div className="flex items-center justify-between gap-2 mb-2.5 p-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[11px]">
                <span className="truncate text-[var(--text)]">
                  Ativo: <strong>{visibleName(activeTimerTopic.disciplinaFixa || activeTimerTopic.materia)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    clearTimerLink();
                    setLinkMenuOpen(false);
                  }}
                  className="text-[10px] font-bold text-[var(--bad)] hover:underline shrink-0"
                >
                  Desvincular
                </button>
              </div>
            )}

            <div className="mb-2.5">
              <select
                value={pickerDay}
                onChange={(e) => setPickerDay(e.target.value as WeekdayName)}
                className="ce-select w-full text-[11.5px] h-8 py-0 px-2.5 font-semibold"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {d} ({(db.schedule[d] || []).length})
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-[160px] overflow-y-auto flex flex-col gap-1.5">
              {dayTopics.length ? (
                dayTopics.map((topic) => {
                  const isLinked = activeTimerTopic?.topicId === topic.id;
                  return (
                    <div
                      key={topic.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] ${
                        isLinked
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--line)] bg-[var(--panel-soft)]'
                      }`}
                    >
                      <span className="truncate text-[var(--text)] font-medium">
                        {visibleName(topic.materia || topic.disciplina_fixa || 'Tópico')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          linkTimerToScheduleTopic(pickerDay, topic, getCurrentTimerSeconds() === 0);
                          setLinkMenuOpen(false);
                        }}
                        className="inline-flex items-center justify-center h-6 px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[10px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors shrink-0"
                      >
                        {isLinked ? 'Ativo' : 'Vincular'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="py-3 text-center text-[11px] text-[var(--muted)]">
                  Nenhum tópico em {pickerDay}.
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Zona 3: Busca Ctrl+K, Modo Foco, Sync Ativo e Menu Rápido Consolidado */}
      <div className="flex items-center gap-1.5 h-9 shrink-0">
        {onOpenCommandPalette && (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Busca global (Ctrl+K)"
            title="Busca global em módulos, leis, resumos e cronograma (Ctrl+K)"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline text-[11px] font-mono-num text-[var(--subtle)]">
              Ctrl+K
            </span>
          </button>
        )}

        {onToggleStudyFocus && (
          <button
            type="button"
            onClick={onToggleStudyFocus}
            aria-pressed="false"
            aria-label="Ativar Modo Foco"
            title="Ativar Modo Foco (Alt+Shift+F) — oculta barra lateral, barra Gov e rodapé"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Focus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Foco</span>
          </button>
        )}

        <PWAInstallButton variant="topbar" />

        {driveConnected && drivePermissionNeedsPicker ? (
          <button
            type="button"
            onClick={() => void authorizeDriveFolderViaPicker()}
            disabled={isSyncingDrive}
            aria-label="Autorizar pasta do Google Drive"
            title={`Autorizar acesso aos backups da pasta "${drivePermissionNeedsPicker.folderName}" no Google Drive`}
            className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--warning)] text-[11px] font-bold hover:bg-[var(--warning)]/25 transition-colors shrink-0 whitespace-nowrap"
          >
            <CloudOff className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Autorizar Drive</span>
          </button>
        ) : driveConnected && isRenewingDriveToken ? (
          <span
            aria-label="Sincronizando sessão do Google Drive"
            title="Validando conexão com o Google Drive em segundo plano…"
            className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold shrink-0 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
            <span className="hidden sm:inline">Sincronizando…</span>
          </span>
        ) : hasPendingCloudChanges || totalPendingSyncCount > 0 ? (
          <div ref={pendingPopoverRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPendingSyncOpen((v) => !v)}
              aria-label={`${totalPendingSyncCount} alteração(ões) local(is) aguardando envio para a nuvem`}
              title={
                driveConnected || gasConnected
                  ? `${totalPendingSyncCount} alteração(ões) local(is) aguardando envio para a nuvem`
                  : `${totalPendingSyncCount} alteração(ões) salva(s) apenas localmente (conecte a nuvem para sincronizar)`
              }
              className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)] transition-colors shrink-0 whitespace-nowrap cursor-pointer"
            >
              {isSyncingDrive || manualSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 text-[var(--accent)] animate-spin shrink-0" />
              ) : (
                <CloudUpload className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
              )}
              <span className="font-mono-num text-[11.5px] font-bold tabular-nums">
                {totalPendingSyncCount}
              </span>
            </button>

            {pendingSyncOpen && (
              <div className="ce-popover-enter absolute right-0 top-[calc(100%+8px)] z-40 w-[300px] max-w-[92vw] rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--panel)] p-3.5 shadow-xl">
                <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-[var(--line)]">
                  <strong className="text-[12px] font-extrabold text-[var(--text)] leading-none">
                    Pendências de Sincronização
                  </strong>
                  <button
                    type="button"
                    onClick={() => setPendingSyncOpen(false)}
                    className="grid place-items-center w-6 h-6 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)]"
                    aria-label="Fechar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5 text-[11.5px] text-[var(--muted)] mb-3 tabular-nums">
                  <div className="flex items-center justify-between">
                    <span>Alterações locais pendentes</span>
                    <strong className="font-mono-num text-[var(--text)]">
                      {Math.max(hasPendingCloudChanges ? 1 : 0, pendingLocalChangesCount)}
                    </strong>
                  </div>
                  {gasOperationQueue.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span>Operações na fila da nuvem</span>
                      <strong className="font-mono-num text-[var(--text)]">
                        {gasOperationQueue.length}
                      </strong>
                    </div>
                  )}
                  {driveUploadOutboxItems.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span>Arquivos aguardando envio</span>
                      <strong className="font-mono-num text-[var(--text)]">
                        {driveUploadOutboxItems.length}
                      </strong>
                    </div>
                  )}
                  <div className="pt-1.5 mt-1 border-t border-[var(--line)]/60 flex items-center justify-between text-[11px]">
                    <span>Última sincronização</span>
                    <span className="font-mono-num text-[var(--text)]">
                      {lastCloudSyncAt
                        ? new Date(lastCloudSyncAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Ainda não sincronizado'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingSyncOpen(false);
                      setActivePage('Backup e Restauração');
                    }}
                    className="h-7 px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                  >
                    Ver Backup
                  </button>
                  <button
                    type="button"
                    disabled={isSyncingDrive || manualSyncing}
                    onClick={() => void handleSyncPendingNow()}
                    className="inline-flex items-center gap-1 h-7 px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isSyncingDrive || manualSyncing ? 'animate-spin' : ''}`}
                    />
                    {driveConnected || gasConnected ? 'Sincronizar agora' : 'Conectar nuvem'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <GasConnectionTopbarWidget />

        {/* Menu Rápido Consolidado: Tema, Atalhos 1-2-3, Alertas Push, Teclado e Tela Inicial */}
        <div ref={morePopoverRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setMoreMenuOpen((v) => !v);
              setQuickConfigOpen(false);
            }}
            aria-expanded={moreMenuOpen}
            aria-label="Preferências rápidas e utilitários"
            title="Tema, atalhos rápidos, alertas Push e mais opções"
            className={`relative grid place-items-center w-9 h-9 rounded-lg border transition-colors shrink-0 cursor-pointer ${
              moreMenuOpen
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
            {pushAlertsActive && (
              <span
                className="sr-only"
                aria-label="Notificações Push ativas"
              >
                Push ativo
              </span>
            )}
          </button>

          {moreMenuOpen && (
            <div className="ce-popover-enter absolute right-0 top-[calc(100%+8px)] z-40 w-[300px] max-w-[92vw] rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--panel)] p-3.5 shadow-xl">
              {/* Aparência (Claro / Escuro / Leitura) */}
              <div className="pb-3 mb-3 border-b border-[var(--line)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11.5px] font-bold text-[var(--text)]">Tema rápido</span>
                  <span className="text-[10.5px] text-[var(--muted)]">
                    {currentThemeId === 'reading-comfort'
                      ? 'Leitura'
                      : currentThemeId === 'gov-escuro' || currentThemeId.startsWith('black-')
                        ? 'Escuro'
                        : 'Claro'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[var(--panel-soft)] border border-[var(--line)]">
                  {QUICK_THEME_OPTIONS.map((opt) => {
                    const active = currentThemeId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectQuickTheme(opt.id, opt.label)}
                        className={`inline-flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--panel)] text-[var(--accent)] shadow-xs border border-[var(--line)]'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        {opt.id === 'gov-padrao' ? (
                          <Sun className="w-3 h-3" />
                        ) : opt.id === 'gov-escuro' ? (
                          <Moon className="w-3 h-3" />
                        ) : (
                          <BookOpenText className="w-3 h-3" />
                        )}
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Atalhos Rápidos (1, 2, 3) */}
              <div className="pb-3 mb-3 border-b border-[var(--line)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11.5px] font-bold text-[var(--text)]">Atalhos rápidos</span>
                  <button
                    type="button"
                    onClick={() => setQuickConfigOpen((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    {quickConfigOpen ? 'Concluir' : 'Personalizar'}
                  </button>
                </div>

                {!quickConfigOpen ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {quickModules.map((modName, idx) => {
                      const isCurrent = activePage === modName;
                      const moduleInfo = MODULES.find((m) => m.name === modName);
                      const iconName = moduleInfo ? moduleInfo.icon : 'home';
                      const displayLabel = getGovModuleLabel(modName);
                      return (
                        <button
                          key={`${idx}-${modName}`}
                          type="button"
                          onClick={() => {
                            setActivePage(modName);
                            setMoreMenuOpen(false);
                          }}
                          title={`Abrir ${displayLabel}`}
                          className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-center transition-colors cursor-pointer ${
                            isCurrent
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-bold'
                              : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                          }`}
                        >
                          <ModuleIcon name={iconName} className="w-4 h-4 shrink-0" />
                          <span className="text-[10.5px] font-semibold truncate w-full">
                            {displayLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {([0, 1, 2] as const).map((slotIdx) => (
                      <div key={slotIdx} className="flex items-center gap-2">
                        <span className="text-[10.5px] font-mono-num font-bold text-[var(--muted)] w-5 shrink-0">
                          #{slotIdx + 1}
                        </span>
                        <select
                          aria-label={`Atalho ${slotIdx + 1}`}
                          value={quickModules[slotIdx]}
                          onChange={(e) => {
                            setQuickModuleAtSlot(slotIdx, e.target.value as ModuleName);
                          }}
                          className="ce-select flex-1 text-[11.5px] h-8 py-0 px-2 font-semibold"
                        >
                          {MODULES.map((m) => (
                            <option key={m.name} value={m.name}>
                              {getGovModuleLabel(m.name)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        updatePreferences({ quick_access_modules: [...DEFAULT_QUICK_MODULES] });
                        toast('Atalhos restaurados.');
                      }}
                      className="self-start mt-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer bg-transparent border-0 p-0"
                    >
                      Restaurar padrão
                    </button>
                  </div>
                )}
              </div>

              {/* Ações Utilitárias */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setPushModalOpen(true);
                  }}
                  className="flex items-center justify-between gap-2 w-full px-2.5 py-2 rounded-lg text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    {pushAlertsActive ? (
                      <BellRing className="w-3.5 h-3.5 text-[var(--good)]" />
                    ) : (
                      <Bell className="w-3.5 h-3.5 text-[var(--muted)]" />
                    )}
                    <span>Alertas Push de metas</span>
                  </span>
                  <span className={`text-[11px] font-semibold ${pushAlertsActive ? 'text-[var(--good)]' : 'text-[var(--subtle)]'}`}>
                    {pushAlertsActive ? 'Ativo' : 'Configurar'}
                  </span>
                </button>

                {onOpenShortcuts && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenShortcuts();
                    }}
                    className="flex items-center justify-between gap-2 w-full px-2.5 py-2 rounded-lg text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Keyboard className="w-3.5 h-3.5 text-[var(--muted)]" />
                      <span>Atalhos de teclado</span>
                    </span>
                    <kbd className="font-mono-num text-[10.5px] text-[var(--subtle)]">?</kbd>
                  </button>
                )}

                {onExitToLogin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onExitToLogin();
                    }}
                    className="flex items-center justify-between gap-2 w-full px-2.5 py-2 rounded-lg text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Home className="w-3.5 h-3.5 text-[var(--muted)]" />
                      <span>Tela de Acesso / Login</span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <DailyGoalPushModal open={pushModalOpen} onClose={() => setPushModalOpen(false)} />
    </header>
  );
  },
);

