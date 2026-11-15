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
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-4 border-b border-[var(--line)]">
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.05em] uppercase text-[var(--accent)] mb-1.5">
        <span>estuda.gov.br</span>
        <span aria-hidden="true" className="text-[var(--subtle)]">
          /
        </span>
        <span className="text-[var(--muted)]">{eyebrow}</span>
      </div>
      <h2 className="m-0 font-display text-[23px] sm:text-[27px] font-bold tracking-[-0.02em] text-[var(--text)] [text-wrap:balance]">
        {title}
      </h2>
      <p className="mt-1.5 mb-0 text-[13.5px] leading-relaxed text-[var(--muted)] max-w-3xl">{description}</p>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pt-1">{actions}</div>}
  </div>
);

interface PanelProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
}) => (
  <section className={`ce-panel p-4 sm:p-5 rounded-[10px] ${className}`}>
    {(title || action) && (
      <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-[var(--line)]">
        <div className="min-w-0">
          {title && (
            <h3 className="m-0 font-display text-[15.5px] font-bold tracking-[-0.015em] text-[var(--text)]">{title}</h3>
          )}
          {subtitle && <p className="mt-0.5 mb-0 text-[12.5px] text-[var(--muted)]">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
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
