import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { StudyProvider, useStudy } from './context/StudyContext';
import { LoginScreen } from './components/auth/LoginScreen';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { TopModuleNav } from './components/layout/TopModuleNav';
import { GovFederalBar } from './components/layout/GovFederalBar';
import { MobileTimerFloat } from './components/layout/MobileTimerFloat';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { DriveSyncConflictDialog } from './components/backup/DriveSyncConflictDialog';
import { ToastRegion } from './components/ui/ToastRegion';
import { BackToTopButton } from './components/ui/BackToTopButton';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import { CareerAchievementWatcher } from './components/performance/CareerAchievementWatcher';
import { DailyGoalPushWatcher } from './components/study/DailyGoalPushWatcher';
import { ModuleName } from './types/study';
import { PAGE_LOADERS } from './lib/routePrefetch';

const CHUNK_RELOAD_GUARD_KEY = 'estuda_chunk_reload_once';

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
        } catch {
          // ignore storage errors
        }
      }
      return mod;
    } catch (firstErr) {
      try {
        await new Promise((r) => window.setTimeout(r, 250));
        return await factory();
      } catch (secondErr) {
        if (typeof window !== 'undefined') {
          let alreadyReloaded = false;
          try {
            alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1';
            if (!alreadyReloaded) {
              sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
            }
          } catch {
            // ignore storage errors
          }
          if (!alreadyReloaded) {
            window.location.reload();
          }
        }
        throw secondErr || firstErr;
      }
    }
  });
}

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  scope?: 'root' | 'page';
  resetKey?: string;
  onResetToHome?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || 'Erro inesperado'),
    };
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  componentDidCatch(error: unknown) {
    console.error('[estuda.gov.br] Erro capturado pelo ErrorBoundary:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isPageScope = this.props.scope === 'page';

    return (
      <div
        className={
          isPageScope
            ? 'rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-6 my-4'
            : 'min-h-screen flex items-center justify-center bg-[#f4f6f9] text-[#071d41] p-6'
        }
      >
        <div className="max-w-lg w-full mx-auto rounded-xl border border-[#b6c6dc] bg-white p-6 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#1351b4]">
            ESTUDA.GOV.BR · RECUPERAÇÃO AUTOMÁTICA
          </div>
          <h2 className="m-0 mt-1.5 text-[18px] font-extrabold text-[#071d41]">
            {isPageScope ? 'Este módulo encontrou um erro ao renderizar' : 'Não foi possível carregar a página'}
          </h2>
          <p className="m-0 mt-2 text-[13px] text-[#3d4f6b] leading-relaxed">
            Seus dados salvos localmente e na nuvem continuam intactos. Clique em recarregar para atualizar os módulos da aplicação.
          </p>
          {this.state.errorMessage && (
            <div className="mt-3 rounded-lg border border-[#d6e0ec] bg-[#f7f9fc] px-3 py-2 font-mono text-[11.5px] text-[#5c6e8a] break-words">
              {this.state.errorMessage}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#1351b4] text-white text-[12.5px] font-bold border-0 cursor-pointer hover:bg-[#0c326f]"
            >
              Recarregar página
            </button>
            {isPageScope && this.props.onResetToHome && (
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '' });
                  this.props.onResetToHome?.();
                }}
                className="px-4 py-2 rounded-lg border border-[#b6c6dc] bg-[#f7f9fc] text-[#071d41] text-[12.5px] font-bold cursor-pointer hover:bg-[#edf2f8]"
              >
                Voltar ao Início
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

const HomePage = lazyWithRetry(PAGE_LOADERS['Início']);
const TrainingPage = lazyWithRetry(PAGE_LOADERS['Treino Diário']);
const SimulationPage = lazyWithRetry(PAGE_LOADERS['Simulado Fechado']);
const CompletedSimulationsPage = lazyWithRetry(PAGE_LOADERS['Simulados Realizados']);
const PerformancePage = lazyWithRetry(PAGE_LOADERS['Monitor de Desempenho']);
const CareerPage = lazyWithRetry(PAGE_LOADERS['Carreira & Mérito']);
const DiscursivePage = lazyWithRetry(PAGE_LOADERS['Discursiva']);
const ProofsPage = lazyWithRetry(PAGE_LOADERS['Provas']);
const ErrorNotebookPage = lazyWithRetry(PAGE_LOADERS['Caderno de Erros']);
const CaseLawPage = lazyWithRetry(PAGE_LOADERS['Súmulas e Jurisprudência']);
const ContestsPage = lazyWithRetry(PAGE_LOADERS['Datas & Locais']);
const EditalPage = lazyWithRetry(PAGE_LOADERS['Editais']);
const SchedulePage = lazyWithRetry(PAGE_LOADERS['Cronograma']);
const CompletedGoalsPage = lazyWithRetry(PAGE_LOADERS['Metas Concluídas']);
const IncompleteGoalsPage = lazyWithRetry(PAGE_LOADERS['Metas Não Concluídas']);
const LawsPage = lazyWithRetry(PAGE_LOADERS['Lei Seca']);
const IncidenceMatrixPage = lazyWithRetry(PAGE_LOADERS['Matriz de Incidência']);
const PersonalPdfsPage = lazyWithRetry(PAGE_LOADERS['PDFs Pessoais']);
const SummariesPage = lazyWithRetry(PAGE_LOADERS['Resumos & Mapas']);
const CriticalPointsPage = lazyWithRetry(PAGE_LOADERS['Pontos Críticos']);
const UtilitiesPage = lazyWithRetry(PAGE_LOADERS['Utilidades']);
const BackupPage = lazyWithRetry(PAGE_LOADERS['Backup e Restauração']);
const SettingsPage = lazyWithRetry(PAGE_LOADERS['Configurações']);

const PageLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[280px] rounded-xl border border-[var(--line)] bg-[var(--panel)] px-6 py-12">
    <div className="flex items-center gap-3 text-[13px] font-medium text-[var(--muted)]">
      <span
        className="w-4 h-4 rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)] animate-spin"
        aria-hidden="true"
      />
      <span>Carregando módulo…</span>
    </div>
  </div>
);

function renderActivePage(page: ModuleName): React.ReactNode {
  switch (page) {
    case 'Início':
      return <HomePage />;
    case 'Carreira & Mérito':
      return <CareerPage />;
    case 'Treino Diário':
      return <TrainingPage />;
    case 'Simulado Fechado':
      return <SimulationPage />;
    case 'Simulados Realizados':
      return <CompletedSimulationsPage />;
    case 'Monitor de Desempenho':
      return <PerformancePage />;
    case 'Discursiva':
      return <DiscursivePage />;
    case 'Provas':
      return <ProofsPage />;
    case 'Caderno de Erros':
      return <ErrorNotebookPage />;
    case 'Súmulas e Jurisprudência':
      return <CaseLawPage />;
    case 'Datas & Locais':
      return <ContestsPage />;
    case 'Editais':
      return <EditalPage />;
    case 'Cronograma':
      return <SchedulePage />;
    case 'Metas Concluídas':
      return <CompletedGoalsPage />;
    case 'Metas Não Concluídas':
      return <IncompleteGoalsPage />;
    case 'Lei Seca':
      return <LawsPage />;
    case 'Matriz de Incidência':
      return <IncidenceMatrixPage />;
    case 'PDFs Pessoais':
      return <PersonalPdfsPage />;
    case 'Resumos & Mapas':
      return <SummariesPage />;
    case 'Pontos Críticos':
      return <CriticalPointsPage />;
    case 'Utilidades':
      return <UtilitiesPage />;
    case 'Backup e Restauração':
      return <BackupPage />;
    case 'Configurações':
      return <SettingsPage />;
  }
}

interface AppShellProps {
  onExitToLogin: () => void;
}

const STUDY_FOCUS_STORAGE_KEY = 'estuda_study_focus_mode';

const AppShell: React.FC<AppShellProps> = ({ onExitToLogin }) => {
  const { db, activePage, setActivePage, mobileOpen, setMobileOpen, examFocusMode } = useStudy();
  const prefs = db.preferences;
  const [studyFocusMode, setStudyFocusMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(STUDY_FOCUS_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleStudyFocusMode = useCallback(() => {
    setStudyFocusMode((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(STUDY_FOCUS_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (studyFocusMode && mobileOpen) {
      setMobileOpen(false);
    }
  }, [studyFocusMode, mobileOpen, setMobileOpen]);

  useEffect(() => {
    if (examFocusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleStudyFocusMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [examFocusMode, toggleStudyFocusMode]);

  const hideNonEssentialChrome = examFocusMode || studyFocusMode;

  const shellClasses = [
    'app-shell',
    prefs.modules_top ? 'modules-on-top' : '',
    prefs.sidebar_hidden ? 'sidebar-collapsed' : 'sidebar-hover',
    mobileOpen && !hideNonEssentialChrome ? 'mobile-open' : '',
    examFocusMode ? 'exam-focus-mode' : '',
    studyFocusMode && !examFocusMode ? 'study-focus-mode' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClasses}>
      {!hideNonEssentialChrome && <Sidebar onExitToLogin={onExitToLogin} />}

      <main className="main-shell">
        {!hideNonEssentialChrome && <GovFederalBar insideApp />}
        {!examFocusMode && (
          <Topbar
            onExitToLogin={onExitToLogin}
            studyFocusMode={studyFocusMode}
            onToggleStudyFocus={toggleStudyFocusMode}
          />
        )}
        {!hideNonEssentialChrome && <TopModuleNav />}

        <section
          className={`flex-1 w-full mx-auto ${
            examFocusMode
              ? 'max-w-[1600px] px-3 sm:px-6 py-3 sm:py-4'
              : studyFocusMode
              ? 'max-w-[1440px] px-4 sm:px-8 py-4 sm:py-6'
              : 'max-w-[1440px] px-4 sm:px-7 py-5 sm:py-6'
          }`}
          id="page-content"
        >
          <AppErrorBoundary
            scope="page"
            resetKey={activePage}
            onResetToHome={() => setActivePage('Início')}
          >
            <Suspense fallback={<PageLoadingFallback />}>{renderActivePage(activePage)}</Suspense>
          </AppErrorBoundary>
        </section>

        {!hideNonEssentialChrome && (
          <footer className="px-4 sm:px-7 py-5 border-t border-[var(--line)] bg-[var(--panel)] text-[11.5px] text-[var(--muted)]">
            <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="font-display font-extrabold text-[var(--text)]">estuda.gov.br</strong>
                  <span aria-hidden="true">·</span>
                  <span>Ministério da Aprovação, Café Forte e Madrugadas</span>
                </div>
                <p className="m-0 mt-1 text-[11px] text-[var(--subtle)]">
                  Seus simulados, cadernos e anotações ficam salvos localmente e sincronizados quando vinculados à nuvem.
                </p>
              </div>

              <nav aria-label="Links institucionais do rodapé" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {(
                  [
                    { label: 'Ouvidoria (Erros)', target: 'Caderno de Erros' as ModuleName },
                    { label: 'Portal da Transparência', target: 'Monitor de Desempenho' as ModuleName },
                    { label: 'Diário Oficial (Lei Seca)', target: 'Lei Seca' as ModuleName },
                    { label: 'Guarda Permanente', target: 'Backup e Restauração' as ModuleName },
                  ] as const
                ).map((link) => (
                  <button
                    key={link.target}
                    type="button"
                    onClick={() => setActivePage(link.target)}
                    className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline cursor-pointer bg-transparent border-0 p-0 whitespace-nowrap"
                  >
                    {link.label}
                  </button>
                ))}
              </nav>
            </div>
          </footer>
        )}
      </main>

      {!hideNonEssentialChrome && mobileOpen && (
        <div
          className="fixed inset-0 z-[25] bg-black/55 min-[721px]:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {!studyFocusMode && <MobileTimerFloat />}
      <BackToTopButton />
      <CareerAchievementWatcher />
      <DailyGoalPushWatcher />
    </div>
  );
};

const MainApp: React.FC = () => {
  const { driveConnected, gasConnected } = useStudy();
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [forceLoginScreen, setForceLoginScreen] = useState<boolean>(false);

  React.useEffect(() => {
    if (driveConnected || gasConnected) {
      setForceLoginScreen(false);
    }
  }, [driveConnected, gasConnected]);

  const handleContinueOffline = () => {
    setOfflineMode(true);
    setForceLoginScreen(false);
  };

  const handleExitToLogin = () => {
    setOfflineMode(false);
    setForceLoginScreen(true);
  };

  const shouldShowLogin = forceLoginScreen || (!driveConnected && !gasConnected && !offlineMode);

  return (
    <>
      {shouldShowLogin ? (
        <LoginScreen onContinueOffline={handleContinueOffline} />
      ) : (
        <AppShell onExitToLogin={handleExitToLogin} />
      )}
      <ConfirmDialog />
      <DriveSyncConflictDialog />
      <ToastRegion />
      <OfflineIndicator />
    </>
  );
};

export function App() {
  return (
    <AppErrorBoundary scope="root">
      <StudyProvider>
        <MainApp />
      </StudyProvider>
    </AppErrorBoundary>
  );
}

export default App;
