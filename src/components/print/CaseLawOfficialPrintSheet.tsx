import React, { useMemo } from 'react';
import { CaseLawItem } from '../../types/study';
import { normalizeSearch } from '../../lib/parsers';
import { StructuredLegalText } from '../ui/StructuredLegalText';

interface CaseLawOfficialPrintSheetProps {
  items: CaseLawItem[];
  filterSummary: string;
  holderName: string;
}

function normalizeCategory(cat?: string): 'Súmula' | 'Jurisprudência' {
  return normalizeSearch(cat || '').includes('sumula') ? 'Súmula' : 'Jurisprudência';
}

export const CaseLawOfficialPrintSheet: React.FC<CaseLawOfficialPrintSheetProps> = ({
  items,
  filterSummary,
  holderName,
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, CaseLawItem[]>();
    items.forEach((item) => {
      const court = (item.tribunal || 'Outros Tribunais').trim().toUpperCase();
      const arr = map.get(court) || [];
      arr.push(item);
      map.set(court, arr);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [items]);

  const sumulaCount = useMemo(
    () => items.filter((i) => normalizeCategory(i.categoria) === 'Súmula').length,
    [items],
  );
  const jurisCount = items.length - sumulaCount;

  const emissionStamp = new Date().toLocaleString('pt-BR');
  const protocolCode = `JUR-${String(items.length).padStart(3, '0')}-${String(groups.length).padStart(2, '0')}`;

  let runningIndex = 0;

  return (
    <section
      className="gov-print-sheet gov-official-doc-print hidden print:block bg-white text-[#071D41]"
      aria-label="Coletânea Oficial de Súmulas e Jurisprudência para Impressão A4"
    >
      <header className="border border-[#071D41] mb-3">
        <div className="bg-[#071D41] text-white px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[8.5pt] font-bold tracking-[0.14em] uppercase text-[#FFCD07]">
              PORTAL ÚNICO DO ESTUDANTE · ESTUDA.GOV.BR
            </div>
            <h1 className="m-0 mt-0.5 text-[13.5pt] font-extrabold tracking-[-0.01em] text-white">
              COLETÂNEA OFICIAL DE SÚMULAS E JURISPRUDÊNCIA
            </h1>
            <div className="text-[8pt] text-[#DCE6F5] mt-0.5">
              Corte Superior · Súmulas vinculantes, temas repetitivos e teses consolidadas
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
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">{filterSummary}</div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Composição
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {sumulaCount} súmula(s) · {jurisCount} jurispr.
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
              Tribunais Incluídos
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {items.length} verbete(s) · {groups.length} órgão(s)
            </div>
          </div>
        </div>
      </header>

      {groups.length > 1 && (
        <section className="mb-3 border border-[#9BB0CD] break-inside-avoid page-break-inside-avoid">
          <div className="bg-[#EDF2F8] border-b border-[#9BB0CD] px-3 py-1 text-[8pt] font-extrabold uppercase tracking-[0.05em] text-[#071D41]">
            Quadro-Resumo por Tribunal / Órgão ({groups.length})
          </div>
          <table className="w-full border-collapse text-[8pt]">
            <thead>
              <tr className="bg-[#F7F9FC] border-b border-[#C5D2E4] text-[#3D4F6B]">
                <th className="text-left px-3 py-1 font-bold">Tribunal / Órgão</th>
                <th className="text-right px-3 py-1 font-bold w-24">Súmulas</th>
                <th className="text-right px-3 py-1 font-bold w-28">Jurisprudência</th>
                <th className="text-right px-3 py-1 font-bold w-20">Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([court, list]) => {
                const sCount = list.filter((i) => normalizeCategory(i.categoria) === 'Súmula').length;
                return (
                  <tr key={court} className="border-b border-[#E3EAF3] last:border-b-0">
                    <td className="px-3 py-1 font-bold text-[#071D41]">{court}</td>
                    <td className="px-3 py-1 text-right font-mono text-[#1351B4]">{sCount}</td>
                    <td className="px-3 py-1 text-right font-mono text-[#3D4F6B]">
                      {list.length - sCount}
                    </td>
                    <td className="px-3 py-1 text-right font-mono font-bold text-[#071D41]">
                      {list.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {groups.length === 0 ? (
        <div className="border border-[#B6C6DC] p-4 text-[9pt] text-[#3D4F6B] italic">
          Nenhuma súmula ou jurisprudência encontrada para o filtro selecionado.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(([court, list]) => (
            <section key={court}>
              <div className="bg-[#EDF2F8] border border-[#071D41] px-3 py-1.5 mb-2 flex items-center justify-between gap-2 break-after-avoid">
                <strong className="text-[10pt] font-extrabold uppercase tracking-[0.03em] text-[#071D41]">
                  {court}
                </strong>
                <span className="font-mono text-[8pt] font-bold text-[#1351B4]">
                  {list.length} referência(s)
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {list.map((item) => {
                  runningIndex += 1;
                  const cat = normalizeCategory(item.categoria);
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
                          <span className="font-bold text-[#1351B4]">{cat}</span>
                          {item.identificador && (
                            <>
                              <span className="text-[#5C6E8A]"> · </span>
                              <strong className="text-[#071D41]">{item.identificador}</strong>
                            </>
                          )}
                          <span className="text-[#5C6E8A]"> · </span>
                          <strong className="text-[8.8pt] text-[#071D41]">{item.titulo}</strong>
                        </div>
                        <span className="font-mono text-[7.8pt] font-bold text-[#3D4F6B] shrink-0">
                          {court}
                        </span>
                      </div>

                      <StructuredLegalText
                        text={item.texto}
                        variant="print"
                        className="text-[8.8pt]"
                      />

                      <div className="mt-2 pt-1 border-t border-[#E6ECF4] flex items-center justify-between text-[7.4pt] text-[#4B5E7A]">
                        <span>Controle de revisão no papel:</span>
                        <div className="flex items-center gap-3 font-mono">
                          <span>[ ] Lida</span>
                          <span>[ ] Rev. 1</span>
                          <span>[ ] Rev. 2</span>
                          <span>[ ] Dominada</span>
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
          estuda.gov.br · Folha Oficial A4 · Coletânea de Súmulas e Jurisprudência
        </div>
        <div className="font-mono">Visto do Estudante: ___________________________</div>
      </footer>
    </section>
  );
};
