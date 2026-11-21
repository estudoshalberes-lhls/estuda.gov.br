import React, { useMemo } from 'react';
import { normalizeSearch, visibleName } from '../../lib/parsers';
import { ErrorNotebookEntry } from '../../types/study';

interface ErrorNotebookOfficialPrintSheetProps {
  entries: ErrorNotebookEntry[];
  selectedSubjectsLabel: string;
  statusFilter: 'pending' | 'corrected' | 'all';
  includeQuestion: boolean;
  pageBreakBySubject: boolean;
  holderName: string;
}

interface SubjectPrintGroup {
  key: string;
  label: string;
  items: ErrorNotebookEntry[];
  pendingCount: number;
  correctedCount: number;
}

export const ErrorNotebookOfficialPrintSheet: React.FC<ErrorNotebookOfficialPrintSheetProps> = ({
  entries,
  selectedSubjectsLabel,
  statusFilter,
  includeQuestion,
  pageBreakBySubject,
  holderName,
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

  const emissionStamp = new Date().toLocaleString('pt-BR');
  const protocolCode = `OUV-${String(entries.length).padStart(3, '0')}-${String(groups.length).padStart(2, '0')}`;

  let runningIndex = 0;

  return (
    <section
      className="gov-print-sheet hidden print:block bg-white text-[#071D41]"
      aria-label="Caderno Oficial de Erros para Impressão A4"
    >
      {/* Cabeçalho Institucional Gov.br */}
      <header className="border border-[#071D41] mb-3">
        <div className="bg-[#071D41] text-white px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[8.5pt] font-bold tracking-[0.14em] uppercase text-[#FFCD07]">
              PORTAL ÚNICO DO ESTUDANTE · ESTUDA.GOV.BR
            </div>
            <h1 className="m-0 mt-0.5 text-[13.5pt] font-extrabold tracking-[-0.01em] text-white">
              CADERNO OFICIAL DE ERROS E REVISÃO (OUVIDORIA)
            </h1>
            <div className="text-[8pt] text-[#DCE6F5] mt-0.5">
              Ouvidoria &amp; Corregedoria de Estudos · Revisão Direcionada por Disciplina
            </div>
          </div>

          <div className="text-right shrink-0 border-l border-white/25 pl-3">
            <div className="text-[7.5pt] uppercase tracking-[0.1em] text-[#FFCD07] font-bold">
              Protocolo
            </div>
            <div className="font-mono text-[10pt] font-bold text-white">{protocolCode}</div>
            <div className="text-[7.5pt] text-[#DCE6F5] mt-0.5">{emissionStamp}</div>
          </div>
        </div>

        <div className="gov-brasil-stripe" />

        {/* Grade de Metadados */}
        <div className="grid grid-cols-4 divide-x divide-[#B6C6DC] bg-[#F7F9FC] text-[8.5pt]">
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Escopo de Matérias
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">
              {selectedSubjectsLabel}
            </div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Status dos Registros
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">{statusLabel}</div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Estudante Responsável
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight truncate">
              {holderName}
            </div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Resumo do Caderno
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {entries.length} item(ns) · {groups.length} mat. ({totalPending} pend. / {totalCorrected} corr.)
            </div>
          </div>
        </div>
      </header>

      {/* Índice Sumário quando houver múltiplas matérias */}
      {groups.length > 1 && (
        <section className="mb-3 border border-[#9BB0CD] break-inside-avoid page-break-inside-avoid">
          <div className="bg-[#EDF2F8] border-b border-[#9BB0CD] px-3 py-1 text-[8pt] font-extrabold uppercase tracking-[0.05em] text-[#071D41]">
            Quadro-Resumo das Matérias Incluídas ({groups.length})
          </div>
          <table className="w-full border-collapse text-[8pt]">
            <thead>
              <tr className="bg-[#F7F9FC] border-b border-[#C5D2E4] text-[#3D4F6B]">
                <th className="text-left px-3 py-1 font-bold">Matéria</th>
                <th className="text-right px-3 py-1 font-bold w-24">Pendentes</th>
                <th className="text-right px-3 py-1 font-bold w-24">Corrigidos</th>
                <th className="text-right px-3 py-1 font-bold w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className="border-b border-[#E3EAF3] last:border-b-0">
                  <td className="px-3 py-1 font-bold text-[#071D41]">{g.label}</td>
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
        <div className="flex flex-col gap-3">
          {groups.map((group, groupIdx) => (
            <section
              key={group.key}
              className={
                groupIdx > 0 && pageBreakBySubject
                  ? 'break-before-page'
                  : undefined
              }
            >
              <div className="bg-[#EDF2F8] border border-[#071D41] px-3 py-1.5 mb-2 flex items-center justify-between gap-2 break-after-avoid">
                <strong className="text-[10pt] font-extrabold uppercase tracking-[0.03em] text-[#071D41]">
                  {group.label}
                </strong>
                <span className="font-mono text-[8pt] font-bold text-[#1351B4]">
                  {group.items.length} registro(s) · {group.pendingCount} pendente(s) ·{' '}
                  {group.correctedCount} corrigido(s)
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {group.items.map((entry) => {
                  runningIndex += 1;
                  const numLabel = `#${String(runningIndex).padStart(2, '0')}`;
                  const isCorrected = Boolean(entry.corrigido);

                  return (
                    <article
                      key={entry.id}
                      className="border border-[#9BB0CD] bg-white px-3 py-2 break-inside-avoid page-break-inside-avoid"
                    >
                      <div className="flex items-baseline justify-between gap-2 border-b border-[#DCE5F0] pb-1 mb-1.5 text-[8pt]">
                        <div className="min-w-0">
                          <span className="font-mono font-extrabold text-[#071D41] mr-1.5">
                            {numLabel}
                          </span>
                          <span
                            className={`font-bold ${
                              isCorrected ? 'text-[#166534]' : 'text-[#9A5B00]'
                            }`}
                          >
                            {isCorrected ? 'Corrigido' : 'Pendente de Correção'}
                          </span>
                          <span className="text-[#5C6E8A]"> · </span>
                          <span className="font-bold text-[#1351B4]">
                            {visibleName(entry.tipo)}
                          </span>
                          {entry.origem && (
                            <>
                              <span className="text-[#5C6E8A]"> · </span>
                              <span className="text-[#3D4F6B]">Origem: {entry.origem}</span>
                            </>
                          )}
                          {entry.correcao_prova && entry.arquivo_prova && (
                            <>
                              <span className="text-[#5C6E8A]"> · </span>
                              <span className="text-[#3D4F6B]">
                                Prova: {visibleName(entry.arquivo_prova)}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="font-mono text-[7.8pt] text-[#3D4F6B] shrink-0">
                          {entry.data}
                        </span>
                      </div>

                      <p className="m-0 text-[8.8pt] leading-[1.45] text-[#071D41] whitespace-pre-wrap">
                        {entry.texto}
                      </p>

                      {includeQuestion && entry.questao && (
                        <div className="mt-2 pt-1.5 border-t border-dashed border-[#B6C6DC] text-[8.2pt] text-[#1E2E47]">
                          <div className="text-[7.2pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B] mb-0.5">
                            Questão Vinculada
                          </div>
                          <p className="m-0 leading-[1.4] whitespace-pre-wrap">
                            {entry.questao.enunciado}
                          </p>
                          {entry.questao.alternativas?.length > 0 && (
                            <div className="mt-1 flex flex-col gap-0.5 text-[7.9pt] text-[#2C3E5A]">
                              {entry.questao.alternativas.map((alt) => (
                                <div key={alt.letra}>
                                  <strong className="text-[#071D41]">[{alt.letra}]</strong>{' '}
                                  {alt.texto}
                                </div>
                              ))}
                            </div>
                          )}
                          {(entry.questao.resposta || entry.questao.gabarito) && (
                            <div className="mt-1 font-mono text-[7.9pt] text-[#071D41]">
                              {entry.questao.resposta && (
                                <span className="mr-3">
                                  Marcada:{' '}
                                  <strong className="text-[#991B1B]">
                                    {entry.questao.resposta}
                                  </strong>
                                </span>
                              )}
                              {entry.questao.gabarito && (
                                <span>
                                  Gabarito Oficial:{' '}
                                  <strong className="text-[#166534]">
                                    {entry.questao.gabarito}
                                  </strong>
                                </span>
                              )}
                            </div>
                          )}
                          {entry.questao.comentario && (
                            <p className="m-0 mt-1 text-[7.9pt] text-[#3D4F6B] whitespace-pre-wrap">
                              <strong>Comentário:</strong> {entry.questao.comentario}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Caixas de revisão física em papel */}
                      <div className="mt-2 pt-1 border-t border-[#E6ECF4] flex items-center justify-between text-[7.4pt] text-[#4B5E7A]">
                        <span>Controle de revisão no papel:</span>
                        <div className="flex items-center gap-3 font-mono">
                          <span>[ ] Rev. 1</span>
                          <span>[ ] Rev. 2</span>
                          <span>[ ] Rev. 3</span>
                          <span>[ ] Dominado</span>
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

      {/* Rodapé Oficial A4 */}
      <footer className="mt-4 pt-2 border-t border-[#071D41] flex items-center justify-between text-[7.5pt] text-[#3D4F6B]">
        <div>
          estuda.gov.br · Caderno Oficial de Erros A4 · Documento gerado para estudo e revisão
        </div>
        <div className="font-mono">
          Visto do Estudante: ___________________________
        </div>
      </footer>
    </section>
  );
};
