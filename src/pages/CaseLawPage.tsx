import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Layers,
  LayoutGrid,
  List,
  ListPlus,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { normalizeSearch, visibleName } from '../lib/parsers';
import { CaseLawItem, CaseLawVigencia, ContentStudyStatus } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { StructuredLegalText } from '../components/ui/StructuredLegalText';
import {
  PinToggleButton,
  ReadingQueueButton,
  STUDY_STATUS_LIST,
  STUDY_STATUS_META,
  StudyStatusSelect,
} from '../components/ui/ContentReadingSurface';
import {
  FONT_FAMILY_CSS,
  FONT_SIZE_PX,
  LINE_HEIGHT_VAL,
  LawClozeText,
  LawReadingToolbar,
  renderLawTextWithExamHighlights,
  useLawReadingPrefs,
} from '../components/ui/LawReadingTools';
import { CaseLawOfficialPrintSheet } from '../components/print/CaseLawOfficialPrintSheet';
import { FlashcardsReviewModal } from '../components/study/FlashcardsReviewModal';

const CATEGORIES = ['Súmula', 'Jurisprudência'] as const;
const VIGENCIAS: CaseLawVigencia[] = ['Vigente', 'Superada', 'Cancelada'];

function normalizeCaseLawCategory(cat?: string): 'Súmula' | 'Jurisprudência' {
  return normalizeSearch(cat || '').includes('sumula') ? 'Súmula' : 'Jurisprudência';
}

