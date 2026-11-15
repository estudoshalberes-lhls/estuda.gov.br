import React from 'react';
import { MODULES, getGovModuleLabel } from '../../data/seedData';
import { useStudy } from '../../context/StudyContext';
import { ModuleIcon } from '../ui/ModuleIcon';

export const TopModuleNav: React.FC = () => {
  const { db, activePage, setActivePage } = useStudy();

  if (!db.preferences.modules_top) return null;

  return (
    <div className="top-module-shell" id="top-module-shell">
      <div className="nav-caption pt-2 pb-1 text-[10px] font-bold tracking-[0.08em] text-[var(--subtle)] uppercase">
        Portal de Serviços · Acesso Direto aos Módulos
      </div>
      <nav
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 pt-1"
        aria-label="Módulos no topo"
      >
        {MODULES.map((mod) => {
          const isActive = activePage === mod.name;
          return (
            <button
              key={mod.name}
              type="button"
              onClick={() => setActivePage(mod.name)}
              className={`flex items-center gap-2 min-h-[34px] px-2.5 py-1.5 rounded-[6px] border text-left text-[12.5px] transition-colors cursor-pointer ${
                isActive
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-bold'
                  : 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] font-medium hover:border-[var(--line-strong)] hover:text-[var(--text)]'
              }`}
            >
              <span
                className={`grid place-items-center w-5 h-5 shrink-0 ${
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--subtle)]'
                }`}
              >
                <ModuleIcon name={mod.icon} />
              </span>
              <span className="truncate">{getGovModuleLabel(mod.name)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
