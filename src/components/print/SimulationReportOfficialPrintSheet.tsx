import React, { useMemo } from 'react';
import { CompletedSimulation } from '../../types/study';
import { extractOptions, formatClock, questionStatement, visibleName } from '../../lib/parsers';
import { analyzeSimulationTiming } from '../../lib/simulationTimeAnalytics';
import { FederalCoatOfArmsPlaceholder } from './FederalCoatOfArmsPlaceholder';
import { StructuredLegalText } from '../ui/StructuredLegalText';

interface SimulationReportOfficialPrintSheetProps {
  simulation: CompletedSimulation | null;
  cutoffPercent: number;
  candidateName: string;
  includeStatements: boolean;
}

export const SimulationReportOfficialPrintSheet: React.FC<
  SimulationReportOfficialPrintSheetProps
> = ({ simulation, cutoffPercent, candidateName, includeStatements }) => {
  const timing = useMemo(
    () => (simulation ? analyzeSimulationTiming(simulation) : null),
    [simulation],
  );

  if (!simulation || !timing) return null;

  const approved = simulation.aproveitamento >= cutoffPercent;
  const emissionStamp = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const protocolCode = `SIM-${new Date().getFullYear()}.${String(simulation.total).padStart(3, '0')}-${String(
    simulation.aproveitamento,
  ).padStart(2, '0')}`;
  const wrongNumbers = simulation.questoes
    .filter((q) => !q.correta && Boolean(q.resposta))
    .map((q) => q.numero);

  return (
    <section
      className="gov-print-sheet gov-official-doc-print gov-simulation-report-print hidden print:block bg-white text-[#071D41]"
      aria-label="Boletim Oficial de Simulado Realizado para Impressão A4"
    >
      {/* Cabeçalho Oficial do Governo Federal com Brasão (Placeholder) */}
      <header className="border border-[#071D41] mb-3.5 bg-white">
        <div className="px-4 pt-3 pb-2.5 flex flex-col items-center text-center bg-white">
          <FederalCoatOfArmsPlaceholder />

          <div className="mt-1.5 text-[9.2pt] font-extrabold tracking-[0.16em] uppercase text-[#071D41]">
            REPÚBLICA FEDERATIVA DO BRASIL
          </div>
          <div className="text-[7.8pt] font-bold tracking-[0.1em] uppercase text-[#1351B4] mt-0.5">
            PORTAL ÚNICO DO ESTUDANTE · ESTUDA.GOV.BR
          </div>
          <div className="text-[7.5pt] font-semibold tracking-[0.06em] uppercase text-[#3D4F6B] mt-0.5">
            CENTRAL DE AVALIAÇÕES · BOLETIM OFICIAL DE SIMULADO REALIZADO
          </div>
        </div>

        <div className="gov-brasil-stripe" />

        <div className="bg-[#071D41] text-white px-4 py-2 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[7pt] font-bold tracking-[0.12em] uppercase text-[#FFCD07]">
              DOCUMENTO OFICIAL DE APURAÇÃO E GABARITO COMENTADO
            </div>
            <h1 className="m-0 mt-0.5 text-[11.5pt] font-extrabold tracking-[0.01em] uppercase text-white leading-tight truncate">
              {simulation.titulo} {simulation.banca ? `· ${simulation.banca}` : ''}
            </h1>
          </div>

          <div className="text-right shrink-0 border-l border-white/25 pl-3">
            <div className="text-[6.8pt] uppercase tracking-[0.1em] text-[#FFCD07] font-bold">
              Protocolo SEI / SIM
            </div>
            <div className="font-mono text-[9.2pt] font-bold text-white leading-tight">
              {protocolCode}
            </div>
            <div className="text-[7pt] text-[#DCE6F5] mt-0.5">Emitido em {emissionStamp}</div>
          </div>
        </div>

        <div className="grid grid-cols-4 divide-x divide-[#B6C6DC] bg-[#F7F9FC] text-[8pt] border-t border-[#071D41]">
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Candidato(a)
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight truncate">
              {candidateName}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Realização / Duração
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {simulation.data} · {formatClock(simulation.tempo_segundos)}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Desempenho ({cutoffPercent}% corte)
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {simulation.aproveitamento}% ({simulation.acertos}/{simulation.total})
              {typeof simulation.pontos_liquidos === 'number'
                ? ` · ${simulation.pontos_liquidos > 0 ? `+${simulation.pontos_liquidos}` : simulation.pontos_liquidos} pts`
                : ''}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Situação Preliminar
            </div>
            <div
              className={`font-extrabold mt-0.5 leading-tight ${
                approved ? 'text-[#166534]' : 'text-[#9A5B00]'
              }`}
            >
              {approved ? 'HABILITADO NA ETAPA' : 'CONVOCADO À OUVIDORIA'}
            </div>
          </div>
        </div>
      </header>

      {/* Quadro de Rendimento e Tempo por Disciplina */}
      <section className="mb-3 border border-[#9BB0CD] break-inside-avoid page-break-inside-avoid">
        <div className="bg-[#EDF2F8] border-b border-[#9BB0CD] px-3 py-1 text-[8pt] font-extrabold uppercase tracking-[0.05em] text-[#071D41] flex items-center justify-between">
          <span>Quadro de Rendimento e Gestão de Tempo por Disciplina</span>
          <span className="font-mono text-[7.8pt] text-[#1351B4]">
            Média geral: {formatClock(timing.avgSecondsPerQuestion)}/questão
          </span>
        </div>
        <table className="w-full border-collapse text-[8pt]">
          <thead>
            <tr className="bg-[#F7F9FC] border-b border-[#C5D2E4] text-[#3D4F6B]">
              <th className="text-left px-3 py-1 font-bold">Disciplina</th>
              <th className="text-right px-2 py-1 font-bold w-14">Qtd.</th>
              <th className="text-right px-2 py-1 font-bold w-16">Acertos</th>
              <th className="text-right px-2 py-1 font-bold w-16">Erros</th>
              <th className="text-right px-2 py-1 font-bold w-16">Aprov.</th>
              {timing.hasPerQuestionTiming && (
                <>
                  <th className="text-right px-2 py-1 font-bold w-20">Tempo Total</th>
                  <th className="text-right px-3 py-1 font-bold w-20">Média / Q</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {timing.bySubject.map((row) => {
              const pct = row.count ? Math.round((row.correct / row.count) * 100) : 0;
              return (
                <tr key={row.materia} className="border-b border-[#E3EAF3] last:border-b-0">
                  <td className="px-3 py-1 font-bold text-[#071D41]">{row.materia}</td>
                  <td className="px-2 py-1 text-right font-mono">{row.count}</td>
                  <td className="px-2 py-1 text-right font-mono text-[#166534]">{row.correct}</td>
                  <td className="px-2 py-1 text-right font-mono text-[#991B1B]">{row.wrong}</td>
                  <td className="px-2 py-1 text-right font-mono font-bold">{pct}%</td>
                  {timing.hasPerQuestionTiming && (
                    <>
                      <td className="px-2 py-1 text-right font-mono">
                        {formatClock(row.totalSeconds)}
                      </td>
                      <td
                        className={`px-3 py-1 text-right font-mono font-bold ${
                          row.aboveAvg ? 'text-[#9A5B00]' : 'text-[#071D41]'
                        }`}
                      >
                        {formatClock(row.avgSeconds)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {timing.slowestQuestions.length > 0 && (
          <div className="px-3 py-1.5 bg-[#F7F9FC] border-t border-[#C5D2E4] text-[7.8pt] text-[#3D4F6B] font-mono">
            <strong>Questões mais demoradas:</strong>{' '}
            {timing.slowestQuestions
              .slice(0, 5)
              .map(
                (q) =>
                  `Q${q.numero} (${formatClock(q.tempo_segundos)} · ${q.correta ? 'Acerto' : q.resposta ? 'Erro' : 'Branco'})`,
              )
              .join('  |  ')}
          </div>
        )}
      </section>

      {/* Gabarito Resumido */}
      <section className="mb-3 border border-[#9BB0CD] break-inside-avoid page-break-inside-avoid">
        <div className="bg-[#EDF2F8] border-b border-[#9BB0CD] px-3 py-1 text-[8pt] font-extrabold uppercase tracking-[0.05em] text-[#071D41]">
          Espelho do Cartão-Resposta ({simulation.questoes.length} questões ·{' '}
          {wrongNumbers.length ? `Erradas: Q${wrongNumbers.join(', Q')}` : 'Nenhum erro'})
        </div>
        <div className="p-2 grid grid-cols-5 gap-1.5 text-[7.8pt] font-mono">
          {simulation.questoes.map((q) => (
            <div
              key={`${simulation.id}-grid-${q.numero}`}
              className={`border px-2 py-1 flex items-center justify-between ${
                q.correta
                  ? 'border-[#BBDDC0] bg-[#F4FBF5]'
                  : q.resposta
                    ? 'border-[#E6B8B8] bg-[#FDF5F5]'
                    : 'border-[#D6E0EC] bg-[#F7F9FC]'
              }`}
            >
              <span className="font-bold text-[#071D41]">Q{String(q.numero).padStart(2, '0')}</span>
              <span>
                <strong className={q.correta ? 'text-[#166534]' : 'text-[#991B1B]'}>
                  {q.resposta || '—'}
                </strong>
                /{q.gabarito}
              </span>
              {typeof q.tempo_segundos === 'number' && q.tempo_segundos > 0 && (
                <span className="text-[7pt] text-[#3D4F6B]">{formatClock(q.tempo_segundos)}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Caderno Detalhado das Questões (alinhado e estruturado) */}
      {includeStatements && simulation.questoes.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="gov-en-subject-header bg-[#EDF2F8] border border-[#071D41] border-l-[4px] border-l-[#071D41] px-3 py-1.5 text-[9.5pt] font-extrabold uppercase tracking-[0.03em] text-[#071D41]">
            Detalhamento das Questões e Gabarito Comentado
          </div>
          {simulation.questoes.map((q) => {
            const opts = extractOptions(q);
            const stmt = questionStatement(q);
            const normGab = (q.gabarito || '').trim().toUpperCase();
            const normResp = (q.resposta || '').trim().toUpperCase();
            const isLong =
              stmt.length +
                (q.comentario?.length || 0) +
                opts.reduce((acc, o) => acc + o.text.length, 0) >
              1300;

            return (
              <article
                key={`${simulation.id}-det-${q.numero}`}
                className={`gov-en-entry-card ${
                  isLong ? 'gov-en-entry-card--long' : ''
                } border border-[#9BB0CD] bg-white`}
              >
                <div className="gov-en-entry-header bg-[#F5F8FC] border-b border-[#C5D2E4] px-3 py-1.5 flex items-baseline justify-between gap-2 text-[7.9pt]">
                  <div className="min-w-0">
                    <span className="font-mono font-extrabold text-[#071D41] mr-1.5">
                      QUESTÃO {String(q.numero).padStart(2, '0')}
                    </span>
                    <span className="font-bold text-[#1351B4]">{visibleName(q.materia)}</span>
                    <span className="text-[#5C6E8A]"> · </span>
                    <span
                      className={`font-bold ${
                        q.correta
                          ? 'text-[#166534]'
                          : q.resposta
                            ? 'text-[#991B1B]'
                            : 'text-[#9A5B00]'
                      }`}
                    >
                      {q.correta ? 'Acertou' : q.resposta ? 'Errou' : 'Em branco'}
                    </span>
                  </div>
                  <span className="font-mono text-[7.6pt] text-[#3D4F6B] shrink-0">
                    Marcada: {q.resposta || '—'} · Gab.: {q.gabarito}
                    {typeof q.tempo_segundos === 'number' && q.tempo_segundos > 0
                      ? ` · Tempo: ${formatClock(q.tempo_segundos)}`
                      : ''}
                  </span>
                </div>

                <div className="px-3 py-2">
                  <StructuredLegalText
                    text={stmt}
                    variant="print"
                    className="text-[8.5pt]"
                  />

                  {opts.length > 0 && (
                    <div className="mt-1.5 flex flex-col gap-1 text-[8pt]">
                      {opts.map((opt) => {
                        const keyNorm = (opt.key || '').trim().toUpperCase();
                        const isRight = Boolean(normGab && keyNorm === normGab);
                        const isWrongChoice = Boolean(
                          normResp && keyNorm === normResp && keyNorm !== normGab,
                        );
                        return (
                          <div
                            key={opt.key}
                            className={`flex items-start gap-1.5 px-2 py-0.5 rounded-sm leading-[1.42] ${
                              isRight
                                ? 'bg-[#ECF8EF] text-[#104A1C] border-l-2 border-[#168821]'
                                : isWrongChoice
                                  ? 'bg-[#FDEEEE] text-[#7F1D1D] border-l-2 border-[#C92A2A]'
                                  : 'text-[#1E2E47]'
                            }`}
                          >
                            <strong className="font-mono font-extrabold text-[#071D41] shrink-0">
                              {keyNorm})
                            </strong>
                            <span className="flex-1 text-justify">
                              {opt.text}
                              {isRight && (
                                <strong className="ml-1 text-[7.2pt] text-[#166534]">
                                  (Gabarito)
                                </strong>
                              )}
                              {isWrongChoice && (
                                <strong className="ml-1 text-[7.2pt] text-[#991B1B]">
                                  (Sua resposta)
                                </strong>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.comentario?.trim() && (
                    <div className="mt-2 bg-[#F8FBF9] border-l-[2.5px] border-[#168821] pl-2.5 pr-2 py-1.5">
                      <div className="text-[7pt] font-extrabold uppercase tracking-[0.07em] text-[#166534] mb-1">
                        Comentário e Fundamentação Legal
                      </div>
                      <StructuredLegalText
                        text={q.comentario}
                        variant="print"
                        className="text-[8pt]"
                      />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <footer className="mt-5 pt-2.5 border-t-2 border-[#071D41] flex items-end justify-between gap-6 text-[7.5pt] text-[#3D4F6B] break-inside-avoid page-break-inside-avoid">
        <div>
          <div className="font-extrabold uppercase tracking-[0.06em] text-[#071D41]">
            Termo de Autenticação · Boletim Oficial de Simulado
          </div>
          <div className="mt-0.5">
            estuda.gov.br · Protocolo <strong className="font-mono text-[#071D41]">{protocolCode}</strong> · Emitido em {emissionStamp}
          </div>
        </div>
        <div className="text-center shrink-0 min-w-[180px]">
          <div className="border-b border-[#071D41] h-5" />
          <div className="mt-1 font-bold text-[7.2pt] text-[#071D41]">
            Visto do Candidato
          </div>
        </div>
      </footer>
    </section>
  );
};
