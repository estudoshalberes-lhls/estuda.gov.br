import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
  Bookmark,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  Play,
  Plus,
  Save,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  WEEKDAYS,
  buildScheduleWeekMetadata,
  dateInputToBrazilian,
  formatClock,
  formatScheduleDuration,
  getCurrentWeekDates,
  getWeekDatesForIsoWeek,
  goalDateIso,
  inferFixedSubjectFromTopic,
  isoWeekInputValue,
  localDateBrazilian,
  localDateIso,
  visibleName,
} from '../lib/parsers';
import { clearFieldDraft, readFieldDraft, writeFieldDraft } from '../lib/draftStorage';
import { ScheduleMap, ScheduleTopic, WeekdayName, WeeklyScheduleFileRecord } from '../types/study';
import { PageHeader, Panel } from '../components/ui/PageHeader';
import { useStudyTimer } from '../lib/timerTickStore';

const ScheduleBannerTimerActions: React.FC<{
  targetLabel: string;
  onCommit: () => void;
  onClear: () => void;
}> = React.memo(({ targetLabel, onCommit, onClear }) => {
  const { timerSeconds } = useStudyTimer();
  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <span className="font-mono-num text-[16px] font-extrabold text-[var(--text)] px-2.5 py-1 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
        {formatClock(timerSeconds)}
      </span>
      {timerSeconds > 0 && (
        <button
          type="button"
          onClick={onCommit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[12px] font-bold hover:opacity-90"
        >
          <Check className="w-3.5 h-3.5" />
          Lançar tempo em {targetLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        className="px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
      >
        Desvincular
      </button>
    </div>
  );
});

const ScheduleTopicLiveClock: React.FC = React.memo(() => {
  const { timerSeconds } = useStudyTimer();
  return (
    <span className="font-bold text-[var(--accent)] font-mono-num">
      · Cronômetro atual: {formatClock(timerSeconds)}
    </span>
  );
});

const ScheduleTopicCommitButton: React.FC<{ label: string; onCommit: () => void }> = React.memo(
  ({ label, onCommit }) => {
    const { timerSeconds } = useStudyTimer();
    if (timerSeconds <= 0) return null;
    return (
      <button
        type="button"
        onClick={onCommit}
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-[var(--good)] bg-[var(--good)] text-white text-[10.5px] font-bold hover:opacity-90"
      >
        <Check className="w-3 h-3" />
        Lançar em {label}
      </button>
    );
  },
);

export const SchedulePage: React.FC = () => {
  const {
    db,
    setActivePage,
    requestConfirm,
    saveScheduleDay,
    setScheduleDayDate,
    applyScheduleWeekDates,
    saveScheduleWeekToTxtFolder,
    loadSavedScheduleWeek,
    deleteSavedScheduleWeek,
    importScheduleTxt,
    addTopicToDay,
    deleteScheduleTopic,
    completeScheduleTopic,
    archiveTopicAsIncomplete,
    archiveFullWeek,
    fixedSubjects,
    addFixedSubject,
    removeFixedSubject,
    activeTimerTopic,
    timerRunning,
    linkTimerToScheduleTopic,
    commitTimerToSchedule,
    clearTimerLink,
    toast,
  } = useStudy();

  const currentWeekday = WEEKDAYS[(new Date().getDay() + 6) % 7];
  const todayBr = localDateBrazilian();
  const currentWeekInput = isoWeekInputValue(localDateIso());
  const firstSavedDateBr =
    db.scheduleDayDates?.['Segunda-feira'] ||
    WEEKDAYS.map((d) => db.scheduleDayDates?.[d]).find(Boolean) ||
    '';
  const inferredWeekIso = firstSavedDateBr ? goalDateIso(firstSavedDateBr) : '';
  const activeWeekInput = inferredWeekIso ? isoWeekInputValue(inferredWeekIso) : currentWeekInput;
  const currentWeekDates = getCurrentWeekDates();
  const activeWeekDates = getWeekDatesForIsoWeek(activeWeekInput) || currentWeekDates;
  const activeWeekMeta = useMemo(
    () => buildScheduleWeekMetadata(activeWeekInput, db.scheduleDayDates),
    [activeWeekInput, db.scheduleDayDates],
  );
  const savedWeeksList = useMemo<WeeklyScheduleFileRecord[]>(() => {
    const map = { ...(db.weeklySchedules || {}) };
    if (!map[activeWeekMeta.weekKey]) {
      map[activeWeekMeta.weekKey] = {
        weekKey: activeWeekMeta.weekKey,
        label: activeWeekMeta.label,
        fileName: activeWeekMeta.fileName,
        updatedAt: 'Semana ativa',
        schedule: db.schedule,
        scheduleDayDates: activeWeekMeta.dayDates,
      };
    }
    return Object.values(map).sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  }, [db.weeklySchedules, db.schedule, activeWeekMeta]);
  const [showFolderPanel, setShowFolderPanel] = useState(true);
  const [showFixedSubjectsPanel, setShowFixedSubjectsPanel] = useState(true);
  const [newFixedSubjectInput, setNewFixedSubjectInput] = useState('');
  const [defaultContestInput, setDefaultContestInput] = useState<string>(() => {
    for (const d of WEEKDAYS) {
      const found = (db.schedule?.[d] || []).find((t) => t.concurso_alvo?.trim());
      if (found?.concurso_alvo) return found.concurso_alvo.trim();
    }
    if (db.contests?.length) {
      const first = db.contests[0];
      return first.concurso || 'CONCURSO PC-PE';
    }
    return 'CONCURSO PC-PE';
  });

  const contestSuggestions = useMemo(() => {
    const set = new Set<string>(['CONCURSO PC-PE', 'CONCURSO PC-AL', 'CONCURSO PF', 'CONCURSO PRF']);
    (db.contests || []).forEach((c) => {
      if (c.concurso?.trim()) {
        const clean = c.concurso.trim();
        set.add(clean);
        if (!/^concurso/i.test(clean)) {
          set.add(`CONCURSO ${clean.toUpperCase()}`);
        }
      }
    });
    WEEKDAYS.forEach((d) => {
      (db.schedule?.[d] || []).forEach((t) => {
        if (t.concurso_alvo?.trim()) set.add(t.concurso_alvo.trim());
      });
    });
    return Array.from(set);
  }, [db.contests, db.schedule]);

  const importTxtInputRef = useRef<HTMLInputElement | null>(null);
  const hydrateScheduleWithDrafts = (source: ScheduleMap): ScheduleMap => {
    const next: ScheduleMap = { ...source };
    WEEKDAYS.forEach((day) => {
      next[day] = (source[day] || []).map((topic) => {
        if (!topic?.id) return topic;
        const savedDraft = readFieldDraft<Partial<ScheduleTopic>>(`schedule_topic_${topic.id}`);
        return savedDraft ? { ...topic, ...savedDraft } : topic;
      });
    });
    return next;
  };
  const [draft, setDraft] = useState<ScheduleMap>(() => hydrateScheduleWithDrafts(db.schedule));
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({
    [currentWeekday]: true,
  });
  const saveTimersRef = useRef<Partial<Record<WeekdayName, number>>>({});
  const dirtyDaysRef = useRef<Set<WeekdayName>>(new Set());
  const draftRef = useRef<ScheduleMap>(draft);
  draftRef.current = draft;

  const clearDayTopicDrafts = (topics: ScheduleTopic[]) => {
    topics.forEach((t) => {
      if (t?.id) clearFieldDraft(`schedule_topic_${t.id}`);
    });
  };

  const flushAllDirtyDays = () => {
    WEEKDAYS.forEach((d) => {
      if (dirtyDaysRef.current.has(d) || saveTimersRef.current[d]) {
        const t = saveTimersRef.current[d];
        if (t) {
          window.clearTimeout(t);
          delete saveTimersRef.current[d];
        }
        if (dirtyDaysRef.current.has(d)) {
          dirtyDaysRef.current.delete(d);
          const dayList = draftRef.current[d] || [];
          saveScheduleDay(d, dayList, true);
          clearDayTopicDrafts(dayList);
        }
      }
    });
  };

  useEffect(() => {
    setDraft((prev) => {
      if (dirtyDaysRef.current.size === 0) {
        const next = hydrateScheduleWithDrafts(db.schedule);
        draftRef.current = next;
        return next;
      }
      const merged = hydrateScheduleWithDrafts(db.schedule);
      dirtyDaysRef.current.forEach((d) => {
        merged[d] = prev[d] || merged[d];
      });
      draftRef.current = merged;
      return merged;
    });
  }, [db.schedule]);

  const flushDaySave = (day: WeekdayName, explicitTopics?: ScheduleTopic[]) => {
    const existingTimer = saveTimersRef.current[day];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete saveTimersRef.current[day];
    }
    if (dirtyDaysRef.current.has(day) || explicitTopics) {
      dirtyDaysRef.current.delete(day);
      const topicsToSave = explicitTopics || draftRef.current[day] || [];
      saveScheduleDay(day, topicsToSave, true);
      clearDayTopicDrafts(topicsToSave);
    }
  };

  const handleDeleteScheduleTopic = (day: WeekdayName, idx: number) => {
    const existingTimer = saveTimersRef.current[day];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete saveTimersRef.current[day];
    }
    dirtyDaysRef.current.delete(day);

    const currentDayTopics = [...(draftRef.current[day] || db.schedule[day] || [])];
    const [removed] = currentDayTopics.splice(idx, 1);
    if (removed?.id) {
      clearFieldDraft(`schedule_topic_${removed.id}`);
    }
    clearDayTopicDrafts(currentDayTopics);

    const nextDraft = { ...draftRef.current, [day]: currentDayTopics };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    saveScheduleDay(day, currentDayTopics, true);
  };

  useEffect(() => {
    const handleFlushDrafts = () => {
      WEEKDAYS.forEach((d) => {
        const t = saveTimersRef.current[d];
        if (t) {
          window.clearTimeout(t);
          delete saveTimersRef.current[d];
        }
        if (dirtyDaysRef.current.has(d)) {
          dirtyDaysRef.current.delete(d);
          const topicsToSave = draftRef.current[d] || [];
          saveScheduleDay(d, topicsToSave, true);
          clearDayTopicDrafts(topicsToSave);
        }
      });
    };
    window.addEventListener('central-estudos:flush-drafts', handleFlushDrafts);
    window.addEventListener('beforeunload', handleFlushDrafts);
    window.addEventListener('pagehide', handleFlushDrafts);
    return () => {
      window.removeEventListener('central-estudos:flush-drafts', handleFlushDrafts);
      window.removeEventListener('beforeunload', handleFlushDrafts);
      window.removeEventListener('pagehide', handleFlushDrafts);
      handleFlushDrafts();
    };
  }, [saveScheduleDay]);

  const toggleDay = (day: WeekdayName) => {
    setOpenDays((prev) => ({ ...prev, [day]: !prev[day] }));
  };

  const updateTopicFields = (
    day: WeekdayName,
    idx: number,
    patch: Partial<ScheduleTopic>,
    options?: { immediate?: boolean },
  ) => {
    const currentDay = draftRef.current[day] || [];
    if (!currentDay[idx]) return;
    const nextDay = [...currentDay];
    const updatedTopic = { ...nextDay[idx], ...patch };
    nextDay[idx] = updatedTopic;
    if (updatedTopic.id && !options?.immediate) {
      writeFieldDraft(`schedule_topic_${updatedTopic.id}`, updatedTopic);
    }
    draftRef.current = { ...draftRef.current, [day]: nextDay };
    setDraft((prev) => ({ ...prev, [day]: nextDay }));

    const existingTimer = saveTimersRef.current[day];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete saveTimersRef.current[day];
    }

    if (options?.immediate) {
      dirtyDaysRef.current.delete(day);
      saveScheduleDay(day, nextDay, true);
      if (updatedTopic.id) clearFieldDraft(`schedule_topic_${updatedTopic.id}`);
    } else {
      dirtyDaysRef.current.add(day);
      saveTimersRef.current[day] = window.setTimeout(() => {
        dirtyDaysRef.current.delete(day);
        delete saveTimersRef.current[day];
        const latestDay = draftRef.current[day] || nextDay;
        saveScheduleDay(day, latestDay, true);
        clearDayTopicDrafts(latestDay);
      }, 450);
    }
  };

  const handleAddFixedSubject = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newFixedSubjectInput.trim();
    if (!clean) {
      toast('Digite o nome da matéria para fixar.', true);
      return;
    }
    addFixedSubject(clean);
    setNewFixedSubjectInput('');
  };

  const applyContestToAllWeekTopics = (contestLabel: string) => {
    const clean = contestLabel.trim();
    if (!clean) {
      toast('Informe o nome do Concurso / Edital (ex.: CONCURSO PC-PE).', true);
      return;
    }
    WEEKDAYS.forEach((d) => {
      const currentTopics = draftRef.current[d] || [];
      if (currentTopics.length > 0) {
        const updated = currentTopics.map((t) => ({
          ...t,
          concurso_alvo: clean,
          disciplina_fixa: t.disciplina_fixa || inferFixedSubjectFromTopic(t, fixedSubjects),
        }));
        clearDayTopicDrafts(updated);
        saveScheduleDay(d, updated, true);
      }
    });
    toast(`Edital "${clean}" vinculado aos tópicos da semana!`);
  };

  const handleCloseWeek = async () => {
    const ok = await requestConfirm({
      title: 'Fechar semana do cronograma',
      description:
        'Deseja mover todos os tópicos ainda pendentes da semana para Metas Não Concluídas e limpar a grade semanal?',
      confirmLabel: 'Arquivar semana inteira',
    });
    if (!ok) return;
    WEEKDAYS.forEach((d) => {
      clearDayTopicDrafts(draftRef.current[d] || []);
    });
    const count = archiveFullWeek(draftRef.current);
    if (count === 0) {
      toast('Nenhum tópico pendente preenchido na semana para arquivar.', true);
    } else {
      toast(`${count} tópico(s) arquivado(s) em Metas Não Concluídas.`);
    }
  };

  return (
    <div>
      <datalist id="schedule-contests-datalist">
        {contestSuggestions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <PageHeader
        eyebrow="EXPEDIENTE SEMANAL · CRONOGRAMA .TXT"
        title="Planejamento diário com Matérias Fixadas e Edital Alvo"
        description="Associe cada assunto estudado a uma Matéria Fixa e ao Concurso/Edital correspondente para lançar o tempo cronometrado diretamente no Portal da Transparência."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importTxtInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  flushAllDirtyDays();
                  const count = await importScheduleTxt(file);
                  toast(`Cronograma .txt importado (${count} tópico(s)) e salvo na pasta Cronogramas!`);
                } catch (err: any) {
                  toast(err?.message || 'Falha ao importar cronograma .txt.', true);
                }
              }}
            />
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)]">
              <Calendar className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <label
                htmlFor="schedule-week-of-year"
                className="text-[11px] font-bold text-[var(--muted)] whitespace-nowrap"
              >
                Semana:
              </label>
              <input
                id="schedule-week-of-year"
                type="week"
                aria-label="Selecionar semana do ano"
                value={activeWeekInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  flushAllDirtyDays();
                  applyScheduleWeekDates(val);
                }}
                className="bg-transparent text-[12px] font-mono-num font-bold text-[var(--text)] outline-none cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                flushAllDirtyDays();
                applyScheduleWeekDates(currentWeekInput);
              }}
              title="Preencher Segunda a Domingo automaticamente com as datas da semana atual do ano"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
              Semana atual ({currentWeekDates['Segunda-feira'].slice(0, 5)}–{currentWeekDates['Domingo'].slice(0, 5)})
            </button>
            <button
              type="button"
              onClick={() => {
                flushAllDirtyDays();
                void saveScheduleWeekToTxtFolder(activeWeekInput, { silent: false });
              }}
              title="Salvar semana atual em arquivo .txt na pasta Cronogramas"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar semana (.txt)
            </button>
            <button
              type="button"
              onClick={() => {
                flushAllDirtyDays();
                void saveScheduleWeekToTxtFolder(activeWeekInput, { silent: false, download: true });
              }}
              title="Baixar arquivo .txt da semana atual"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
              Baixar .txt
            </button>
            <button
              type="button"
              onClick={() => importTxtInputRef.current?.click()}
              title="Importar arquivo .txt de cronograma para a pasta Cronogramas"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <FileUp className="w-3.5 h-3.5 text-[var(--accent)]" />
              Importar .txt
            </button>
            <button
              type="button"
              onClick={() => void handleCloseWeek()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <Archive className="w-3.5 h-3.5 text-[var(--accent)]" />
              Fechar semana
            </button>
          </div>
        }
      />

      {/* Painel de Matérias Fixadas e Concurso/Edital Alvo */}
      <Panel className="mb-3 p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[var(--panel-soft)] border-b border-[var(--line)]">
          <button
            type="button"
            onClick={() => setShowFixedSubjectsPanel((v) => !v)}
            className="flex items-center gap-2 text-left min-w-0"
          >
            <Bookmark className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span className="text-[12.5px] font-extrabold text-[var(--text)]">
              Matérias Fixadas & Edital Alvo (lançamento automático no Portal da Transparência)
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-mono-num font-bold text-[var(--accent)]">
              {fixedSubjects.length} matéria(s) fixa(s)
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${
                showFixedSubjectsPanel ? 'rotate-180' : ''
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              flushAllDirtyDays();
              setActivePage('Monitor de Desempenho');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] hover:border-[var(--accent)]"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Ver horas no Portal da Transparência →
          </button>
        </div>

        {showFixedSubjectsPanel && (
          <div className="p-3.5 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                    1. Matérias Fixadas para o Cronômetro
                  </span>
                  <p className="m-0 text-[11.5px] text-[var(--muted)]">
                    Quando o tempo cronometrado é enviado, ele é somado na Matéria Fixa vinculada ao tópico, mesmo que o assunto estudado mude a cada dia.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAddFixedSubject} className="flex flex-wrap items-center gap-2 mb-2.5">
                <input
                  type="text"
                  value={newFixedSubjectInput}
                  onChange={(e) => setNewFixedSubjectInput(e.target.value)}
                  placeholder="Cadastrar nova matéria fixa (ex.: Direito Constitucional, Medicina Legal...)"
                  className="ce-input flex-1 min-w-[210px] text-[12px] h-[34px]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3 h-[34px] rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Fixar matéria
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5 max-h-[115px] overflow-y-auto pr-1">
                {fixedSubjects.map((subj) => (
                  <span
                    key={subj}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)]"
                  >
                    <Bookmark className="w-3 h-3 text-[var(--accent)] shrink-0" />
                    <span>{subj}</span>
                    <button
                      type="button"
                      onClick={() => removeFixedSubject(subj)}
                      title={`Desafixar ${subj}`}
                      className="text-[var(--muted)] hover:text-[var(--bad)] transition-colors ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                  2. Edital / Concurso Padrão dos Novos Tópicos
                </span>
                <p className="m-0 text-[11.5px] text-[var(--muted)] mb-2.5">
                  Defina para qual edital os tópicos estão sendo estudados (ex.: <strong>CONCURSO PC-PE</strong>). Novos tópicos já recebem este concurso automaticamente.
                </p>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <input
                    type="text"
                    list="schedule-contests-datalist"
                    value={defaultContestInput}
                    onChange={(e) => setDefaultContestInput(e.target.value)}
                    placeholder="Ex.: CONCURSO PC-PE"
                    className="ce-input flex-1 min-w-[160px] text-[12px] h-[34px] font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => applyContestToAllWeekTopics(defaultContestInput)}
                    className="inline-flex items-center gap-1.5 px-2.5 h-[34px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    title="Aplicar este Concurso/Edital em todos os tópicos da semana atual"
                  >
                    <Briefcase className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Aplicar na semana
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--line)]">
                <span className="text-[10.5px] font-bold text-[var(--muted)]">Editais rápidos:</span>
                {contestSuggestions.slice(0, 5).map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setDefaultContestInput(sug)}
                    className={`px-2 py-0.5 rounded-md border text-[10.5px] font-bold transition-colors ${
                      defaultContestInput.toUpperCase() === sug.toUpperCase()
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel className="mb-3 p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[var(--panel-soft)] border-b border-[var(--line)]">
          <button
            type="button"
            onClick={() => setShowFolderPanel((v) => !v)}
            className="flex items-center gap-2 text-left min-w-0"
          >
            <FolderOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span className="text-[12.5px] font-extrabold text-[var(--text)]">
              Pasta Cronogramas (.txt organizados por semana)
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-mono-num font-bold text-[var(--accent)]">
              {savedWeeksList.length} semana(s)
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${
                showFolderPanel ? 'rotate-180' : ''
              }`}
            />
          </button>
          <span className="text-[11px] font-mono-num text-[var(--muted)] truncate">
            Ativo: {activeWeekMeta.fileName}
          </span>
        </div>

        {showFolderPanel && (
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {savedWeeksList.map((wk) => {
              const isCurrent = wk.weekKey === activeWeekMeta.weekKey;
              const topicCount = WEEKDAYS.reduce(
                (sum, d) => sum + ((isCurrent ? draft[d] : wk.schedule?.[d])?.length || 0),
                0,
              );
              return (
                <div
                  key={wk.weekKey}
                  className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-colors ${
                    isCurrent
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <strong className="text-[12px] font-bold text-[var(--text)] truncate">
                        {wk.label}
                      </strong>
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--accent)] text-white text-[9.5px] font-extrabold uppercase">
                          Ativa
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-[var(--muted)] font-mono-num truncate mt-0.5">
                      {wk.fileName} · {topicCount} tópico(s)
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          flushAllDirtyDays();
                          loadSavedScheduleWeek(wk.weekKey);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                      >
                        Abrir
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        flushAllDirtyDays();
                        void saveScheduleWeekToTxtFolder(wk.weekKey, {
                          silent: false,
                          download: true,
                        });
                      }}
                      title="Baixar arquivo .txt desta semana"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                    >
                      <Download className="w-3 h-3 text-[var(--accent)]" />
                      .txt
                    </button>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => deleteSavedScheduleWeek(wk.weekKey)}
                        title="Remover semana da lista"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--bad)] hover:border-[var(--bad)]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {activeTimerTopic && (
        <div className="mb-4 rounded-2xl border border-[var(--accent)]/50 bg-[var(--accent-soft)] p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid place-items-center w-9 h-9 rounded-xl border border-[var(--accent)]/40 bg-[var(--panel)] text-[var(--accent)] shrink-0">
              <Timer className={`w-4 h-4 ${timerRunning ? 'animate-pulse' : ''}`} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent)]">
                  CRONÔMETRO VINCULADO ({activeTimerTopic.day})
                </span>
                {activeTimerTopic.disciplinaFixa && (
                  <span className="px-2 py-0.5 rounded-md border border-[var(--accent)]/50 bg-[var(--panel)] text-[10px] font-extrabold uppercase text-[var(--accent)]">
                    MATÉRIA: {visibleName(activeTimerTopic.disciplinaFixa).toUpperCase()}.
                  </span>
                )}
                {activeTimerTopic.concursoAlvo && (
                  <span className="px-2 py-0.5 rounded-md border border-[var(--good)]/50 bg-[var(--panel)] text-[10px] font-extrabold uppercase text-[var(--good)]">
                    {activeTimerTopic.concursoAlvo.toUpperCase()}
                  </span>
                )}
              </div>
              <strong className="block text-[13.5px] font-bold text-[var(--text)] truncate">
                Assunto: {visibleName(activeTimerTopic.materia)}
              </strong>
            </div>
          </div>

          <ScheduleBannerTimerActions
            targetLabel={visibleName(activeTimerTopic.disciplinaFixa || activeTimerTopic.materia)}
            onCommit={() => commitTimerToSchedule()}
            onClear={clearTimerLink}
          />
        </div>
      )}

      {(() => {
        const activeWeekTotalTopics = WEEKDAYS.reduce(
          (sum, d) => sum + (draft[d]?.length || 0),
          0,
        );
        const populatedOtherWeeks = savedWeeksList.filter((wk) => {
          if (wk.weekKey === activeWeekMeta.weekKey) return false;
          const cnt = WEEKDAYS.reduce((s, d) => s + (wk.schedule?.[d]?.length || 0), 0);
          return cnt > 0;
        });
        if (activeWeekTotalTopics > 0 || populatedOtherWeeks.length === 0) return null;
        return (
          <div className="mb-3 rounded-2xl border border-[var(--warning)]/45 bg-[var(--warning)]/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <strong className="block text-[13px] font-bold text-[var(--text)]">
                Esta semana está vazia, mas encontramos {populatedOtherWeeks.length} semana(s) salva(s) com tópicos na Pasta Cronogramas
              </strong>
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
                Restaure sua grade com 1 clique ou importe um arquivo .txt de cronograma.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {populatedOtherWeeks.slice(0, 2).map((wk) => {
                const cnt = WEEKDAYS.reduce((s, d) => s + (wk.schedule?.[d]?.length || 0), 0);
                return (
                  <button
                    key={wk.weekKey}
                    type="button"
                    onClick={() => {
                      flushAllDirtyDays();
                      loadSavedScheduleWeek(wk.weekKey);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Abrir {wk.label.split('(')[0].trim()} ({cnt} tópicos)
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="flex flex-col gap-3">
        {WEEKDAYS.map((day) => {
          const topics = draft[day] || [];
          const isOpen = Boolean(openDays[day]);
          const isToday = day === currentWeekday;
          const generalDayDate = db.scheduleDayDates?.[day] || activeWeekDates[day] || todayBr;
          const dayStudiedTotal = topics.reduce((sum, t) => sum + (t.estudado_segundos || 0), 0);

          return (
            <Panel key={day} className="overflow-hidden p-0">
              <button
                type="button"
                onClick={() => toggleDay(day)}
                className="flex items-center justify-between w-full px-4 py-3.5 text-left hover:bg-[var(--panel-soft)] transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <strong className="font-display text-[15px] font-bold text-[var(--text)]">
                    {day}
                  </strong>
                  {isToday && (
                    <span className="px-2 py-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                      Hoje
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] text-[11px] font-mono-num font-semibold text-[var(--muted)]">
                    <Calendar className="w-3 h-3 text-[var(--accent)]" />
                    {generalDayDate}
                  </span>
                  <span className="text-[12px] text-[var(--muted)] tabular-nums">
                    {topics.length} {topics.length === 1 ? 'tópico' : 'tópicos'}
                  </span>
                  {dayStudiedTotal > 0 && (
                    <span className="px-2 py-0.5 rounded-md border border-[var(--good)]/40 bg-[var(--good)]/10 text-[11px] font-bold text-[var(--good)] font-mono-num">
                      Estudado: {formatScheduleDuration(dayStudiedTotal)}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--muted)] transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-2 border-t border-[var(--line)]">
                  <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor={`schedule-day-date-${day}`}
                        className="text-[11.5px] font-bold text-[var(--text)] whitespace-nowrap"
                      >
                        Data geral do dia:
                      </label>
                      <input
                        id={`schedule-day-date-${day}`}
                        type="date"
                        value={goalDateIso(generalDayDate)}
                        onChange={(e) => {
                          const nextDate = dateInputToBrazilian(e.target.value) || todayBr;
                          flushDaySave(day);
                          setScheduleDayDate(day, nextDate, { silent: true });
                        }}
                        className="ce-input font-mono-num text-[12px] h-[34px] w-[150px]"
                      />
                      {generalDayDate !== todayBr && (
                        <button
                          type="button"
                          onClick={() => {
                            flushDaySave(day);
                            setScheduleDayDate(day, todayBr, { silent: true });
                          }}
                          className="px-2.5 h-[34px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                        >
                          Hoje
                        </button>
                      )}
                      {topics.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            flushDaySave(day);
                            setScheduleDayDate(day, generalDayDate, { overwriteCustomized: true });
                          }}
                          className="px-2.5 h-[34px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                        >
                          Aplicar em todos os tópicos
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--muted)]">
                      Selecione a <strong>Matéria Fixa</strong> e o <strong>Concurso/Edital</strong> em cada tópico para consolidar as horas no Monitor de Desempenho.
                    </span>
                  </div>

                  {topics.length > 0 ? (
                    <div className="flex flex-col gap-2.5 mb-3">
                      {topics.map((topic, idx) => {
                        const isLinked = activeTimerTopic?.topicId === topic.id;
                        const studiedSec = topic.estudado_segundos || 0;
                        const isCustomDate = Boolean(
                          topic.data_personalizada && topic.data && topic.data !== generalDayDate,
                        );
                        const effectiveFixedSubject = (
                          topic.disciplina_fixa ||
                          inferFixedSubjectFromTopic(topic, fixedSubjects) ||
                          ''
                        ).trim();
                        const effectiveContest = (topic.concurso_alvo || defaultContestInput || '').trim();
                        const subjectOptions = effectiveFixedSubject && !fixedSubjects.includes(effectiveFixedSubject)
                          ? [effectiveFixedSubject, ...fixedSubjects]
                          : fixedSubjects;
                        const formattedMateriaBadge = effectiveFixedSubject
                          ? `MATÉRIA: ${visibleName(effectiveFixedSubject).toUpperCase().replace(/\.+$/, '')}.`
                          : 'MATÉRIA FIXA: NÃO DEFINIDA';
                        const formattedContestBadge = effectiveContest
                          ? effectiveContest.toUpperCase()
                          : 'DEFINIR CONCURSO / EDITAL';

                        return (
                          <div
                            key={topic.id}
                            className={`rounded-xl border p-3 transition-colors ${
                              isLinked
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)]/50 shadow-sm'
                                : 'border-[var(--line-strong)] bg-[var(--panel-soft)] hover:border-[var(--accent)]/50'
                            }`}
                          >
                            {/* Cabeçalho de Identificação da Matéria Fixa e Edital Alvo */}
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-[var(--line)]/80">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11px] font-extrabold tracking-wide text-[var(--accent)]">
                                  <Bookmark className="w-3 h-3 shrink-0" />
                                  {formattedMateriaBadge}
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--good)]/45 bg-[var(--good)]/12 text-[11px] font-extrabold tracking-wide text-[var(--good)]">
                                  <Briefcase className="w-3 h-3 shrink-0" />
                                  {formattedContestBadge}
                                </span>
                                {topic.materia?.trim() && (
                                  <span className="text-[11.5px] font-semibold text-[var(--muted)] truncate max-w-[340px]">
                                    Assunto: <strong className="text-[var(--text)]">{visibleName(topic.materia)}</strong>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--muted)]">
                                <span>
                                  Tempo vai para:{' '}
                                  <strong className="text-[var(--text)]">
                                    {visibleName(effectiveFixedSubject || topic.materia || 'Geral')}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            {/* Linha 1: Matéria Fixa + Assunto que vai ser estudado + Concurso/Edital */}
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.35fr_0.95fr] gap-2 mb-2">
                              <div>
                                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] mb-1">
                                  Matéria Fixada (Monitor de Desempenho)
                                </label>
                                <select
                                  aria-label="Matéria Fixada"
                                  value={effectiveFixedSubject}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateTopicFields(
                                      day,
                                      idx,
                                      {
                                        disciplina_fixa: val,
                                        concurso_alvo: topic.concurso_alvo || defaultContestInput,
                                      },
                                      { immediate: true },
                                    );
                                  }}
                                  className="ce-select text-[12px] font-bold"
                                >
                                  <option value="">Selecione a Matéria Fixa...</option>
                                  {subjectOptions.map((subj) => (
                                    <option key={subj} value={subj}>
                                      MATÉRIA: {subj.toUpperCase()}.
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] mb-1">
                                  Assunto / Tópico que vai ser estudado
                                </label>
                                <input
                                  type="text"
                                  aria-label="Assunto que vai ser estudado"
                                  value={topic.materia}
                                  onChange={(e) => {
                                    const nextMateria = e.target.value;
                                    const autoFixed =
                                      topic.disciplina_fixa ||
                                      inferFixedSubjectFromTopic(
                                        { ...topic, materia: nextMateria },
                                        fixedSubjects,
                                      );
                                    updateTopicFields(day, idx, {
                                      materia: nextMateria,
                                      ...(autoFixed && !topic.disciplina_fixa
                                        ? { disciplina_fixa: autoFixed }
                                        : {}),
                                      ...(!topic.concurso_alvo && defaultContestInput
                                        ? { concurso_alvo: defaultContestInput }
                                        : {}),
                                    });
                                  }}
                                  onBlur={() => flushDaySave(day)}
                                  placeholder="Ex.: Controle de Constitucionalidade, Direitos e Garantias..."
                                  className="ce-input text-[12px]"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--muted)] mb-1">
                                  Para qual Edital / Concurso
                                </label>
                                <input
                                  type="text"
                                  list="schedule-contests-datalist"
                                  aria-label="Concurso ou Edital alvo"
                                  value={topic.concurso_alvo ?? defaultContestInput}
                                  onChange={(e) =>
                                    updateTopicFields(day, idx, {
                                      concurso_alvo: e.target.value,
                                      disciplina_fixa: effectiveFixedSubject,
                                    })
                                  }
                                  onBlur={() => flushDaySave(day)}
                                  placeholder="Ex.: CONCURSO PC-PE"
                                  className="ce-input text-[12px] font-bold"
                                />
                              </div>
                            </div>

                            {/* Linha 2: Data + Tempo Previsto + Observações + Ações */}
                            <div className="grid grid-cols-1 md:grid-cols-[145px_125px_1fr_auto] gap-2 items-center">
                              <input
                                type="date"
                                aria-label="Data da meta"
                                value={goalDateIso(topic.data || generalDayDate)}
                                onChange={(e) => {
                                  const nextTopicDate =
                                    dateInputToBrazilian(e.target.value) || generalDayDate;
                                  updateTopicFields(day, idx, {
                                    data: nextTopicDate,
                                    data_personalizada: nextTopicDate !== generalDayDate,
                                  });
                                }}
                                onBlur={() => flushDaySave(day)}
                                className="ce-input font-mono-num text-[12px]"
                              />
                              <input
                                type="text"
                                aria-label="Tempo previsto"
                                value={topic.tempo}
                                onChange={(e) =>
                                  updateTopicFields(day, idx, { tempo: e.target.value })
                                }
                                onBlur={() => flushDaySave(day)}
                                placeholder="Ex.: 1h 30min"
                                className="ce-input text-[12px]"
                              />
                              <input
                                type="text"
                                aria-label="Observações"
                                value={topic.observacoes}
                                onChange={(e) =>
                                  updateTopicFields(day, idx, { observacoes: e.target.value })
                                }
                                onBlur={() => flushDaySave(day)}
                                placeholder="Observações, artigos, bateria de questões..."
                                className="ce-input text-[12px]"
                              />

                              <div className="flex items-center justify-end gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const enrichedTopic: ScheduleTopic = {
                                      ...topic,
                                      disciplina_fixa: effectiveFixedSubject || topic.materia,
                                      concurso_alvo: effectiveContest,
                                    };
                                    if (
                                      topic.disciplina_fixa !== enrichedTopic.disciplina_fixa ||
                                      topic.concurso_alvo !== enrichedTopic.concurso_alvo
                                    ) {
                                      updateTopicFields(day, idx, {
                                        disciplina_fixa: enrichedTopic.disciplina_fixa,
                                        concurso_alvo: enrichedTopic.concurso_alvo,
                                      });
                                      flushDaySave(day);
                                    }
                                    linkTimerToScheduleTopic(day, enrichedTopic, true);
                                  }}
                                  title="Vincular cronômetro a este tópico e lançar na Matéria Fixa"
                                  className={`inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border text-[11px] font-bold whitespace-nowrap transition-colors ${
                                    isLinked
                                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                      : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--accent)] hover:border-[var(--accent)]'
                                  }`}
                                >
                                  <Play className="w-3 h-3" />
                                  {isLinked ? 'Cronometrando' : 'Cronometrar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const latestDayTopics = draftRef.current[day] || topics;
                                    if (latestDayTopics[idx]?.id) {
                                      clearFieldDraft(`schedule_topic_${latestDayTopics[idx].id}`);
                                    }
                                    completeScheduleTopic(day, idx, latestDayTopics);
                                  }}
                                  title={`Concluir ${visibleName(topic.materia || effectiveFixedSubject || 'tópico')}`}
                                  aria-label="Concluir tópico"
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/15 text-[var(--good)] hover:bg-[var(--good)] hover:text-white transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const latestDayTopics = draftRef.current[day] || topics;
                                    if (latestDayTopics[idx]?.id) {
                                      clearFieldDraft(`schedule_topic_${latestDayTopics[idx].id}`);
                                    }
                                    archiveTopicAsIncomplete(day, idx, draftRef.current);
                                  }}
                                  title="Arquivar em Metas Não Concluídas"
                                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--warning)] hover:border-[var(--warning)] whitespace-nowrap"
                                >
                                  <Clock3 className="w-3 h-3" />
                                  Pendente
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteScheduleTopic(day, idx)}
                                  aria-label="Remover tópico"
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--bad)] hover:border-[var(--bad)] transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {(studiedSec > 0 || isLinked || isCustomDate) && (
                              <div className="mt-2 pt-1.5 border-t border-[var(--line)]/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
                                  {isCustomDate && (
                                    <span className="inline-flex items-center gap-1.5 text-[var(--accent)] font-semibold">
                                      Data individual ({topic.data})
                                      <button
                                        type="button"
                                        onClick={() => {
                                          updateTopicFields(day, idx, {
                                            data: generalDayDate,
                                            data_personalizada: false,
                                          });
                                        }}
                                        className="underline hover:text-[var(--text)] font-bold"
                                      >
                                        Usar data do dia
                                      </button>
                                    </span>
                                  )}
                                  {studiedSec > 0 && (
                                    <span className="inline-flex items-center gap-1 font-bold text-[var(--good)] font-mono-num">
                                      <Timer className="w-3 h-3" />
                                      Tempo contabilizado em {visibleName(effectiveFixedSubject || topic.materia)}: {formatScheduleDuration(studiedSec)}
                                    </span>
                                  )}
                                  {isLinked && <ScheduleTopicLiveClock />}
                                </div>
                                {isLinked && (
                                  <ScheduleTopicCommitButton
                                    label={visibleName(effectiveFixedSubject || topic.materia)}
                                    onCommit={() => commitTimerToSchedule()}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-[12.5px] text-[var(--muted)]">
                      Nenhum tópico planejado para {day}.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
                    <button
                      type="button"
                      onClick={() => {
                        flushDaySave(day);
                        const lastTopic = topics[topics.length - 1];
                        addTopicToDay(day, {
                          disciplina_fixa:
                            lastTopic?.disciplina_fixa ||
                            (lastTopic ? inferFixedSubjectFromTopic(lastTopic, fixedSubjects) : '') ||
                            fixedSubjects[0] ||
                            'Direito Constitucional',
                          concurso_alvo: lastTopic?.concurso_alvo || defaultContestInput || 'CONCURSO PC-PE',
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Adicionar tópico com Matéria Fixa
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        dirtyDaysRef.current.delete(day);
                        const t = saveTimersRef.current[day];
                        if (t) {
                          window.clearTimeout(t);
                          delete saveTimersRef.current[day];
                        }
                        const latestTopics = draftRef.current[day] || topics;
                        clearDayTopicDrafts(latestTopics);
                        flushAllDirtyDays();
                        saveScheduleDay(day, latestTopics);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Salvar dia (.txt)
                    </button>
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
};

