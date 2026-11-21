import React from 'react';
import { formatTimerClock, getEssayScorePct, isEssayCorrected } from '../../lib/discursiveHelpers';
import { visibleName } from '../../lib/parsers';
import { EssayRecord } from '../../types/study';
import { StructuredLegalText } from '../ui/StructuredLegalText';
import { FederalCoatOfArmsPlaceholder } from './FederalCoatOfArmsPlaceholder';

interface DiscursiveOfficialPrintSheetProps {
  essays: EssayRecord[];
  filterLabel: string;
  holderName: string;
}

export const DiscursiveOfficialPrintSheet: React.FC<DiscursiveOfficialPrintSheetProps> = ({
  essays,
  filterLabel,
  holderName,
}) => {
  const emissionStamp = new Date().toLocaleString('pt-BR');
  const protocolCode = `DSC-${String(essays.length).padStart(3, '0')}-${new Date().getFullYear()}`;
  const isSingle = essays.length === 1;

  return (
    <section
      className="gov-print-sheet gov-official-doc-print hidden print:block bg-white text-[#071D41]"
      aria-label="Espelho Oficial de Redação Discursiva para Impressão A4"
    >
      <header className="border border-[#071D41] mb-3">
        <div className="bg-[#071D41] text-white px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white rounded-md p-1 shrink-0">
              <FederalCoatOfArmsPlaceholder size={44} />
            </div>
            <div className="min-w-0">
              <div className="text-[8pt] font-bold tracking-[0.14em] uppercase text-[#FFCD07]">
                PORTAL ÚNICO DO ESTUDANTE · ESTUDA.GOV.BR
              </div>
              <h1 className="m-0 mt-0.5 text-[13pt] font-extrabold tracking-[-0.01em] text-white">
                {isSingle
                  ? 'FOLHA OFICIAL DE REDAÇÃO E ESPELHO DE CORREÇÃO'
                  : 'DOSSIÊ OFICIAL DE REDAÇÕES DISCURSIVAS E PARECERES'}
              </h1>
              <div className="text-[7.8pt] text-[#DCE6F5] mt-0.5">
                Protocolo de redações, pontuação por banca, diagnóstico de falhas e histórico de reescritas
              </div>
            </div>
          </div>

          <div className="text-right shrink-0 border-l border-white/25 pl-3">
            <div className="text-[7.2pt] uppercase tracking-[0.1em] text-[#FFCD07] font-bold">
              Protocolo
            </div>
            <div className="font-mono text-[9.5pt] font-bold text-white">{protocolCode}</div>
            <div className="text-[7.2pt] text-[#DCE6F5] mt-0.5">{emissionStamp}</div>
          </div>
        </div>

        <div className="gov-brasil-stripe" />

        <div className="grid grid-cols-3 divide-x divide-[#B6C6DC] bg-[#F7F9FC] text-[8.2pt]">
          <div className="px-3 py-1.5">
            <div className="text-[6.8pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Estudante Responsável
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 truncate">{holderName}</div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[6.8pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Escopo do Documento
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 truncate">{filterLabel}</div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[6.8pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Total Consolidado
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 font-mono">
              {essays.length} redação(ões)
            </div>
          </div>
        </div>
      </header>

      {essays.length === 0 ? (
        <div className="border border-[#B6C6DC] p-4 text-[9pt] text-[#3D4F6B] italic">
          Nenhuma redação selecionada para impressão.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {essays.map((essay, idx) => {
            const pct = getEssayScorePct(essay);
            const corrected = isEssayCorrected(essay);

            return (
              <article
                key={essay.id}
                className={`border border-[#071D41] bg-white ${
                  idx > 0 ? 'break-before-page' : ''
                }`}
              >
                {/* Essay Header */}
                <div className="bg-[#EDF2F8] border-b border-[#071D41] px-3 py-2 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono text-[8.5pt] font-extrabold text-[#1351B4] mr-2">
                      #{String(idx + 1).padStart(2, '0')}
                    </span>
                    <strong className="text-[10.5pt] font-extrabold text-[#071D41]">
                      {visibleName(essay.titulo)}
                    </strong>
                  </div>
                  <span className="font-mono text-[8pt] font-bold uppercase text-[#071D41] shrink-0">
                    {corrected ? 'Corrigida' : 'Protocolada'} · {essay.data}
                  </span>
                </div>

                {/* Metadata Strip */}
                <div className="grid grid-cols-4 divide-x divide-[#CBD6E6] border-b border-[#CBD6E6] bg-[#FAFBFD] text-[7.8pt]">
                  <div className="px-2.5 py-1.5">
                    <span className="block text-[6.6pt] uppercase font-bold text-[#4A5E7A]">Banca / Tipo</span>
                    <strong className="text-[#071D41]">
                      {essay.banca || 'Geral'} · {essay.tipo || 'Dissertação'}
                    </strong>
                  </div>
                  <div className="px-2.5 py-1.5">
                    <span className="block text-[6.6pt] uppercase font-bold text-[#4A5E7A]">Disciplina</span>
                    <strong className="text-[#071D41]">
                      {essay.disciplina ? visibleName(essay.disciplina) : 'Discursiva'}
                    </strong>
                  </div>
                  <div className="px-2.5 py-1.5">
                    <span className="block text-[6.6pt] uppercase font-bold text-[#4A5E7A]">Extensão & Tempo</span>
                    <strong className="font-mono text-[#071D41]">
                      {essay.linhas_escritas ? `${essay.linhas_escritas}L` : '—'}
                      {essay.limite_linhas ? ` / ${essay.limite_linhas}L` : ''}
                      {essay.tempo_segundos ? ` · ${formatTimerClock(essay.tempo_segundos)}` : ''}
                    </strong>
                  </div>
                  <div className="px-2.5 py-1.5">
                    <span className="block text-[6.6pt] uppercase font-bold text-[#4A5E7A]">Nota Final (V1)</span>
                    <strong className="font-mono text-[#1351B4]">
                      {essay.rubrica
                        ? `${essay.rubrica.notaFinal.toFixed(2)} / ${essay.rubrica.notaMaxima} (${pct ?? 0}%)`
                        : 'Sem nota'}
                    </strong>
                  </div>
                </div>

                <div className="p-3 flex flex-col gap-3">
                  {/* Proposta */}
                  {essay.proposta && (
                    <div className="border border-[#CBD6E6] bg-[#F7F9FC] p-2.5">
                      <div className="text-[7.5pt] font-extrabold uppercase tracking-[0.06em] text-[#1351B4] mb-1">
                        Enunciado / Proposta da Banca
                      </div>
                      <StructuredLegalText
                        text={essay.proposta}
                        variant="print"
                        className="text-[8.5pt]"
                      />
                    </div>
                  )}

                  {/* Original Essay Text */}
                  {essay.texto_original && (
                    <div className="border border-[#9BB0CD] p-2.5">
                      <div className="text-[7.5pt] font-extrabold uppercase tracking-[0.06em] text-[#071D41] mb-1.5 border-b border-[#DCE5F0] pb-1">
                        Texto Protocolado (Versão 1)
                      </div>
                      <div className="whitespace-pre-wrap text-[8.8pt] leading-[1.6] text-[#071D41] text-justify">
                        {essay.texto_original}
                      </div>
                    </div>
                  )}

                  {/* Rubric Table */}
                  {essay.rubrica && (
                    <div className="border border-[#071D41] break-inside-avoid">
                      <div className="bg-[#EDF2F8] px-2.5 py-1 text-[7.5pt] font-extrabold uppercase tracking-[0.06em] text-[#071D41] border-b border-[#071D41]">
                        Espelho de Pontuação (
                        {essay.rubrica.mode === 'cebraspe'
                          ? 'Fórmula Cebraspe: NC − 2×NE/TL'
                          : essay.rubrica.mode === 'criteria'
                            ? 'Avaliação por Critérios'
                            : 'Nota Direta'}
                        )
                      </div>
                      <table className="w-full border-collapse text-[8.2pt]">
                        <tbody>
                          {essay.rubrica.mode === 'cebraspe' && (
                            <>
                              <tr className="border-b border-[#CBD6E6]">
                                <td className="px-2.5 py-1 font-semibold">Nota de Conteúdo (NC)</td>
                                <td className="px-2.5 py-1 text-right font-mono font-bold">
                                  {(essay.rubrica.notaConteudo ?? 0).toFixed(2)} pts
                                </td>
                              </tr>
                              <tr className="border-b border-[#CBD6E6]">
                                <td className="px-2.5 py-1 font-semibold">
                                  Erros Gramaticais (NE) / Total de Linhas (TL)
                                </td>
                                <td className="px-2.5 py-1 text-right font-mono font-bold">
                                  {essay.rubrica.numErrosGramaticais ?? 0} erros /{' '}
                                  {essay.rubrica.totalLinhas ?? 30} linhas
                                </td>
                              </tr>
                            </>
                          )}
                          {essay.rubrica.mode === 'criteria' && (
                            <>
                              <tr className="border-b border-[#CBD6E6]">
                                <td className="px-2.5 py-1 font-semibold">Conteúdo / Domínio Técnico</td>
                                <td className="px-2.5 py-1 text-right font-mono font-bold">
                                  {(essay.rubrica.notaConteudo ?? 0).toFixed(2)} pts
                                </td>
                              </tr>
                              <tr className="border-b border-[#CBD6E6]">
                                <td className="px-2.5 py-1 font-semibold">Estrutura / Coesão Textual</td>
                                <td className="px-2.5 py-1 text-right font-mono font-bold">
                                  {(essay.rubrica.notaEstrutura ?? 0).toFixed(2)} pts
                                </td>
                              </tr>
                              <tr className="border-b border-[#CBD6E6]">
                                <td className="px-2.5 py-1 font-semibold">Gramática / Norma Culta</td>
                                <td className="px-2.5 py-1 text-right font-mono font-bold">
                                  {(essay.rubrica.notaGramatica ?? 0).toFixed(2)} pts
                                </td>
                              </tr>
                            </>
                          )}
                          <tr className="bg-[#F7F9FC]">
                            <td className="px-2.5 py-1.5 font-extrabold uppercase text-[#071D41]">
                              Nota Final Consolidada
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-mono font-extrabold text-[#1351B4]">
                              {essay.rubrica.notaFinal.toFixed(2)} / {essay.rubrica.notaMaxima} (
                              {pct ?? 0}%)
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Error Tags */}
                  {essay.erros_tags && essay.erros_tags.length > 0 && (
                    <div className="text-[8.2pt]">
                      <strong className="uppercase text-[7.4pt] tracking-[0.05em] text-[#4A5E7A] mr-1.5">
                        Falhas mapeadas:
                      </strong>
                      <span className="font-semibold text-[#071D41]">
                        {essay.erros_tags.join(' · ')}
                      </span>
                    </div>
                  )}

                  {/* Feedback */}
                  {essay.feedback.trim() && (
                    <div className="border border-[#9BB0CD] p-2.5 break-inside-avoid">
                      <div className="text-[7.5pt] font-extrabold uppercase tracking-[0.06em] text-[#1351B4] mb-1">
                        Parecer da Correção
                      </div>
                      <StructuredLegalText
                        text={essay.feedback}
                        variant="print"
                        className="text-[8.6pt]"
                      />
                    </div>
                  )}

                  {/* Rewrite V2 */}
                  {essay.reescrita && (essay.reescrita.texto || essay.reescrita.notaFinal !== undefined || essay.reescrita.observacoes) && (
                    <div className="border border-[#168821] bg-[#F6FBF7] p-2.5 break-inside-avoid">
                      <div className="flex items-baseline justify-between gap-2 border-b border-[#B7DEC0] pb-1 mb-1.5">
                        <strong className="text-[7.8pt] font-extrabold uppercase tracking-[0.06em] text-[#168821]">
                          Reescrita Aprimorada (Versão 2)
                        </strong>
                        {typeof essay.reescrita.notaFinal === 'number' && (
                          <span className="font-mono text-[8.2pt] font-extrabold text-[#168821]">
                            Nova nota V2: {essay.reescrita.notaFinal.toFixed(2)}
                            {essay.rubrica ? ` / ${essay.rubrica.notaMaxima}` : ''}
                          </span>
                        )}
                      </div>
                      {essay.reescrita.observacoes && (
                        <div className="text-[8.2pt] font-semibold text-[#071D41] mb-1.5">
                          Ajustes realizados: {essay.reescrita.observacoes}
                        </div>
                      )}
                      {essay.reescrita.texto && (
                        <div className="whitespace-pre-wrap text-[8.6pt] leading-[1.58] text-[#071D41] text-justify">
                          {essay.reescrita.texto}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer className="mt-4 pt-2 border-t border-[#071D41] flex items-center justify-between text-[7.5pt] text-[#3D4F6B]">
        <div>estuda.gov.br · Folha Oficial A4 · Protocolo de Redação Discursiva</div>
        <div className="font-mono">Visto do Estudante: ___________________________</div>
      </footer>
    </section>
  );
};