export const CaseLawPage: React.FC = () => {
  const {
    db,
    disciplines,
    googleUser,
    moduleVisibility,
    saveCaseLaw,
    updateCaseLawMeta,
    deleteCaseLaw,
    setActivePage,
    openLawAt,
    addToReadingQueue,
    removeFromReadingQueue,
    toggleReadingQueueDone,
    clearReadingQueue,
    toast,
  } = useStudy();
  const hideSearch = moduleVisibility('Súmulas e Jurisprudência').hide_search;

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [categoria, setCategoria] = useState<string>(CATEGORIES[0]);
  const [titulo, setTitulo] = useState('');
  const [tribunal, setTribunal] = useState('STF');
  const [identificador, setIdentificador] = useState('');
  const [materia, setMateria] = useState('');
  const [vigencia, setVigencia] = useState<CaseLawVigencia>('Vigente');
  const [texto, setTexto] = useState('');

  const [filterCat, setFilterCat] = useState('Todas');
  const [filterCourt, setFilterCourt] = useState('Todos');
  const [filterSubject, setFilterSubject] = useState('Todas');
  const [filterVigencia, setFilterVigencia] = useState<'Todas' | CaseLawVigencia>('Todas');
  const [filterStatus, setFilterStatus] = useState<'all' | ContentStudyStatus>('all');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'alpha' | 'court' | 'status'>('recent');
  const [viewMode, setViewMode] = useState<'cards' | 'compact' | 'reader'>('cards');
  const [search, setSearch] = useState('');
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);

  const [clozeRevealSignal, setClozeRevealSignal] = useState(0);
  const [clozeHideSignal, setClozeHideSignal] = useState(0);
  const {
    prefs: readingPrefs,
    stepFontSize,
    cycleLineHeight,
    toggleFontFamily,
    toggleComfortableWidth,
    toggleHighlightExamWords,
    toggleClozeMode,
  } = useLawReadingPrefs();

  const resetForm = () => {
    setEditingId(undefined);
    setCategoria(CATEGORIES[0]);
    setTitulo('');
    setTribunal('STF');
    setIdentificador('');
    setMateria('');
    setVigencia('Vigente');
    setTexto('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !texto.trim()) {
      toast('Preencha o título e o enunciado / tese.', true);
      return;
    }
    saveCaseLaw({
      id: editingId,
      categoria: normalizeCaseLawCategory(categoria),
      titulo: titulo.trim(),
      tribunal: tribunal.trim(),
      identificador: identificador.trim(),
      materia: materia.trim(),
      vigencia,
      fonte: '',
      texto: texto.trim(),
    });
    resetForm();
  };

  const loadForEdit = (item: CaseLawItem) => {
    setEditingId(item.id);
    setCategoria(normalizeCaseLawCategory(item.categoria));
    setTitulo(item.titulo);
    setTribunal(item.tribunal);
    setIdentificador(item.identificador);
    setMateria(item.materia || '');
    setVigencia(item.vigencia || 'Vigente');
    setTexto(item.texto);
    if (viewMode === 'reader') setViewMode('cards');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const courts = useMemo(() => {
    const list = new Set<string>(['STF', 'STJ', 'TST', 'TCU']);
    db.caseLaw.forEach((item) => {
      if (item.tribunal?.trim()) list.add(item.tribunal.trim());
    });
    return Array.from(list);
  }, [db.caseLaw]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    db.caseLaw.forEach((item) => {
      if (item.materia?.trim()) set.add(item.materia.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [db.caseLaw]);

  const subjectSuggestions = useMemo(() => {
    const set = new Set<string>(subjects);
    disciplines.forEach((d) => {
      const clean = visibleName(d);
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [disciplines, subjects]);

  const filtered = useMemo(() => {
    const term = normalizeSearch(search);
    const list = db.caseLaw.filter((item) => {
      const cat = normalizeCaseLawCategory(item.categoria);
      if (filterCat !== 'Todas' && cat !== filterCat) return false;
      if (filterCourt !== 'Todos' && item.tribunal?.toUpperCase() !== filterCourt.toUpperCase()) {
        return false;
      }
      if (filterSubject !== 'Todas' && (item.materia?.trim() || '') !== filterSubject) {
        return false;
      }
      if (filterVigencia !== 'Todas' && (item.vigencia || 'Vigente') !== filterVigencia) {
        return false;
      }
      if (filterStatus !== 'all' && (item.studyStatus || 'a_ler') !== filterStatus) {
        return false;
      }
      if (onlyPinned && !item.pinned) return false;
      if (term) {
        const hay = normalizeSearch(
          `${cat} ${item.titulo} ${item.tribunal} ${item.identificador} ${item.materia || ''} ${item.vigencia || ''} ${item.texto}`,
        );
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      if (sortBy === 'alpha') {
        return (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR');
      }
      if (sortBy === 'court') {
        const c = (a.tribunal || '').localeCompare(b.tribunal || '', 'pt-BR');
        if (c !== 0) return c;
        return (a.identificador || '').localeCompare(b.identificador || '', 'pt-BR');
      }
      if (sortBy === 'status') {
        const s =
          STUDY_STATUS_META[a.studyStatus || 'a_ler'].order -
          STUDY_STATUS_META[b.studyStatus || 'a_ler'].order;
        if (s !== 0) return s;
      }
      return (b.atualizado_em || b.criado_em || '').localeCompare(
        a.atualizado_em || a.criado_em || '',
      );
    });
  }, [
    db.caseLaw,
    filterCat,
    filterCourt,
    filterStatus,
    filterSubject,
    filterVigencia,
    onlyPinned,
    search,
    sortBy,
  ]);

  const holderName = googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal';
  const filterSummary = [
    filterCourt !== 'Todos' ? `Tribunal: ${filterCourt}` : 'Todos os tribunais',
    filterCat !== 'Todas' ? filterCat : 'Súmulas e Jurisprudência',
    filterSubject !== 'Todas' ? `Matéria: ${filterSubject}` : '',
    filterVigencia !== 'Todas' ? `Situação: ${filterVigencia}` : '',
    search.trim() ? `Busca: "${search.trim()}"` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div data-print-hide="true" className="print:hidden">
        <PageHeader
          eyebrow="CORTE SUPERIOR · JURISPRUDÊNCIA"
          title="Súmulas, teses e jurisprudência"
          description="Catálogo consolidado de súmulas vinculantes, teses de repercussão e entendimentos relevantes dos tribunais superiores."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ReadingQueueButton
                queue={db.preferences.reading_queue || []}
                onToggleDone={toggleReadingQueueDone}
                onRemove={removeFromReadingQueue}
                onClearDone={() => clearReadingQueue(true)}
                onOpenItem={(q) => {
                  if (q.kind === 'law' && q.folder) {
                    openLawAt(q.folder);
                  } else if (q.kind === 'summary') {
                    setActivePage('Resumos & Mapas');
                  } else if (q.kind === 'pdf') {
                    setActivePage('PDFs Pessoais');
                  } else if (q.kind === 'caselaw') {
                    setSearch(q.title);
                    setViewMode('reader');
                  }
                }}
              />
              <button
                type="button"
                disabled={filtered.length === 0}
                onClick={() => setViewMode((m) => (m === 'reader' ? 'cards' : 'reader'))}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-[12px] font-bold transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer ${
                  viewMode === 'reader'
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                {viewMode === 'reader' ? 'Sair da Leitura Contínua' : 'Leitura Contínua'}
              </button>
              <button
                type="button"
                disabled={db.caseLaw.length === 0}
                onClick={() => setFlashcardsOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[12px] font-bold hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Flashcards (SRS)
              </button>
              <button
                type="button"
                disabled={filtered.length === 0}
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir (A4)
              </button>
            </div>
          }
        />

        {viewMode !== 'reader' && (
          <Panel
            title={editingId ? 'Editar referência' : 'Cadastrar súmula ou jurisprudência'}
            className="mb-4"
          >
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Categoria
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="ce-select"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Tribunal / Órgão
                </label>
                <input
                  type="text"
                  value={tribunal}
                  onChange={(e) => setTribunal(e.target.value)}
                  placeholder="STF, STJ, TST, TCU..."
                  className="ce-input"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Número / Tema
                </label>
                <input
                  type="text"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  placeholder="Ex.: Súmula Vinculante 13, Tema 1.077"
                  className="ce-input"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Matéria / Ramo do Direito
                </label>
                <input
                  type="text"
                  list="caselaw-subjects-datalist"
                  value={materia}
                  onChange={(e) => setMateria(e.target.value)}
                  placeholder="Ex.: Direito Administrativo"
                  className="ce-input"
                />
                <datalist id="caselaw-subjects-datalist">
                  {subjectSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Situação / Vigência
                </label>
                <select
                  value={vigencia}
                  onChange={(e) => setVigencia(e.target.value as CaseLawVigencia)}
                  className="ce-select"
                >
                  {VIGENCIAS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Título resumido *
                </label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Vedação ao nepotismo na Administração"
                  className="ce-input"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Texto oficial / Tese firmada *
                </label>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={3}
                  placeholder="Texto integral da súmula ou síntese da decisão..."
                  className="ce-textarea"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap cursor-pointer"
                  >
                    Cancelar edição
                  </button>
                )}
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {editingId ? 'Salvar alterações' : 'Adicionar referência'}
                </button>
              </div>
            </form>
          </Panel>
        )}

        {/* Filters & View Switcher */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            aria-label="Filtrar por tribunal"
            value={filterCourt}
            onChange={(e) => setFilterCourt(e.target.value)}
            className="ce-select w-auto min-w-[130px] h-[34px] text-[12px]"
          >
            <option value="Todos">Tribunal: Todos</option>
            {courts.map((court) => (
              <option key={court} value={court}>
                {court}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por categoria"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="ce-select w-auto min-w-[155px] h-[34px] text-[12px]"
          >
            <option value="Todas">Categorias: Todas ({db.caseLaw.length})</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {subjects.length > 0 && (
            <select
              aria-label="Filtrar por matéria"
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="ce-select w-auto min-w-[150px] h-[34px] text-[12px]"
            >
              <option value="Todas">Matéria: Todas</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Filtrar por vigência"
            value={filterVigencia}
            onChange={(e) => setFilterVigencia(e.target.value as 'Todas' | CaseLawVigencia)}
            className="ce-select w-auto h-[34px] text-[12px]"
          >
            <option value="Todas">Vigência: Todas</option>
            {VIGENCIAS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por status de estudo"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | ContentStudyStatus)}
            className="ce-select w-auto h-[34px] text-[12px]"
          >
            <option value="all">Status: Todos</option>
            {STUDY_STATUS_LIST.map((st) => (
              <option key={st} value={st}>
                {STUDY_STATUS_META[st].label}
              </option>
            ))}
          </select>

          <select
            aria-label="Ordenar súmulas"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as 'recent' | 'alpha' | 'court' | 'status')
            }
            className="ce-select w-auto h-[34px] text-[12px]"
          >
            <option value="recent">Mais recentes</option>
            <option value="court">Por tribunal</option>
            <option value="alpha">Ordem alfabética</option>
            <option value="status">Por status</option>
          </select>

          <button
            type="button"
            onClick={() => setOnlyPinned((v) => !v)}
            className={`h-[34px] px-2.5 rounded-lg border text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
              onlyPinned
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            Fixadas
          </button>

          {!hideSearch && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar tribunal, número, matéria ou tese..."
                className="ce-input pl-8 h-[34px] text-[12px]"
              />
            </div>
          )}

          <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-bold cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Cartões
            </button>
            <button
              type="button"
              onClick={() => setViewMode('compact')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-bold cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Compacta
            </button>
            <button
              type="button"
              onClick={() => setViewMode('reader')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-bold cursor-pointer ${
                viewMode === 'reader'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Leitura
            </button>
          </div>
        </div>

        {/* VIEW 1: CONTINUOUS READING STREAM WITH TYPOGRAPHY + CLOZE */}
        {viewMode === 'reader' ? (
          <div>
            <LawReadingToolbar
              prefs={readingPrefs}
              onStepFontSize={stepFontSize}
              onCycleLineHeight={cycleLineHeight}
              onToggleFontFamily={toggleFontFamily}
              onToggleComfortableWidth={toggleComfortableWidth}
              onToggleHighlightExamWords={toggleHighlightExamWords}
              showClozeModeToggle
              onToggleClozeMode={toggleClozeMode}
              onClozeRevealAll={() => setClozeRevealSignal((n) => n + 1)}
              onClozeHideAll={() => setClozeHideSignal((n) => n + 1)}
            />

            {filtered.length > 0 ? (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-5 py-6 sm:px-8">
                <div
                  className={
                    readingPrefs.comfortableWidth ? 'max-w-[68ch] mx-auto' : 'max-w-[92ch] mx-auto'
                  }
                  style={{
                    fontSize: FONT_SIZE_PX[readingPrefs.fontSize],
                    lineHeight: LINE_HEIGHT_VAL[readingPrefs.lineHeight],
                    fontFamily: FONT_FAMILY_CSS[readingPrefs.fontFamily],
                  }}
                >
                  <div className="divide-y divide-[var(--line)]">
                    {filtered.map((item, idx) => {
                      const cat = normalizeCaseLawCategory(item.categoria);
                      const vig = item.vigencia || 'Vigente';
                      return (
                        <article key={item.id} className="py-5 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--muted)] tabular-nums">
                              <span className="font-mono-num font-bold text-[var(--accent)]">
                                {String(idx + 1).padStart(2, '0')}.
                              </span>
                              <span className="font-bold text-[var(--text)]">{cat}</span>
                              {item.tribunal && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-bold text-[var(--text)]">{item.tribunal}</span>
                                </>
                              )}
                              {item.identificador && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{item.identificador}</span>
                                </>
                              )}
                              {item.materia && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{item.materia}</span>
                                </>
                              )}
                              {vig !== 'Vigente' && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-bold text-[var(--bad)]">{vig}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <PinToggleButton
                                pinned={item.pinned}
                                onToggle={() =>
                                  updateCaseLawMeta(item.id, { pinned: !item.pinned })
                                }
                              />
                              <StudyStatusSelect
                                value={item.studyStatus}
                                onChange={(next) =>
                                  updateCaseLawMeta(item.id, { studyStatus: next })
                                }
                                compact
                              />
                            </div>
                          </div>

                          <h3 className="m-0 mb-2 font-display text-[1.12em] font-bold text-[var(--text)] leading-snug">
                            {item.titulo}
                          </h3>

                          <p className="m-0 text-[var(--text)] whitespace-pre-line break-words">
                            {readingPrefs.clozeMode ? (
                              <LawClozeText
                                text={item.texto}
                                scopeKey={`caselaw-reader-${item.id}`}
                                revealAllSignal={clozeRevealSignal}
                                hideAllSignal={clozeHideSignal}
                              />
                            ) : (
                              renderLawTextWithExamHighlights(
                                item.texto,
                                readingPrefs.highlightExamWords,
                              )
                            )}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState message="Nenhuma súmula ou jurisprudência encontrada para esta busca." />
            )}
          </div>
        ) : viewMode === 'compact' ? (
          filtered.length > 0 ? (
            <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden">
              {filtered.map((item) => {
                const cat = normalizeCaseLawCategory(item.categoria);
                const vig = item.vigencia || 'Vigente';
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 hover:bg-[var(--panel)] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-[min(100%,260px)] flex-1">
                      <PinToggleButton
                        pinned={item.pinned}
                        onToggle={() => updateCaseLawMeta(item.id, { pinned: !item.pinned })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-[var(--text)] truncate">
                          {item.titulo}
                        </div>
                        <div className="text-[11.5px] text-[var(--muted)] truncate">
                          {cat}
                          {item.tribunal ? ` · ${item.tribunal}` : ''}
                          {item.identificador ? ` · ${item.identificador}` : ''}
                          {item.materia ? ` · ${item.materia}` : ''}
                          {vig !== 'Vigente' ? ` · ${vig}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <StudyStatusSelect
                        value={item.studyStatus}
                        onChange={(next) => updateCaseLawMeta(item.id, { studyStatus: next })}
                        compact
                      />
                      <button
                        type="button"
                        onClick={() =>
                          addToReadingQueue({
                            kind: 'caselaw',
                            title: item.titulo,
                            subtitle: [item.tribunal, item.identificador].filter(Boolean).join(' · '),
                            itemId: item.id,
                          })
                        }
                        title="Adicionar à Fila de Leitura"
                        className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => loadForEdit(item)}
                        className="inline-flex items-center gap-1 h-[28px] px-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCaseLaw(item.id)}
                        className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--bad)] hover:border-[var(--bad)] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="Nenhuma súmula ou jurisprudência cadastrada para esta busca." />
          )
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.length ? (
              filtered.map((item) => {
                const cat = normalizeCaseLawCategory(item.categoria);
                const vig = item.vigencia || 'Vigente';
                return (
                  <Panel
                    key={item.id}
                    className={item.pinned ? 'border-[var(--accent)]/60' : undefined}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <div className="min-w-[min(100%,240px)] flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1 text-[12px] text-[var(--muted)]">
                          <span className="font-bold text-[var(--accent)]">{cat}</span>
                          {item.tribunal && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-[var(--text)]">{item.tribunal}</span>
                            </>
                          )}
                          {item.identificador && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.identificador}</span>
                            </>
                          )}
                          {item.materia && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{item.materia}</span>
                            </>
                          )}
                          {vig !== 'Vigente' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-bold text-[var(--bad)]">{vig}</span>
                            </>
                          )}
                        </div>
                        <h3 className="m-0 font-display text-[15px] font-bold leading-snug text-[var(--text)] text-left">
                          {item.titulo}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <PinToggleButton
                          pinned={item.pinned}
                          onToggle={() => updateCaseLawMeta(item.id, { pinned: !item.pinned })}
                        />
                        <StudyStatusSelect
                          value={item.studyStatus}
                          onChange={(next) => updateCaseLawMeta(item.id, { studyStatus: next })}
                          compact
                        />
                        <button
                          type="button"
                          onClick={() =>
                            addToReadingQueue({
                              kind: 'caselaw',
                              title: item.titulo,
                              subtitle: [item.tribunal, item.identificador]
                                .filter(Boolean)
                                .join(' · '),
                              itemId: item.id,
                            })
                          }
                          title="Adicionar à Fila de Leitura"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                        >
                          <ListPlus className="w-3 h-3 text-[var(--accent)]" />
                          Na Fila
                        </button>
                        <button
                          type="button"
                          onClick={() => loadForEdit(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCaseLaw(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Excluir
                        </button>
                      </div>
                    </div>

                    <StructuredLegalText
                      text={item.texto}
                      className="text-[13.5px] text-[var(--text)]"
                    />
                  </Panel>
                );
              })
            ) : (
              <EmptyState message="Nenhuma súmula ou jurisprudência cadastrada para esta busca." />
            )}
          </div>
        )}
      </div>

      <CaseLawOfficialPrintSheet
        items={filtered}
        filterSummary={filterSummary}
        holderName={holderName}
      />

      <FlashcardsReviewModal
        open={flashcardsOpen}
        onClose={() => setFlashcardsOpen(false)}
        initialSources={['caselaw']}
      />
    </>
  );
};
