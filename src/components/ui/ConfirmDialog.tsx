import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';

export const ConfirmDialog: React.FC = () => {
  const { confirmDialog } = useStudy();

  useEffect(() => {
    if (!confirmDialog) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') confirmDialog.resolve(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDialog]);

  if (!confirmDialog) return null;

  return (
    <div
      className="ce-backdrop-enter fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="ce-modal-enter w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--panel)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`grid place-items-center w-9 h-9 rounded-lg border shrink-0 ${
              confirmDialog.danger
                ? 'border-[var(--bad)]/40 bg-[var(--bad)]/10 text-[var(--bad)]'
                : 'border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3
              id="confirm-dialog-title"
              className="m-0 font-display text-[15px] font-bold text-[var(--text)] leading-snug"
            >
              {confirmDialog.title}
            </h3>
            <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-[var(--muted)] break-words">
              {confirmDialog.description}
            </p>
          </div>
        </div>
        <div className="mt-5 pt-3.5 border-t border-[var(--line)]/60 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => confirmDialog.resolve(false)}
            className="inline-flex items-center justify-center px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] hover:border-[var(--accent)] transition-colors text-center leading-snug max-w-full"
          >
            {confirmDialog.cancelLabel || 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={() => confirmDialog.resolve(true)}
            className={`inline-flex items-center justify-center px-3.5 py-2 rounded-lg border text-[12px] font-semibold text-white transition-colors text-center leading-snug max-w-full ${
              confirmDialog.danger
                ? 'border-[var(--bad)] bg-[var(--bad)] hover:opacity-90'
                : 'border-[var(--accent)] bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
            }`}
          >
            {confirmDialog.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
};
