import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  HardDrive,
  Home,
  Link2,
  Menu,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { MODULES, getGovModuleLabel } from '../../data/seedData';
import { WEEKDAYS, formatClock, formatScheduleDuration, visibleName } from '../../lib/parsers';
import { ModuleName, WeekdayName } from '../../types/study';
import { GlobalSearch } from './GlobalSearch';
import { ModuleIcon } from '../ui/ModuleIcon';
import { PWAInstallButton } from '../ui/PWAInstallButton';

interface TopbarProps {
  onExitToLogin?: () => void;
}

const DEFAULT_QUICK_MODULES: [ModuleName, ModuleName, ModuleName] = [
  'Cronograma',
  'Lei Seca',
  'Matriz de Incidência',
];

export const Topbar: React.FC<TopbarProps> = ({ onExitToLogin }) => {
  const {
    db,
    disciplines,
    fixedSubjects,
    activePage,
    setActivePage,
    setMobileOpen,
    focusQuote,
    changeFocusQuote,
    updatePreferences,
    nowTick,
    timerSeconds,
    timerRunning,
    toggleTimer,
    resetTimer,
    pomodoroMode,
    pomodoroPhase,
    pomodoroRemainingSeconds,
    setPomodoroMode,
    activeTimerTopic,
    linkTimerToScheduleTopic,
    clearTimerLink,
    commitTimerToSchedule,
    googleUser,
    driveConnected,
    driveTokenReady,
    isRenewingDriveToken,
    isSyncingDrive,
    hasPendingCloudChanges,
    drivePermissionNeedsPicker,
    restoreProgress,
    connectGoogleDrive,
    disconnectGoogleDrive,
    authorizeDriveFolderViaPicker,
    localFolderConnected,
    localFolderWritable,
    localFolderName,
    isSyncingLocalFolder,
    firestoreConnectionMonitor,
    toast,
  } = useStudy();

  const cyclePomodoroMode = () => {
    const order = ['continuous', '25-5', '50-10'] as const;
    const next = order[(order.indexOf(pomodoroMode) + 1) % order.length];
    setPomodoroMode(next);
  };

  const wallSecond = Math.floor(nowTick / 1000);
  const { clockText, dateText, fullDateTitle } = useMemo(() => {
    const now = new Date(wallSecond * 1000);
    return {
      clockText: new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now),
      dateText: new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }).format(now),
      fullDateTitle: new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(now),
    };
  }, [wallSecond]);

  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const todayWeekday: WeekdayName = WEEKDAYS[(new Date(wallSecond * 1000).getDay() + 6) % 7];
  const [pickerDay, setPickerDay] = useState<WeekdayName>(todayWeekday);
  const linkPopoverRef = useRef<HTMLDivElement | null>(null);

  // Quick access 3 customizable modules state
  const [quickConfigOpen, setQuickConfigOpen] = useState(false);
  const [activeSlotIdx, setActiveSlotIdx] = useState<0 | 1 | 2>(0);
  const quickPopoverRef = useRef<HTMLDivElement | null>(null);

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
      }
      if (quickPopoverRef.current && !quickPopoverRef.current.contains(e.target as Node)) {
        setQuickConfigOpen(false);
      }
    };
    if (linkMenuOpen || quickConfigOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [linkMenuOpen, quickConfigOpen]);

  const dayTopics = db.schedule[pickerDay] || [];

  const handleSaveTimerClick = () => {
    if (activeTimerTopic) {
      commitTimerToSchedule();
    } else {
      setPickerDay(todayWeekday);
      setLinkMenuOpen(true);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between flex-wrap xl:flex-nowrap gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 border-b border-[var(--line)] bg-[var(--panel)] w-full shadow-xs">
      {/* Menu + Título */}
      <div className="flex items-center gap-2 min-w-0 shrink-0 h-9 sm:h-10">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="mobile-menu-btn w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)] transition-colors shrink-0 grid place-items-center"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="min-w-0 hidden sm:flex flex-col justify-center">
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.06em] uppercase text-[var(--accent)] leading-none mb-1">
            <span>estuda.gov.br</span>
            <span className="text-[var(--subtle)]">/</span>
            <span className="text-[var(--muted)] font-semibold">Painel</span>
          </div>
          <h1 className="m-0 font-display text-[15px] font-extrabold tracking-[-0.02em] leading-none text-[var(--text)] truncate max-w-[205px]">
            {getGovModuleLabel(activePage)}
          </h1>
        </div>
      </div>

      {/* Busca Geral */}
      <div className="flex-1 min-w-[110px] sm:min-w-[170px] max-w-[300px] h-9 sm:h-10 flex items-center">
        <GlobalSearch />
      </div>

      {/* Caixa do FOCO */}
      <div className="flex order-last w-full xl:order-none xl:w-auto xl:flex-[1.45] xl:min-w-[240px] xl:max-w-[540px] items-center justify-between gap-2.5 min-h-10 h-auto py-1.5 px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] transition-colors hover:border-[var(--accent)]/60">
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 leading-none mb-1">
            <span className="text-[9.5px] font-extrabold tracking-[0.06em] text-[var(--accent)] uppercase leading-none">
              Diretriz Ministerial
            </span>
          </div>
          <p
            className="m-0 text-[12px] font-medium text-[var(--text)] leading-[1.35] whitespace-normal break-words"
            aria-live="polite"
          >
            “{focusQuote}”
          </p>
        </div>
        <button
          type="button"
          onClick={changeFocusQuote}
          aria-label="Alterar frase do foco do dia"
          title="Alterar frase do foco do dia"
          className="grid place-items-center w-7 h-7 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3 Módulos de Acesso Rápido + Configurações */}
      <div
        ref={quickPopoverRef}
        className="relative hidden md:flex items-center h-10 p-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] shrink-0"
        aria-label="Acesso rápido a 3 módulos"
      >
        <div className="flex items-center h-8 rounded-lg overflow-hidden border border-[var(--line-strong)] bg-[var(--panel-raised)] divide-x divide-[var(--line-strong)]">
          {quickModules.map((modName, idx) => {
            const isCurrent = activePage === modName;
            const moduleInfo = MODULES.find((m) => m.name === modName);
            const iconName = moduleInfo ? moduleInfo.icon : 'home';
            const displayLabel = getGovModuleLabel(modName);
            return (
              <button
                key={`${idx}-${modName}`}
                type="button"
                onClick={() => setActivePage(modName)}
                title={`Abrir ${displayLabel}`}
                aria-label={`Abrir ${displayLabel}`}
                className={`grid place-items-center w-9 h-full text-[12px] font-bold transition-colors ${
                  isCurrent
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-transparent text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]'
                }`}
              >
                <ModuleIcon name={iconName} className="w-4 h-4 shrink-0" />
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setQuickConfigOpen((v) => !v)}
            aria-label="Configurar módulos de acesso rápido nas configurações"
            title="Configurar módulos de acesso rápido"
            className={`grid place-items-center w-9 h-full transition-colors shrink-0 ${
              quickConfigOpen
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'bg-transparent text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {quickConfigOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[320px] max-w-[92vw] rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] p-3.5 shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--line)]">
              <strong className="text-[12px] font-extrabold text-[var(--text)] leading-none">
                Configurar Atalhos Rápidos (1, 2, 3)
              </strong>
              <button
                type="button"
                onClick={() => setQuickConfigOpen(false)}
                className="grid place-items-center w-6 h-6 rounded-lg border border-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors"
                aria-label="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-2 mb-3">
              {([0, 1, 2] as const).map((slotIdx) => {
                const slotModule = MODULES.find((m) => m.name === quickModules[slotIdx]);
                return (
                  <div
                    key={slotIdx}
                    className="rounded-xl border p-2 border-[var(--line)] bg-[var(--panel-soft)] flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold text-[var(--muted)]">
                      <span className="inline-flex items-center gap-1.5">
                        <ModuleIcon name={slotModule ? slotModule.icon : 'home'} className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                        <span>Atalho #{slotIdx + 1}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setActivePage(quickModules[slotIdx]);
                          setQuickConfigOpen(false);
                        }}
                        className="text-[var(--accent)] hover:underline font-bold"
                      >
                        Ir agora
                      </button>
                    </div>
                    <select
                      aria-label={`Atalho ${slotIdx + 1}`}
                      value={quickModules[slotIdx]}
                      onChange={(e) => {
                        setQuickModuleAtSlot(slotIdx, e.target.value as ModuleName);
                      }}
                      className="ce-select w-full text-[11.5px] h-8 py-0 px-2.5 font-semibold"
                    >
                      {MODULES.map((m) => (
                        <option key={m.name} value={m.name}>
                          {getGovModuleLabel(m.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[var(--line)] text-[11px]">
              <button
                type="button"
                onClick={() => {
                  updatePreferences({ quick_access_modules: [...DEFAULT_QUICK_MODULES] });
                  toast('Atalhos restaurados.');
                }}
                className="inline-flex items-center h-7 px-2 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] font-semibold transition-colors"
              >
                Restaurar padrão
              </button>
              <button
                type="button"
                onClick={() => setQuickConfigOpen(false)}
                className="inline-flex items-center justify-center h-7 px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white font-bold"
              >
                Salvar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Relógio, Cronômetro e Ações */}
      <div
        ref={linkPopoverRef}
        className="relative flex items-center justify-between sm:justify-start w-full sm:w-auto gap-1.5 sm:gap-2.5 min-h-10 px-2 sm:px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] shrink-0"
        aria-label="Cronômetro"
      >
        <div className="hidden xl:flex flex-col justify-center leading-none pr-2.5 border-r border-[var(--line)] h-7">
          <span className="text-[8px] font-extrabold tracking-[0.14em] text-[var(--muted)] uppercase whitespace-nowrap leading-none mb-1">
            {dateText}
          </span>
          <strong className="font-mono-num text-[12.5px] font-bold text-[var(--text)] tabular-nums leading-none">
            {clockText}
          </strong>
        </div>

        <div
          className={`flex flex-col justify-center leading-none h-8 px-2.5 rounded-lg transition-colors shrink-0 ${
            timerRunning
              ? 'border border-[var(--accent)] bg-[var(--accent)] shadow-xs'
              : 'border border-transparent'
          }`}
        >
          <span
            className={`text-[8px] font-extrabold tracking-[0.14em] uppercase whitespace-nowrap leading-none mb-1 transition-colors ${
              timerRunning ? 'text-white' : 'text-[var(--muted)]'
            }`}
          >
            {pomodoroMode === 'continuous'
              ? 'CRONÔMETRO'
              : pomodoroPhase === 'focus'
              ? `POMO ${pomodoroMode}`
              : `PAUSA`}
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

        <div className="flex items-center gap-1 sm:gap-1.5 pl-2 sm:pl-2.5 border-l border-[var(--line)] h-7 shrink-0">
          <button
            type="button"
            onClick={cyclePomodoroMode}
            title="Alternar modo"
            className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg border text-[10.5px] font-bold whitespace-nowrap leading-none transition-colors ${
              pomodoroMode !== 'continuous'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <Timer className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">{pomodoroMode === 'continuous' ? 'Pomo' : pomodoroMode}</span>
          </button>

          <button
            type="button"
            onClick={() => {
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

          {timerSeconds > 0 && (
            <button
              type="button"
              onClick={handleSaveTimerClick}
              title="Contabilizar tempo"
              className="grid place-items-center w-7 h-7 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[10.5px] font-bold shrink-0"
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}

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

        {linkMenuOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[320px] max-w-[92vw] rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] p-3.5 shadow-xl">
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
                          linkTimerToScheduleTopic(pickerDay, topic, timerSeconds === 0);
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

      {/* Ícones Minimalistas: Instalar PWA, Status Pasta Local, Status Drive, Google e Tela Inicial */}
      <div className="flex items-center gap-1 sm:gap-1.5 h-9 sm:h-10 shrink-0">
        <PWAInstallButton variant="topbar" />
        {localFolderConnected && (
          <button
            type="button"
            onClick={() => setActivePage('Backup e Restauração')}
            aria-label={`Pasta local conectada: ${localFolderName}`}
            title={
              localFolderWritable
                ? `Pasta local ativa: "${localFolderName}" · Leitura e salvamento automático no computador`
                : `Pasta local carregada: "${localFolderName}" · Salvando automaticamente no navegador`
            }
            className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-2 sm:px-2.5 rounded-xl border border-[var(--good)]/45 bg-[var(--good)]/10 text-[var(--good)] text-[11px] font-bold hover:border-[var(--accent)] transition-colors shrink-0 whitespace-nowrap"
          >
            <HardDrive className={`w-3.5 h-3.5 shrink-0 ${isSyncingLocalFolder ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline max-w-[110px] truncate">{localFolderName}</span>
          </button>
        )}

        {driveConnected && drivePermissionNeedsPicker ? (
          <button
            type="button"
            onClick={() => void authorizeDriveFolderViaPicker()}
            disabled={isSyncingDrive}
            aria-label="Autorizar pasta do Google Drive"
            title={`Autorizar acesso aos backups da pasta "${drivePermissionNeedsPicker.folderName}" no Google Drive`}
            className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-2 sm:px-2.5 rounded-xl border border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--warning)] text-[11px] font-bold hover:bg-[var(--warning)]/25 transition-colors shrink-0 whitespace-nowrap"
          >
            <CloudOff className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Autorizar Drive</span>
          </button>
        ) : driveConnected && isRenewingDriveToken ? (
          <span
            aria-label="Renovando sessão do Google Drive"
            title="Renovando automaticamente a permissão do Google Drive em segundo plano…"
            className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-2 sm:px-2.5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-bold shrink-0 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
            <span className="hidden sm:inline">Renovando…</span>
          </span>
        ) : driveConnected && !driveTokenReady ? (
          <button
            type="button"
            onClick={() => void connectGoogleDrive()}
            disabled={isSyncingDrive}
            aria-label="Reconectar Google Drive"
            title="Navegador bloqueou a renovação silenciosa — clique uma vez para renovar o acesso ao Google Drive"
            className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-2 sm:px-2.5 rounded-xl border border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--warning)] text-[11px] font-bold hover:bg-[var(--warning)]/25 transition-colors shrink-0 whitespace-nowrap"
          >
            <CloudOff className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Reconectar</span>
          </button>
        ) : hasPendingCloudChanges ? (
          <button
            type="button"
            onClick={() => setActivePage('Backup e Restauração')}
            aria-label="Alterações aguardando envio para nuvem"
            title={
              driveConnected
                ? 'Sincronizando alterações locais com o Google Drive…'
                : 'Alterações salvas localmente aguardando conexão com o Google Drive'
            }
            className="grid place-items-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)] transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
          </button>
        ) : null}

        {driveConnected ? (
          <button
            type="button"
            onClick={async () => {
              await disconnectGoogleDrive();
              if (onExitToLogin) onExitToLogin();
            }}
            aria-label="Desconectar do Google"
            title={
              firestoreConnectionMonitor.status === 'expired' ||
              firestoreConnectionMonitor.status === 'inconsistent'
                ? `Alerta de autenticação (${googleUser?.email || ''}): ${firestoreConnectionMonitor.message || 'Sessão expirada ou inconsistente'}`
                : drivePermissionNeedsPicker
                ? `Conectado (${googleUser?.email || ''}) · Aguardando autorização da pasta — Clique para sair`
                : isRenewingDriveToken
                ? `Conectado (${googleUser?.email || ''}) · Renovando sessão automaticamente…`
                : !driveTokenReady
                ? `Conta conectada (${googleUser?.email || ''}) · Clique em Reconectar se precisar enviar arquivos ao Drive`
                : isSyncingDrive
                ? `Sincronizando (${googleUser?.email || ''})…`
                : `Sessão permanente ativa (${googleUser?.email || ''}) — Clique para sair`
            }
            className={`relative grid place-items-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border transition-colors shrink-0 ${
              firestoreConnectionMonitor.status === 'expired' ||
              firestoreConnectionMonitor.status === 'inconsistent'
                ? 'border-[var(--bad)]/60 bg-[var(--bad)]/15 text-[var(--bad)]'
                : drivePermissionNeedsPicker || (!driveTokenReady && !isRenewingDriveToken)
                ? 'border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)] hover:border-[var(--bad)] hover:text-[var(--bad)]'
                : 'border-[var(--good)]/40 bg-[var(--good)]/10 text-[var(--good)] hover:border-[var(--bad)] hover:text-[var(--bad)]'
            }`}
          >
            <Cloud className={`w-4 h-4 ${isSyncingDrive || isRenewingDriveToken ? 'animate-pulse' : ''}`} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void connectGoogleDrive()}
            aria-label="Entrar com Google"
            title="Entrar com Google"
            className="grid place-items-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)] transition-colors shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          </button>
        )}

        {onExitToLogin && (
          <button
            type="button"
            onClick={onExitToLogin}
            aria-label="Tela Inicial"
            title="Tela Inicial"
            className="grid place-items-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors shrink-0"
          >
            <Home className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

