import React, { useMemo, useState } from 'react';
import { Layers, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { normalizeSearch } from '../lib/parsers';
import { CaseLawItem } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { CaseLawOfficialPrintSheet } from '../components/print/CaseLawOfficialPrintSheet';
import { FlashcardsReviewModal } from '../components/study/FlashcardsReviewModal';

const CATEGORIES = ['Súmula', 'Jurisprudência'] as const;

function normalizeCaseLawCategory(cat?: string): 'Súmula' | 'Jurisprudência' {
  return normalizeSearch(cat || '').includes('sumula') ? 'Súmula' : 'Jurisprudência';
}

export const CaseLawPage: React.FC = () => {
  const { db, googleUser, moduleVisibility, saveCaseLaw, deleteCaseLaw, toast } = useStudy();
  const hideSearch = moduleVisibility('Súmulas e Jurisprudência').hide_search;

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [categoria, setCategoria] = useState<string>(CATEGORIES[0]);
  const [titulo, setTitulo] = useState('');
  const [tribunal, setTribunal] = useState('STF');
  const [identificador, setIdentificador] = useState('');
  const [texto, setTexto] = useState('');

  const [filterCat, setFilterCat] = useState('Todas');
  const [filterCourt, setFilterCourt] = useState('Todos');
  const [search, setSearch] = useState('');
  const [flashcardsOpen, setFlashcardsOpen] = useState(false);

  const resetForm = () => {
    setEditingId(undefined);
    setCategoria(CATEGORIES[0]);
    setTitulo('');
    setTribunal('STF');
    setIdentificador('');
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
    setTexto(item.texto);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const courts = useMemo(() => {
    const list = new Set<string>(['STF', 'STJ', 'TST']);
    db.caseLaw.forEach((item) => {
      if (item.tribunal?.trim()) list.add(item.tribunal.trim());
    });
    return Array.from(list);
  }, [db.caseLaw]);

  const filtered = useMemo(() => {
    const term = normalizeSearch(search);
    return db.caseLaw.filter((item) => {
      const cat = normalizeCaseLawCategory(item.categoria);
      if (filterCat !== 'Todas' && cat !== filterCat) return false;
      if (filterCourt !== 'Todos' && item.tribunal?.toUpperCase() !== filterCourt.toUpperCase()) return false;
      if (term) {
        const hay = normalizeSearch(
          `${cat} ${item.titulo} ${item.tribunal} ${item.identificador} ${item.texto}`,
        );
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [db.caseLaw, filterCat, filterCourt, search]);

  const holderName = googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal';
  const filterSummary = [
    filterCourt !== 'Todos' ? `Tribunal: ${filterCourt}` : 'Todos os tribunais',
    filterCat !== 'Todas' ? filterCat : 'Súmulas e Jurisprudência',
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
              <button
                type="button"
                disabled={db.caseLaw.length === 0}
                onClick={() => setFlashcardsOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[12px] font-bold hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Estudar em Flashcards (SRS)
              </button>
              <button
                type="button"
                disabled={filtered.length === 0}
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Folha Oficial (A4)
              </button>
            </div>
          }
        />

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
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Título resumido
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
              Texto oficial / Tese firmada
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
                className="px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap"
              >
                Cancelar edição
              </button>
            )}
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {editingId ? 'Salvar alterações' : 'Adicionar referência'}
            </button>
          </div>
        </form>
      </Panel>

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select
          aria-label="Filtrar por tribunal"
          value={filterCourt}
          onChange={(e) => setFilterCourt(e.target.value)}
          className="ce-select w-auto min-w-[140px]"
        >
          <option value="Todos">Tribunais: Todos</option>
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
          className="ce-select w-auto min-w-[180px]"
        >
          <option value="Todas">Categorias: Todas ({db.caseLaw.length})</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {!hideSearch && (
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por tribunal, número, título ou texto..."
              className="ce-input pl-8"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {filtered.length ? (
          filtered.map((item) => {
            const cat = normalizeCaseLawCategory(item.categoria);
            return (
              <Panel key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[10.5px] font-bold text-[var(--accent)]">
                        {cat}
                      </span>
                      {item.tribunal && (
                        <span className="text-[12px] font-bold text-[var(--text)]">
                          {item.tribunal}
                        </span>
                      )}
                      {item.identificador && (
                        <span className="text-[12px] text-[var(--muted)]">
                          · {item.identificador}
                        </span>
                      )}
                    </div>
                    <h3 className="m-0 font-display text-[15px] font-bold text-[var(--text)]">
                      {item.titulo}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => loadForEdit(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Pencil className="w-3 h-3" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCaseLaw(item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                    >
                      <Trash2 className="w-3 h-3" />
                      Excluir
                    </button>
                  </div>
                </div>

                <p className="m-0 text-[13.5px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                  {item.texto}
                </p>
              </Panel>
            );
          })
        ) : (
          <EmptyState message="Nenhuma súmula ou jurisprudência cadastrada para esta busca." />
        )}
      </div>
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
