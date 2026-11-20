import React from 'react';
import {
  WEEKDAYS,
  formatScheduleDuration,
  inferFixedSubjectFromTopic,
  visibleName,
} from '../../lib/parsers';
import { ScheduleMap, WeekdayName } from '../../types/study';

interface ScheduleOfficialPrintSheetProps {
  weekLabel: string;
  weekFileName: string;
  defaultContest: string;
  schedule: ScheduleMap;
  dayDates: Partial<Record<WeekdayName, string>>;
  fixedSubjects: string[];
  holderName: string;
}

export const ScheduleOfficialPrintSheet: React.FC<ScheduleOfficialPrintSheetProps> = ({
  weekLabel,
  weekFileName,
  defaultContest,
  schedule,
  dayDates,
  fixedSubjects,
  holderName,
}) => {
  const totalTopics = WEEKDAYS.reduce((sum, day) => sum + (schedule[day]?.length || 0), 0);
  const totalStudiedSeconds = WEEKDAYS.reduce(
    (sum, day) =>
      sum + (schedule[day] || []).reduce((daySum, t) => daySum + (t.estudado_segundos || 0), 0),
    0,
  );

  const uniqueSubjects = Array.from(
    new Set(
      WEEKDAYS.flatMap((day) =>
        (schedule[day] || []).map((topic) =>
          visibleName(
            topic.disciplina_fixa || inferFixedSubjectFromTopic(topic, fixedSubjects) || 'Geral',
          ),
        ),
      ),
    ),
  );

  const emissionStamp = new Date().toLocaleString('pt-BR');
  const docCode = `EXP-${weekFileName.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase() || '2026'}`;

  return (
    <section
      className="gov-print-sheet hidden print:block bg-white text-[#071D41]"
      aria-label="Folha Oficial de Cronograma Semanal para Impressão A4"
    >
      {/* Cabeçalho Institucional Gov.br */}
      <header className="border border-[#071D41] mb-3">
        <div className="bg-[#071D41] text-white px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[8.5pt] font-bold tracking-[0.14em] uppercase text-[#FFCD07]">
              PORTAL ÚNICO DO ESTUDANTE · ESTUDA.GOV.BR
            </div>
            <h1 className="m-0 mt-0.5 text-[13.5pt] font-extrabold tracking-[-0.01em] text-white">
              FOLHA OFICIAL DE EXPEDIENTE SEMANAL (CRONOGRAMA)
            </h1>
            <div className="text-[8pt] text-[#DCE6F5] mt-0.5">
              Ministério da Aprovação, Café Forte e Madrugadas · Planejamento Semanal de Estudos
            </div>
          </div>

          <div className="text-right shrink-0 border-l border-white/25 pl-3">
            <div className="text-[7.5pt] uppercase tracking-[0.1em] text-[#FFCD07] font-bold">
              Protocolo
            </div>
            <div className="font-mono text-[10pt] font-bold text-white">{docCode}</div>
            <div className="text-[7.5pt] text-[#DCE6F5] mt-0.5">{emissionStamp}</div>
          </div>
        </div>

        <div className="gov-brasil-stripe" />

        {/* Grade de Metadados do Expediente */}
        <div className="grid grid-cols-4 divide-x divide-[#B6C6DC] bg-[#F7F9FC] text-[8.5pt]">
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Semana de Referência
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">{weekLabel}</div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Concurso / Edital Alvo
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">
              {defaultContest || 'A definir'}
            </div>
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
              Resumo da Grade
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {totalTopics} tópico(s) ·{' '}
              {totalStudiedSeconds > 0 ? formatScheduleDuration(totalStudiedSeconds) : '0m'}
            </div>
          </div>
        </div>
      </header>

      {/* Quadro de Disciplinas Envolvidas na Semana */}
      {uniqueSubjects.length > 0 && (
        <div className="mb-3 px-3 py-1.5 border border-[#B6C6DC] bg-white text-[8pt] flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="uppercase tracking-[0.05em] text-[#071D41] text-[7.5pt]">
            Matérias Programadas:
          </strong>
          <span className="text-[#3D4F6B]">{uniqueSubjects.join(' · ')}</span>
        </div>
      )}

      {/* Blocos Diários Otimizados para A4 */}
      <div className="flex flex-col gap-2.5">
        {WEEKDAYS.map((day) => {
          const topics = schedule[day] || [];
          const dayDate = dayDates[day] || '—';
          const dayStudied = topics.reduce((sum, t) => sum + (t.estudado_segundos || 0), 0);

          return (
            <section
              key={day}
              className="border border-[#9BB0CD] break-inside-avoid page-break-inside-avoid"
            >
              <div className="bg-[#EDF2F8] border-b border-[#9BB0CD] px-3 py-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <strong className="text-[9.5pt] font-extrabold text-[#071D41] uppercase tracking-[0.02em]">
                    {day}
                  </strong>
                  <span className="font-mono text-[8.5pt] font-bold text-[#1351B4]">
                    {dayDate}
                  </span>
                </div>
                <div className="text-[8pt] font-semibold text-[#3D4F6B] font-mono">
                  {topics.length} {topics.length === 1 ? 'meta' : 'metas'}
                  {dayStudied > 0 ? ` · Executado: ${formatScheduleDuration(dayStudied)}` : ''}
                </div>
              </div>

              {topics.length === 0 ? (
                <div className="px-3 py-1.5 text-[8pt] italic text-[#5C6E8A] bg-white">
                  Expediente sem tópicos programados para esta data.
                </div>
              ) : (
                <table className="w-full border-collapse text-[8.2pt]">
                  <thead>
                    <tr className="bg-[#F7F9FC] border-b border-[#D6E0EC] text-[#3D4F6B] text-[7pt] uppercase tracking-[0.04em]">
                      <th className="w-[26px] px-1.5 py-1 text-center font-bold border-r border-[#E2E8F0]">
                        OK
                      </th>
                      <th className="w-[125px] px-2 py-1 text-left font-bold border-r border-[#E2E8F0]">
                        Matéria Fixa
                      </th>
                      <th className="px-2 py-1 text-left font-bold border-r border-[#E2E8F0]">
                        Assunto / Tópico de Estudo
                      </th>
                      <th className="w-[95px] px-2 py-1 text-left font-bold border-r border-[#E2E8F0]">
                        Edital Alvo
                      </th>
                      <th className="w-[62px] px-1.5 py-1 text-center font-bold border-r border-[#E2E8F0]">
                        Previsto
                      </th>
                      <th className="w-[62px] px-1.5 py-1 text-center font-bold border-r border-[#E2E8F0]">
                        Realizado
                      </th>
                      <th className="w-[135px] px-2 py-1 text-left font-bold">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topics.map((topic, idx) => {
                      const fixedLabel = visibleName(
                        topic.disciplina_fixa ||
                          inferFixedSubjectFromTopic(topic, fixedSubjects) ||
                          'Geral',
                      );
                      const contestLabel = (topic.concurso_alvo || defaultContest || '—').trim();
                      const studiedSec = topic.estudado_segundos || 0;

                      return (
                        <tr
                          key={topic.id || `${day}-${idx}`}
                          className={`border-b border-[#E2E8F0] last:border-b-0 ${
                            idx % 2 === 1 ? 'bg-[#FAFBFD]' : 'bg-white'
                          }`}
                        >
                          <td className="px-1.5 py-1.5 text-center border-r border-[#E2E8F0] align-top">
                            <span
                              className="inline-block w-[11px] h-[11px] border border-[#071D41] rounded-[2px] mt-[1px]"
                              aria-hidden="true"
                            />
                          </td>
                          <td className="px-2 py-1.5 font-bold text-[#071D41] border-r border-[#E2E8F0] align-top leading-snug">
                            {fixedLabel}
                          </td>
                          <td className="px-2 py-1.5 text-[#071D41] border-r border-[#E2E8F0] align-top leading-snug">
                            {topic.materia?.trim() ? visibleName(topic.materia) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-[7.6pt] font-semibold text-[#1351B4] border-r border-[#E2E8F0] align-top leading-snug">
                            {contestLabel}
                          </td>
                          <td className="px-1.5 py-1.5 text-center font-mono text-[#071D41] border-r border-[#E2E8F0] align-top whitespace-nowrap">
                            {topic.tempo?.trim() || '—'}
                          </td>
                          <td className="px-1.5 py-1.5 text-center font-mono font-semibold text-[#168821] border-r border-[#E2E8F0] align-top whitespace-nowrap">
                            {studiedSec > 0 ? formatScheduleDuration(studiedSec) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-[7.8pt] text-[#3D4F6B] align-top leading-snug">
                            {topic.observacoes?.trim() || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>

      {/* Rodapé Oficial de Conferência */}
      <footer className="mt-4 pt-2.5 border-t border-[#071D41] flex items-end justify-between gap-4 text-[7.8pt] text-[#3D4F6B] break-inside-avoid">
        <div>
          <strong className="text-[#071D41]">estuda.gov.br · Folha Oficial de Expediente A4</strong>
          <div className="mt-0.5">
            Arquivo de referência: <span className="font-mono">{weekFileName}</span> · Emitido em{' '}
            {emissionStamp}
          </div>
        </div>
        <div className="text-center min-w-[200px]">
          <div className="border-t border-[#071D41] pt-1 text-[7.5pt] font-bold uppercase tracking-[0.06em] text-[#071D41]">
            Visto de Cumprimento Semanal
          </div>
        </div>
      </footer>
    </section>
  );
};
