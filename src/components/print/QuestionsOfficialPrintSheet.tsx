import React, { useMemo } from 'react';
import { Question } from '../../types/study';
import {
  extractOptions,
  isTrueFalseQuestion,
  normalizeSearch,
  questionStatement,
  visibleName,
} from '../../lib/parsers';
import { FederalCoatOfArmsPlaceholder } from './FederalCoatOfArmsPlaceholder';
import { StructuredLegalText } from '../ui/StructuredLegalText';

interface QuestionsOfficialPrintSheetProps {
  questions: Question[];
  scopeLabel: string;
  formatLabel: string;
  holderName: string;
  includeAnswersAndComments: boolean;
  previewMode?: boolean;
}

interface SubjectQuestionGroup {
  key: string;
  label: string;
  count: number;
}

export const QuestionsOfficialPrintSheet: React.FC<QuestionsOfficialPrintSheetProps> = ({
  questions,
  scopeLabel,
  formatLabel,
  holderName,
  includeAnswersAndComments,
  previewMode = false,
}) => {
  const subjectSummary = useMemo<SubjectQuestionGroup[]>(() => {
    const map = new Map<string, SubjectQuestionGroup>();
    questions.forEach((q) => {
      const label = visibleName(q.materia || 'Geral') || 'Geral';
      const key = normalizeSearch(label) || 'geral';
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { key, label, count: 1 });
      }
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [questions]);

  const emissionStamp = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const emissionDateOnly = new Date().toLocaleDateString('pt-BR');
  const protocolCode = `QST-${new Date().getFullYear()}.${String(questions.length).padStart(4, '0')}-${String(subjectSummary.length).padStart(2, '0')}`;
  const estimatedPages = Math.max(1, Math.ceil(questions.length / 4));

  return (
    <section
      className={
        previewMode
          ? 'gov-official-doc-print gov-questions-print block bg-white text-[#071D41]'
          : 'gov-print-sheet gov-official-doc-print gov-questions-print hidden print:block bg-white text-[#071D41]'
      }
      aria-label="Caderno Oficial de Questões — Padrão Documento Governo Federal A4"
    >
      {/* Cabeçalho Oficial do Governo Federal */}
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
            BANCO OFICIAL DE QUESTÕES · CADERNO DE PROVA E TREINAMENTO
          </div>
        </div>

        <div className="gov-brasil-stripe" />

        <div className="bg-[#071D41] text-white px-4 py-2 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[7pt] font-bold tracking-[0.12em] uppercase text-[#FFCD07]">
              {includeAnswersAndComments
                ? 'CADERNO OFICIAL DE QUESTÕES COM GABARITO COMENTADO'
                : 'CADERNO OFICIAL DE QUESTÕES PARA RESOLUÇÃO (PROVA)'}
            </div>
            <h1 className="m-0 mt-0.5 text-[12pt] font-extrabold tracking-[0.01em] uppercase text-white leading-tight">
              CADERNO DE QUESTÕES DE CONCURSO
            </h1>
          </div>

          <div className="text-right shrink-0 border-l border-white/25 pl-3">
            <div className="text-[6.8pt] uppercase tracking-[0.1em] text-[#FFCD07] font-bold">
              Protocolo SEI / QST
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
              Candidato / Titular
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight truncate">
              {holderName}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Disciplina / Escopo
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">
              {scopeLabel}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Formato
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">
              {formatLabel}
            </div>
          </div>
          <div className="px-2.5 py-1.5">
            <div className="text-[6.6pt] font-bold uppercase tracking-[0.06em] text-[#4B5E7A]">
              Quantitativo
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {questions.length} questão(ões) · {subjectSummary.length} mat.
            </div>
          </div>
        </div>
      </header>

      {/* Quadro-Resumo por Matéria quando houver múltiplas disciplinas */}
      {subjectSummary.length > 1 && (
        <section className="mb-3.5 border border-[#9BB0CD] break-inside-avoid page-break-inside-avoid">
          <div className="bg-[#EDF2F8] border-b border-[#9BB0CD] px-3 py-1 flex items-center justify-between text-[7.8pt] font-extrabold uppercase tracking-[0.05em] text-[#071D41]">
            <span>Distribuição por Disciplina</span>
            <span className="font-mono text-[#1351B4]">{subjectSummary.length} matéria(s)</span>
          </div>
          <div className="px-3 py-1.5 grid grid-cols-2 gap-x-6 gap-y-1 text-[7.9pt]">
            {subjectSummary.map((s, idx) => (
              <div
                key={s.key}
                className="flex items-baseline justify-between gap-2 border-b border-[#E6ECF4] pb-0.5"
              >
                <span className="font-bold text-[#071D41] truncate">
                  {String(idx + 1).padStart(2, '0')}. {s.label}
                </span>
                <span className="font-mono text-[#3D4F6B] shrink-0">
                  {s.count} q.
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lista Estruturada de Questões */}
      {questions.length === 0 ? (
        <div className="border border-[#B6C6DC] p-4 text-[9pt] text-[#3D4F6B] italic">
          Nenhuma questão selecionada para impressão.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {questions.map((q, idx) => {
            const opts = extractOptions(q);
            const isCE = isTrueFalseQuestion(q, opts);
            const statement = questionStatement(q);
            const normGab = (q.gabarito || '').trim().toUpperCase();
            const totalChars =
              statement.length +
              (q.comentario?.length || 0) +
              opts.reduce((acc, o) => acc + o.text.length, 0);
            const isLong = totalChars > 1350;

            return (
              <article
                key={q.id || `q-${idx}`}
                className={`gov-en-entry-card ${
                  isLong ? 'gov-en-entry-card--long' : ''
                } border border-[#9BB0CD] bg-white`}
              >
                {/* Barra da Questão */}
                <div className="gov-en-entry-header bg-[#F5F8FC] border-b border-[#C5D2E4] px-3 py-1.5 flex items-center justify-between gap-2 text-[7.9pt]">
                  <div className="min-w-0 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-mono font-extrabold text-[#071D41]">
                      QUESTÃO {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[#7A8DA8]">·</span>
                    <span className="font-bold text-[#1351B4]">
                      {visibleName(q.materia || 'Geral')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-1.5 py-0.5 rounded bg-white border border-[#C5D2E4] text-[6.8pt] font-bold uppercase text-[#3D4F6B]">
                      {isCE ? 'Certo / Errado' : 'Múltipla Escolha'}
                    </span>
                    {includeAnswersAndComments && normGab && (
                      <span className="px-1.5 py-0.5 rounded bg-[#E8F6EC] border border-[#8ECF9E] text-[6.8pt] font-extrabold uppercase text-[#166534] font-mono">
                        Gab: {normGab}
                      </span>
                    )}
                  </div>
                </div>

                {/* Corpo da Questão */}
                <div className="px-3 py-2">
                  <StructuredLegalText
                    text={statement}
                    variant="print"
                    className="text-[8.6pt]"
                  />

                  {/* Opções */}
                  {isCE ? (
                    <div className="mt-2 pt-1.5 border-t border-[#E6ECF4] flex items-center gap-6 font-mono text-[8pt] text-[#071D41]">
                      <span
                        className={
                          includeAnswersAndComments && normGab === 'C'
                            ? 'font-extrabold text-[#166534] bg-[#ECF8EF] px-2 py-0.5 rounded-sm border border-[#8ECF9E]'
                            : ''
                        }
                      >
                        [ {includeAnswersAndComments && normGab === 'C' ? 'X' : ' '} ] CERTO
                      </span>
                      <span
                        className={
                          includeAnswersAndComments && normGab === 'E'
                            ? 'font-extrabold text-[#166534] bg-[#ECF8EF] px-2 py-0.5 rounded-sm border border-[#8ECF9E]'
                            : ''
                        }
                      >
                        [ {includeAnswersAndComments && normGab === 'E' ? 'X' : ' '} ] ERRADO
                      </span>
                    </div>
                  ) : opts.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1 text-[8.2pt]">
                      {opts.map((opt) => {
                        const keyNorm = (opt.key || '').trim().toUpperCase();
                        const isRight = Boolean(
                          includeAnswersAndComments && normGab && keyNorm === normGab,
                        );
                        return (
                          <div
                            key={opt.key}
                            className={`flex items-start gap-1.5 px-2 py-0.5 rounded-sm leading-[1.45] ${
                              isRight
                                ? 'bg-[#ECF8EF] text-[#104A1C] border-l-2 border-[#168821]'
                                : 'text-[#1E2E47]'
                            }`}
                          >
                            <strong className="font-mono font-extrabold text-[#071D41] shrink-0">
                              {keyNorm})
                            </strong>
                            <span className="flex-1 text-justify">
                              {opt.text}
                              {isRight && (
                                <strong className="ml-1 text-[7.3pt] text-[#166534]">
                                  (Gabarito)
                                </strong>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {/* Comentário / Fundamentação */}
                  {includeAnswersAndComments && q.comentario?.trim() && (
                    <div className="mt-2 bg-[#F8FBF9] border-l-[2.5px] border-[#168821] pl-2.5 pr-2 py-1.5">
                      <div className="text-[7pt] font-extrabold uppercase tracking-[0.07em] text-[#166534] mb-1">
                        Comentário e Fundamentação Legal
                      </div>
                      <StructuredLegalText
                        text={q.comentario}
                        variant="print"
                        className="text-[8.1pt]"
                      />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Folha de Gabarito Oficial destacada no final quando impresso sem gabarito inline */}
      {!includeAnswersAndComments && questions.some((q) => Boolean(q.gabarito)) && (
        <section className="mt-4 border border-[#071D41] break-inside-avoid page-break-inside-avoid">
          <div className="bg-[#071D41] text-white px-3 py-1.5 text-[8pt] font-extrabold uppercase tracking-[0.06em] flex items-center justify-between">
            <span>Gabarito Oficial de Conferência</span>
            <span className="font-mono text-[#FFCD07]">{protocolCode}</span>
          </div>
          <div className="p-2.5 grid grid-cols-5 gap-1.5 text-[7.8pt] font-mono">
            {questions.map((q, idx) => (
              <div
                key={`gab-${q.id || idx}`}
                className="border border-[#C5D2E4] bg-[#F7F9FC] px-2 py-1 flex items-center justify-between"
              >
                <span className="font-bold text-[#071D41]">
                  Q{String(idx + 1).padStart(2, '0')}
                </span>
                <strong className="text-[#166534]">{q.gabarito || '—'}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Termo de Encerramento */}
      <footer className="mt-5 pt-2.5 border-t-2 border-[#071D41] break-inside-avoid page-break-inside-avoid">
        <div className="flex items-end justify-between gap-6 text-[7.5pt] text-[#3D4F6B]">
          <div className="max-w-[62%]">
            <div className="font-extrabold uppercase tracking-[0.06em] text-[#071D41]">
              Termo de Encerramento · Caderno Oficial de Questões
            </div>
            <p className="m-0 mt-0.5 leading-snug">
              Caderno gerado eletronicamente pelo Portal Único do Estudante (estuda.gov.br) sob o
              protocolo <strong className="font-mono text-[#071D41]">{protocolCode}</strong> em{' '}
              {emissionDateOnly}, totalizando <strong className="text-[#071D41]">{questions.length}</strong>{' '}
              questão(ões).
            </p>
          </div>
          <div className="text-center shrink-0 min-w-[180px]">
            <div className="border-b border-[#071D41] h-6" />
            <div className="mt-1 font-bold text-[7.3pt] text-[#071D41] truncate max-w-[200px]">
              {holderName}
            </div>
            <div className="text-[6.8pt] uppercase tracking-[0.06em] text-[#4B5E7A]">
              Assinatura / Visto do Candidato
            </div>
          </div>
        </div>

        {previewMode && (
          <div className="gov-en-preview-only-footer mt-4 pt-2 border-t border-[#071D41] flex items-center justify-between text-[7.2pt] text-[#4B5E7A]">
            <span className="font-semibold uppercase tracking-[0.04em]">
              PORTAL ÚNICO DO ESTUDANTE · CADERNO OFICIAL DE QUESTÕES (A4)
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
