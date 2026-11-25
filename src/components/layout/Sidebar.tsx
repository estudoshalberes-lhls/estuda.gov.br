import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { MODULES, getGovModuleLabel } from '../../data/seedData';
import { useStudy } from '../../context/StudyContext';
import { normalizeSearch } from '../../lib/parsers';
import { ModuleName } from '../../types/study';
import { ModuleIcon } from '../ui/ModuleIcon';
import { PWAInstallButton } from '../ui/PWAInstallButton';
import { prefetchModulePage } from '../../lib/routePrefetch';

interface NavGroup {
  label: string;
  items: ModuleName[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Guichê do Cidadão-Estudante',
    items: ['Início', 'Carreira & Mérito', 'Monitor de Desempenho'],
  },
  {
    label: 'Banca & Exames Oficiais',
    items: ['Treino Diário', 'Simulado Fechado', 'Simulados Realizados'],
  },
  {
    label: 'Ouvidoria & Corregedoria',
    items: ['Caderno de Erros', 'Pontos Críticos', 'Resumos & Mapas'],
  },
  {
    label: 'Diário Oficial & Normas',
    items: ['Lei Seca', 'Matriz de Incidência', 'Súmulas e Jurisprudência'],
  },
  {
    label: 'Expediente & Editais',
    items: ['Cronograma', 'Metas Concluídas', 'Metas Não Concluídas', 'Datas & Locais', 'Editais'],
  },
  {
    label: 'Arquivo Nacional & Redação',
    items: ['Provas', 'Discursiva', 'PDFs Pessoais'],
  },
  {
    label: 'Secretaria & Guarda',
    items: ['Utilidades', 'Backup e Restauração'],
  },
];

const COLLAPSED_GROUPS_KEY = 'estuda_sidebar_collapsed_groups';

