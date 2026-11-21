import React, { useMemo } from 'react';
import { CriticalPoint } from '../../types/study';
import { visibleName } from '../../lib/parsers';

interface CriticalPointsOfficialPrintSheetProps {
  items: CriticalPoint[];
  filterLabel: string;
  groupBy: 'materia' | 'ano';
  holderName: string;
}

export const CriticalPointsOfficialPrintSheet: React.FC<CriticalPointsOfficialPrintSheetProps> = ({
  items,
  filterLabel,
  groupBy,
  holderName,
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, CriticalPoint[]>();
    items.forEach((item) => {
      const key =
        groupBy === 'materia'
          ? visibleName(item.materia || 'Geral') || 'Geral'
          : (item.data || 'Sem vigência').trim();
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [items, groupBy]);

  const emissionStamp = new Date().toLocaleString('pt-BR');
  const protocolCode = `PCR-${String(items.length).padStart(3, '0')}-${String(groups.length).padStart(2, '0')}`;

  let runningIndex = 0;

  return (
    <section
      className="gov-print-sheet hidden print:block bg-white text-[#071D41]"
      aria-label="Boletim Oficial de Pontos Críticos para Impressão A4"
    >
      <header className="border border-[#071D41] mb-3">
        <div className="bg-[#071D41] text-white px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[8.5pt] font-bold tracking-[0.14em] uppercase text-[#FFCD07]">
              PORTAL ÚNICO DO ESTUDANTE · ESTUDA.GOV.BR
            </div>
            <h1 className="m-0 mt-0.5 text-[13.5pt] font-extrabold tracking-[-0.01em] text-white">
              ALERTA MINISTERIAL · PONTOS CRÍTICOS E NOVIDADES LEGISLATIVAS
            </h1>
            <div className="text-[8pt] text-[#DCE6F5] mt-0.5">
              Alterações recentes de normas, emendas constitucionais e viradas jurisprudenciais
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

        <div className="grid grid-cols-4 divide-x divide-[#B6C6DC] bg-[#F7F9FC] text-[8.5pt]">
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Filtro Aplicado
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">{filterLabel}</div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Agrupamento
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">
              {groupBy === 'materia' ? 'Por Disciplina' : 'Por Ano / Vigência'}
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
              Total Consolidado
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {items.length} ponto(s) · {groups.length} grupo(s)
            </div>
          </div>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="border border-[#B6C6DC] p-4 text-[9pt] text-[#3D4F6B] italic">
          Nenhum ponto crítico encontrado para o filtro selecionado.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([groupLabel, groupItems]) => (
            <section key={groupLabel}>
              <div className="bg-[#EDF2F8] border border-[#071D41] px-3 py-1.5 mb-2 flex items-center justify-between gap-2 break-after-avoid">
                <strong className="text-[10pt] font-extrabold uppercase tracking-[0.03em] text-[#071D41]">
                  {groupLabel}
                </strong>
                <span className="font-mono text-[8pt] font-bold text-[#1351B4]">
                  {groupItems.length} registro(s)
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {groupItems.map((item) => {
                  runningIndex += 1;
                  return (
                    <article
                      key={item.id}
                      className="border border-[#9BB0CD] bg-white px-3 py-2 break-inside-avoid page-break-inside-avoid"
                    >
                      <div className="flex items-baseline justify-between gap-2 border-b border-[#DCE5F0] pb-1 mb-1.5 text-[8pt]">
                        <div className="min-w-0">
                          <span className="font-mono font-extrabold text-[#071D41] mr-1.5">
                            #{String(runningIndex).padStart(2, '0')}
                          </span>
                          <strong className="text-[9pt] font-extrabold text-[#071D41]">
                            {item.titulo}
                          </strong>
                          <span className="text-[#5C6E8A]"> · </span>
                          <span className="font-bold text-[#1351B4]">
                            {visibleName(item.materia || 'Geral')}
                          </span>
                        </div>
                        <span className="font-mono text-[7.8pt] font-bold text-[#3D4F6B] shrink-0">
                          Vigência: {item.data || '—'}
                        </span>
                      </div>

                      <p className="m-0 text-[8.8pt] leading-[1.45] text-[#071D41] whitespace-pre-wrap">
                        {item.texto}
                      </p>

                      <div className="mt-2 pt-1 border-t border-[#E6ECF4] flex items-center justify-between text-[7.4pt] text-[#4B5E7A]">
                        <span>Controle de revisão no papel:</span>
                        <div className="flex items-center gap-3 font-mono">
                          <span>[ ] Lido</span>
                          <span>[ ] Rev. 7d</span>
                          <span>[ ] Rev. 30d</span>
                          <span>[ ] Memorizado</span>
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

      <footer className="mt-4 pt-2 border-t border-[#071D41] flex items-center justify-between text-[7.5pt] text-[#3D4F6B]">
        <div>
          estuda.gov.br · Folha Oficial A4 · Pontos Críticos e Novidades Legislativas
        </div>
        <div className="font-mono">Visto do Estudante: ___________________________</div>
      </footer>
    </section>
  );
};
