import React, { useMemo, useState } from 'react';
import { ChevronDown, FileDown, Printer, Stamp } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { extractOptions, formatClock, questionStatement, visibleName } from '../lib/parsers';
import { exportSimulationPreliminaryResultPdf } from '../lib/pdfExport';
import { analyzeSimulationTiming } from '../lib/simulationTimeAnalytics';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { SimulationReportOfficialPrintSheet } from '../components/print/SimulationReportOfficialPrintSheet';

export const CompletedSimulationsPage: React.FC = () => {
  const { db, googleUser, toast } = useStudy();
  const [filterId, setFilterId] = useState<string>('all');
  const [cutoffPercent, setCutoffPercent] = useState<number>(70);
  const [printingSimId, setPrintingSimId] = useState<string | null>(null);
  const [printIncludeStatements, setPrintIncludeStatements] = useState<boolean>(true);

  const filterOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set('montado', 'Montados por disciplinas');
    db.submittedSimulations.forEach((s) => map.set(s.id, s.titulo));
    db.completedSimulations.forEach((c) => {
      if (!map.has(c.prova_id)) {
        map.set(c.prova_id, c.prova_id === 'montado' ? 'Montados por disciplinas' : c.titulo);
      }
    });
    return [...map.entries()];
  }, [db.completedSimulations, db.submittedSimulations]);

  const filtered = useMemo(() => {
    if (filterId === 'all') return db.completedSimulations;
    return db.completedSimulations.filter((c) => c.prova_id === filterId);
  }, [db.completedSimulations, filterId]);

  const totals = useMemo(() => {
    const correct = filtered.reduce((sum, s) => sum + s.acertos, 0);
    const wrong = filtered.reduce((sum, s) => sum + s.erros, 0);
    const answered = correct + wrong;
    const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
    return { correct, wrong, answered, accuracy };
  }, [filtered]);

  const candidateName = googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal';

  const activePrintSimulation = useMemo(() => {
    if (printingSimId) {
      return db.completedSimulations.find((s) => s.id === printingSimId) || filtered[0] || null;
    }
    return filtered[0] || null;
  }, [db.completedSimulations, filtered, printingSimId]);

  const handlePrintOfficialSheet = (simId: string) => {
    setPrintingSimId(simId);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.print();
      }, 60);
    });
  };

  return (
    <>
      <div data-print-hide="true" className="print:hidden">
        <PageHeader
          eyebrow="BOLETIM DE OCORRÊNCIAS · SIMULADOS"
          title="Histórico e Edital de Resultado Preliminar"
          description="Acompanhe seu rendimento, analise o tempo gasto por disciplina e emita o Boletim Oficial em folha A4 ou PDF."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={() => handlePrintOfficialSheet(filtered[0].id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
                  title="Imprimir Boletim Oficial em folha A4 (último simulado filtrado)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Boletim (A4)
                </button>
              )}
              <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--muted)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={printIncludeStatements}
                  onChange={(e) => setPrintIncludeStatements(e.target.checked)}
                  className="accent-[var(--accent)] w-3.5 h-3.5"
                />
                Enunciados no A4
              </label>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] px-2.5 py-1.5 text-[11.5px] font-bold text-[var(--muted)]">
              <span>Corte (%):</span>
              <input
                type="number"
                min={10}
                max={100}
                step={5}
                value={cutoffPercent}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCutoffPercent(Number.isFinite(n) ? Math.min(100, Math.max(10, n)) : 70);
                }}
                aria-label="Nota de corte percentual para aprovação preliminar"
                className="w-12 bg-transparent font-mono-num text-[12px] font-extrabold text-[var(--text)] outline-none text-right"
              />
            </label>
            <div className="min-w-[220px]">
              <select
                aria-label="Filtrar por prova ou modalidade"
                value={filterId}
                onChange={(e) => setFilterId(e.target.value)}
                className="ce-select"
              >
                <option value="all">Todas as provas e modalidades</option>
                {filterOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Acertos</div>
          <div className="font-mono-num text-[26px] font-extrabold text-[var(--good)] mt-1">
            {totals.correct.toLocaleString('pt-BR')}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Erros</div>
          <div className="font-mono-num text-[26px] font-extrabold text-[var(--bad)] mt-1">
            {totals.wrong.toLocaleString('pt-BR')}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Questões respondidas</div>
          <div className="font-mono-num text-[26px] font-extrabold text-[var(--text)] mt-1">
            {totals.answered.toLocaleString('pt-BR')}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Aproveitamento</div>
          <div className="font-mono-num text-[26px] font-extrabold text-[var(--text)] mt-1">
            {totals.accuracy}%
          </div>
        </article>
      </div>

      {filtered.length ? (
        <>
          <Panel
            title="Proporção de acertos e erros por tentativa"
            className="mb-4"
          >
            <div className="flex flex-col gap-3">
              {filtered.map((sim) => {
                const total = Math.max(1, sim.total || sim.acertos + sim.erros);
                const goodPct = Math.round((sim.acertos / total) * 100);
                const badPct = Math.max(0, 100 - goodPct);
                return (
                  <div key={sim.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <strong className="text-[var(--text)] truncate max-w-[400px]">
                          {sim.titulo}
                        </strong>
                        {sim.banca && (
                          <span className="px-1.5 py-0.5 rounded border border-[var(--line)] bg-[var(--panel-soft)] text-[10px] font-bold text-[var(--accent)] shrink-0">
                            {sim.banca}
                          </span>
                        )}
                      </div>
                      <span className="font-mono-num text-[var(--muted)]">
                        {sim.acertos} acertos · {sim.erros} erros{sim.em_branco !== undefined && sim.em_branco > 0 ? ` · ${sim.em_branco} em branco` : ''} ({sim.aproveitamento}%)
                        {sim.pontos_liquidos !== undefined
                          ? ` · ${sim.pontos_liquidos > 0 ? `+${sim.pontos_liquidos}` : sim.pontos_liquidos} pts Cespe`
                          : ''}{' '}
                        · {formatClock(sim.tempo_segundos)}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden flex border border-[var(--line)] bg-[var(--panel-soft)]">
                      <div
                        className="bg-[var(--good)] h-full transition-all"
                        style={{ width: `${goodPct}%` }}
                      />
                      <div
                        className="bg-[var(--bad)] h-full transition-all"
                        style={{ width: `${badPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="flex flex-col gap-2.5">
            {filtered.map((sim) => {
              const wrongNumbers = sim.questoes
                .filter((q) => !q.correta)
                .map((q) => q.numero);
              const approved = sim.aproveitamento >= cutoffPercent;
              const editalNum = `DOU-${String((sim.total || 10) * 19 + sim.acertos * 13 + 2026).padStart(5, '0')}/2026`;
              const simTiming = analyzeSimulationTiming(sim);

              const handleDownloadDouPdf = () => {
                try {
                  exportSimulationPreliminaryResultPdf({
                    titulo: sim.titulo,
                    data: sim.data,
                    materia: sim.materia,
                    banca: sim.banca,
                    acertos: sim.acertos,
                    erros: sim.erros,
                    emBranco: sim.em_branco ?? 0,
                    total: sim.total,
                    aproveitamento: sim.aproveitamento,
                    pontosLiquidos: sim.pontos_liquidos,
                    tempoFormatted: formatClock(sim.tempo_segundos),
                    cutoffPercent,
                    wrongQuestionNumbers: wrongNumbers,
                    candidateName,
                  });
                  toast('Edital de Resultado Preliminar (DOU) gerado em PDF!');
                } catch (err) {
                  toast((err as Error).message || 'Não foi possível gerar o edital em PDF.', true);
                }
              };

              return (
                <details key={sim.id} className="ce-panel overflow-hidden group">
                  <summary className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-[var(--panel-soft)] transition-colors">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-[13.5px] font-bold text-[var(--text)] truncate">
                          {sim.titulo}
                        </strong>
                        <span
                          className={`px-2 py-0.5 rounded border text-[10.5px] font-bold shrink-0 ${
                            approved
                              ? 'border-[var(--good)]/40 bg-[var(--good)]/10 text-[var(--good)]'
                              : 'border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]'
                          }`}
                        >
                          {approved ? `Habilitado (>=${cutoffPercent}%)` : `Ouvidoria (<${cutoffPercent}%)`}
                        </span>
                      </div>
                      <span className="block text-[11.5px] text-[var(--muted)] mt-0.5 tabular-nums">
                        {sim.data} · {visibleName(sim.materia)} · Duração{' '}
                        {formatClock(sim.tempo_segundos)} ·{' '}
                        {wrongNumbers.length
                          ? `Erradas: Q${wrongNumbers.join(', Q')}`
                          : 'Sem erros'}
                        {sim.em_branco !== undefined && sim.em_branco > 0
                          ? ` · Em branco: ${sim.em_branco}`
                          : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {sim.pontos_liquidos !== undefined && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-mono-num ${
                            sim.pontos_liquidos > 0
                              ? 'bg-emerald-500/10 text-[var(--good)] border border-emerald-500/20'
                              : sim.pontos_liquidos < 0
                              ? 'bg-rose-500/10 text-[var(--bad)] border border-rose-500/20'
                              : 'bg-zinc-500/10 text-[var(--muted)] border border-zinc-500/20'
                          }`}
                        >
                          {sim.pontos_liquidos > 0 ? `+${sim.pontos_liquidos}` : sim.pontos_liquidos} pts Cespe
                        </span>
                      )}
                      <span className="font-mono-num text-[13px] font-extrabold text-[var(--text)]">
                        {sim.aproveitamento}% ({sim.acertos}/{sim.total})
                      </span>
                      <ChevronDown className="w-4 h-4 text-[var(--muted)] group-open:rotate-180 transition-transform" />
                    </div>
                  </summary>

                  <div className="px-4 pb-4 pt-3 border-t border-[var(--line)] flex flex-col gap-3">
                    {/* DOU-style Official Preliminary Result Notice */}
                    <div className="rounded-xl border border-[var(--accent)]/35 bg-[var(--panel-soft)] p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
                            <Stamp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Diário Oficial dos Estudos · Edital {editalNum}</span>
                          </div>
                          <p className="m-0 mt-1 text-[12px] leading-relaxed text-[var(--text)]">
                            A Banca Examinadora ({sim.banca || 'Colegiado Interno'}) torna público o resultado preliminar de{' '}
                            <strong>{candidateName}</strong> na avaliação <strong>{sim.titulo}</strong>: pontuação de{' '}
                            <strong className="font-mono-num">{sim.aproveitamento}%</strong> ({sim.acertos} acertos em {sim.total} questões
                            {typeof sim.pontos_liquidos === 'number'
                              ? `, ${sim.pontos_liquidos > 0 ? `+${sim.pontos_liquidos}` : sim.pontos_liquidos} pts líquidos CESPE`
                              : ''}
                            ), sendo declarado{' '}
                            <strong className={approved ? 'text-[var(--good)]' : 'text-[var(--bad)]'}>
                              {approved ? 'HABILITADO NA ETAPA' : 'CONVOCADO À OUVIDORIA (ERROS)'}
                            </strong>
                            .
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handlePrintOfficialSheet(sim.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[11.5px] font-bold hover:border-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 text-[var(--accent)]" />
                            Imprimir Folha Oficial (A4)
                          </button>
                          <button
                            type="button"
                            onClick={handleDownloadDouPdf}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            Emitir Resultado DOU (PDF)
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Análise de Tempo por Disciplina */}
                    {simTiming.hasPerQuestionTiming && (
                      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                          <strong className="text-[12px] font-bold text-[var(--text)]">
                            Gestão de Tempo por Disciplina
                          </strong>
                          <span className="text-[11px] font-mono-num text-[var(--muted)]">
                            Média: {formatClock(simTiming.avgSecondsPerQuestion)}/questão
                            {simTiming.slowestSubject
                              ? ` · Mais demorada: ${simTiming.slowestSubject.materia} (${formatClock(simTiming.slowestSubject.avgSeconds)}/q)`
                              : ''}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-[11.5px]">
                            <thead>
                              <tr className="border-b border-[var(--line)] text-[10.5px] font-bold text-[var(--muted)]">
                                <th className="text-left py-1.5 pr-2">Disciplina</th>
                                <th className="text-right py-1.5 px-2">Qtd.</th>
                                <th className="text-right py-1.5 px-2">Acertos</th>
                                <th className="text-right py-1.5 px-2">Tempo Total</th>
                                <th className="text-right py-1.5 px-2">Média / Q</th>
                                <th className="text-right py-1.5 pl-2">% Tempo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {simTiming.bySubject.map((row) => (
                                <tr
                                  key={row.materia}
                                  className="border-b border-[var(--line)]/50 last:border-b-0"
                                >
                                  <td className="py-1.5 pr-2 font-semibold text-[var(--text)]">
                                    {row.materia}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono-num text-[var(--muted)]">
                                    {row.count}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono-num text-[var(--good)]">
                                    {row.correct}/{row.count}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono-num text-[var(--text)]">
                                    {formatClock(row.totalSeconds)}
                                  </td>
                                  <td
                                    className={`py-1.5 px-2 text-right font-mono-num font-bold ${
                                      row.aboveAvg ? 'text-[var(--warning)]' : 'text-[var(--text)]'
                                    }`}
                                  >
                                    {formatClock(row.avgSeconds)}
                                  </td>
                                  <td className="py-1.5 pl-2 text-right font-mono-num text-[var(--muted)]">
                                    {row.sharePercent}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {simTiming.slowestQuestions.length > 0 && (
                          <div className="mt-2 pt-1.5 border-t border-[var(--line)]/60 text-[11px] text-[var(--muted)] tabular-nums">
                            <strong className="text-[var(--text)]">Questões mais demoradas:</strong>{' '}
                            {simTiming.slowestQuestions
                              .slice(0, 4)
                              .map(
                                (item) =>
                                  `Q${item.numero} (${formatClock(item.tempo_segundos)} · ${item.materia})`,
                              )
                              .join(' · ')}
                          </div>
                        )}
                      </div>
                    )}

                    {sim.questoes.map((q) => {
                      const opts = extractOptions(q);
                      return (
                        <div
                          key={`${sim.id}-${q.numero}`}
                          className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                        >
                          <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                            <strong className="text-[var(--text)] tabular-nums">
                              Questão {q.numero} · {visibleName(q.materia)}
                              {typeof q.tempo_segundos === 'number' && q.tempo_segundos > 0
                                ? ` · ${formatClock(q.tempo_segundos)}`
                                : ''}
                            </strong>
                            <span
                              className={`font-bold ${
                                q.correta ? 'text-[var(--good)]' : 'text-[var(--bad)]'
                              }`}
                            >
                              {q.correta ? 'Acertou' : 'Errou'}
                            </span>
                          </div>
                          <p className="m-0 text-[12.5px] leading-relaxed text-[var(--text)]">
                            {questionStatement(q)}
                          </p>
                          {opts.length > 0 && (
                            <div className="mt-1.5 flex flex-col gap-0.5 text-[11.5px] text-[var(--muted)]">
                              {opts.map((opt) => (
                                <span key={opt.key}>
                                  <strong className="text-[var(--text)]">{opt.key}.</strong>{' '}
                                  {opt.text}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-1.5 text-[11.5px] text-[var(--muted)]">
                            Marcada: <strong className="text-[var(--text)]">{q.resposta || '—'}</strong> · Gabarito:{' '}
                            <strong className="text-[var(--text)]">{q.gabarito}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState message="Nenhum simulado finalizado ainda. Complete uma prova em Prova Lacrada (Simulado)." />
      )}
      </div>

      <SimulationReportOfficialPrintSheet
        simulation={activePrintSimulation}
        cutoffPercent={cutoffPercent}
        candidateName={candidateName}
        includeStatements={printIncludeStatements}
      />
    </>
  );
};

