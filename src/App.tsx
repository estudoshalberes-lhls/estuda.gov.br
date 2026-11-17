import React, { Suspense, lazy, useState } from 'react';
import { StudyProvider, useStudy } from './context/StudyContext';
import { LoginScreen } from './components/auth/LoginScreen';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { TopModuleNav } from './components/layout/TopModuleNav';
import { GovFederalBar } from './components/layout/GovFederalBar';
import { MobileTimerFloat } from './components/layout/MobileTimerFloat';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { ToastRegion } from './components/ui/ToastRegion';
import { BackToTopButton } from './components/ui/BackToTopButton';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import { FirestoreAuthAlertBanner } from './components/ui/FirestoreAuthAlertBanner';
import { ModuleName } from './types/study';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const TrainingPage = lazy(() => import('./pages/TrainingPage').then((m) => ({ default: m.TrainingPage })));
const SimulationPage = lazy(() => import('./pages/SimulationPage').then((m) => ({ default: m.SimulationPage })));
const CompletedSimulationsPage = lazy(() =>
  import('./pages/CompletedSimulationsPage').then((m) => ({ default: m.CompletedSimulationsPage })),
);
const PerformancePage = lazy(() => import('./pages/PerformancePage').then((m) => ({ default: m.PerformancePage })));
const DiscursivePage = lazy(() => import('./pages/DiscursivePage').then((m) => ({ default: m.DiscursivePage })));
const ProofsPage = lazy(() => import('./pages/ProofsPage').then((m) => ({ default: m.ProofsPage })));
const ErrorNotebookPage = lazy(() =>
  import('./pages/ErrorNotebookPage').then((m) => ({ default: m.ErrorNotebookPage })),
);
const CaseLawPage = lazy(() => import('./pages/CaseLawPage').then((m) => ({ default: m.CaseLawPage })));
const ContestsPage = lazy(() => import('./pages/ContestsPage').then((m) => ({ default: m.ContestsPage })));
const EditalPage = lazy(() => import('./pages/EditalPage').then((m) => ({ default: m.EditalPage })));
const SchedulePage = lazy(() => import('./pages/SchedulePage').then((m) => ({ default: m.SchedulePage })));
const CompletedGoalsPage = lazy(() =>
  import('./pages/CompletedGoalsPage').then((m) => ({ default: m.CompletedGoalsPage })),
);
const IncompleteGoalsPage = lazy(() =>
  import('./pages/IncompleteGoalsPage').then((m) => ({ default: m.IncompleteGoalsPage })),
);
const LawsPage = lazy(() => import('./pages/LawsPage').then((m) => ({ default: m.LawsPage })));
const IncidenceMatrixPage = lazy(() =>
  import('./pages/IncidenceMatrixPage').then((m) => ({ default: m.IncidenceMatrixPage })),
);
const PersonalPdfsPage = lazy(() =>
  import('./pages/PersonalPdfsPage').then((m) => ({ default: m.PersonalPdfsPage })),
);
const SummariesPage = lazy(() => import('./pages/SummariesPage').then((m) => ({ default: m.SummariesPage })));
const CriticalPointsPage = lazy(() =>
  import('./pages/CriticalPointsPage').then((m) => ({ default: m.CriticalPointsPage })),
);
const UtilitiesPage = lazy(() => import('./pages/UtilitiesPage').then((m) => ({ default: m.UtilitiesPage })));
const BackupPage = lazy(() => import('./pages/BackupPage').then((m) => ({ default: m.BackupPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

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

const AppShell: React.FC<AppShellProps> = ({ onExitToLogin }) => {
  const { db, activePage, setActivePage, mobileOpen, setMobileOpen, examFocusMode } = useStudy();
  const prefs = db.preferences;

  const shellClasses = [
    'app-shell',
    prefs.modules_top ? 'modules-on-top' : '',
    prefs.sidebar_hidden ? 'sidebar-collapsed' : 'sidebar-hover',
    mobileOpen ? 'mobile-open' : '',
    examFocusMode ? 'exam-focus-mode' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClasses}>
      {!examFocusMode && <Sidebar onExitToLogin={onExitToLogin} />}

      <main className="main-shell">
        {!examFocusMode && <GovFederalBar insideApp />}
        {!examFocusMode && <Topbar onExitToLogin={onExitToLogin} />}
        {!examFocusMode && <TopModuleNav />}
        {!examFocusMode && <FirestoreAuthAlertBanner />}

        <section
          className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-7 py-5 sm:py-6"
          id="page-content"
          aria-live="polite"
        >
          <Suspense fallback={<PageLoadingFallback />}>{renderActivePage(activePage)}</Suspense>
        </section>

        {!examFocusMode && (
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

      {!examFocusMode && mobileOpen && (
        <div
          className="fixed inset-0 z-[25] bg-black/55 min-[721px]:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <MobileTimerFloat />
      <BackToTopButton />
    </div>
  );
};

const MainApp: React.FC = () => {
  const { firebaseConnected, driveConnected, localFolderConnected } = useStudy();
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [forceLoginScreen, setForceLoginScreen] = useState<boolean>(false);

  React.useEffect(() => {
    if (firebaseConnected || driveConnected || localFolderConnected) {
      setForceLoginScreen(false);
    }
  }, [firebaseConnected, driveConnected, localFolderConnected]);

  const handleContinueOffline = () => {
    setOfflineMode(true);
    setForceLoginScreen(false);
  };

  const handleExitToLogin = () => {
    setOfflineMode(false);
    setForceLoginScreen(true);
  };

  const shouldShowLogin =
    forceLoginScreen || (!firebaseConnected && !driveConnected && !localFolderConnected && !offlineMode);

  return (
    <>
      {shouldShowLogin ? (
        <LoginScreen onContinueOffline={handleContinueOffline} />
      ) : (
        <AppShell onExitToLogin={handleExitToLogin} />
      )}
      <ConfirmDialog />
      <ToastRegion />
      <OfflineIndicator />
    </>
  );
};

export function App() {
  return (
    <StudyProvider>
      <MainApp />
    </StudyProvider>
  );
}

export default App;
