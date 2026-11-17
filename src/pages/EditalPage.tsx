import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  CheckSquare,
  Download,
  FileText,
  FileUp,
  Link2,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { analyzeEditalWithAi } from '../lib/aiApi';
import {
  WEEKDAYS,
  itemMatchesMultiArticleSpec,
  normalizeSearch,
  parseEditalTopicsText,
  parseMultiArticleSpec,
  visibleName,
} from '../lib/parsers';
import { ContestEditalPoint, EditalLawLink, WeekdayName } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

export const EditalPage: React.FC = () => {
  const {
    db,
    setActivePage,
    selectedEditalContestId,
    setSelectedEditalContestId,
    saveContestEditalPoints,
    importContestEditalFile,
    toggleContestEditalPoint,
    setContestEditalPointsStudied,
    updateContestEditalPoint,
    deleteContestEditalPoint,
    linkEditalPointToLaw,
    unlinkEditalPointFromLaw,
    openLawAt,
    clearContestEdital,
    syncContestsAndEditaisTxtToFolder,
    addTopicToDay,
    toast,
  } = useStudy();

  const contests = db.contests;

  // Resolve active contest (prefer selected, then first with edital, then first overall)
  const activeContest = useMemo(() => {
    if (!contests.length) return null;
    if (selectedEditalContestId) {
      const found = contests.find((c) => c.id === selectedEditalContestId);
      if (found) return found;
    }
    return contests.find((c) => (c.edital_pontos?.length || 0) > 0) || contests[0];
  }, [contests, selectedEditalContestId]);

  useEffect(() => {
    if (activeContest && activeContest.id !== selectedEditalContestId) {
      setSelectedEditalContestId(activeContest.id);
    }
  }, [activeContest, selectedEditalContestId, setSelectedEditalContestId]);

  // Input mode for adding points
  const [inputMode, setInputMode] = useState<'single' | 'batch'>('single');
  const [singleSubject, setSingleSubject] = useState('');
  const [singleTitle, setSingleTitle] = useState('');
  const [singleNote, setSingleNote] = useState('');

  const [batchDefaultSubject, setBatchDefaultSubject] = useState('Geral');
  const [batchText, setBatchText] = useState('');
  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [aiExtracting, setAiExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'studied'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Inline point editing
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');

  // Inline schedule assignment
  const [schedulePointId, setSchedulePointId] = useState<string | null>(null);
  const [scheduleDay, setScheduleDay] = useState<WeekdayName>(() => WEEKDAYS[(new Date().getDay() + 6) % 7]);
  const [scheduleTime, setScheduleTime] = useState('1h');

  // Inline Lei Seca association
  const lawFolders = useMemo(
    () => Object.keys(db.laws).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [db.laws],
  );
  const [linkPointId, setLinkPointId] = useState<string | null>(null);
  const [linkLawFolder, setLinkLawFolder] = useState<string>('');
  const [linkArticleSpec, setLinkArticleSpec] = useState<string>('');

  const resolvedLinkLawFolder = lawFolders.includes(linkLawFolder)
    ? linkLawFolder
    : lawFolders[0] || '';

  const linkPreviewMatchCount = useMemo(() => {
    const q = linkArticleSpec.trim();
    if (!q || !resolvedLinkLawFolder) return null;
    const items = db.laws[resolvedLinkLawFolder]?.items || [];
    const spec = parseMultiArticleSpec(q);
    if (spec.exactKeys.size > 0) {
      return items.filter((it) => itemMatchesMultiArticleSpec(it, spec)).length;
    }
    const normQ = normalizeSearch(q);
    return items.filter((it) =>
      normalizeSearch(`${it.artigo_base || ''} ${it.dispositivo} ${it.texto}`).includes(normQ),
    ).length;
  }, [db.laws, linkArticleSpec, resolvedLinkLawFolder]);

  const getLawLinkStats = (link: EditalLawLink) => {
    const folder = db.laws[link.pastaLei];
    if (!folder) return { exists: false, matched: 0, read: 0 };
    const readSet = new Set(db.readLawItems?.[link.pastaLei] || []);
    const spec = parseMultiArticleSpec(link.filtroArtigos);
    const matchedItems =
      spec.exactKeys.size > 0
        ? folder.items.filter((it) => itemMatchesMultiArticleSpec(it, spec))
        : folder.items.filter((it) =>
            normalizeSearch(`${it.artigo_base || ''} ${it.dispositivo} ${it.texto}`).includes(
              normalizeSearch(link.filtroArtigos),
            ),
          );
    const readCount = matchedItems.filter((it) => readSet.has(it.id)).length;
    return { exists: true, matched: matchedItems.length, read: readCount };
  };

  // Reset subject filter & inline edit when switching contest
  useEffect(() => {
    setSubjectFilter('all');
    setEditingPointId(null);
    setSchedulePointId(null);
    setLinkPointId(null);
  }, [activeContest?.id]);

  const points = activeContest?.edital_pontos || [];

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const pt of points) {
      const key = normalizeSearch(pt.materia || 'Geral');
      if (!map.has(key)) {
        map.set(key, pt.materia || 'Geral');
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [points]);

  const stats = useMemo(() => {
    const total = points.length;
    const studied = points.filter((p) => p.estudado).length;
    const pending = total - studied;
    const pct = total > 0 ? Math.round((studied / total) * 100) : 0;
    return { total, studied, pending, pct };
  }, [points]);

  const filteredPoints = useMemo(() => {
    const q = normalizeSearch(searchTerm);
    return points.filter((pt) => {
      if (statusFilter === 'studied' && !pt.estudado) return false;
      if (statusFilter === 'pending' && pt.estudado) return false;
      if (subjectFilter !== 'all' && normalizeSearch(pt.materia) !== normalizeSearch(subjectFilter)) {
        return false;
      }
      if (q) {
        const hay = normalizeSearch(`${pt.materia} ${pt.titulo} ${pt.observacao || ''}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [points, searchTerm, statusFilter, subjectFilter]);

  const groupedBySubject = useMemo(() => {
    const groups = new Map<string, ContestEditalPoint[]>();
    for (const pt of filteredPoints) {
      const label = pt.materia?.trim() || 'Geral';
      const existing = groups.get(label);
      if (existing) {
        existing.push(pt);
      } else {
        groups.set(label, [pt]);
      }
    }
    return Array.from(groups.entries());
  }, [filteredPoints]);

  const parsedBatchPreview = useMemo(
    () => parseEditalTopicsText(batchText, batchDefaultSubject.trim() || 'Geral'),
    [batchText, batchDefaultSubject],
  );

  const handleAddSinglePoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContest) return;
    if (!singleTitle.trim()) {
      toast('Informe o ponto/tópico do edital.', true);
      return;
    }
    const added = saveContestEditalPoints(
      activeContest.id,
      [
        {
          materia: singleSubject.trim() || 'Geral',
          titulo: singleTitle.trim(),
          observacao: singleNote.trim() || undefined,
        },
      ],
      { replace: false },
    );
    if (added > 0) {
      setSingleTitle('');
      setSingleNote('');
    }
  };

  const handleImportBatchText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContest) return;
    if (!parsedBatchPreview.length) {
      toast('Cole ao menos um ponto de edital para importar.', true);
      return;
    }
    const added = saveContestEditalPoints(activeContest.id, parsedBatchPreview, {
      replace: replaceOnImport,
    });
    if (added > 0 || replaceOnImport) {
      setBatchText('');
      setReplaceOnImport(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeContest) return;
    setUploadingFile(true);
    try {
      await importContestEditalFile(activeContest.id, file, {
        replace: replaceOnImport,
        defaultSubject: batchDefaultSubject.trim() || 'Geral',
      });
      setReplaceOnImport(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao importar arquivo do edital.', true);
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleAiExtractBatch = async () => {
    if (!activeContest) return;
    const clean = batchText.trim();
    if (clean.length < 10) {
      toast('Cole o texto do edital na caixa abaixo para estruturar com IA.', true);
      return;
    }
    setAiExtracting(true);
    try {
      const { topics } = await analyzeEditalWithAi({
        text: clean,
        defaultSubject: batchDefaultSubject.trim() || 'Geral',
        contestName: activeContest.concurso,
      });
      if (!topics.length) {
        toast('Nenhum tópico programático identificado no texto enviado.', true);
        return;
      }
      const added = saveContestEditalPoints(activeContest.id, topics, {
        replace: replaceOnImport,
      });
      if (added > 0 || replaceOnImport) {
        setBatchText('');
        setReplaceOnImport(false);
      }
      toast(`${topics.length} tópico(s) estruturado(s) com IA.`);
    } catch (err) {
      toast((err as Error).message || 'Falha ao analisar edital com IA.', true);
    } finally {
      setAiExtracting(false);
    }
  };

  const startEditPoint = (pt: ContestEditalPoint) => {
    setEditingPointId(pt.id);
    setEditSubject(pt.materia);
    setEditTitle(pt.titulo);
    setEditNote(pt.observacao || '');
  };

  const saveEditPoint = (pointId: string) => {
    if (!activeContest) return;
    if (!editTitle.trim()) {
      toast('O título do ponto não pode ficar vazio.', true);
      return;
    }
    updateContestEditalPoint(activeContest.id, pointId, {
      materia: editSubject.trim() || 'Geral',
      titulo: editTitle.trim(),
      observacao: editNote.trim(),
    });
    setEditingPointId(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="DIÁRIO DE EDITAIS · ARQUIVOS .TXT"
        title="Editais dos concursos e pontos estudados"
        description="Cada edital e o cumprimento dos pontos programáticos são gravados automaticamente em arquivo .txt na pasta Editais (local e Google Drive), integrados com Protocolo & GRUs."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeContest && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void syncContestsAndEditaisTxtToFolder({
                      contestId: activeContest.id,
                      silent: false,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar Edital na pasta (.txt)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void syncContestsAndEditaisTxtToFolder({
                      contestId: activeContest.id,
                      downloadEditalContestId: activeContest.id,
                      silent: false,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Baixar Edital (.txt)
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setActivePage('Datas & Locais')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <MapPin className="w-4 h-4 text-[var(--accent)]" />
              Gerenciar Protocolo &amp; GRUs
            </button>
          </div>
        }
      />

      {!contests.length || !activeContest ? (
        <Panel>
          <EmptyState message="Nenhum concurso cadastrado em Protocolo & GRUs ainda." />
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setActivePage('Datas & Locais')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)]"
            >
              <Plus className="w-4 h-4" />
              Cadastrar concurso em Protocolo &amp; GRUs
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Selecione o concurso" className="mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {contests.map((c) => {
                const cPoints = c.edital_pontos || [];
                const cTotal = cPoints.length;
                const cDone = cPoints.filter((p) => p.estudado).length;
                const cPct = cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0;
                const isSelected = c.id === activeContest.id;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedEditalContestId(c.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-xs'
                        : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-[13px] font-bold text-[var(--text)] leading-snug line-clamp-2">
                        {c.concurso}
                      </strong>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-md text-[10.5px] font-bold font-mono-num border ${
                          cTotal === 0
                            ? 'border-[var(--line)] bg-[var(--panel-raised)] text-[var(--muted)]'
                            : cPct === 100
                              ? 'border-[var(--good)]/50 bg-[var(--good)]/12 text-[var(--good)]'
                              : 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]'
                        }`}
                      >
                        {cTotal > 0 ? `${cPct}%` : 'Sem edital'}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
                      {c.data_abertura && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-[var(--accent)]" />
                          {c.data_abertura}
                        </span>
                      )}
                      <span>
                        {cTotal > 0 ? `${cDone}/${cTotal} pontos` : 'Clique para adicionar pontos'}
                      </span>
                    </div>

                    {cTotal > 0 && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--panel-raised)] overflow-hidden">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${cPct}%`,
                            backgroundColor: cPct === 100 ? 'var(--good)' : 'var(--accent)',
                          }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Active contest header + progress KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
            <article className="ce-panel p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Total de pontos</div>
              <div className="font-mono-num text-[26px] font-extrabold text-[var(--text)] mt-1">
                {stats.total}
              </div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
                {subjects.length} matéria(s) no edital
              </div>
            </article>
            <article className="ce-panel p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Pontos estudados</div>
              <div className="font-mono-num text-[26px] font-extrabold text-[var(--good)] mt-1">
                {stats.studied}
              </div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">Concluídos no edital</div>
            </article>
            <article className="ce-panel p-4">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Pendentes</div>
              <div className="font-mono-num text-[26px] font-extrabold text-[var(--warning)] mt-1">
                {stats.pending}
              </div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5">Restantes para estudar</div>
            </article>
            <article className="ce-panel p-4">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--muted)]">
                <span>Progresso geral</span>
                <span className="font-mono-num font-bold text-[var(--accent)]">{stats.pct}%</span>
              </div>
              <div className="font-mono-num text-[26px] font-extrabold text-[var(--accent)] mt-1">
                {stats.pct}%
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-[var(--panel-soft)] border border-[var(--line)] overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${stats.pct}%`,
                    backgroundColor: stats.pct === 100 ? 'var(--good)' : 'var(--accent)',
                  }}
                />
              </div>
            </article>
          </div>

          {/* Add / Import points */}
          <Panel
            title={`Adicionar pontos ao edital · ${activeContest.concurso}`}
            action={
              <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                <button
                  type="button"
                  onClick={() => setInputMode('single')}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-colors ${
                    inputMode === 'single'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Ponto único
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('batch')}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-colors ${
                    inputMode === 'batch'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Em lote / Arquivo
                </button>
              </div>
            }
            className="mb-4"
          >
            {(activeContest.local_prova || activeContest.edital_arquivo) && (
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--muted)]">
                {activeContest.local_prova && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                    {activeContest.local_prova}
                  </span>
                )}
                {activeContest.edital_arquivo && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Arquivo associado: <strong className="text-[var(--text)]">{activeContest.edital_arquivo}</strong>
                  </span>
                )}
              </div>
            )}

            {inputMode === 'single' ? (
              <form onSubmit={handleAddSinglePoint} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Matéria / Disciplina
                  </label>
                  <input
                    type="text"
                    list="edital-subjects-list"
                    value={singleSubject}
                    onChange={(e) => setSingleSubject(e.target.value)}
                    placeholder="Ex.: Direito Constitucional"
                    className="ce-input"
                  />
                  <datalist id="edital-subjects-list">
                    {subjects.map((subj) => (
                      <option key={subj} value={subj} />
                    ))}
                  </datalist>
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Ponto / Tópico do edital
                  </label>
                  <input
                    type="text"
                    value={singleTitle}
                    onChange={(e) => setSingleTitle(e.target.value)}
                    placeholder="Ex.: Controle de constitucionalidade (ADPF, ADI, ADC)"
                    className="ce-input"
                  />
                </div>
                <div className="sm:col-span-4 flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                      Observação (opcional)
                    </label>
                    <input
                      type="text"
                      value={singleNote}
                      onChange={(e) => setSingleNote(e.target.value)}
                      placeholder="Aula, livro ou lei..."
                      className="ce-input"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleImportBatchText} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                      Matéria padrão (se não houver cabeçalho no texto)
                    </label>
                    <input
                      type="text"
                      value={batchDefaultSubject}
                      onChange={(e) => setBatchDefaultSubject(e.target.value)}
                      placeholder="Ex.: Geral"
                      className="ce-input"
                    />
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-2 pb-1">
                    <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replaceOnImport}
                        onChange={(e) => setReplaceOnImport(e.target.checked)}
                        className="rounded border-[var(--line-strong)] accent-[var(--accent)]"
                      />
                      Substituir edital atual
                    </label>

                    <input
                      ref={fileRef}
                      type="file"
                      accept=".txt,.md,.pdf"
                      onChange={handleImportFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploadingFile}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60"
                    >
                      <FileUp className="w-3.5 h-3.5 text-[var(--accent)]" />
                      {uploadingFile ? 'Importando...' : 'Importar .txt / .md / .pdf'}
                    </button>
                  </div>
                </div>

                <div>
                  <textarea
                    rows={5}
                    value={batchText}
                    onChange={(e) => setBatchText(e.target.value)}
                    placeholder={`Cole vários tópicos de uma vez (1 por linha). Exemplos:\nDireito Administrativo:\n1. Atos administrativos\n2. Licitações (Lei 14.133/2021)\nDireito Penal | Aplicação da lei penal`}
                    className="ce-input min-h-[115px] py-2 font-mono text-[12px]"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] text-[var(--muted)]">
                    {parsedBatchPreview.length > 0
                      ? `${parsedBatchPreview.length} ponto(s) pronto(s) para importar.`
                      : 'Aceita listas simples, cabeçalhos terminados em ":" ou "Matéria | Ponto".'}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={aiExtracting || !batchText.trim()}
                      onClick={() => void handleAiExtractBatch()}
                      title="Usar análise semântica no servidor para separar matérias e pontos do texto bruto do edital"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-55 whitespace-nowrap"
                    >
                      <Sparkles className={`w-3.5 h-3.5 text-[var(--accent)] ${aiExtracting ? 'animate-pulse' : ''}`} />
                      {aiExtracting ? 'Analisando com IA…' : 'Extrair com IA'}
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Importar pontos do texto
                    </button>
                  </div>
                </div>
              </form>
            )}
          </Panel>

          {/* Filters & Checklist */}
          <Panel
            title="Pontos do edital"
            action={
              points.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {filteredPoints.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setContestEditalPointsStudied(
                            activeContest.id,
                            filteredPoints.map((p) => p.id),
                            true,
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/10 text-[11.5px] font-bold text-[var(--good)] hover:bg-[var(--good)] hover:text-white transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Marcar filtrados
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setContestEditalPointsStudied(
                            activeContest.id,
                            filteredPoints.map((p) => p.id),
                            false,
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                      >
                        Desmarcar filtrados
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => clearContestEdital(activeContest.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar edital
                  </button>
                </div>
              ) : undefined
            }
          >
            {points.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 mb-4">
                <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                  {(
                    [
                      { key: 'all', label: `Todos (${stats.total})` },
                      { key: 'pending', label: `Pendentes (${stats.pending})` },
                      { key: 'studied', label: `Estudados (${stats.studied})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setStatusFilter(tab.key)}
                      className={`px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-colors ${
                        statusFilter === tab.key
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="ce-select w-auto min-w-[180px]"
                  aria-label="Filtrar por matéria do edital"
                >
                  <option value="all">Todas as matérias ({subjects.length})</option>
                  {subjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>

                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar ponto ou observação..."
                    className="ce-input pl-8"
                  />
                </div>
              </div>
            )}

            {points.length === 0 ? (
              <EmptyState message="Este concurso ainda não possui pontos de edital cadastrados. Adicione manualmente ou importe um arquivo acima." />
            ) : groupedBySubject.length === 0 ? (
              <EmptyState message="Nenhum ponto encontrado com os filtros selecionados." />
            ) : (
              <div className="space-y-4">
                {groupedBySubject.map(([subjectName, groupPoints]) => {
                  const gTotal = groupPoints.length;
                  const gDone = groupPoints.filter((p) => p.estudado).length;
                  const gPct = gTotal > 0 ? Math.round((gDone / gTotal) * 100) : 0;
                  const allGroupDone = gDone === gTotal;

                  return (
                    <section
                      key={subjectName}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden"
                    >
                      <header className="px-3.5 py-2.5 border-b border-[var(--line)] bg-[var(--panel-raised)]/70 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <ListChecks className="w-4 h-4 text-[var(--accent)] shrink-0" />
                          <h3 className="m-0 font-display text-[13.5px] font-bold text-[var(--text)] truncate">
                            {subjectName}
                          </h3>
                          <span className="font-mono-num text-[11px] font-bold text-[var(--muted)]">
                            {gDone}/{gTotal} ({gPct}%)
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className="hidden sm:block w-24 h-1.5 rounded-full bg-[var(--panel-soft)] border border-[var(--line)] overflow-hidden">
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${gPct}%`,
                                backgroundColor: gPct === 100 ? 'var(--good)' : 'var(--accent)',
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setContestEditalPointsStudied(
                                activeContest.id,
                                groupPoints.map((p) => p.id),
                                !allGroupDone,
                              )
                            }
                            className="text-[11px] font-bold text-[var(--accent)] hover:underline whitespace-nowrap"
                          >
                            {allGroupDone ? 'Desmarcar matéria' : 'Marcar matéria'}
                          </button>
                        </div>
                      </header>

                      <div className="divide-y divide-[var(--line)]/60">
                        {groupPoints.map((pt) => {
                          const isEditing = editingPointId === pt.id;
                          return (
                            <div
                              key={pt.id}
                              className={`px-3.5 py-2.5 transition-colors ${
                                pt.estudado ? 'bg-[var(--good)]/[0.04]' : 'hover:bg-[var(--panel-raised)]/40'
                              }`}
                            >
                              {isEditing ? (
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                  <input
                                    type="text"
                                    value={editSubject}
                                    onChange={(e) => setEditSubject(e.target.value)}
                                    placeholder="Matéria"
                                    className="ce-input sm:col-span-3 text-[12px]"
                                  />
                                  <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Ponto do edital"
                                    className="ce-input sm:col-span-5 text-[12px]"
                                  />
                                  <input
                                    type="text"
                                    value={editNote}
                                    onChange={(e) => setEditNote(e.target.value)}
                                    placeholder="Observação"
                                    className="ce-input sm:col-span-2 text-[12px]"
                                  />
                                  <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => saveEditPoint(pt.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Salvar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingPointId(null)}
                                      className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]"
                                      aria-label="Cancelar edição"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-start justify-between gap-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleContestEditalPoint(activeContest.id, pt.id)}
                                    className="flex items-start gap-2.5 text-left min-w-0 flex-1 group"
                                    aria-pressed={pt.estudado}
                                  >
                                    {pt.estudado ? (
                                      <CheckSquare className="w-4 h-4 text-[var(--good)] shrink-0 mt-0.5" />
                                    ) : (
                                      <Square className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--accent)] shrink-0 mt-0.5" />
                                    )}
                                      <div className="min-w-0">
                                        <div
                                          className={`text-[13px] font-semibold leading-snug ${
                                            pt.estudado
                                              ? 'line-through text-[var(--muted)]'
                                              : 'text-[var(--text)]'
                                          }`}
                                        >
                                          {pt.titulo}
                                        </div>
                                        {(pt.observacao || pt.estudado) && (
                                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                                            {pt.estudado && (
                                              <span className="px-1.5 py-0.5 rounded border border-[var(--good)]/40 bg-[var(--good)]/10 text-[var(--good)] font-bold">
                                                Estudado{pt.estudado_em ? ` em ${pt.estudado_em}` : ''}
                                              </span>
                                            )}
                                            {pt.observacao && <span>{pt.observacao}</span>}
                                          </div>
                                        )}
                                      </div>
                                    </button>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (linkPointId === pt.id) {
                                            setLinkPointId(null);
                                          } else {
                                            setLinkPointId(pt.id);
                                            setSchedulePointId(null);
                                            setLinkArticleSpec('');
                                            if (!linkLawFolder && lawFolders.length) {
                                              setLinkLawFolder(lawFolders[0]);
                                            }
                                          }
                                        }}
                                        aria-label={`Vincular Lei Seca em ${pt.titulo}`}
                                        title="Vincular artigo(s) da Lei Seca a este ponto do edital"
                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                                          linkPointId === pt.id
                                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                                            : 'border-transparent text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-[var(--panel-raised)] hover:text-[var(--text)]'
                                        }`}
                                      >
                                        <Link2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                                        <span className="hidden md:inline">Lei Seca</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (schedulePointId === pt.id) {
                                            setSchedulePointId(null);
                                          } else {
                                            setSchedulePointId(pt.id);
                                            setLinkPointId(null);
                                            setScheduleTime('1h');
                                          }
                                        }}
                                        aria-label={`Agendar ${pt.titulo} no Cronograma`}
                                        title="Enviar este ponto do edital para o Cronograma semanal"
                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                                          schedulePointId === pt.id
                                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                                            : 'border-transparent text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-[var(--panel-raised)] hover:text-[var(--text)]'
                                        }`}
                                      >
                                        <CalendarPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                                        <span className="hidden md:inline">Cronograma</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => startEditPoint(pt)}
                                        aria-label={`Editar ${pt.titulo}`}
                                        className="p-1.5 rounded-lg border border-transparent hover:border-[var(--line-strong)] hover:bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteContestEditalPoint(activeContest.id, pt.id)}
                                        aria-label={`Excluir ${pt.titulo}`}
                                        className="p-1.5 rounded-lg border border-transparent hover:border-[var(--bad)]/40 hover:bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--bad)]"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  {pt.artigos_vinculados && pt.artigos_vinculados.length > 0 && (
                                    <div className="mt-2 ml-6 flex flex-wrap items-center gap-1.5">
                                      {pt.artigos_vinculados.map((link) => {
                                        const lStats = getLawLinkStats(link);
                                        const artDisplay =
                                          link.label ||
                                          (/^(?:\d|art\b)/i.test(link.filtroArtigos) && !/^art/i.test(link.filtroArtigos)
                                            ? `Art(s). ${link.filtroArtigos}`
                                            : link.filtroArtigos);
                                        return (
                                          <span
                                            key={link.id}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)]/35 bg-[var(--accent-soft)]/70 pl-2 pr-1 py-0.5 text-[11px] text-[var(--text)]"
                                          >
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (!lStats.exists) {
                                                  toast(`A lei "${visibleName(link.pastaLei)}" não foi encontrada na aba Lei Seca.`, true);
                                                  return;
                                                }
                                                openLawAt(link.pastaLei, link.filtroArtigos, { onlyMatches: true });
                                              }}
                                              title={`Abrir ${visibleName(link.pastaLei)} em ${artDisplay} na aba Lei Seca`}
                                              className="inline-flex items-center gap-1 font-bold hover:text-[var(--accent)] transition-colors text-left"
                                            >
                                              <BookOpen className="w-3 h-3 text-[var(--accent)] shrink-0" />
                                              <span>
                                                {visibleName(link.pastaLei)} · {artDisplay}
                                              </span>
                                              {lStats.exists && lStats.matched > 0 && (
                                                <span className="font-mono-num text-[10px] font-semibold text-[var(--muted)]">
                                                  ({lStats.read}/{lStats.matched} lidos)
                                                </span>
                                              )}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => unlinkEditalPointFromLaw(activeContest.id, pt.id, link.id)}
                                              aria-label={`Remover vínculo ${visibleName(link.pastaLei)} ${artDisplay}`}
                                              title="Remover vínculo"
                                              className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--bad)]"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                              {linkPointId === pt.id && !isEditing && (
                                <div className="mt-2.5 pt-2.5 border-t border-[var(--line)]/60 flex flex-wrap items-center gap-2">
                                  {lawFolders.length === 0 ? (
                                    <span className="text-[11.5px] text-[var(--muted)]">
                                      Nenhuma legislação cadastrada ainda na aba Lei Seca / Matriz de Incidência.
                                    </span>
                                  ) : (
                                    <>
                                      <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--text)]">
                                        <Link2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                                        Vincular Lei Seca:
                                      </span>
                                      <select
                                        aria-label="Selecionar lei para vincular"
                                        value={resolvedLinkLawFolder}
                                        onChange={(e) => setLinkLawFolder(e.target.value)}
                                        className="ce-select h-[32px] w-auto max-w-[240px] text-[11.5px] py-0.5"
                                      >
                                        {lawFolders.map((name) => (
                                          <option key={name} value={name}>
                                            {visibleName(name)}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        aria-label="Artigo ou faixa de artigos"
                                        value={linkArticleSpec}
                                        onChange={(e) => setLinkArticleSpec(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (
                                              linkEditalPointToLaw(activeContest.id, pt.id, {
                                                pastaLei: resolvedLinkLawFolder,
                                                filtroArtigos: linkArticleSpec,
                                              })
                                            ) {
                                              setLinkArticleSpec('');
                                              setLinkPointId(null);
                                            }
                                          }
                                        }}
                                        placeholder="Ex.: 5, 37-41 ou 116, 117"
                                        className="ce-input h-[32px] w-[200px] text-[11.5px]"
                                      />
                                      {linkPreviewMatchCount !== null && (
                                        <span className="text-[11px] font-semibold text-[var(--muted)]">
                                          {linkPreviewMatchCount} dispositivo(s)
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (
                                            linkEditalPointToLaw(activeContest.id, pt.id, {
                                              pastaLei: resolvedLinkLawFolder,
                                              filtroArtigos: linkArticleSpec,
                                            })
                                          ) {
                                            setLinkArticleSpec('');
                                            setLinkPointId(null);
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 h-[32px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        Vincular
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setLinkPointId(null)}
                                        className="h-[32px] px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                                      >
                                        Cancelar
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              {schedulePointId === pt.id && !isEditing && (
                                <div className="mt-2.5 pt-2.5 border-t border-[var(--line)]/60 flex flex-wrap items-center gap-2">
                                  <span className="text-[11.5px] font-bold text-[var(--text)]">
                                    Agendar no Cronograma:
                                  </span>
                                  <select
                                    aria-label="Dia da semana para agendar tópico"
                                    value={scheduleDay}
                                    onChange={(e) => setScheduleDay(e.target.value as WeekdayName)}
                                    className="ce-select h-[32px] w-auto text-[11.5px] py-0.5"
                                  >
                                    {WEEKDAYS.map((d) => (
                                      <option key={d} value={d}>
                                        {d}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    aria-label="Tempo previsto no cronograma"
                                    value={scheduleTime}
                                    onChange={(e) => setScheduleTime(e.target.value)}
                                    className="ce-select h-[32px] w-auto text-[11.5px] py-0.5"
                                  >
                                    <option value="30m">30 min</option>
                                    <option value="45m">45 min</option>
                                    <option value="1h">1h</option>
                                    <option value="1h30">1h30</option>
                                    <option value="2h">2h</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      addTopicToDay(scheduleDay, {
                                        materia: pt.materia || 'Geral',
                                        tempo: scheduleTime,
                                        observacoes: `${activeContest.concurso} · Edital: ${pt.titulo}`,
                                      });
                                      toast(`"${pt.titulo}" agendado em ${scheduleDay} (${scheduleTime}).`);
                                      setSchedulePointId(null);
                                    }}
                                    className="inline-flex items-center gap-1 h-[32px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSchedulePointId(null)}
                                    className="h-[32px] px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};
