import React, { useMemo } from 'react';
import { MODULES, getGovModuleLabel } from '../../data/seedData';
import { useStudy } from '../../context/StudyContext';
import { formatClock } from '../../lib/parsers';
import { ModuleName } from '../../types/study';
import { ModuleIcon } from '../ui/ModuleIcon';
import { PWAInstallButton } from '../ui/PWAInstallButton';

interface NavGroup {
  label: string;
  items: ModuleName[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Guichê do Cidadão-Estudante',
    items: ['Início', 'Monitor de Desempenho'],
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

interface SidebarProps {
  onExitToLogin?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onExitToLogin }) => {
  const {
    db,
    activePage,
    setActivePage,
    setMobileOpen,
    timerSeconds,
    timerRunning,
    toggleTimer,
    resetTimer,
    googleUser,
    driveConnected,
    disconnectGoogleDrive,
    connectGoogleDrive,
  } = useStudy();

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

  return (
    <aside className="sidebar" id="sidebar" aria-label="Navegação principal">
      <button
        type="button"
        onClick={() => {
          setActivePage('Início');
          setMobileOpen(false);
        }}
        className="brand shrink-0 flex flex-col items-start gap-2 w-full text-left px-2 py-2 mb-2.5 rounded-xl border border-transparent hover:border-[var(--line)] hover:bg-[var(--panel-soft)] transition-colors cursor-pointer"
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
            Programa do Estudante
          </small>
        </span>
      </button>

      <div className="sidebar-timer shrink-0 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 mb-2.5">
        <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.06em] text-[var(--muted)] uppercase mb-1">
          <span>Ponto Eletrônico</span>
          {timerRunning && (
            <span className="text-[10px] text-[var(--good)] font-bold">
              Ativo
            </span>
          )}
        </div>
        <strong className="block font-mono-num text-[21px] font-bold tracking-[0.02em] text-[var(--text)]">
          {formatClock(timerSeconds)}
        </strong>
        <div className="grid grid-cols-[1fr_auto] gap-1.5 mt-2">
          <button
            type="button"
            onClick={toggleTimer}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
              timerRunning
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                : 'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            {timerRunning ? 'Pausar' : 'Iniciar'}
          </button>
          <button
            type="button"
            onClick={resetTimer}
            aria-label="Zerar cronômetro"
            className="px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
          >
            Zerar
          </button>
        </div>
      </div>

      <nav className="module-nav" aria-label="Módulos">
        {/* Acesso Rápido (Mobile) */}
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
                  <span className="text-[var(--accent)]">
                    <ModuleIcon name={mod.icon} />
                  </span>
                  <span className="text-[10.5px] leading-tight font-bold line-clamp-1 w-full">
                    {getGovModuleLabel(mod.name)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-2 pb-1.5 border-b border-[var(--line)]/55 last:border-b-0">
            <div className="nav-caption px-2 pt-1 pb-1 text-[10px] font-bold tracking-[0.06em] text-[var(--subtle)] uppercase">
              {group.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((name) => {
                const mod = moduleMap.get(name);
                if (!mod) return null;
                const isActive = activePage === mod.name;
                const displayLabel = getGovModuleLabel(mod.name);
                return (
                  <button
                    key={mod.name}
                    type="button"
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
                      className={`nav-icon grid place-items-center w-5 h-5 shrink-0 transition-colors ${
                        isActive ? 'text-[var(--accent)]' : 'text-[var(--subtle)] group-hover:text-[var(--text)]'
                      }`}
                    >
                      <ModuleIcon name={mod.icon} />
                    </span>
                    <span className="nav-label truncate">{displayLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 pt-2 mt-1 border-t border-[var(--line)]">
        <button
          type="button"
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
              activePage === 'Configurações' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
            }`}
          >
            <ModuleIcon name="settings" />
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
};
