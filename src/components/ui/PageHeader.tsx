import React from 'react';
import { Inbox } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  compact?: boolean;
}

function formatEyebrowLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Soften all-caps technical eyebrows into readable institutional title/sentence case
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 4) {
    return trimmed
      .toLowerCase()
      .replace(/(^|\s|[·/(-])([a-zà-ú])/g, (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`)
      .replace(/\b(De|Da|Do|Dos|Das|E|Ao|À|Em|No|Na|Nos|Nas|Para|Por)\b/g, (m) => m.toLowerCase());
  }
  return trimmed;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  eyebrow = 'Serviço ao Estudante',
  actions,
  compact = false,
}) => (
  <div
    className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-[var(--line)] ${
      compact ? 'mb-4 pb-3' : 'mb-5 pb-4'
    }`}
  >
    <div className="min-w-[min(100%,340px)] flex-1 text-left">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] font-semibold text-[var(--accent)] mb-1">
        <span className="whitespace-nowrap">estuda.gov.br</span>
        <span aria-hidden="true" className="text-[var(--subtle)]">
          /
        </span>
        <span className="text-[var(--muted)] font-medium">{formatEyebrowLabel(eyebrow)}</span>
      </div>
      <h2
        className={`m-0 font-display font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--text)] text-left text-balance ${
          compact ? 'text-[20px] sm:text-[22px]' : 'text-[22px] sm:text-[26px]'
        }`}
      >
        {title}
      </h2>
      {description && (
        <p className="mt-1 mb-0 text-[13.5px] leading-relaxed text-[var(--muted)] max-w-3xl text-left">
          {description}
        </p>
      )}
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
  <section className={`ce-panel min-w-0 max-w-full p-4 sm:p-5 rounded-[var(--radius-md)] ${className}`}>
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

export const EmptyState: React.FC<{
  message: string;
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ message, title, icon, action }) => (
  <div className="px-6 py-9 rounded-[var(--radius-md)] border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)]/70 text-center flex flex-col items-center justify-center gap-2.5">
    <div
      className="grid place-items-center w-10 h-10 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] mb-0.5"
      aria-hidden="true"
    >
      {icon || <Inbox className="w-4.5 h-4.5" />}
    </div>
    {title && (
      <h4 className="m-0 font-display text-[14.5px] font-bold text-[var(--text)]">{title}</h4>
    )}
    <p className="m-0 text-[13px] leading-relaxed font-medium text-[var(--muted)] max-w-md">
      {message}
    </p>
    {action && <div className="mt-1.5">{action}</div>}
  </div>
);
