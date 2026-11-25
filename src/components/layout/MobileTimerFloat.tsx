import React, { useEffect, useState } from 'react';
import { Clock3, Pause, Play, Save } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { useStudyTimer } from '../../lib/timerTickStore';
import { formatClock, visibleName } from '../../lib/parsers';

export const MobileTimerFloat: React.FC = React.memo(() => {
  const {
    toggleTimer,
    activeTimerTopic,
    commitTimerToSchedule,
    setActivePage,
    examFocusMode,
  } = useStudy();
  const { timerSeconds, timerRunning } = useStudyTimer();

  const [scrolledPastTop, setScrolledPastTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolledPastTop(window.scrollY > 120);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (examFocusMode) return null;
  if (!timerRunning && !(timerSeconds > 0 && scrolledPastTop)) return null;

  const subjectLabel = activeTimerTopic?.materia
    ? visibleName(activeTimerTopic.materia)
    : 'Ponto Eletrônico';

  return (
    <aside
      data-print-hide="true"
      aria-label="Controle flutuante do Ponto Eletrônico"
      className="fixed bottom-[68px] left-3 right-[68px] z-35 min-[721px]:hidden rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 shadow-lg flex items-center justify-between gap-2 print:hidden"
    >
      <div className="min-w-0 flex items-center gap-2">
        <span
          className={`grid place-items-center w-8 h-8 rounded-lg border shrink-0 ${
            timerRunning
              ? 'border-[var(--good)]/50 bg-[var(--good)]/15 text-[var(--good)]'
              : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--accent)]'
          }`}
        >
          <Clock3 className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="font-mono-num text-[14px] font-extrabold leading-none text-[var(--text)]">
            {formatClock(timerSeconds)}
          </div>
          <div className="text-[10.5px] font-semibold text-[var(--muted)] truncate mt-0.5">
            {subjectLabel}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={toggleTimer}
          aria-label={timerRunning ? 'Pausar cronômetro' : 'Retomar cronômetro'}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
        >
          {timerRunning ? <Pause className="w-3.5 h-3.5 text-[var(--warning)]" /> : <Play className="w-3.5 h-3.5 text-[var(--good)]" />}
          <span>{timerRunning ? 'Pausar' : 'Retomar'}</span>
        </button>

        {timerSeconds > 0 && (
          <button
            type="button"
            onClick={() => {
              if (activeTimerTopic) {
                commitTimerToSchedule();
              } else {
                setActivePage('Cronograma');
              }
            }}
            aria-label={activeTimerTopic ? 'Salvar tempo no cronograma' : 'Abrir cronograma para lançar tempo'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{activeTimerTopic ? 'Salvar' : 'Lançar'}</span>
          </button>
        )}
      </div>
    </aside>
  );
});