function readCollapsedGroups(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

interface SidebarProps {
  onExitToLogin?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({ onExitToLogin }) => {
  const {
    db,
    activePage,
    setActivePage,
    setMobileOpen,
    googleUser,
    driveConnected,
    disconnectGoogleDrive,
    connectGoogleDrive,
  } = useStudy();

  const [moduleQuery, setModuleQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    readCollapsedGroups(),
  );

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const moduleMap = useMemo(() => {
    const map = new Map<ModuleName, (typeof MODULES)[number]>();
    MODULES.forEach((m) => map.set(m.name, m));
    return map;
  }, []);

  const quickModules = useMemo(() => {
    const list = db.preferences.quick_access_modules?.length
      ? db.preferences.quick_access_modules
      : (['Cronograma', 'Lei Seca', 'Matriz de Incidência'] as ModuleName[]);
    return list.slice(0, 3);
  }, [db.preferences.quick_access_modules]);

  const normalizedQuery = normalizeSearch(moduleQuery);

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return NAV_GROUPS;
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((name) => {
        const display = getGovModuleLabel(name);
        return (
          normalizeSearch(name).includes(normalizedQuery) ||
          normalizeSearch(display).includes(normalizedQuery)
        );
      }),
    })).filter((g) => g.items.length > 0);
  }, [normalizedQuery]);

  return (
    <aside className="sidebar" id="sidebar" aria-label="Navegação principal">
      <button
        type="button"
        onClick={() => {
          setActivePage('Início');
          setMobileOpen(false);
        }}
        className="brand shrink-0 flex flex-col items-start gap-2 w-full text-left px-2 py-2 mb-2 rounded-xl border border-transparent hover:border-[var(--line)] hover:bg-[var(--panel-soft)] transition-colors cursor-pointer"
        aria-label="estuda.gov.br — ir para Início"
      >
        <span className="brand-mark-mec inline-flex items-center justify-center rounded-xl border border-[var(--line-strong)] bg-white px-2.5 py-1.5 shadow-xs shrink-0 max-w-full overflow-hidden">
          <img
            src="/assets/aistudio/MEC-GOV-2025-Positivo-Horizontal_0f35c2cb.png"
            alt="Ministério da Educação · Governo do Brasil"
            className="h-7 w-auto max-w-full object-contain"
          />
        </span>
        <span className="brand-copy min-w-0 w-full">
          <strong className="block font-display text-[15px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--text)] truncate">
            estuda.gov.br
          </strong>
          <small className="block text-[10px] font-semibold text-[var(--muted)] mt-0.5 truncate">
            Portal Único do Estudante
          </small>
        </span>
      </button>

      {/* Busca rápida de módulos (visível quando expandida ou no mobile) */}
      <div className="sidebar-search-box shrink-0 mb-2.5 relative">
        <Search
          className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="text"
          value={moduleQuery}
          onChange={(e) => setModuleQuery(e.target.value)}
          placeholder="Filtrar módulos…"
          aria-label="Filtrar módulos na barra lateral"
          className="w-full h-8 pl-8 pr-7 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[12px] text-[var(--text)] placeholder:text-[var(--subtle)] outline-none focus:border-[var(--accent)] transition-colors"
        />
        {moduleQuery && (
          <button
            type="button"
            onClick={() => setModuleQuery('')}
            aria-label="Limpar filtro de módulos"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <nav className="module-nav" aria-label="Módulos">
        {/* Acesso Rápido (Mobile) */}
        {!normalizedQuery && (
          <div className="min-[721px]:hidden mb-3 pb-2.5 border-b border-[var(--line)]">
            <div className="nav-caption px-2 pt-1 pb-1.5 text-[9.5px] font-bold tracking-[0.08em] text-[var(--subtle)] uppercase">
              Atalhos Rápidos
            </div>
            <div className="grid grid-cols-3 gap-1.5 px-1">
              {quickModules.map((name) => {
                const mod = moduleMap.get(name);
                if (!mod) return null;
                const isActive = activePage === mod.name;
                return (
                  <button
                    key={`mobile-quick-${mod.name}`}
                    type="button"
                    onClick={() => {
                      setActivePage(mod.name);
                      setMobileOpen(false);
                    }}
                    className={`flex flex-col items-center justify-center gap-1 px-1.5 py-2 rounded-lg border text-center transition-colors cursor-pointer ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-bold'
                        : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                    }`}
                  >
                    <ModuleIcon name={mod.icon} className="w-5 h-5 shrink-0" />
                    <span className="text-[10.5px] leading-tight font-bold line-clamp-1 w-full">
                      {getGovModuleLabel(mod.name)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filteredGroups.length === 0 ? (
          <div className="sidebar-search-box px-2.5 py-4 text-center text-[11.5px] text-[var(--muted)]">
            Nenhum módulo encontrado para “{moduleQuery}”.
          </div>
        ) : (
          filteredGroups.map((group) => {
            const containsActive = group.items.includes(activePage);
            const isCollapsed = !normalizedQuery && !containsActive && Boolean(collapsedGroups[group.label]);

            return (
              <div
                key={group.label}
                className="mb-1.5 pb-1.5 border-b border-[var(--line)]/55 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={!isCollapsed}
                  className="nav-caption w-full flex items-center justify-between gap-1 px-2 pt-1 pb-1 text-[10px] font-bold tracking-[0.06em] text-[var(--subtle)] hover:text-[var(--text)] uppercase transition-colors cursor-pointer"
                >
                  <span className="truncate">{group.label}</span>
                  <ChevronDown
                    className={`w-3 h-3 shrink-0 transition-transform ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <div
                  className={`sidebar-group-items flex flex-col gap-0.5 ${
                    isCollapsed ? 'is-collapsed' : ''
                  }`}
                >
                  {group.items.map((name) => {
                    const mod = moduleMap.get(name);
                    if (!mod) return null;
                    const isActive = activePage === mod.name;
                    const displayLabel = getGovModuleLabel(mod.name);
                    return (
                      <button
                        key={mod.name}
                        type="button"
                        onMouseEnter={() => prefetchModulePage(mod.name)}
                        onFocus={() => prefetchModulePage(mod.name)}
                        onClick={() => {
                          setActivePage(mod.name);
                          setMobileOpen(false);
                        }}
                        title={displayLabel}
                        className={`nav-link group flex items-center gap-2.5 w-full min-h-[34px] px-2.5 py-1.5 rounded-[6px] border text-left text-[13px] transition-colors cursor-pointer ${
                          isActive
                            ? 'active border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] font-bold'
                            : 'border-transparent font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
                        }`}
                      >
                        <span
                          className={`nav-icon grid place-items-center w-5 h-5 shrink-0 transition-transform ${
                            isActive ? 'opacity-100' : 'opacity-85 group-hover:opacity-100'
                          }`}
                        >
                          <ModuleIcon name={mod.icon} className="w-[18px] h-[18px] shrink-0" />
                        </span>
                        <span className="nav-label truncate">{displayLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </nav>

      <div className="shrink-0 pt-2 mt-1 border-t border-[var(--line)]">
        <button
          type="button"
          onMouseEnter={() => prefetchModulePage('Configurações')}
          onFocus={() => prefetchModulePage('Configurações')}
          onClick={() => {
            setActivePage('Configurações');
            setMobileOpen(false);
          }}
          title={getGovModuleLabel('Configurações')}
          className={`nav-link flex items-center gap-2.5 w-full min-h-[34px] px-2.5 py-1.5 rounded-[6px] border text-left text-[13px] transition-colors cursor-pointer ${
            activePage === 'Configurações'
              ? 'active border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] font-bold'
              : 'border-transparent font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] hover:text-[var(--text)]'
          }`}
        >
          <span
            className={`nav-icon grid place-items-center w-5 h-5 shrink-0 ${
              activePage === 'Configurações' ? 'opacity-100' : 'opacity-85'
            }`}
          >
            <ModuleIcon name="settings" className="w-[18px] h-[18px] shrink-0" />
          </span>
          <span className="nav-label truncate">{getGovModuleLabel('Configurações')}</span>
        </button>

        <PWAInstallButton variant="sidebar" />

        {/* Account / Auth Session Card */}
        <div className="sidebar-account mt-2.5 p-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] flex items-center justify-between gap-2">
          <div className="sidebar-account-info min-w-0 flex items-center gap-2">
            <div className="sidebar-account-copy min-w-0">
              <span className="block text-[11px] font-bold text-[var(--text)] truncate">
                {driveConnected
                  ? googleUser?.displayName || googleUser?.email || 'Cadastro gov.estud'
                  : 'Sessão do Navegador'}
              </span>
              <span
                className={`block text-[10px] font-semibold truncate ${
                  driveConnected ? 'text-[var(--good)]' : 'text-[var(--muted)]'
                }`}
              >
                {driveConnected ? 'Regular · Autenticado' : 'Offline no navegador'}
              </span>
            </div>
          </div>
          {driveConnected ? (
            <button
              type="button"
              onClick={async () => {
                await disconnectGoogleDrive();
                if (onExitToLogin) onExitToLogin();
              }}
              className="sidebar-account-btn inline-flex items-center justify-center text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] px-2 py-1 rounded hover:bg-[var(--panel-raised)] shrink-0 transition-colors cursor-pointer"
              title="Sair da conta e voltar ao login"
            >
              Sair
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connectGoogleDrive()}
              className="sidebar-account-btn inline-flex items-center justify-center text-[11px] font-bold text-[var(--accent)] hover:underline px-2 py-1 rounded hover:bg-[var(--panel-raised)] shrink-0 transition-colors cursor-pointer"
              title="Entrar com Google Drive"
            >
              Entrar
            </button>
          )}
        </div>
      </div>
    </aside>
  );
});
