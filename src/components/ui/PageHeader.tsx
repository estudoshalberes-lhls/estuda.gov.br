import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  eyebrow = 'SERVIÇO AO ESTUDANTE',
  actions,
}) => (
  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3.5 mb-6 pb-4 border-b border-[var(--line)]">
    <div className="min-w-[min(100%,380px)] flex-1 text-left">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold tracking-[0.05em] uppercase text-[var(--accent)] mb-1.5">
        <span className="whitespace-nowrap">estuda.gov.br</span>
        <span aria-hidden="true" className="text-[var(--subtle)]">
          /
        </span>
        <span className="text-[var(--muted)]">{eyebrow}</span>
      </div>
      <h2 className="m-0 font-display text-[23px] sm:text-[27px] font-bold leading-[1.2] tracking-[-0.02em] text-[var(--text)] text-left">
        {title}
      </h2>
      <p className="mt-1.5 mb-0 text-[13.5px] leading-relaxed text-[var(--muted)] max-w-3xl text-left">
        {description}
      </p>
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full sm:pt-0.5">
        {actions}
      </div>
    )}
  </div>
);

interface PanelProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  stackHeader?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
  stackHeader = false,
}) => (
  <section className={`ce-panel min-w-0 max-w-full p-4 sm:p-5 rounded-[10px] ${className}`}>
    {(title || action) && (
      <div
        className={`flex ${
          stackHeader ? 'flex-col' : 'flex-wrap items-start justify-between'
        } gap-x-4 gap-y-2.5 mb-4 pb-3 border-b border-[var(--line)]`}
      >
        <div className={stackHeader ? 'min-w-0 w-full text-left' : 'min-w-[min(100%,240px)] flex-1 text-left'}>
          {title && (
            <h3
              className={`m-0 font-display text-[15.5px] font-bold leading-snug tracking-[-0.015em] text-[var(--text)] text-left ${
                stackHeader ? 'whitespace-nowrap overflow-x-auto' : ''
              }`}
            >
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="mt-0.5 mb-0 text-[12.5px] leading-relaxed text-[var(--muted)] text-left">
              {subtitle}
            </p>
          )}
        </div>
        {action && (
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            {action}
          </div>
        )}
      </div>
    )}
    {children}
  </section>
);

export const EmptyState: React.FC<{ message: string; action?: React.ReactNode }> = ({ message, action }) => (
  <div className="p-8 rounded-[10px] border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] text-center flex flex-col items-center justify-center gap-3">
    <p className="m-0 text-[13.5px] font-medium text-[var(--muted)] max-w-md">{message}</p>
    {action && <div className="mt-1">{action}</div>}
  </div>
);
