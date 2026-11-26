import { ModuleName } from '../types/study';
import { getGovModuleLabel } from '../data/seedData';

export const MODULE_ROUTE_SLUGS: Record<ModuleName, string> = {
  'Início': '/inicio',
  'Carreira & Mérito': '/carreira',
  'Treino Diário': '/treino-diario',
  'Simulado Fechado': '/simulado',
  'Simulados Realizados': '/simulados-realizados',
  'Monitor de Desempenho': '/monitor',
  'Discursiva': '/discursiva',
  'Provas': '/provas',
  'Caderno de Erros': '/caderno-de-erros',
  'Súmulas e Jurisprudência': '/sumulas',
  'Datas & Locais': '/datas-locais',
  'Editais': '/editais',
  'Cronograma': '/cronograma',
  'Metas Concluídas': '/metas-concluidas',
  'Metas Não Concluídas': '/metas-pendentes',
  'Lei Seca': '/lei-seca',
  'Matriz de Incidência': '/matriz-incidencia',
  'PDFs Pessoais': '/pdfs',
  'Resumos & Mapas': '/resumos',
  'Pontos Críticos': '/pontos-criticos',
  'Utilidades': '/utilidades',
  'Backup e Restauração': '/backup',
  'Configurações': '/configuracoes',
};

const SLUG_TO_MODULE = new Map<string, ModuleName>(
  (Object.entries(MODULE_ROUTE_SLUGS) as Array<[ModuleName, string]>).map(([mod, slug]) => [
    slug.toLowerCase(),
    mod,
  ]),
);

function normalizePathname(raw: string): string {
  const cleaned = raw.trim().replace(/^#/, '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  if (!cleaned || cleaned === '/') return '/inicio';
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

export function resolveModuleFromLocation(): ModuleName {
  if (typeof window === 'undefined') return 'Início';
  try {
    const hashCandidate = window.location.hash
      ? normalizePathname(window.location.hash)
      : '';
    if (hashCandidate && SLUG_TO_MODULE.has(hashCandidate)) {
      return SLUG_TO_MODULE.get(hashCandidate)!;
    }
    const pathCandidate = normalizePathname(window.location.pathname || '/');
    return SLUG_TO_MODULE.get(pathCandidate) || 'Início';
  } catch {
    return 'Início';
  }
}

export function syncUrlWithModule(module: ModuleName, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const targetPath = MODULE_ROUTE_SLUGS[module] || '/inicio';
  try {
    const currentPath = normalizePathname(window.location.pathname || '/');
    if (currentPath !== targetPath) {
      const nextUrl = `${targetPath}${window.location.search || ''}`;
      if (options.replace) {
        window.history.replaceState({ module }, '', nextUrl);
      } else {
        window.history.pushState({ module }, '', nextUrl);
      }
    }
    document.title = `${getGovModuleLabel(module)} · estuda.gov.br`;
  } catch {
    // Fallback safely if History API is restricted in an embedded origin
    try {
      document.title = `${getGovModuleLabel(module)} · estuda.gov.br`;
    } catch {
      // ignore
    }
  }
}
