import React, { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Columns2,
  Download,
  Eye,
  FileText,
  GitCompare,
  MessageSquarePlus,
  Printer,
  Search,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  SubmitEssayOptions,
  UpdateEssayCorrectionOptions,
  useStudy,
} from '../context/StudyContext';
import {
  ESSAY_BANKS,
  estimateSheetMetrics,
  formatTimerClock,
  getEssayScorePct,
  isEssayCorrected,
  roundScore,
} from '../lib/discursiveHelpers';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import { visibleName } from '../lib/parsers';
import { EssayRecord } from '../types/study';
import { DiscursiveAnalyticsPanel } from '../components/discursive/DiscursiveAnalyticsPanel';
import { DiscursiveCorrectionDrawer } from '../components/discursive/DiscursiveCorrectionDrawer';
import { DiscursiveWritingStudio } from '../components/discursive/DiscursiveWritingStudio';
import { DiscursiveOfficialPrintSheet } from '../components/print/DiscursiveOfficialPrintSheet';
import { FilePreview } from '../components/ui/FilePreview';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { StructuredLegalText } from '../components/ui/StructuredLegalText';

interface PreviewTarget {
  blobKey: string;
  filename: string;
  mimeType?: string;
  title: string;
}

type StatusFilter = 'all' | 'corrected' | 'pending' | 'rewritten';

