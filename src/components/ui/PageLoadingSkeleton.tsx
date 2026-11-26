import React from 'react';
import { ModuleName } from '../../types/study';
import { getGovModuleLabel } from '../../data/seedData';

interface PageLoadingSkeletonProps {
  activePage?: ModuleName;
}

export const PageLoadingSkeleton: React.FC<PageLoadingSkeletonProps> = ({ activePage }) => {
  const label = activePage ? getGovModuleLabel(activePage) : 'módulo';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Carregando ${label}`}
      className="flex flex-col gap-4 motion-safe:animate-pulse"
    >
      {/* Header skeleton */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="h-3 w-36 rounded bg-[var(--line)]/70 mb-2.5" />
        <div className="h-6 w-72 max-w-[80%] rounded bg-[var(--line-strong)]/60 mb-2" />
        <div className="h-3.5 w-[440px] max-w-full rounded bg-[var(--line)]/60" />
      </div>

      {/* KPI strip skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 flex flex-col gap-2"
          >
            <div className="h-3 w-24 rounded bg-[var(--line)]/70" />
            <div className="h-6 w-20 rounded bg-[var(--line-strong)]/60" />
            <div className="h-2.5 w-28 rounded bg-[var(--line)]/50" />
          </div>
        ))}
      </div>

      {/* Main body skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 flex flex-col gap-3">
          <div className="h-4 w-48 rounded bg-[var(--line-strong)]/60" />
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-12 w-full rounded-lg border border-[var(--line)]/70 bg-[var(--panel-soft)]"
            />
          ))}
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 flex flex-col gap-3">
          <div className="h-4 w-36 rounded bg-[var(--line-strong)]/60" />
          <div className="h-24 w-full rounded-lg bg-[var(--panel-soft)]" />
          <div className="h-24 w-full rounded-lg bg-[var(--panel-soft)]" />
        </div>
      </div>

      <span className="sr-only">Carregando {label}…</span>
    </div>
  );
};
