import React, { useMemo } from 'react';
import { formatIsoDateBr, normalizeSearch, visibleName } from '../../lib/parsers';
import { ErrorNotebookEntry } from '../../types/study';
import { FederalCoatOfArmsPlaceholder } from '../print/FederalCoatOfArmsPlaceholder';
import { StructuredLegalText } from '../ui/StructuredLegalText';

interface ErrorNotebookOfficialPrintSheetProps {
  entries: ErrorNotebookEntry[];
  selectedSubjectsLabel: string;
  statusFilter: 'pending' | 'corrected' | 'all';
  includeQuestion: boolean;
  pageBreakBySubject: boolean;
  holderName: string;
  /** When true, displays visibly on screen inside the A4 preview modal */
  previewMode?: boolean;
}

interface SubjectPrintGroup {
  key: string;
  label: string;
  items: ErrorNotebookEntry[];
  pendingCount: number;
  correctedCount: number;
}

const StructuredLegalPrintText: React.FC<{
  text: string;
  sizeClass?: string;
}> = ({ text, sizeClass = 'text-[8.8pt]' }) => (
  <StructuredLegalText text={text} variant="print" className={sizeClass} />
);

export const ErrorNotebookOfficialPrintSheet: React.FC<ErrorNotebookOfficialPrintSheetProps> = ({
  entries,
  selectedSubjectsLabel,
  statusFilter,
  includeQuestion,
  pageBreakBySubject,
  holderName,
  previewMode = false,
}) => {
  const groups = useMemo<SubjectPrintGroup[]>(() => {
    const map = new Map<string, SubjectPrintGroup>();
    entries.forEach((entry) => {
      const label = visibleName(entry.materia || 'Geral') || 'Geral';
      const key = normalizeSearch(label) || 'geral';
      const existing = map.get(key);
      if (existing) {
        existing.items.push(entry);
        if (entry.corrigido) existing.correctedCount += 1;
        else existing.pendingCount += 1;
      } else {
        map.set(key, {
          key,
          label,
          items: [entry],
          pendingCount: entry.corrigido ? 0 : 1,
          correctedCount: entry.corrigido ? 1 : 0,
        });
      }
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [entries]);

  const totalPending = useMemo(
    () => entries.filter((e) => !e.corrigido).length,
    [entries],
  );
  const totalCorrected = entries.length - totalPending;

  const statusLabel =
    statusFilter === 'pending'
      ? 'Pendentes de Correção'
      : statusFilter === 'corrected'
        ? 'Já Corrigidos'
        : 'Todos os Registros';

  const emissionStamp = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const emissionDateOnly = new Date().toLocaleDateString('pt-BR');
  const protocolCode = `OUV-${new Date().getFullYear()}.${String(entries.length).padStart(4, '0')}-${String(groups.length).padStart(2, '0')}`;
  const estimatedPages = Math.max(1, Math.ceil(entries.length / 3));

  let runningIndex = 0;

  return (
    <section
      className={
        previewMode
          ? 'gov-error-notebook-print block bg-white text-[#071D41]'
          : 'gov-print-sheet gov-error-notebook-print hidden print:block bg-white text-[#071D41]'
      }
      aria-label="Caderno Oficial de Erros — Padrão Documento Governo Federal A4"
    >
      {/* ====================================================================
          CABEÇALHO OFICIAL DO GOVERNO FEDERAL (Padrão Manual de Redação PR)
          ==================================================================== */}
      <header className="border border-[#071D41] mb-3.5 bg-white">
        {/* Timbre Centralizado com Brasão (Placeholder) */}
        <div className="px-4 pt-3 pb-2.5 flex flex-col items-center text-center bg-white">
          <FederalCoatOfArmsPlaceholder />

          <div className="mt-1.5 text-[9.2pt] font-extrabold tracking-[0.16em] uppercase text-[#071D41]">
            REPÚBLICA FEDERATIVA DO BRASIL
          </div>
          <div className="text-[7.8pt] font-bold tracking-[0.1em] uppercase text-[#1351B4] mt-0.5">
            PORTAL ÚNICO DO ESTUDANTE · ESTUDA.GOV.BR
          </div>
          <div className="text-[7.5pt] font-semibold tracking-[0.06em] uppercase text-[#3D4F6B] mt-0.5">
            OUVIDORIA &amp; CORREGEDORIA DE ESTUDOS · REVISÃO DIRECIONADA
          </div>
        </div>

        {/* Faixa Oficial Tricolor Brasil */}
        <div className="gov-brasil-stripe" />

        {/* Barra Institucional de Título do Documento e Protocolo */}
        <div className="bg-[#071D41] text-white px-4 py-2 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[7pt] font-bold tracking-[0.12em] uppercase text-[#FFCD07]">
              DOCUMENTO OFICIAL DE CONTROLE E REVISÃO DE ERROS
            </div>
            <h1 className="m-0 mt-0.5 text-[12pt] font-extrabold tracking-[0.01em] uppercase text-white leading-tight">
              CADERNO OFICIAL DE ERROS E FUNDAMENTAÇÃO
            </h1>
          </div>

          <div className="text-right shrink-0 border-l border-white/25 pl-3">
            <div className="text-[6.8pt] uppercase tracking-[0.1em] text-[#FFCD07] font-bold">
              Protocolo SEI / OUV
            </div>
            <div className="font-mono text-[9.2pt] font-bold text-white leading-tight">
              {protocolCode}
            </div>
            <div className="text-[7pt] text-[#DCE6F5] mt-0.5">Emitido em {emissionStamp}</div>
          </div>
        </div>

        {/* Grade Formal de Identificação e Metadados */}
        <div className="grid grid-cols-4 divide-x divide-[#B6C6DC] bg-[#F7F9FC] text-[8pt] border-t border-[#071D41]">
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Interessado / Titular
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight truncate">
              {holderName}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Escopo de Matérias
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">
              {selectedSubjectsLabel}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Situação dos Registros
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">{statusLabel}</div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Consolidação
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {entries.length} reg. · {groups.length} mat. ({totalPending} p. / {totalCorrected} c.)
            </div>
          </div>
        </div>
      </header>

      {/* Índice / Quadro-Resumo por Matéria quando houver múltiplas disciplinas */}
      {groups.length > 1 && (
        <section className="mb-3.5 border border-[#9BB0CD] break-inside-avoid page-break-inside-avoid">
          <div className="bg-[#EDF2F8] border-b border-[#9BB0CD] px-3 py-1.5 flex items-center justify-between text-[7.8pt] font-extrabold uppercase tracking-[0.05em] text-[#071D41]">
            <span>Sumário Consolidado por Disciplina</span>
            <span className="font-mono text-[#1351B4]">{groups.length} matéria(s)</span>
          </div>
          <table className="w-full border-collapse text-[7.9pt]">
            <thead>
              <tr className="bg-[#F7F9FC] border-b border-[#C5D2E4] text-[#3D4F6B]">
                <th className="text-left px-3 py-1 font-bold w-10">Nº</th>
                <th className="text-left px-2 py-1 font-bold">Disciplina / Matéria</th>
                <th className="text-right px-3 py-1 font-bold w-24">Pendentes</th>
                <th className="text-right px-3 py-1 font-bold w-24">Corrigidos</th>
                <th className="text-right px-3 py-1 font-bold w-20">Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, idx) => (
                <tr key={g.key} className="border-b border-[#E3EAF3] last:border-b-0">
                  <td className="px-3 py-1 font-mono font-bold text-[#4B5E7A]">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="px-2 py-1 font-bold text-[#071D41]">{g.label}</td>
                  <td className="px-3 py-1 text-right font-mono text-[#9A5B00]">
                    {g.pendingCount}
                  </td>
                  <td className="px-3 py-1 text-right font-mono text-[#166534]">
                    {g.correctedCount}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-bold text-[#071D41]">
                    {g.items.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Registros Agrupados por Matéria */}
      {groups.length === 0 ? (
        <div className="border border-[#B6C6DC] p-4 text-[9pt] text-[#3D4F6B] italic">
          Nenhum registro encontrado para os filtros selecionados de impressão.
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {groups.map((group, groupIdx) => (
            <section
              key={group.key}
              className={
                groupIdx > 0 && pageBreakBySubject
                  ? 'break-before-page'
                  : undefined
              }
            >
              {/* Cabeçalho Oficial da Disciplina */}
              <div className="gov-en-subject-header bg-[#EDF2F8] border border-[#071D41] border-l-[4px] border-l-[#071D41] px-3 py-1.5 mb-2.5 flex items-center justify-between gap-2">
                <strong className="text-[9.8pt] font-extrabold uppercase tracking-[0.04em] text-[#071D41]">
                  {groupIdx + 1}. {group.label}
                </strong>
                <span className="font-mono text-[7.8pt] font-bold text-[#1351B4] shrink-0">
                  {group.items.length} registro(s) · {group.pendingCount} pendente(s) ·{' '}
                  {group.correctedCount} corrigido(s)
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {group.items.map((entry) => {
                  runningIndex += 1;
                  const numLabel = `#${String(runningIndex).padStart(2, '0')}`;
                  const isCorrected = Boolean(entry.corrigido);
                  const totalChars =
                    (entry.texto?.length || 0) +
                    (includeQuestion && entry.questao
                      ? (entry.questao.enunciado?.length || 0) +
                        (entry.questao.comentario?.length || 0) +
                        (entry.questao.alternativas?.reduce((acc, a) => acc + a.texto.length, 0) || 0)
                      : 0);
                  const isLongEntry = totalChars > 1300;
                  const normGabarito = (entry.questao?.gabarito || '').trim().toUpperCase();
                  const normResposta = (entry.questao?.resposta || '').trim().toUpperCase();

                  return (
                    <article
                      key={entry.id}
                      className={`gov-en-entry-card ${
                        isLongEntry ? 'gov-en-entry-card--long' : ''
                      } border border-[#9BB0CD] bg-white`}
                    >
                      {/* Cabeçalho do Registro */}
                      <div className="gov-en-entry-header bg-[#F5F8FC] border-b border-[#C5D2E4] px-3 py-1.5 flex items-center justify-between gap-2 text-[7.9pt]">
                        <div className="min-w-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="font-mono font-extrabold text-[#1351B4]">
                            {numLabel}
                          </span>
                          <span className="font-bold text-[#071D41]">
                            {visibleName(entry.tipo || 'Anotação')}
                          </span>
                          {entry.origem && (
                            <>
                              <span className="text-[#7A8DA8]">·</span>
                              <span className="text-[#3D4F6B]">{visibleName(entry.origem)}</span>
                            </>
                          )}
                          {entry.banca && (
                            <>
                              <span className="text-[#7A8DA8]">·</span>
                              <span className="text-[#3D4F6B]">Banca: {visibleName(entry.banca)}</span>
                            </>
                          )}
                          {entry.correcao_prova && entry.arquivo_prova && (
                            <>
                              <span className="text-[#7A8DA8]">·</span>
                              <span className="text-[#3D4F6B]">
                                Prova: {visibleName(entry.arquivo_prova)}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[7.4pt] text-[#4B5E7A]">
                            {entry.data}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[6.8pt] font-extrabold uppercase tracking-[0.04em] border ${
                              isCorrected
                                ? 'bg-[#E8F6EC] border-[#8ECF9E] text-[#166534]'
                                : 'bg-[#FEF3E0] border-[#E5B869] text-[#9A4A06]'
                            }`}
                          >
                            {isCorrected ? 'Corrigido' : 'Pendente'}
                          </span>
                        </div>
                      </div>

                      <div className="px-3 py-2">
                        {/* Metadados secundários de revisão quando existentes */}
                        {((entry.nivel_revisao && entry.nivel_revisao > 0) ||
                          (entry.proxima_revisao && !isCorrected) ||
                          (entry.corrigido_em && isCorrected)) && (
                          <div className="text-[7.2pt] italic text-[#4B5E7A] mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            {entry.nivel_revisao && entry.nivel_revisao > 0 && (
                              <span>Revisões concluídas: {entry.nivel_revisao}</span>
                            )}
                            {entry.proxima_revisao && !isCorrected && (
                              <span>Próxima revisão: {formatIsoDateBr(entry.proxima_revisao)}</span>
                            )}
                            {entry.corrigido_em && isCorrected && (
                              <span>Corrigido em: {entry.corrigido_em}</span>
                            )}
                          </div>
                        )}

                        {/* Seção A: Ponto para Revisar / Correção */}
                        {entry.texto?.trim() && (
                          <div className="border-l-[2.5px] border-[#1351B4] pl-2.5 py-0.5">
                            <div className="text-[7pt] font-extrabold uppercase tracking-[0.07em] text-[#1351B4] mb-1">
                              Ponto para Revisar / Fundamentação
                            </div>
                            <StructuredLegalPrintText text={entry.texto} sizeClass="text-[8.7pt]" />
                          </div>
                        )}

                        {/* Seção B: Questão Vinculada */}
                        {includeQuestion && entry.questao && (
                          <div className="mt-2.5 pt-2 border-t border-dashed border-[#B6C6DC]">
                            <div className="text-[7pt] font-extrabold uppercase tracking-[0.07em] text-[#071D41] mb-1">
                              Questão Vinculada
                            </div>

                            {entry.questao.enunciado && (
                              <StructuredLegalPrintText
                                text={entry.questao.enunciado}
                                sizeClass="text-[8.3pt]"
                              />
                            )}

                            {entry.questao.alternativas?.length > 0 && (
                              <div className="mt-1.5 flex flex-col gap-1 text-[8pt]">
                                {entry.questao.alternativas.map((alt) => {
                                  const letraNorm = (alt.letra || '').trim().toUpperCase();
                                  const isRight = Boolean(normGabarito && letraNorm === normGabarito);
                                  const isWrongChoice = Boolean(
                                    normResposta && letraNorm === normResposta && letraNorm !== normGabarito,
                                  );
                                  return (
                                    <div
                                      key={alt.letra}
                                      className={`px-2 py-0.5 rounded-sm text-justify leading-[1.4] ${
                                        isRight
                                          ? 'bg-[#ECF8EF] text-[#104A1C] border-l-2 border-[#168821]'
                                          : isWrongChoice
                                            ? 'bg-[#FDEEEE] text-[#7F1D1D] border-l-2 border-[#C92A2A]'
                                            : 'text-[#1E2E47]'
                                      }`}
                                    >
                                      <strong className="font-extrabold mr-1">
                                        {letraNorm})
                                      </strong>
                                      {alt.texto}
                                      {isRight && (
                                        <strong className="ml-1 text-[7.3pt] text-[#166534]">
                                          (Gabarito)
                                        </strong>
                                      )}
                                      {isWrongChoice && (
                                        <strong className="ml-1 text-[7.3pt] text-[#991B1B]">
                                          (Sua resposta)
                                        </strong>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {(entry.questao.resposta || entry.questao.gabarito) && (
                              <div className="mt-1.5 px-2.5 py-1 bg-[#F4F7FC] border border-[#C6D3E4] font-mono text-[7.8pt] text-[#071D41] flex flex-wrap gap-x-5 gap-y-0.5">
                                {entry.questao.resposta && (
                                  <span>
                                    Sua resposta:{' '}
                                    <strong className="text-[#991B1B]">
                                      {entry.questao.resposta}
                                    </strong>
                                  </span>
                                )}
                                {entry.questao.gabarito && (
                                  <span>
                                    Gabarito oficial:{' '}
                                    <strong className="text-[#166534]">
                                      {entry.questao.gabarito}
                                    </strong>
                                  </span>
                                )}
                              </div>
                            )}

                            {entry.questao.comentario?.trim() && (
                              <div className="mt-2 bg-[#F8FBF9] border-l-[2.5px] border-[#168821] pl-2.5 pr-2 py-1.5">
                                <div className="text-[7pt] font-extrabold uppercase tracking-[0.07em] text-[#166534] mb-1">
                                  Comentário e Fundamentação Legal
                                </div>
                                <StructuredLegalPrintText
                                  text={entry.questao.comentario}
                                  sizeClass="text-[8.2pt]"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Caixas de Controle de Revisão Física no Papel */}
                        <div className="mt-2 pt-1.5 border-t border-[#E6ECF4] flex items-center justify-between text-[7.2pt] text-[#4B5E7A]">
                          <span className="font-semibold uppercase tracking-[0.04em]">
                            Controle de revisão no papel:
                          </span>
                          <div className="flex items-center gap-3 font-mono">
                            <span>[ ] Rev. 1</span>
                            <span>[ ] Rev. 2</span>
                            <span>[ ] Rev. 3</span>
                            <span>[ ] Dominado</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Termo Oficial de Encerramento e Autenticação */}
      <footer className="mt-5 pt-2.5 border-t-2 border-[#071D41] break-inside-avoid page-break-inside-avoid">
        <div className="flex items-end justify-between gap-6 text-[7.5pt] text-[#3D4F6B]">
          <div className="max-w-[62%]">
            <div className="font-extrabold uppercase tracking-[0.06em] text-[#071D41]">
              Termo de Encerramento · Caderno Oficial de Erros
            </div>
            <p className="m-0 mt-0.5 leading-snug">
              Documento emitido eletronicamente pelo Portal Único do Estudante (estuda.gov.br) sob
              o protocolo <strong className="font-mono text-[#071D41]">{protocolCode}</strong> em{' '}
              {emissionDateOnly}, contendo <strong className="text-[#071D41]">{entries.length}</strong>{' '}
              registro(s) em <strong className="text-[#071D41]">{groups.length}</strong> disciplina(s).
            </p>
          </div>

          <div className="text-center shrink-0 min-w-[180px]">
            <div className="border-b border-[#071D41] h-6" />
            <div className="mt-1 font-bold text-[7.3pt] text-[#071D41] truncate max-w-[200px]">
              {holderName}
            </div>
            <div className="text-[6.8pt] uppercase tracking-[0.06em] text-[#4B5E7A]">
              Assinatura / Visto do Estudante
            </div>
          </div>
        </div>

        {/* Rodapé Numerado Simulado na Pré-visualização em Tela (na impressão real usa @page counter(page)) */}
        {previewMode && (
          <div className="gov-en-preview-only-footer mt-4 pt-2 border-t border-[#071D41] flex items-center justify-between text-[7.2pt] text-[#4B5E7A]">
            <span className="font-semibold uppercase tracking-[0.04em]">
              PORTAL ÚNICO DO ESTUDANTE · DOCUMENTO OFICIAL DE REVISÃO (A4)
            </span>
            <span className="font-mono font-bold text-[#071D41]">
              Página 1 de {estimatedPages} (numeração automática em todas as páginas ao imprimir)
            </span>
          </div>
        )}
      </footer>
    </section>
  );
};
