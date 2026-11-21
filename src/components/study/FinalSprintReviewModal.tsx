import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Flame,
  Gavel,
  Printer,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { buildFinalSprintBundle } from '../../lib/studyTools';
import { localDateTimeBrazilian, visibleName } from '../../lib/parsers';
import { FederalCoatOfArmsPlaceholder } from '../print/FederalCoatOfArmsPlaceholder';
import { StructuredLegalText } from '../ui/StructuredLegalText';

interface FinalSprintReviewModalProps {
  open: boolean;
  onClose: () => void;
}

export const FinalSprintReviewModal: React.FC<FinalSprintReviewModalProps> = ({
  open,
  onClose,
}) => {
  const { db, googleUser, toast } = useStudy();
  const [subjectFilter, setSubjectFilter] = useState<string>('Todas');
  const [search, setSearch] = useState<string>('');
  const [includeCritical, setIncludeCritical] = useState(true);
  const [includeCaseLaw, setIncludeCaseLaw] = useState(true);
  const [includeErrors, setIncludeErrors] = useState(true);
  const [includeLaws, setIncludeLaws] = useState(true);

  const bundle = useMemo(
    () => buildFinalSprintBundle(db, subjectFilter, search, 30),
    [db, subjectFilter, search],
  );

  const totalItems =
    (includeCritical ? bundle.criticalPoints.length : 0) +
    (includeCaseLaw ? bundle.caseLaw.length : 0) +
    (includeErrors ? bundle.unresolvedErrors.length : 0) +
    (includeLaws ? bundle.veryHighLaws.length : 0);

  const holderName =
    googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal';

  const handlePrint = () => {
    if (totalItems === 0) {
      toast('Nenhum item selecionado para impressão no Caderno de Revisão de Véspera.', true);
      return;
    }
    document.body.dataset.printTarget = 'final-sprint';
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        delete document.body.dataset.printTarget;
      }, 400);
    }, 60);
  };

  if (!open) return null;

  return (
    <>
      {/* Interactive Modal (screen only) */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-3 sm:p-5 print:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Caderno de Revisão de Véspera"
      >
        <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-[var(--line)] bg-[var(--panel-soft)] flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span>Reta Final · Filtro Rápido Consolidado</span>
              </div>
              <h3 className="m-0 mt-0.5 font-display text-[18px] font-extrabold text-[var(--text)]">
                Caderno de Revisão de Véspera ({totalItems} itens)
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-extrabold hover:opacity-95 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Caderno Oficial (A4)
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar Caderno de Revisão de Véspera"
                className="grid place-items-center w-9 h-9 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-4 sm:px-6 py-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2.5 bg-[var(--panel)]">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIncludeCritical((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                  includeCritical
                    ? 'border-[var(--warning)]/60 bg-[var(--warning)]/12 text-[var(--warning)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)]'
                }`}
              >
                Pontos Críticos ({bundle.criticalPoints.length})
              </button>
              <button
                type="button"
                onClick={() => setIncludeCaseLaw((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                  includeCaseLaw
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)]'
                }`}
              >
                Súmulas &amp; Juris ({bundle.caseLaw.length})
              </button>
              <button
                type="button"
                onClick={() => setIncludeErrors((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                  includeErrors
                    ? 'border-[var(--bad)]/60 bg-[var(--bad)]/12 text-[var(--bad)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)]'
                }`}
              >
                Erros Pendentes ({bundle.unresolvedErrors.length})
              </button>
              <button
                type="button"
                onClick={() => setIncludeLaws((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                  includeLaws
                    ? 'border-[var(--good)]/60 bg-[var(--good)]/12 text-[var(--good)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)]'
                }`}
              >
                Lei Seca Muito Alta ({bundle.veryHighLaws.length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrar termo..."
                  className="ce-input h-8 rounded-lg pl-8 pr-2.5 text-[12px] w-44"
                />
              </div>
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="ce-input h-8 rounded-lg px-2.5 text-[12px] max-w-[190px]"
              >
                <option value="Todas">Todas as matérias</option>
                {bundle.availableSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content Scroll */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5">
            {totalItems === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-8 text-center text-[13px] text-[var(--muted)]">
                Nenhum registro encontrado para os filtros aplicados.
              </div>
            )}

            {includeCritical && bundle.criticalPoints.length > 0 && (
              <div>
                <h4 className="m-0 mb-2.5 flex items-center gap-1.5 font-display text-[14.5px] font-extrabold text-[var(--warning)]">
                  <Sparkles className="w-4 h-4" />
                  1. Pontos Críticos &amp; Pegadinhas ({bundle.criticalPoints.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {bundle.criticalPoints.map((pt) => (
                    <article
                      key={pt.id}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <strong className="text-[12.5px] font-extrabold text-[var(--text)]">
                          {pt.titulo}
                        </strong>
                        <span className="text-[10.5px] font-bold text-[var(--accent)] shrink-0">
                          {visibleName(pt.materia)}
                        </span>
                      </div>
                      <div className="text-[12px] leading-relaxed text-[var(--text)]">
                        <StructuredLegalText text={pt.texto} />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {includeCaseLaw && bundle.caseLaw.length > 0 && (
              <div>
                <h4 className="m-0 mb-2.5 flex items-center gap-1.5 font-display text-[14.5px] font-extrabold text-[var(--accent)]">
                  <Gavel className="w-4 h-4" />
                  2. Súmulas &amp; Jurisprudência Recente ({bundle.caseLaw.length})
                </h4>
                <div className="flex flex-col gap-2.5">
                  {bundle.caseLaw.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <strong className="text-[12.5px] font-extrabold text-[var(--text)]">
                          {item.tribunal} · {item.identificador}
                          {item.titulo ? ` — ${item.titulo}` : ''}
                        </strong>
                        <span className="text-[10.5px] font-bold text-[var(--muted)]">
                          {visibleName(item.categoria)}
                        </span>
                      </div>
                      <div className="text-[12px] leading-relaxed text-[var(--text)]">
                        <StructuredLegalText text={item.texto} />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {includeErrors && bundle.unresolvedErrors.length > 0 && (
              <div>
                <h4 className="m-0 mb-2.5 flex items-center gap-1.5 font-display text-[14.5px] font-extrabold text-[var(--bad)]">
                  <AlertCircle className="w-4 h-4" />
                  3. Erros Não Superados ({bundle.unresolvedErrors.length})
                </h4>
                <div className="flex flex-col gap-2.5">
                  {bundle.unresolvedErrors.map((err) => (
                    <article
                      key={err.id}
                      className="rounded-xl border border-[var(--bad)]/25 bg-[var(--panel-soft)] p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <strong className="text-[12.5px] font-extrabold text-[var(--text)]">
                          {visibleName(err.materia)} · {err.tipo || 'Erro'}
                        </strong>
                        {err.questao?.gabarito && (
                          <span className="font-mono-num text-[11px] font-extrabold text-[var(--good)]">
                            Gab.: {err.questao.gabarito}
                          </span>
                        )}
                      </div>
                      {err.questao?.enunciado && (
                        <div className="text-[12px] text-[var(--muted)] mb-1.5">
                          <StructuredLegalText text={err.questao.enunciado} />
                        </div>
                      )}
                      {err.texto && (
                        <div className="text-[12px] text-[var(--text)] pt-1.5 border-t border-[var(--line)]">
                          <StructuredLegalText text={err.texto} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {includeLaws && bundle.veryHighLaws.length > 0 && (
              <div>
                <h4 className="m-0 mb-2.5 flex items-center gap-1.5 font-display text-[14.5px] font-extrabold text-[var(--good)]">
                  <BookOpen className="w-4 h-4" />
                  4. Lei Seca — Incidência Muito Alta ({bundle.veryHighLaws.length})
                </h4>
                <div className="flex flex-col gap-2.5">
                  {bundle.veryHighLaws.map(({ folder, folderLabel, item }) => (
                    <article
                      key={`${folder}-${item.id}`}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <strong className="text-[12.5px] font-extrabold text-[var(--text)]">
                          {folderLabel} · {item.dispositivo || item.artigo_base}
                        </strong>
                        <span className="px-2 py-0.5 rounded bg-[var(--good)]/15 text-[var(--good)] text-[10px] font-extrabold">
                          Muito Alto
                        </span>
                      </div>
                      <div className="text-[12px] leading-relaxed text-[var(--text)]">
                        <StructuredLegalText text={item.texto} />
                      </div>
                      {item.dica && (
                        <p className="m-0 mt-1.5 text-[11.5px] text-[var(--accent)] font-semibold">
                          Dica: {item.dica}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Official Gov.br A4 Print Sheet (Print-only when Final Sprint print is triggered) */}
      <div className="gov-final-sprint-print hidden print:block bg-white text-[#071D41]">
        <header className="border-b-2 border-[#071D41] pb-3 mb-4 text-center">
          <div className="flex justify-center mb-1.5">
            <FederalCoatOfArmsPlaceholder size={54} />
          </div>
          <p className="m-0 text-[9.5pt] font-bold uppercase tracking-[0.08em]">
            REPÚBLICA FEDERATIVA DO BRASIL · PORTAL ESTUDA.GOV.BR
          </p>
          <h1 className="m-0 mt-1 text-[14pt] font-extrabold uppercase tracking-[0.04em]">
            CADERNO OFICIAL DE REVISÃO DE VÉSPERA (RETA FINAL)
          </h1>
          <p className="m-0 mt-1 text-[9pt] text-[#334155]">
            Candidato(a): <strong>{holderName}</strong> · Filtro:{' '}
            <strong>{subjectFilter}</strong> · Emitido em {localDateTimeBrazilian()} ·{' '}
            <strong>{totalItems}</strong> itens consolidados
          </p>
        </header>

        {includeCritical && bundle.criticalPoints.length > 0 && (
          <section className="mb-4">
            <h2 className="text-[11pt] font-extrabold uppercase border-b border-[#071D41] pb-1 mb-2">
              I. PONTOS CRÍTICOS E PEGADINHAS DE BANCA ({bundle.criticalPoints.length})
            </h2>
            {bundle.criticalPoints.map((pt, idx) => (
              <div key={pt.id} className="mb-2.5 pb-2 border-b border-[#CBD5E1] break-inside-avoid">
                <div className="text-[9.5pt] font-bold">
                  {idx + 1}. [{visibleName(pt.materia)}] {pt.titulo}
                </div>
                <div className="text-[9pt] leading-snug mt-0.5">
                  <StructuredLegalText text={pt.texto} variant="print" />
                </div>
              </div>
            ))}
          </section>
        )}

        {includeCaseLaw && bundle.caseLaw.length > 0 && (
          <section className="mb-4">
            <h2 className="text-[11pt] font-extrabold uppercase border-b border-[#071D41] pb-1 mb-2">
              II. SÚMULAS E JURISPRUDÊNCIA CONSOLIDADA ({bundle.caseLaw.length})
            </h2>
            {bundle.caseLaw.map((item, idx) => (
              <div key={item.id} className="mb-2.5 pb-2 border-b border-[#CBD5E1] break-inside-avoid">
                <div className="text-[9.5pt] font-bold">
                  {idx + 1}. {item.tribunal} · {item.identificador} ({visibleName(item.categoria)})
                  {item.titulo ? ` — ${item.titulo}` : ''}
                </div>
                <div className="text-[9pt] leading-snug mt-0.5">
                  <StructuredLegalText text={item.texto} variant="print" />
                </div>
              </div>
            ))}
          </section>
        )}

        {includeErrors && bundle.unresolvedErrors.length > 0 && (
          <section className="mb-4">
            <h2 className="text-[11pt] font-extrabold uppercase border-b border-[#071D41] pb-1 mb-2">
              III. CADERNO DE ERROS PENDENTES ({bundle.unresolvedErrors.length})
            </h2>
            {bundle.unresolvedErrors.map((err, idx) => (
              <div key={err.id} className="mb-2.5 pb-2 border-b border-[#CBD5E1] break-inside-avoid">
                <div className="text-[9.5pt] font-bold">
                  {idx + 1}. {visibleName(err.materia)} · {err.tipo || 'Erro'}
                  {err.questao?.gabarito ? ` · Gabarito: ${err.questao.gabarito}` : ''}
                </div>
                {err.questao?.enunciado && (
                  <div className="text-[8.5pt] text-[#334155] mt-0.5">
                    <StructuredLegalText text={err.questao.enunciado} variant="print" />
                  </div>
                )}
                {err.texto && (
                  <div className="text-[9pt] leading-snug mt-1">
                    <StructuredLegalText text={err.texto} variant="print" />
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {includeLaws && bundle.veryHighLaws.length > 0 && (
          <section className="mb-4">
            <h2 className="text-[11pt] font-extrabold uppercase border-b border-[#071D41] pb-1 mb-2">
              IV. LEI SECA — INCIDÊNCIA MUITO ALTA ({bundle.veryHighLaws.length})
            </h2>
            {bundle.veryHighLaws.map(({ folder, folderLabel, item }, idx) => (
              <div
                key={`${folder}-${item.id}`}
                className="mb-2.5 pb-2 border-b border-[#CBD5E1] break-inside-avoid"
              >
                <div className="text-[9.5pt] font-bold">
                  {idx + 1}. {folderLabel} — {item.dispositivo || item.artigo_base}
                </div>
                <div className="text-[9pt] leading-snug mt-0.5">
                  <StructuredLegalText text={item.texto} variant="print" />
                </div>
                {item.dica && (
                  <div className="text-[8.5pt] italic mt-0.5">Dica de Prova: {item.dica}</div>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
};
