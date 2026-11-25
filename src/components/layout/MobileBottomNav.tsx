import React from 'react';
import { BookOpen, Calendar, Crosshair, Home, Menu } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { ModuleName } from '../../types/study';
import { prefetchModulePage } from '../../lib/routePrefetch';

interface NavTabItem {
  label: string;
  page?: ModuleName;
  icon: React.ComponentType<{ className?: string }>;
  isMenu?: boolean;
}

const MOBILE_TABS: ReadonlyArray<NavTabItem> = [
  { label: 'Início', page: 'Início', icon: Home },
  { label: 'Cronograma', page: 'Cronograma', icon: Calendar },
  { label: 'Treino', page: 'Treino Diário', icon: Crosshair },
  { label: 'Lei Seca', page: 'Lei Seca', icon: BookOpen },
  { label: 'Menu', icon: Menu, isMenu: true },
];

export const MobileBottomNav: React.FC = React.memo(() => {
  const { activePage, setActivePage, mobileOpen, setMobileOpen } = useStudy();

  return (
    <nav
      aria-label="Navegação inferior mobile"
      data-print-hide="true"
      className="fixed bottom-0 inset-x-0 z-30 min-[721px]:hidden border-t border-[var(--line-strong)] bg-[var(--panel)]/95 backdrop-blur-md print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-5 h-[58px] max-w-[640px] mx-auto px-1">
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon;
          const isActive = item.isMenu ? mobileOpen : activePage === item.page;

          return (
            <button
              key={item.label}
              type="button"
              onTouchStart={() => {
                if (item.page) prefetchModulePage(item.page);
              }}
              onClick={() => {
                if (item.isMenu) {
                  setMobileOpen(!mobileOpen);
                } else if (item.page) {
                  setMobileOpen(false);
                  setActivePage(item.page);
                }
              }}
              aria-current={!item.isMenu && isActive ? 'page' : undefined}
              aria-label={item.isMenu ? 'Abrir menu completo de módulos' : `Abrir ${item.label}`}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? 'text-[var(--accent)] font-bold'
                  : 'text-[var(--muted)] hover:text-[var(--text)] font-medium'
              }`}
            >
              {isActive && !item.isMenu && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-[2.5px] rounded-b-full bg-[var(--accent)]"
                />
              )}
              <Icon className="w-[19px] h-[19px] shrink-0" />
              <span className="text-[10px] leading-none truncate max-w-full px-0.5">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
