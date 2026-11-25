import type React from 'react';
import { ModuleName } from '../types/study';

type PageModuleLoader = () => Promise<{ default: React.ComponentType<any> }>;

export const PAGE_LOADERS: Record<ModuleName, PageModuleLoader> = {
  'Início': () => import('../pages/HomePage').then((m) => ({ default: m.HomePage })),
  'Carreira & Mérito': () => import('../pages/CareerPage').then((m) => ({ default: m.CareerPage })),
  'Treino Diário': () => import('../pages/TrainingPage').then((m) => ({ default: m.TrainingPage })),
  'Simulado Fechado': () => import('../pages/SimulationPage').then((m) => ({ default: m.SimulationPage })),
  'Simulados Realizados': () =>
    import('../pages/CompletedSimulationsPage').then((m) => ({ default: m.CompletedSimulationsPage })),
  'Monitor de Desempenho': () =>
    import('../pages/PerformancePage').then((m) => ({ default: m.PerformancePage })),
  'Discursiva': () => import('../pages/DiscursivePage').then((m) => ({ default: m.DiscursivePage })),
  'Provas': () => import('../pages/ProofsPage').then((m) => ({ default: m.ProofsPage })),
  'Caderno de Erros': () =>
    import('../pages/ErrorNotebookPage').then((m) => ({ default: m.ErrorNotebookPage })),
  'Súmulas e Jurisprudência': () =>
    import('../pages/CaseLawPage').then((m) => ({ default: m.CaseLawPage })),
  'Datas & Locais': () => import('../pages/ContestsPage').then((m) => ({ default: m.ContestsPage })),
  'Editais': () => import('../pages/EditalPage').then((m) => ({ default: m.EditalPage })),
  'Cronograma': () => import('../pages/SchedulePage').then((m) => ({ default: m.SchedulePage })),
  'Metas Concluídas': () =>
    import('../pages/CompletedGoalsPage').then((m) => ({ default: m.CompletedGoalsPage })),
  'Metas Não Concluídas': () =>
    import('../pages/IncompleteGoalsPage').then((m) => ({ default: m.IncompleteGoalsPage })),
  'Lei Seca': () => import('../pages/LawsPage').then((m) => ({ default: m.LawsPage })),
  'Matriz de Incidência': () =>
    import('../pages/IncidenceMatrixPage').then((m) => ({ default: m.IncidenceMatrixPage })),
  'PDFs Pessoais': () =>
    import('../pages/PersonalPdfsPage').then((m) => ({ default: m.PersonalPdfsPage })),
  'Resumos & Mapas': () => import('../pages/SummariesPage').then((m) => ({ default: m.SummariesPage })),
  'Pontos Críticos': () =>
    import('../pages/CriticalPointsPage').then((m) => ({ default: m.CriticalPointsPage })),
  'Utilidades': () => import('../pages/UtilitiesPage').then((m) => ({ default: m.UtilitiesPage })),
  'Backup e Restauração': () => import('../pages/BackupPage').then((m) => ({ default: m.BackupPage })),
  'Configurações': () => import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
};

const prefetchedModules = new Set<ModuleName>();

/**
 * Triggers idle/hover prefetching of a lazy page chunk so module transitions feel instant.
 */
export function prefetchModulePage(name: ModuleName): void {
  if (prefetchedModules.has(name)) return;
  const loader = PAGE_LOADERS[name];
  if (!loader) return;
  prefetchedModules.add(name);
  void loader().catch(() => {
    prefetchedModules.delete(name);
  });
}
