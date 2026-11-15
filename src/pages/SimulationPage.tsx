import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Play, Trash2 } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { shuffled, uid } from '../lib/parsers';
import { Question, SubmittedSimulation } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { QuizRunner } from '../components/quiz/QuizRunner';

export const SimulationPage: React.FC = () => {
  const {
    db,
    disciplines,
    questionsByDiscipline,
    quiz,
    setQuiz,
    timerSeconds,
    ensureTimerRunning,
    setActivePage,
    deleteSubmittedSimulation,
    toast,
  } = useStudy();

  const [tab, setTab] = useState<'build' | 'submitted'>('build');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(0);
  const [selectedBanca, setSelectedBanca] = useState<string>('CESPE / Cebraspe');
  const [submittedSearch, setSubmittedSearch] = useState<string>('');
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    disciplines.forEach((d) => {
      initial[d] = Math.min(2, questionsByDiscipline[d] || 0);
    });
    return initial;
  });
  const [shuffleAll, setShuffleAll] = useState<boolean>(true);

  useEffect(() => {
    setCounts((prev) => {
      const next = { ...prev };
      disciplines.forEach((d) => {
        if (next[d] === undefined) {
          next[d] = Math.min(2, questionsByDiscipline[d] || 0);
        }
      });
      return next;
    });
  }, [disciplines, questionsByDiscipline]);

  const startBuiltSimulation = () => {
    const selected: Question[] = [];
    for (const d of disciplines) {
      const qty = Math.min(Number(counts[d] || 0), questionsByDiscipline[d] || 0);
      if (qty > 0) {
        const pool = shuffled(db.questions.filter((q) => q.materia === d));
        selected.push(...pool.slice(0, qty));
      }
    }
    if (!selected.length) {
      toast('Selecione pelo menos 1 questão para montar o simulado.', true);
      return;
    }
    const questions = shuffleAll ? shuffled(selected) : selected;
    ensureTimerRunning();
    setQuiz({
      id: uid(16),
      kind: 'simulation',
      titulo: 'Montado por disciplinas',
      materia: 'Geral',
      banca: selectedBanca || undefined,
      questions,
      index: 0,
      answers: Array(questions.length),
      studySeconds: 0,
      timerBaseline: timerSeconds,
      startedAt: Date.now(),
      timeLimitSeconds: timeLimitMinutes > 0 ? timeLimitMinutes * 60 : undefined,
    });
  };

  const startSubmittedSimulation = (sim: SubmittedSimulation) => {
    const ordered = [...sim.questoes].sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));
    if (!ordered.length) {
      toast('Este simulado ainda não possui questões.', true);
      return;
    }
    ensureTimerRunning();
    setQuiz({
      id: uid(16),
      kind: 'simulation',
      submittedSimulationId: sim.id,
      titulo: sim.titulo,
      materia: sim.materia,
      banca: selectedBanca || undefined,
      questions: ordered,
      index: 0,
      answers: Array(ordered.length),
      studySeconds: 0,
      timerBaseline: timerSeconds,
      startedAt: Date.now(),
      timeLimitSeconds: timeLimitMinutes > 0 ? timeLimitMinutes * 60 : undefined,
    });
  };

  const activeSimulation = quiz?.kind === 'simulation';

  return (
    <div>
      <PageHeader
        eyebrow="BANCA EXAMINADORA · SIMULADO FECHADO"
        title="Simulado sem feedback imediato"
        description="Gabarito oficial, pontuação e revisão ficam lacrados até o encerramento da prova. Inclui quadro branco opcional para cálculos e esquemas."
      />

      {!activeSimulation && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={() => setTab('build')}
              className={`px-3.5 py-2 rounded-lg border text-[12.5px] font-bold transition-colors whitespace-nowrap ${
                tab === 'build'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Montar por disciplinas
            </button>
            <button
              type="button"
              onClick={() => setTab('submitted')}
              className={`px-3.5 py-2 rounded-lg border text-[12.5px] font-bold transition-colors whitespace-nowrap tabular-nums ${
                tab === 'submitted'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Simulados Enviados ({db.submittedSimulations.length})
            </button>
          </div>

          {tab === 'build' ? (
            <Panel
              title="Definir quantidade de questões por disciplina"
              subtitle="Use 0 para omitir uma disciplina."
            >
              {disciplines.length ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                    {disciplines.map((d) => {
                      const available = questionsByDiscipline[d] || 0;
                      return (
                        <div
                          key={d}
                          className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <label
                              htmlFor={`sim-qty-${d}`}
                              className="text-[12.5px] font-bold text-[var(--text)] truncate"
                              title={d}
                            >
                              {d}
                            </label>
                            <span className="text-[11px] text-[var(--muted)] tabular-nums shrink-0">
                              disp.: {available}
                            </span>
                          </div>
                          <input
                            id={`sim-qty-${d}`}
                            type="number"
                            min={0}
                            max={available}
                            value={counts[d] ?? 0}
                            onChange={(e) =>
                              setCounts((prev) => ({
                                ...prev,
                                [d]: Math.max(0, Math.min(available, Number(e.target.value) || 0)),
                              }))
                            }
                            className="ce-input font-mono-num"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--line)]">
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--text)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={shuffleAll}
                          onChange={(e) => setShuffleAll(e.target.checked)}
                          className="accent-[var(--accent)] w-4 h-4"
                        />
                        Misturar questões
                      </label>

                      <div className="flex items-center gap-2">
                        <label htmlFor="sim-time-limit" className="text-[12px] font-bold text-[var(--muted)]">
                          Tempo limite:
                        </label>
                        <select
                          id="sim-time-limit"
                          value={timeLimitMinutes}
                          onChange={(e) => setTimeLimitMinutes(Number(e.target.value) || 0)}
                          className="ce-select w-auto text-[12px] py-1 h-[34px]"
                        >
                          <option value="0">Sem tempo limite</option>
                          <option value="30">30 minutos</option>
                          <option value="60">1 hora</option>
                          <option value="90">1h 30min</option>
                          <option value="120">2 horas</option>
                          <option value="180">3 horas</option>
                          <option value="240">4 horas</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <label htmlFor="sim-banca" className="text-[12px] font-bold text-[var(--muted)]">
                          Banca:
                        </label>
                        <select
                          id="sim-banca"
                          value={selectedBanca}
                          onChange={(e) => setSelectedBanca(e.target.value)}
                          className="ce-select w-auto text-[12px] py-1 h-[34px]"
                        >
                          <option value="CESPE / Cebraspe">CESPE / Cebraspe</option>
                          <option value="FGV">FGV</option>
                          <option value="FCC">FCC</option>
                          <option value="VUNESP">VUNESP</option>
                          <option value="IBFC / AOCP">IBFC / AOCP</option>
                          <option value="Outra / Geral">Outra / Geral</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={startBuiltSimulation}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[13px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Iniciar simulado
                    </button>
                  </div>
                </>
              ) : (
                <EmptyState message="Importe questões em Utilidades para montar seu primeiro simulado." />
              )}
            </Panel>
          ) : (
            <Panel
              title="Provas e simulados importados"
              subtitle="Simulados enviados via Utilidades com ordem fiel da prova original."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Banca examinadora"
                    value={selectedBanca}
                    onChange={(e) => setSelectedBanca(e.target.value)}
                    className="ce-select w-auto text-[11.5px] py-1 h-[32px]"
                  >
                    <option value="CESPE / Cebraspe">CESPE / Cebraspe</option>
                    <option value="FGV">FGV</option>
                    <option value="FCC">FCC</option>
                    <option value="VUNESP">VUNESP</option>
                    <option value="IBFC / AOCP">IBFC / AOCP</option>
                    <option value="Outra / Geral">Outra / Geral</option>
                  </select>
                  <select
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(Number(e.target.value) || 0)}
                    className="ce-select w-auto text-[11.5px] py-1 h-[32px]"
                  >
                    <option value="0">Sem tempo limite</option>
                    <option value="60">1h limite</option>
                    <option value="120">2h limite</option>
                    <option value="180">3h limite</option>
                    <option value="240">4h limite</option>
                  </select>
                </div>
              }
            >
              {db.submittedSimulations.length ? (
                <div className="flex flex-col gap-3">
                  <div className="mb-1">
                    <input
                      type="text"
                      value={submittedSearch}
                      onChange={(e) => setSubmittedSearch(e.target.value)}
                      placeholder="Buscar por título, matéria ou arquivo..."
                      className="ce-input text-[12.5px]"
                    />
                  </div>

                  {db.submittedSimulations
                    .filter((s) => {
                      if (!submittedSearch.trim()) return true;
                      const term = submittedSearch.toLowerCase();
                      return (
                        s.titulo.toLowerCase().includes(term) ||
                        s.materia.toLowerCase().includes(term) ||
                        s.arquivo.toLowerCase().includes(term)
                      );
                    })
                    .map((sim) => (
                    <div
                      key={sim.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
                          <strong className="text-[14px] font-bold text-[var(--text)] truncate">
                            {sim.titulo}
                          </strong>
                        </div>
                        <div className="mt-1 text-[12px] text-[var(--muted)] tabular-nums">
                          {sim.materia} · {sim.arquivo} · {sim.questoes.length} questões · {sim.data}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startSubmittedSimulation(sim)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Iniciar prova
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSubmittedSimulation(sim.id)}
                          aria-label={`Excluir ${sim.titulo}`}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="Nenhum simulado enviado ainda. Importe arquivos .txt ou PDFs de provas em Utilidades." />
              )}
            </Panel>
          )}
        </>
      )}

      {activeSimulation && (
        <QuizRunner
          simulation={true}
          onViewCompletedSimulations={() => setActivePage('Simulados Realizados')}
        />
      )}
    </div>
  );
};
