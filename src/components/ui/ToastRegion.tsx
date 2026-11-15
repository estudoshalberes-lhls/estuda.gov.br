import React from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';

export const ToastRegion: React.FC = () => {
  const { toasts, dismissToast } = useStudy();

  if (!toasts.length) return null;

  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex flex-col gap-2 max-w-[min(400px,calc(100vw-32px))]"
      aria-live="polite"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`flex items-start gap-2.5 px-3.5 py-3 rounded-lg border shadow-lg text-[12.5px] leading-snug bg-[var(--panel-raised)] text-[var(--text)] ${
            item.isError
              ? 'border-[var(--bad)]/50'
              : 'border-[var(--good)]/45'
          }`}
        >
          {item.isError ? (
            <AlertCircle className="w-4 h-4 text-[var(--bad)] shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[var(--good)] shrink-0 mt-0.5" />
          )}
          <span className="flex-1 min-w-0">{item.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            aria-label="Fechar aviso"
            className="text-[var(--muted)] hover:text-[var(--text)] p-0.5 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