export const DiscursivePage: React.FC = () => {
  const {
    db,
    disciplines,
    googleUser,
    moduleVisibility,
    submitEssay,
    updateEssayCorrection,
    deleteEssay,
    addAnnotation,
    requestConfirm,
    toast,
  } = useStudy();
  const hideUpload = moduleVisibility('Discursiva').hide_upload;

  const [guideOpen, setGuideOpen] = useState(false);
  const [editorialSerif, setEditorialSerif] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ce-discursive-serif-mode') === '1';
    } catch {
      return false;
    }
  });
  const toggleEditorialSerif = () => {
    setEditorialSerif((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ce-discursive-serif-mode', next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };
  const [editingState, setEditingState] = useState<{
    id: string;
    tab: 'rubric' | 'rewrite';
  } | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [expandedCompareIds, setExpandedCompareIds] = useState<Record<string, boolean>>({});
  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<string, boolean>>({});

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [bankFilter, setBankFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [errorTagFilter, setErrorTagFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Print target (null = print filtered dossier; string = print single essay mirror)
  const [printEssayId, setPrintEssayId] = useState<string | null>(null);

  useEffect(() => {
    const handleAfterPrint = () => setPrintEssayId(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const allDisciplines = useMemo(() => {
    const set = new Set<string>(disciplines.map((d) => visibleName(d)).filter(Boolean));
    for (const e of db.essays) {
      if (e.disciplina?.trim()) set.add(visibleName(e.disciplina));
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [disciplines, db.essays]);

  const availableBanks = useMemo(() => {
    const set = new Set<string>();
    for (const e of db.essays) {
      if (e.banca?.trim()) set.add(e.banca.trim());
    }
    for (const b of ESSAY_BANKS) set.add(b);
    return [...set];
  }, [db.essays]);

  const filteredEssays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return db.essays.filter((essay) => {
      const corrected = isEssayCorrected(essay);
      const rewritten = Boolean(
        essay.reescrita &&
          (essay.reescrita.texto?.trim() ||
            essay.reescrita.arquivo ||
            typeof essay.reescrita.notaFinal === 'number'),
      );

      if (statusFilter === 'corrected' && !corrected) return false;
      if (statusFilter === 'pending' && corrected) return false;
      if (statusFilter === 'rewritten' && !rewritten) return false;

      if (bankFilter && (essay.banca || '') !== bankFilter) return false;
      if (subjectFilter && visibleName(essay.disciplina || '') !== subjectFilter) return false;
      if (errorTagFilter && !(essay.erros_tags || []).includes(errorTagFilter)) return false;

      if (q) {
        const haystack = [
          essay.titulo,
          essay.banca || '',
          essay.tipo || '',
          essay.disciplina || '',
          essay.proposta || '',
          essay.feedback || '',
          essay.texto_original || '',
          (essay.erros_tags || []).join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [db.essays, statusFilter, bankFilter, subjectFilter, errorTagFilter, searchQuery]);

  const hasActiveFilters = Boolean(
    statusFilter !== 'all' || bankFilter || subjectFilter || errorTagFilter || searchQuery.trim(),
  );

  const clearFilters = () => {
    setStatusFilter('all');
    setBankFilter('');
    setSubjectFilter('');
    setErrorTagFilter('');
    setSearchQuery('');
  };

  const handleToggleErrorTagFilter = (tag: string) => {
    if (!tag) {
      setErrorTagFilter('');
      return;
    }
    setErrorTagFilter((prev) => (prev === tag ? '' : tag));
  };

  const handleStudioSubmit = async (
    titulo: string,
    file: File | null,
    options?: SubmitEssayOptions,
  ) => {
    await submitEssay(titulo, file, options);
  };

  const handleDrawerSave = async (
    essayId: string,
    feedback: string,
    correctedFile: File | null,
    options: UpdateEssayCorrectionOptions,
  ) => {
    await updateEssayCorrection(essayId, feedback, correctedFile, options);
  };

  const handleDownload = async (blobKey: string, filename: string) => {
    const blob = await getFileBlob(blobKey);
    if (!blob) {
      toast('Arquivo não encontrado no armazenamento local.', true);
      return;
    }
    triggerBlobDownload(blob, filename);
  };

  const handleSendToErrorNotebook = (
    essay: EssayRecord,
    tagsOverride?: string[],
    feedbackOverride?: string,
  ) => {
    const materia = essay.disciplina?.trim() || 'Discursiva';
    const tags = tagsOverride ?? essay.erros_tags ?? [];
    const fb = (feedbackOverride ?? essay.feedback ?? '').trim();
    const scorePart = essay.rubrica
      ? `Nota: ${essay.rubrica.notaFinal.toFixed(2)}/${essay.rubrica.notaMaxima} (${getEssayScorePct(essay) ?? 0}%)`
      : '';
    const lines: string[] = [
      `Redação: ${visibleName(essay.titulo)}${essay.banca ? ` (${essay.banca})` : ''}`,
    ];
    if (scorePart) lines.push(scorePart);
    if (tags.length > 0) lines.push(`Falhas identificadas: ${tags.join(', ')}`);
    if (fb) {
      const excerpt = fb.length > 700 ? `${fb.slice(0, 700).trim()}…` : fb;
      lines.push(`Apontamentos da correção:\n${excerpt}`);
    } else if (tags.length === 0) {
      lines.push('Revisar estrutura, fundamentação legal e norma culta desta proposta discursiva.');
    }
    addAnnotation(materia, 'Discursiva', lines.join('\n'));
    toast(`Apontamento enviado ao Caderno de Erros (${visibleName(materia)}).`);
  };

  const triggerPrint = (singleEssayId: string | null) => {
    setPrintEssayId(singleEssayId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  const openEditor = (essayId: string, tab: 'rubric' | 'rewrite') => {
    setEditingState((prev) =>
      prev && prev.id === essayId && prev.tab === tab ? null : { id: essayId, tab },
    );
  };

  const essaysToPrint = useMemo(() => {
    if (printEssayId) {
      return db.essays.filter((e) => e.id === printEssayId);
    }
    return filteredEssays;
  }, [db.essays, filteredEssays, printEssayId]);

  const printFilterLabel = useMemo(() => {
    if (printEssayId) {
      const found = db.essays.find((e) => e.id === printEssayId);
      return found ? `Espelho Individual · ${visibleName(found.titulo)}` : 'Espelho Individual';
    }
    const parts: string[] = [];
    if (statusFilter === 'corrected') parts.push('Corrigidas');
    if (statusFilter === 'pending') parts.push('Pendentes');
    if (statusFilter === 'rewritten') parts.push('Com Reescrita V2');
    if (bankFilter) parts.push(`Banca: ${bankFilter}`);
    if (subjectFilter) parts.push(`Disciplina: ${subjectFilter}`);
    if (errorTagFilter) parts.push(`Falha: ${errorTagFilter}`);
    if (searchQuery.trim()) parts.push(`Busca: "${searchQuery.trim()}"`);
    return parts.length > 0 ? parts.join(' · ') : 'Todas as redações protocoladas';
  }, [printEssayId, db.essays, statusFilter, bankFilter, subjectFilter, errorTagFilter, searchQuery]);

  const holderName = googleUser?.displayName || googleUser?.email || 'Estudante · estuda.gov.br';

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          eyebrow="PROTOCOLO DE REDAÇÃO · DISCURSIVA"
          title="Redações e pareceres de correção"
          description="Escreva na folha pautada cronometrada ou anexe arquivos, registre o espelho por banca, mapeie erros recorrentes e compare sua reescrita V2."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleEditorialSerif}
                aria-pressed={editorialSerif}
                title="Alternar fonte serifada de leitura prolongada nas redações e pareceres"
                className={`inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg border text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  editorialSerif
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                {editorialSerif ? 'Leitura Editorial: Ativa' : 'Leitura Editorial'}
              </button>
              {!hideUpload && (
                <button
                  type="button"
                  onClick={() => setGuideOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg border text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    guideOpen
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Guia Rápido
                </button>
              )}
              <button
                type="button"
                disabled={filteredEssays.length === 0}
                onClick={() => triggerPrint(null)}
                className="inline-flex items-center gap-1.5 h-[36px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Dossiê (A4)
              </button>
            </div>
          }
        />

        {/* Analytics Dashboard: KPIs + Score Evolution Chart + Recurring Error Tags */}
        <DiscursiveAnalyticsPanel
          essays={db.essays}
          activeErrorTag={errorTagFilter}
          onToggleErrorTag={handleToggleErrorTagFilter}
        />

        {/* Integrated Writing Studio (Lined Sheet + Timer + Quick Guide) */}
        {!hideUpload && (
          <DiscursiveWritingStudio
            disciplines={allDisciplines}
            guideOpen={guideOpen}
            onToggleGuide={() => setGuideOpen((prev) => !prev)}
            onSubmitEssay={handleStudioSubmit}
            onNotify={toast}
          />
        )}

        {preview && (
          <FilePreview
            blobKey={preview.blobKey}
            filename={preview.filename}
            mimeType={preview.mimeType}
            title={preview.title}
            onClose={() => setPreview(null)}
          />
        )}

        {/* Filter & Search Toolbar */}
        {db.essays.length > 0 && (
          <Panel className="mb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
              <div className="lg:col-span-4">
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Buscar redação ou parecer
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tema, artigo, parecer, falha..."
                    className="ce-input pl-8"
                  />
                </div>
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="ce-input"
                >
                  <option value="all">Todas ({db.essays.length})</option>
                  <option value="corrected">Corrigidas</option>
                  <option value="pending">Pendentes de correção</option>
                  <option value="rewritten">Com reescrita (V2)</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Banca
                </label>
                <select
                  value={bankFilter}
                  onChange={(e) => setBankFilter(e.target.value)}
                  className="ce-input"
                >
                  <option value="">Todas as bancas</option>
                  {availableBanks.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3">
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Disciplina
                </label>
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="ce-input"
                >
                  <option value="">Todas as disciplinas</option>
                  {allDisciplines.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(hasActiveFilters || errorTagFilter) && (
              <div className="mt-2.5 pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
                  <span className="font-mono-num tabular-nums font-bold text-[var(--text)]">
                    Exibindo {filteredEssays.length} de {db.essays.length} redação(ões)
                  </span>
                  {errorTagFilter && (
                    <button
                      type="button"
                      onClick={() => setErrorTagFilter('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)]"
                    >
                      Falha: {errorTagFilter}
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11.5px] font-bold text-[var(--accent)] hover:underline"
                >
                  Limpar filtros
                </button>
              </div>
            )}
          </Panel>
        )}

        {/* Essays List */}
        <div className="mt-3 flex flex-col gap-3">
          {filteredEssays.length > 0 ? (
            filteredEssays.map((essay) => {
              const corrected = isEssayCorrected(essay);
              const pct = getEssayScorePct(essay);
              const isEditing = editingState?.id === essay.id;
              const hasRewrite = Boolean(
                essay.reescrita &&
                  (essay.reescrita.texto?.trim() ||
                    essay.reescrita.arquivo ||
                    typeof essay.reescrita.notaFinal === 'number'),
              );
              const rewriteDelta =
                typeof essay.reescrita?.notaFinal === 'number' && essay.rubrica
                  ? roundScore(essay.reescrita.notaFinal - essay.rubrica.notaFinal)
                  : null;
              const compareOpen = Boolean(expandedCompareIds[essay.id]);
              const promptOpen = Boolean(expandedPromptIds[essay.id]);

              const metaParts: string[] = [];
              if (essay.banca) metaParts.push(essay.banca);
              if (essay.tipo) metaParts.push(essay.tipo);
              if (essay.disciplina) metaParts.push(visibleName(essay.disciplina));
              metaParts.push(`Protocolada em ${essay.data}`);
              if (essay.linhas_escritas) {
                metaParts.push(
                  `${essay.linhas_escritas}${essay.limite_linhas ? `/${essay.limite_linhas}` : ''} linhas`,
                );
              }
              if (essay.tempo_segundos) {
                metaParts.push(`Tempo ${formatTimerClock(essay.tempo_segundos)}`);
              }
              metaParts.push(`Arquivo: ${visibleName(essay.original_arquivo)}`);

              return (
                <Panel key={essay.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[min(100%,280px)] flex-1 text-left">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <h3 className="m-0 font-display text-[15.5px] font-bold leading-snug text-[var(--text)] text-left">
                          {visibleName(essay.titulo)}
                        </h3>
                        <span
                          className={`text-[11px] font-extrabold uppercase tracking-wider ${
                            corrected ? 'text-[var(--good)]' : 'text-[var(--muted)]'
                          }`}
                        >
                          {corrected ? '● Corrigida' : '○ Aguardando correção'}
                        </span>
                        {hasRewrite && (
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                            · Reescrita V2
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-[12px] text-[var(--muted)] leading-relaxed">
                        {metaParts.join(' · ')}
                      </div>

                      {/* Score & Rubric Summary Line */}
                      {(essay.rubrica || typeof essay.reescrita?.notaFinal === 'number') && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] font-mono-num tabular-nums">
                          {essay.rubrica && (
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--muted)] font-sans text-[11.5px] font-bold uppercase tracking-wider">
                                Nota V1:
                              </span>
                              <strong
                                className={`text-[13.5px] ${
                                  pct !== null && pct >= 70
                                    ? 'text-[var(--good)]'
                                    : 'text-[var(--warning)]'
                                }`}
                              >
                                {essay.rubrica.notaFinal.toFixed(2)} / {essay.rubrica.notaMaxima}
                                {pct !== null ? ` (${pct}%)` : ''}
                              </strong>
                              {essay.rubrica.mode === 'cebraspe' && (
                                <span className="text-[11.5px] text-[var(--muted)]">
                                  [NC {(essay.rubrica.notaConteudo ?? 0).toFixed(2)} ·{' '}
                                  {essay.rubrica.numErrosGramaticais ?? 0} erros /{' '}
                                  {essay.rubrica.totalLinhas ?? 30}L]
                                </span>
                              )}
                              {essay.rubrica.mode === 'criteria' && (
                                <span className="text-[11.5px] text-[var(--muted)]">
                                  [Cont {(essay.rubrica.notaConteudo ?? 0).toFixed(1)} · Estr{' '}
                                  {(essay.rubrica.notaEstrutura ?? 0).toFixed(1)} · Gram{' '}
                                  {(essay.rubrica.notaGramatica ?? 0).toFixed(1)}]
                                </span>
                              )}
                            </div>
                          )}

                          {typeof essay.reescrita?.notaFinal === 'number' && (
                            <div className="flex items-center gap-1.5 text-[var(--good)] font-bold">
                              <span className="font-sans text-[11.5px] uppercase tracking-wider">
                                V2:
                              </span>
                              <span>
                                {essay.reescrita.notaFinal.toFixed(2)}
                                {essay.rubrica ? ` / ${essay.rubrica.notaMaxima}` : ''}
                              </span>
                              {rewriteDelta !== null && (
                                <span
                                  className={
                                    rewriteDelta >= 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'
                                  }
                                >
                                  ({rewriteDelta >= 0 ? '+' : ''}
                                  {rewriteDelta.toFixed(2)} pts)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Error tags inline (clickable filters) */}
                      {essay.erros_tags && essay.erros_tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-bold uppercase tracking-wider text-[var(--muted)] mr-0.5">
                            Falhas:
                          </span>
                          {essay.erros_tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleToggleErrorTagFilter(tag)}
                              className={`px-2 py-0.5 rounded border font-semibold transition-colors ${
                                errorTagFilter === tag
                                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                                  : 'border-[var(--bad)]/35 bg-[var(--bad)]/8 text-[var(--bad)] hover:border-[var(--bad)]'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
                      <button
                        type="button"
                        onClick={() => openEditor(essay.id, 'rubric')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--text)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        {isEditing && editingState?.tab === 'rubric'
                          ? 'Fechar espelho'
                          : 'Espelho & correção'}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditor(essay.id, 'rewrite')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                        {hasRewrite ? 'Editar V2' : 'Reescrever (V2)'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendToErrorNotebook(essay)}
                        title="Registrar apontamento desta redação no Caderno de Erros"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--warning)] whitespace-nowrap"
                      >
                        <BookMarked className="w-3.5 h-3.5 text-[var(--warning)]" />
                        Caderno de Erros
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerPrint(essay.id)}
                        title="Imprimir folha oficial e espelho de correção em A4"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Espelho A4
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPreview({
                            blobKey: essay.original_blobKey,
                            filename: essay.original_arquivo,
                            mimeType: essay.original_mime,
                            title: `Original — ${visibleName(essay.titulo)}`,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Visualizar
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleDownload(essay.original_blobKey, essay.original_arquivo)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Original
                      </button>

                      {essay.corrigido_blobKey && essay.corrigido_arquivo && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setPreview({
                                blobKey: essay.corrigido_blobKey!,
                                filename: essay.corrigido_arquivo,
                                mimeType: essay.corrigido_mime,
                                title: `Corrigida — ${visibleName(essay.titulo)}`,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--good)] hover:border-[var(--good)] whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver correção
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleDownload(essay.corrigido_blobKey!, essay.corrigido_arquivo)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--good)] hover:border-[var(--good)] whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Corrigida
                          </button>
                        </>
                      )}

                      {essay.reescrita?.blobKey && essay.reescrita.arquivo && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({
                              blobKey: essay.reescrita!.blobKey!,
                              filename: essay.reescrita!.arquivo!,
                              mimeType: essay.reescrita!.mime,
                              title: `Reescrita V2 — ${visibleName(essay.titulo)}`,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)] whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Ver V2
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          void requestConfirm({
                            title: `Excluir "${visibleName(essay.titulo)}"?`,
                            description:
                              'A redação, o espelho de correção e a reescrita V2 serão removidos do aplicativo e enviados para a lixeira do Google Drive.',
                            confirmLabel: 'Excluir redação',
                            danger: true,
                          }).then(async (ok) => {
                            if (!ok) return;
                            await deleteEssay(essay.id);
                            if (
                              preview &&
                              (preview.blobKey === essay.original_blobKey ||
                                preview.blobKey === essay.corrigido_blobKey ||
                                preview.blobKey === essay.reescrita?.blobKey)
                            ) {
                              setPreview(null);
                            }
                            if (editingState?.id === essay.id) setEditingState(null);
                          });
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                      </button>
                    </div>
                  </div>

                  {/* Quick toggles for Prompt/Reference and Side-by-Side V1xV2 */}
                  {(essay.proposta || essay.espelho || (essay.texto_original && essay.reescrita?.texto)) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px]">
                      {(essay.proposta || essay.espelho) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPromptIds((prev) => ({
                              ...prev,
                              [essay.id]: !prev[essay.id],
                            }))
                          }
                          className="font-bold text-[var(--accent)] hover:underline"
                        >
                          {promptOpen
                            ? 'Ocultar enunciado e espelho de referência'
                            : 'Ver enunciado e espelho de referência'}
                        </button>
                      )}
                      {essay.texto_original && essay.reescrita?.texto && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCompareIds((prev) => ({
                              ...prev,
                              [essay.id]: !prev[essay.id],
                            }))
                          }
                          className="inline-flex items-center gap-1 font-bold text-[var(--good)] hover:underline"
                        >
                          <Columns2 className="w-3.5 h-3.5" />
                          {compareOpen
                            ? 'Ocultar comparativo V1 × V2'
                            : 'Comparar V1 × V2 lado a lado'}
                        </button>
                      )}
                    </div>
                  )}

                  {promptOpen && (essay.proposta || essay.espelho) && (
                    <div
                      className={`mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 ${
                        editorialSerif ? 'ce-editorial-serif' : 'text-[12.5px]'
                      }`}
                    >
                      {essay.proposta && (
                        <div>
                          <strong className="block text-[10.5px] uppercase tracking-wider text-[var(--muted)] mb-1">
                            Enunciado / Proposta
                          </strong>
                          <StructuredLegalText
                            text={essay.proposta}
                            className="text-[12px] text-[var(--text)]"
                          />
                        </div>
                      )}
                      {essay.espelho && (
                        <div>
                          <strong className="block text-[10.5px] uppercase tracking-wider text-[var(--muted)] mb-1">
                            Espelho de Referência
                          </strong>
                          <StructuredLegalText
                            text={essay.espelho}
                            className="text-[12px] text-[var(--text)]"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {essay.feedback.trim() && (
                    <div className="ce-notice mt-3 text-[var(--text)]">
                      <strong className="block text-[11.5px] font-bold text-[var(--muted)] mb-1">
                        Parecer da correção
                      </strong>
                      <StructuredLegalText
                        text={essay.feedback}
                        className={`text-[var(--text)] ${editorialSerif ? 'ce-editorial-serif' : 'text-[12.5px]'}`}
                      />
                    </div>
                  )}

                  {essay.reescrita?.observacoes && !compareOpen && (
                    <div className="mt-2.5 rounded-lg border border-[var(--good)]/35 bg-[var(--good)]/8 px-3 py-2 text-[12px] text-[var(--text)]">
                      <strong className="text-[var(--good)]">Ajustes na Reescrita V2: </strong>
                      {essay.reescrita.observacoes}
                    </div>
                  )}

                  {compareOpen && essay.texto_original && essay.reescrita?.texto && (
                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
                        <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-[var(--line)] text-[11.5px] font-bold text-[var(--muted)]">
                          <span>Versão 1 (Original)</span>
                          <span className="font-mono-num tabular-nums">
                            {essay.linhas_escritas ||
                              estimateSheetMetrics(essay.texto_original).estimatedLines}{' '}
                            linhas
                            {essay.rubrica ? ` · ${essay.rubrica.notaFinal.toFixed(2)} pts` : ''}
                          </span>
                        </div>
                        <div
                          className={`whitespace-pre-wrap text-[var(--text)]/90 max-h-[340px] overflow-y-auto pr-1 ${
                            editorialSerif ? 'ce-editorial-serif' : 'text-[12.5px] leading-relaxed'
                          }`}
                        >
                          {essay.texto_original}
                        </div>
                      </div>

                      <div className="rounded-[var(--radius-md)] border border-[var(--good)]/45 bg-[var(--good)]/6 p-3.5">
                        <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-[var(--good)]/25 text-[11.5px] font-bold text-[var(--good)]">
                          <span>Versão 2 (Reescrita)</span>
                          <span className="font-mono-num tabular-nums">
                            {essay.reescrita.linhas_escritas ||
                              estimateSheetMetrics(essay.reescrita.texto).estimatedLines}{' '}
                            linhas
                            {typeof essay.reescrita.notaFinal === 'number'
                              ? ` · ${essay.reescrita.notaFinal.toFixed(2)} pts`
                              : ''}
                          </span>
                        </div>
                        {essay.reescrita.observacoes && (
                          <div className="mb-2 text-[11.5px] font-semibold text-[var(--text)]">
                            Ajustes: {essay.reescrita.observacoes}
                          </div>
                        )}
                        <div
                          className={`whitespace-pre-wrap text-[var(--text)] max-h-[340px] overflow-y-auto pr-1 ${
                            editorialSerif ? 'ce-editorial-serif' : 'text-[12.5px] leading-relaxed'
                          }`}
                        >
                          {essay.reescrita.texto}
                        </div>
                      </div>
                    </div>
                  )}

                  {isEditing && editingState && (
                    <DiscursiveCorrectionDrawer
                      essay={essay}
                      initialTab={editingState.tab}
                      disciplines={allDisciplines}
                      onSave={handleDrawerSave}
                      onSendToErrorNotebook={(targetEssay, tags, fb) =>
                        handleSendToErrorNotebook(targetEssay, tags, fb)
                      }
                      onClose={() => setEditingState(null)}
                      onNotify={toast}
                    />
                  )}
                </Panel>
              );
            })
          ) : db.essays.length > 0 ? (
            <EmptyState
              message="Nenhuma redação encontrada com os filtros aplicados."
              action={
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[12px] font-bold text-[var(--accent)]"
                >
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <EmptyState message="Nenhuma redação protocolada ainda. Use o Estúdio de Redação acima para escrever na folha pautada ou anexar um arquivo." />
          )}
        </div>
      </div>

      {/* Official Gov.br A4 Print Sheet */}
      <DiscursiveOfficialPrintSheet
        essays={essaysToPrint}
        filterLabel={printFilterLabel}
        holderName={holderName}
      />
    </div>
  );
};
