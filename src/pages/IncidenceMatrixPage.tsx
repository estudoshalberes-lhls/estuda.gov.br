import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  BookmarkPlus,
  CalendarCheck2,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileUp,
  FolderPlus,
  ListFilter,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  formatIsoDateBr,
  formatSequentialDeviceLabel,
  INCIDENCE_GRADES,
  incidenceColorClass,
  itemMatchesMultiArticleSpec,
  localDateIso,
  normalizeSearch,
  parseMultiArticleSpec,
  sortLawItemsInOrder,
  visibleName,
} from '../lib/parsers';
import { exportIncidenceMatrixPdf } from '../lib/pdfExport';
import { clearFieldDraft, readFieldDraft, writeFieldDraft } from '../lib/draftStorage';
import { IncidenceGrade, LawItem, SavedIncidenceFilter } from '../types/study';
import {
  ArticleJumpBar,
  FONT_SIZE_PX,
  LINE_HEIGHT_VAL,
  LawReadingToolbar,
  buildArticleAnchorId,
  renderLawTextWithExamHighlights,
  useLawReadingPrefs,
} from '../components/ui/LawReadingTools';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { IncidenceD3Panels } from '../components/charts/IncidenceD3Panels';

export const IncidenceMatrixPage: React.FC = () => {
  const {
    db,
    moduleVisibility,
    openLawAt,
    openContestEdital,
    unlinkEditalPointFromLaw,
    createLawFolder,
    uploadLawFile,
    addManualLawItem,
    updateLawItem,
    deleteLawItem,
    addLawItemReadDate,
    removeLawItemReadDate,
    setLawLastPosition,
    saveIncidenceFilter,
    deleteIncidenceFilter,
    requestConfirm,
    toast,
  } = useStudy();

  const {
    prefs: readingPrefs,
    stepFontSize,
    cycleLineHeight,
    toggleComfortableWidth,
    toggleHighlightExamWords,
    toggleCleanMode,
  } = useLawReadingPrefs();

  const vis = moduleVisibility('Matriz de Incidência');
  const folderNames = useMemo(
    () => Object.keys(db.laws).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [db.laws],
  );

  const [selectedFolder, setSelectedFolder] = useState<string>(folderNames[0] || '');
  const activeFolder = folderNames.includes(selectedFolder)
    ? selectedFolder
    : folderNames[0] || '';
  const folderData = activeFolder ? db.laws[activeFolder] : undefined;

  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  // Manual device form
  const [manualDevice, setManualDevice] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualTip, setManualTip] = useState('');
  const [manualGrade, setManualGrade] = useState<IncidenceGrade>('Alto');

  // Filter & row draft overrides
  const [search, setSearch] = useState('');
  const [multiArticleQuery, setMultiArticleQuery] = useState('');
  const [selectedArticleKeys, setSelectedArticleKeys] = useState<string[]>([]);
  const [showArticlePicker, setShowArticlePicker] = useState(false);
  const [articlePickerSearch, setArticlePickerSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'Todas' | IncidenceGrade>('Todas');
  const [readStatusFilter, setReadStatusFilter] = useState<
    'all' | 'stale-7' | 'stale-15' | 'stale-30' | 'today'
  >('all');
  const [editalFilterContestId, setEditalFilterContestId] = useState<string>('all');
  const [drafts, setDrafts] = useState<Record<string, { grau: IncidenceGrade; observacao: string }>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const activeFolderRef = useRef(activeFolder);
  activeFolderRef.current = activeFolder;
  const folderItemsRef = useRef(folderData?.items || []);
  folderItemsRef.current = folderData?.items || [];

  const flushRowDrafts = useCallback(() => {
    const folder = activeFolderRef.current;
    if (!folder) return;
    const currentItems = folderItemsRef.current;
    const keysToClear: string[] = [];
    Object.entries(draftsRef.current).forEach(([itemId, d]) => {
      const target = currentItems.find((it) => it.id === itemId);
      if (!target) return;
      if (target.grau !== d.grau || (target.observacao || '').trim() !== d.observacao.trim()) {
        updateLawItem(folder, itemId, d.grau, d.observacao, undefined, undefined, undefined, true);
      }
      clearFieldDraft(`law_obs_${folder}_${itemId}`);
      keysToClear.push(itemId);
    });
    if (keysToClear.length > 0) {
      setDrafts((prev) => {
        const next = { ...prev };
        keysToClear.forEach((id) => {
          delete next[id];
        });
        return next;
      });
    }
  }, [updateLawItem]);

  useEffect(() => {
    if (Object.keys(drafts).length === 0) return;
    const timer = window.setTimeout(() => flushRowDrafts(), 1000);
    return () => window.clearTimeout(timer);
  }, [drafts, flushRowDrafts]);

  useEffect(() => {
    const handleFlush = () => flushRowDrafts();
    window.addEventListener('central-estudos:flush-drafts', handleFlush);
    window.addEventListener('beforeunload', handleFlush);
    window.addEventListener('pagehide', handleFlush);
    return () => {
      window.removeEventListener('central-estudos:flush-drafts', handleFlush);
      window.removeEventListener('beforeunload', handleFlush);
      window.removeEventListener('pagehide', handleFlush);
      handleFlush();
    };
  }, [flushRowDrafts]);

  // Saved filters UI state
  const [showSaveFilterForm, setShowSaveFilterForm] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [saveFilterLaw, setSaveFilterLaw] = useState('');
  const [activeSavedFilterId, setActiveSavedFilterId] = useState<string | null>(null);
  const skipResetOnFolderSwitchRef = useRef(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [dateFormItemId, setDateFormItemId] = useState<string | null>(null);
  const [itemReadDateInput, setItemReadDateInput] = useState<string>(() => localDateIso());
  const [itemReadDateNote, setItemReadDateNote] = useState('');

  useEffect(() => {
    if (skipResetOnFolderSwitchRef.current) {
      skipResetOnFolderSwitchRef.current = false;
      return;
    }
    setSelectedArticleKeys([]);
    setMultiArticleQuery('');
    setArticlePickerSearch('');
    setReadStatusFilter('all');
    setEditalFilterContestId('all');
    setDateFormItemId(null);
    setActiveSavedFilterId(null);
  }, [activeFolder]);
  const [editDraft, setEditDraft] = useState<{
    dispositivo: string;
    texto: string;
    dica: string;
    observacao: string;
    grau: IncidenceGrade;
  }>({
    dispositivo: '',
    texto: '',
    dica: '',
    observacao: '',
    grau: 'Médio',
  });

  const handleStartEdit = (item: LawItem) => {
    setEditingItemId(item.id);
    const savedModalDraft = activeFolder
      ? readFieldDraft<{
          dispositivo: string;
          texto: string;
          dica: string;
          observacao: string;
          grau: IncidenceGrade;
        }>(`law_modal_${activeFolder}_${item.id}`)
      : null;
    setEditDraft(
      savedModalDraft || {
        dispositivo: item.dispositivo,
        texto: item.texto,
        dica: item.dica || '',
        observacao: item.observacao || '',
        grau: item.grau,
      },
    );
  };

  useEffect(() => {
    if (!editingItemId || !activeFolder) return;
    writeFieldDraft(`law_modal_${activeFolder}_${editingItemId}`, editDraft);
  }, [activeFolder, editDraft, editingItemId]);

  const handleCancelEdit = () => {
    if (editingItemId && activeFolder) {
      clearFieldDraft(`law_modal_${activeFolder}_${editingItemId}`);
    }
    setEditingItemId(null);
  };

  const handleSaveEdit = (itemId: string) => {
    if (!activeFolder) return;
    if (!editDraft.dispositivo.trim() || !editDraft.texto.trim()) {
      toast('O dispositivo e o texto legal não podem ficar vazios.', true);
      return;
    }
    updateLawItem(
      activeFolder,
      itemId,
      editDraft.grau,
      editDraft.observacao,
      editDraft.dispositivo,
      editDraft.texto,
      editDraft.dica,
    );
    clearFieldDraft(`law_modal_${activeFolder}_${itemId}`);
    setEditingItemId(null);
  };

  const handleDeleteItem = async (item: LawItem) => {
    if (!activeFolder) return;
    const label = formatSequentialDeviceLabel(item.dispositivo, item.artigo_base) || item.dispositivo;
    const confirmed = await requestConfirm({
      title: 'Excluir Dispositivo',
      description: `Tem certeza que deseja remover "${label}" da Matriz de Incidência?`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (confirmed) {
      deleteLawItem(activeFolder, item.id);
      if (editingItemId === item.id) {
        setEditingItemId(null);
      }
    }
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      toast('Informe o nome da pasta de legislação.', true);
      return;
    }
    const created = createLawFolder(newFolderName);
    setSelectedFolder(created);
    setNewFolderName('');
  };

  const handleUploadLaw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolder || !uploadFile) {
      toast('Selecione a pasta e o arquivo (.txt, .md ou .pdf).', true);
      return;
    }
    setUploading(true);
    try {
      await uploadLawFile(activeFolder, uploadFile);
      setUploadFile(null);
      if (uploadRef.current) uploadRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setUploading(false);
    }
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolder) {
      toast('Crie ou selecione uma pasta de legislação primeiro.', true);
      return;
    }
    addManualLawItem(activeFolder, manualDevice, manualText, manualTip, manualGrade);
    setManualDevice('');
    setManualText('');
    setManualTip('');
  };

  const getRowDraft = (item: LawItem) => {
    if (drafts[item.id]) return drafts[item.id];
    const persisted = activeFolder
      ? readFieldDraft<{ grau: IncidenceGrade; observacao: string }>(
          `law_obs_${activeFolder}_${item.id}`,
        )
      : null;
    return persisted || { grau: item.grau, observacao: item.observacao };
  };

  const availableArticleKeys = useMemo(() => {
    if (!folderData) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    sortLawItemsInOrder(folderData.items).forEach((item) => {
      const key = (item.artigo_base || item.dispositivo || 'Outros').trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(key);
      }
    });
    return list;
  }, [folderData]);

  const filteredPickerKeys = useMemo(() => {
    const q = normalizeSearch(articlePickerSearch);
    if (!q) return availableArticleKeys;
    return availableArticleKeys.filter((k) => normalizeSearch(k).includes(q));
  }, [availableArticleKeys, articlePickerSearch]);

  const multiArticleSpec = useMemo(
    () => parseMultiArticleSpec(multiArticleQuery),
    [multiArticleQuery],
  );

  const selectedArticleSet = useMemo(
    () => new Set(selectedArticleKeys),
    [selectedArticleKeys],
  );

  const activeFolderLinks = useMemo(() => {
    const list: Array<{
      linkId: string;
      contestId: string;
      contestName: string;
      pointId: string;
      materia: string;
      titulo: string;
      filtroArtigos: string;
      spec: ReturnType<typeof parseMultiArticleSpec>;
    }> = [];
    if (!activeFolder) return list;
    const normLaw = normalizeSearch(activeFolder);
    for (const c of db.contests) {
      for (const pt of c.edital_pontos || []) {
        for (const lk of pt.artigos_vinculados || []) {
          if (normalizeSearch(lk.pastaLei) === normLaw) {
            list.push({
              linkId: lk.id,
              contestId: c.id,
              contestName: c.concurso,
              pointId: pt.id,
              materia: pt.materia || 'Geral',
              titulo: pt.titulo,
              filtroArtigos: lk.filtroArtigos,
              spec: parseMultiArticleSpec(lk.filtroArtigos),
            });
          }
        }
      }
    }
    return list;
  }, [db.contests, activeFolder]);

  const itemToLinksMap = useMemo(() => {
    const map = new Map<string, typeof activeFolderLinks>();
    if (!folderData || !activeFolderLinks.length) return map;
    for (const item of folderData.items) {
      const matched = activeFolderLinks.filter((lk) => {
        if (lk.spec.exactKeys.size > 0) {
          return itemMatchesMultiArticleSpec(item, lk.spec);
        }
        const hay = normalizeSearch(`${item.artigo_base || ''} ${item.dispositivo} ${item.texto}`);
        return hay.includes(normalizeSearch(lk.filtroArtigos));
      });
      if (matched.length) map.set(item.id, matched);
    }
    return map;
  }, [folderData, activeFolderLinks]);

  const readSet = useMemo(
    () => new Set(db.readLawItems?.[activeFolder] || []),
    [db.readLawItems, activeFolder],
  );

  const filteredItems = useMemo(() => {
    if (!folderData) return [];
    const term = normalizeSearch(search);
    const hasTypedMulti =
      multiArticleSpec.exactKeys.size > 0 || multiArticleSpec.textTokens.length > 0;
    const hasSelectedChips = selectedArticleSet.size > 0;
    const todayIso = localDateIso();
    const todayMs = new Date(`${todayIso}T00:00:00`).getTime();

    return sortLawItemsInOrder(
      folderData.items.filter((item) => {
        if (gradeFilter !== 'Todas' && item.grau !== gradeFilter) return false;

        if (editalFilterContestId !== 'all') {
          const links = itemToLinksMap.get(item.id) || [];
          if (editalFilterContestId === '__any__') {
            if (!links.length) return false;
          } else if (!links.some((l) => l.contestId === editalFilterContestId)) {
            return false;
          }
        }

        if (readStatusFilter !== 'all') {
          const latest = [...(item.leituras || [])]
            .sort((a, b) => b.data.localeCompare(a.data))[0]?.data;
          if (readStatusFilter === 'today' && latest !== todayIso) return false;
          if (
            readStatusFilter === 'stale-7' ||
            readStatusFilter === 'stale-15' ||
            readStatusFilter === 'stale-30'
          ) {
            if (!latest) return false;
            const threshold =
              readStatusFilter === 'stale-7' ? 7 : readStatusFilter === 'stale-15' ? 15 : 30;
            const diffDays = Math.round(
              (todayMs - new Date(`${latest}T00:00:00`).getTime()) / 86400000,
            );
            if (!Number.isFinite(diffDays) || diffDays < threshold) return false;
          }
        }

        if (hasTypedMulti || hasSelectedChips) {
          const itemGroupKey = (item.artigo_base || item.dispositivo || 'Outros').trim();
          const matchesChips = hasSelectedChips && selectedArticleSet.has(itemGroupKey);
          const matchesTyped = hasTypedMulti && itemMatchesMultiArticleSpec(item, multiArticleSpec);
          if (!matchesChips && !matchesTyped) return false;
        }

        if (term) {
          const hay = normalizeSearch(`${item.dispositivo} ${item.texto} ${item.dica} ${item.observacao}`);
          if (!hay.includes(term)) return false;
        }
        return true;
      }),
    );
  }, [
    folderData,
    gradeFilter,
    editalFilterContestId,
    itemToLinksMap,
    readStatusFilter,
    search,
    multiArticleSpec,
    selectedArticleSet,
  ]);

  const hasActiveFilter =
    gradeFilter !== 'Todas' ||
    editalFilterContestId !== 'all' ||
    readStatusFilter !== 'all' ||
    Boolean(search.trim()) ||
    Boolean(multiArticleQuery.trim()) ||
    selectedArticleKeys.length > 0;

  const toggleSelectedArticleKey = (key: string) => {
    setSelectedArticleKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const clearAllFilters = () => {
    setGradeFilter('Todas');
    setEditalFilterContestId('all');
    setReadStatusFilter('all');
    setSearch('');
    setMultiArticleQuery('');
    setSelectedArticleKeys([]);
    setActiveSavedFilterId(null);
  };

  const applySavedFilter = (f: SavedIncidenceFilter) => {
    if (f.pastaLei && f.pastaLei !== activeFolder && db.laws[f.pastaLei]) {
      skipResetOnFolderSwitchRef.current = true;
      setSelectedFolder(f.pastaLei);
    }
    setGradeFilter(f.gradeFilter || 'Todas');
    setReadStatusFilter(f.readStatusFilter || 'all');
    setEditalFilterContestId(f.editalContestId || 'all');
    setMultiArticleQuery(f.multiArticleQuery || '');
    setSelectedArticleKeys(Array.isArray(f.selectedArticleKeys) ? f.selectedArticleKeys : []);
    setSearch(f.search || '');
    setActiveSavedFilterId(f.id);
    toast(`Filtro "${f.nome}" aplicado (${visibleName(f.pastaLei)}).`);
  };

  const handleOpenSaveFilter = () => {
    if (showSaveFilterForm) {
      setShowSaveFilterForm(false);
      return;
    }
    const targetLaw = activeFolder || folderNames[0] || '';
    setSaveFilterLaw(targetLaw);
    const parts: string[] = [visibleName(targetLaw)];
    if (multiArticleQuery.trim()) parts.push(`Arts. ${multiArticleQuery.trim()}`);
    else if (selectedArticleKeys.length) parts.push(`${selectedArticleKeys.length} art(s)`);
    if (gradeFilter !== 'Todas') parts.push(gradeFilter);
    if (readStatusFilter !== 'all') parts.push(readStatusFilter);
    setSaveFilterName(parts.join(' · '));
    setShowSaveFilterForm(true);
  };

  const handleConfirmSaveFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const lawToUse = saveFilterLaw || activeFolder;
    if (!lawToUse) {
      toast('Selecione uma lei para vincular ao filtro.', true);
      return;
    }
    const saved = saveIncidenceFilter({
      nome: saveFilterName.trim() || `${visibleName(lawToUse)} · Filtro`,
      pastaLei: lawToUse,
      gradeFilter,
      readStatusFilter,
      editalContestId: editalFilterContestId,
      multiArticleQuery,
      selectedArticleKeys,
      search,
    });
    setActiveSavedFilterId(saved.id);
    setShowSaveFilterForm(false);
  };

  const handleJumpToArticle = (articleKey: string) => {
    if (activeFolder) {
      setLawLastPosition(activeFolder, articleKey);
    }
    const anchorId = buildArticleAnchorId('matrix-art', articleKey);
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Article is currently hidden by active filters — reset blocking filters and focus this article
      setGradeFilter('Todas');
      setReadStatusFilter('all');
      setEditalFilterContestId('all');
      setSearch('');
      setMultiArticleQuery('');
      setSelectedArticleKeys([articleKey]);
      window.setTimeout(() => {
        document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const handleSelectLawAndGradeFromD3 = (folder: string, grade: 'Todas' | IncidenceGrade) => {
    if (folder && folder !== activeFolder && db.laws[folder]) {
      skipResetOnFolderSwitchRef.current = true;
      setSelectedFolder(folder);
      setSelectedArticleKeys([]);
      setMultiArticleQuery('');
      setReadStatusFilter('all');
      setEditalFilterContestId('all');
      setSearch('');
    }
    setGradeFilter(grade);
    setActiveSavedFilterId(null);
  };

  const groupedFilteredItems = useMemo(() => {
    const groups: Array<{ key: string; title: string; items: typeof filteredItems }> = [];
    filteredItems.forEach((item) => {
      const groupKey = item.artigo_base || item.dispositivo || 'Outros';
      const existing = groups.find((g) => g.key === groupKey);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({ key: groupKey, title: groupKey, items: [item] });
      }
    });
    return groups;
  }, [filteredItems]);

  const handleExportPdf = (onlyFiltered = false) => {
    if (!activeFolder || !folderData) return;
    const targetItems = onlyFiltered ? filteredItems : folderData.items;
    if (!targetItems.length) {
      toast('Não há dispositivos para exportar no PDF.', true);
      return;
    }
    try {
      exportIncidenceMatrixPdf(activeFolder, targetItems);
      toast(
        onlyFiltered
          ? `PDF gerado com ${targetItems.length} dispositivo(s) filtrado(s).`
          : 'PDF da Matriz de Incidência gerado.',
      );
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="INTELIGÊNCIA ESTATÍSTICA · INCIDÊNCIA"
        title="Classificação de incidência em provas"
        description="Audite artigos e incisos por frequência de cobrança em bancas, registre observações de prova e exporte o resumo colorido em PDF."
      />

      {!vis.hide_upload && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-4 items-start">
          <Panel title="Nova pasta ou importar arquivo (.txt, .md, .pdf)">
            <form onSubmit={handleCreateFolder} className="flex gap-2 mb-3">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ex.: Lei_8112, Codigo_Penal..."
                className="ce-input flex-1"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                Criar pasta
              </button>
            </form>

            <form
              onSubmit={handleUploadLaw}
              className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--line)]"
            >
              <input
                ref={uploadRef}
                type="file"
                accept=".txt,.md,.pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="ce-input flex-1 min-w-[180px]"
              />
              <button
                type="submit"
                disabled={uploading || !activeFolder}
                className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
              >
                <FileUp className="w-3.5 h-3.5" />
                {uploading ? 'Importando…' : 'Enviar para pasta ativa'}
              </button>
            </form>
          </Panel>

          <Panel title="Adicionar dispositivo manualmente">
            <form onSubmit={handleAddManual} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={manualDevice}
                onChange={(e) => setManualDevice(e.target.value)}
                placeholder="Ex.: Art. 5º, LXVIII"
                className="ce-input"
              />
              <select
                value={manualGrade}
                onChange={(e) => setManualGrade(e.target.value as IncidenceGrade)}
                className="ce-select"
              >
                {INCIDENCE_GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Texto legal..."
                className="ce-input sm:col-span-2"
              />
              <input
                type="text"
                value={manualTip}
                onChange={(e) => setManualTip(e.target.value)}
                placeholder="Dica de prova (opcional)"
                className="ce-input"
              />
              <button
                type="submit"
                disabled={!activeFolder}
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                Adicionar dispositivo
              </button>
            </form>
          </Panel>
        </div>
      )}

      {folderNames.length ? (
        <>
          <IncidenceD3Panels
            laws={db.laws}
            readLawItems={db.readLawItems}
            activeFolder={activeFolder}
            activeGradeFilter={gradeFilter}
            onSelectLawAndGrade={handleSelectLawAndGradeFromD3}
            onSelectArticle={handleJumpToArticle}
          />

          {/* Filtros Salvos com Leis Predefinidas */}
          <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--text)] mr-1">
                  <Bookmark className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  Filtros Salvos (Leis Predefinidas):
                </span>

                {(db.savedIncidenceFilters || []).length === 0 ? (
                  <span className="text-[11.5px] text-[var(--muted)]">
                    Configure uma lei + artigos/grau abaixo e clique em &ldquo;Salvar filtro&rdquo; para criar atalhos rápidos.
                  </span>
                ) : (
                  (db.savedIncidenceFilters || []).map((sf) => {
                    const isActive = activeSavedFilterId === sf.id;
                    const summaryParts: string[] = [visibleName(sf.pastaLei)];
                    if (sf.multiArticleQuery) summaryParts.push(`Arts. ${sf.multiArticleQuery}`);
                    else if (sf.selectedArticleKeys?.length) {
                      summaryParts.push(`${sf.selectedArticleKeys.length} art(s)`);
                    }
                    if (sf.gradeFilter && sf.gradeFilter !== 'Todas') {
                      summaryParts.push(sf.gradeFilter);
                    }
                    if (sf.readStatusFilter && sf.readStatusFilter !== 'all') {
                      summaryParts.push(
                        sf.readStatusFilter === 'today'
                          ? 'Lidos hoje'
                          : sf.readStatusFilter.replace('stale-', '+') + 'd',
                      );
                    }
                    return (
                      <span
                        key={sf.id}
                        className={`inline-flex items-center gap-1 rounded-lg border pl-2.5 pr-1 py-1 text-[11.5px] transition-colors ${
                          isActive
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => applySavedFilter(sf)}
                          title={`Aplicar lei "${visibleName(sf.pastaLei)}" e filtros: ${summaryParts.join(' · ')}`}
                          className="inline-flex items-center gap-1.5 font-bold text-left"
                        >
                          <span>{sf.nome}</span>
                          <span className="px-1.5 py-0.2 rounded bg-[var(--panel)] border border-[var(--line)] text-[10px] font-semibold text-[var(--muted)]">
                            {summaryParts.join(' · ')}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeSavedFilterId === sf.id) setActiveSavedFilterId(null);
                            deleteIncidenceFilter(sf.id);
                          }}
                          aria-label={`Excluir filtro salvo ${sf.nome}`}
                          title="Excluir filtro salvo"
                          className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--bad)]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                onClick={handleOpenSaveFilter}
                className={`inline-flex items-center gap-1.5 h-[32px] px-3 rounded-lg border text-[11.5px] font-bold whitespace-nowrap transition-colors ${
                  showSaveFilterForm
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                }`}
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                Salvar filtro com lei
              </button>
            </div>

            {showSaveFilterForm && (
              <form
                onSubmit={handleConfirmSaveFilter}
                className="mt-2.5 pt-2.5 border-t border-[var(--line)]/60 flex flex-wrap items-center gap-2"
              >
                <span className="text-[11.5px] font-bold text-[var(--text)]">
                  Nome do atalho:
                </span>
                <input
                  type="text"
                  value={saveFilterName}
                  onChange={(e) => setSaveFilterName(e.target.value)}
                  placeholder="Ex.: CF/88 - Direitos Fundamentais (Alta)"
                  className="ce-input h-[32px] w-[250px] text-[12px]"
                />
                <span className="text-[11.5px] font-bold text-[var(--text)]">
                  Lei predefinida:
                </span>
                <select
                  aria-label="Lei predefinida do filtro salvo"
                  value={saveFilterLaw || activeFolder}
                  onChange={(e) => setSaveFilterLaw(e.target.value)}
                  className="ce-select h-[32px] w-auto max-w-[230px] text-[12px] py-0.5"
                >
                  {folderNames.map((name) => (
                    <option key={name} value={name}>
                      {visibleName(name)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 h-[32px] px-3 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  Confirmar e salvar
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveFilterForm(false)}
                  className="h-[32px] px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Cancelar
                </button>
              </form>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <select
              aria-label="Selecionar legislação"
              value={activeFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="ce-select w-auto min-w-[200px]"
            >
              {folderNames.map((name) => (
                <option key={name} value={name}>
                  {visibleName(name)} ({db.laws[name].items.length})
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por grau de incidência"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value as 'Todas' | IncidenceGrade)}
              className="ce-select w-auto min-w-[160px]"
            >
              <option value="Todas">Todos os graus</option>
              {INCIDENCE_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por histórico de leitura"
              value={readStatusFilter}
              onChange={(e) => setReadStatusFilter(e.target.value as typeof readStatusFilter)}
              className="ce-select w-auto min-w-[185px]"
            >
              <option value="all">Todas as leituras</option>
              <option value="stale-7">Sem revisão há +7 dias</option>
              <option value="stale-15">Sem revisão há +15 dias</option>
              <option value="stale-30">Sem revisão há +30 dias</option>
              <option value="today">Lidos hoje</option>
            </select>

            {db.contests.length > 0 && (
              <select
                aria-label="Filtrar por vínculo com Edital"
                value={editalFilterContestId}
                onChange={(e) => setEditalFilterContestId(e.target.value)}
                className="ce-select w-auto max-w-[240px]"
              >
                <option value="all">Edital: Todos os artigos</option>
                <option value="__any__">
                  Só vinculados a Editais ({itemToLinksMap.size})
                </option>
                {db.contests.map((c) => {
                  const countForContest = activeFolderLinks.filter((l) => l.contestId === c.id).length;
                  return (
                    <option key={c.id} value={c.id}>
                      Só Edital: {c.concurso} ({countForContest})
                    </option>
                  );
                })}
              </select>
            )}

            <div className="relative flex-1 min-w-[200px]">
              <ListFilter className="w-3.5 h-3.5 text-[var(--accent)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Filtrar vários artigos"
                value={multiArticleQuery}
                onChange={(e) => setMultiArticleQuery(e.target.value)}
                placeholder="Vários artigos: ex. 5, 14, 37-40"
                className="ce-input pl-8"
                title="Separe por vírgula ou use intervalos (ex.: 5, 14, 37-40, 155)"
              />
            </div>

            {availableArticleKeys.length > 0 && (
              <button
                type="button"
                onClick={() => setShowArticlePicker((v) => !v)}
                className={`inline-flex items-center gap-1.5 h-[38px] px-3 rounded-lg border text-[12px] font-bold whitespace-nowrap transition-colors ${
                  showArticlePicker || selectedArticleKeys.length > 0
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                {selectedArticleKeys.length > 0
                  ? `Artigos (${selectedArticleKeys.length})`
                  : 'Selecionar artigos'}
                {showArticlePicker ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {!vis.hide_search && (
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar texto ou observação..."
                  className="ce-input pl-8"
                />
              </div>
            )}

            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => handleExportPdf(true)}
                className="inline-flex items-center gap-1.5 h-[38px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                PDF filtrados ({filteredItems.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => handleExportPdf(false)}
              className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Salvar PDF desta lei
            </button>
          </div>

          <LawReadingToolbar
            prefs={readingPrefs}
            onStepFontSize={stepFontSize}
            onCycleLineHeight={cycleLineHeight}
            onToggleComfortableWidth={toggleComfortableWidth}
            onToggleHighlightExamWords={toggleHighlightExamWords}
            showCleanModeToggle
            onToggleCleanMode={toggleCleanMode}
            lastReadPosition={db.lawLastReadPosition?.[activeFolder]}
            onResumeLastPosition={handleJumpToArticle}
          />

          <ArticleJumpBar
            items={folderData?.items || []}
            readSet={readSet}
            lastReadPosition={db.lawLastReadPosition?.[activeFolder]}
            onSelectArticle={handleJumpToArticle}
          />

          {showArticlePicker && availableArticleKeys.length > 0 && (
            <Panel
              title={`Selecionar múltiplos artigos · ${visibleName(activeFolder)}`}
              subtitle="Clique em quantos artigos quiser para filtrá-los simultaneamente (ou digite números/intervalos acima, ex.: 5, 14, 37-40)."
              className="mb-3"
              action={
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedArticleKeys(availableArticleKeys)}
                    className="px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedArticleKeys([])}
                    disabled={!selectedArticleKeys.length}
                    className="px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-45"
                  >
                    Limpar ({selectedArticleKeys.length})
                  </button>
                </div>
              }
            >
              {availableArticleKeys.length > 12 && (
                <div className="relative mb-2.5 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={articlePickerSearch}
                    onChange={(e) => setArticlePickerSearch(e.target.value)}
                    placeholder="Localizar artigo na lista..."
                    className="ce-input pl-8 h-[34px] text-[12px]"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 max-h-[210px] overflow-y-auto pr-1">
                {filteredPickerKeys.map((key) => {
                  const active = selectedArticleSet.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSelectedArticleKey(key)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11.5px] font-bold transition-colors ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                          : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                      {key}
                    </button>
                  );
                })}
              </div>
            </Panel>
          )}

          {hasActiveFilter && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-3.5 py-2 text-[12px]">
              <span className="text-[var(--muted)]">
                Exibindo <strong className="text-[var(--text)]">{filteredItems.length}</strong> dispositivo(s) em{' '}
                <strong className="text-[var(--text)]">{groupedFilteredItems.length}</strong> artigo(s).
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                {filteredItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      addLawItemReadDate(
                        activeFolder,
                        filteredItems.map((it) => it.id),
                        localDateIso(),
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/10 text-[11px] font-bold text-[var(--good)] hover:bg-[var(--good)] hover:text-white transition-colors"
                  >
                    <CalendarCheck2 className="w-3.5 h-3.5" />
                    Marcar filtrados hoje ({filteredItems.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    clearAllFilters();
                    setReadStatusFilter('all');
                  }}
                  className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--accent)] hover:underline"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar filtros
                </button>
              </div>
            </div>
          )}

          <div
            className={`flex flex-col gap-3 ${
              readingPrefs.comfortableWidth ? 'max-w-[82ch] mx-auto' : ''
            }`}
          >
            {groupedFilteredItems.length ? (
              groupedFilteredItems.map((group) => {
                const groupDates = group.items
                  .flatMap((it) => it.leituras || [])
                  .sort((a, b) => b.data.localeCompare(a.data));
                const latestGroupDate = groupDates[0]?.data;
                const anchorId = buildArticleAnchorId('matrix-art', group.key);

                return (
                  <div key={group.key} id={anchorId} className="scroll-mt-20">
                    <Panel
                      title={group.title}
                      action={
                        <div className="flex flex-wrap items-center gap-2">
                          {latestGroupDate && (
                            <span className="px-2 py-0.5 rounded-md border border-[var(--good)]/40 bg-[var(--good)]/10 text-[11px] font-bold text-[var(--good)]">
                              Última leitura: {formatIsoDateBr(latestGroupDate)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              openLawAt(activeFolder, group.key, {
                                tab: 'continuous',
                                onlyMatches: false,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors whitespace-nowrap"
                            title={`Abrir ${group.title} no Leitor de Lei Seca`}
                          >
                            <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
                            Abrir na Lei Seca
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              addLawItemReadDate(
                                activeFolder,
                                group.items.map((it) => it.id),
                                localDateIso(),
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/10 text-[11px] font-bold text-[var(--good)] hover:bg-[var(--good)] hover:text-white transition-colors whitespace-nowrap"
                            title="Registrar que leu hoje todos os dispositivos deste artigo"
                          >
                            <CalendarCheck2 className="w-3.5 h-3.5" />
                            {group.items.length > 1 ? 'Marcar artigo hoje' : 'Lido hoje'}
                          </button>
                        </div>
                      }
                    >
                      <div className="flex flex-col gap-4">
                        {group.items.map((item, idx) => {
                          const draft = getRowDraft(item);
                          const gradeCls = `grade-badge-${incidenceColorClass(draft.grau)}`;
                          const displayLabel = formatSequentialDeviceLabel(
                            item.dispositivo,
                            item.artigo_base,
                          );
                          const isParagraph =
                            item.tipo_dispositivo === 'Parágrafo' ||
                            /^(?:§|Par[áa]grafo\b)/i.test(displayLabel);
                          const isInciso =
                            item.tipo_dispositivo === 'Inciso' ||
                            /^(?:Inciso\s+)?[IVXLCDM]{1,8}\b/.test(displayLabel);
                          const isAlinea =
                            item.tipo_dispositivo === 'Alínea' ||
                            /^(?:Al[íi]nea\s+|[a-z]\))/i.test(displayLabel);
                          const isPena =
                            item.tipo_dispositivo === 'Pena' ||
                            /^Pena\b/i.test(displayLabel);
                          const indentStyle = isAlinea
                            ? 'pl-8 border-l-2 border-[var(--accent-soft)] ml-3'
                            : isInciso
                            ? 'pl-5 border-l-2 border-[var(--accent-soft)] ml-1'
                            : isParagraph || isPena
                            ? 'pl-3 border-l-2 border-[var(--line-strong)]'
                            : '';
                          const isEditing = editingItemId === item.id;
                          const itemEditalLinks = itemToLinksMap.get(item.id) || [];

                          if (isEditing) {
                            return (
                              <div
                                key={item.id}
                                className={`p-4 rounded-xl border-2 border-[var(--accent)] bg-[var(--panel-raised)] shadow-sm ${
                                  idx > 0 ? 'mt-3' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between pb-2 mb-3 border-b border-[var(--line)]">
                                  <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--accent)]">
                                    Editando dispositivo individual
                                  </span>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)]"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-2.5">
                                  <div className="sm:col-span-2">
                                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                                      Dispositivo (ex: Art. 1º, § 1º, Inciso I...)
                                    </label>
                                    <input
                                      type="text"
                                      value={editDraft.dispositivo}
                                      onChange={(e) =>
                                        setEditDraft((p) => ({
                                          ...p,
                                          dispositivo: e.target.value,
                                        }))
                                      }
                                      className="ce-input w-full font-bold"
                                      placeholder="Ex.: Art. 1º, § 1º ou Inciso I"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                                      Grau de incidência
                                    </label>
                                    <select
                                      value={editDraft.grau}
                                      onChange={(e) =>
                                        setEditDraft((p) => ({
                                          ...p,
                                          grau: e.target.value as IncidenceGrade,
                                        }))
                                      }
                                      className={`ce-select w-full font-bold grade-badge-${incidenceColorClass(
                                        editDraft.grau,
                                      )}`}
                                    >
                                      {INCIDENCE_GRADES.map((g) => (
                                        <option
                                          key={g}
                                          value={g}
                                          className="bg-[var(--panel)] text-[var(--text)]"
                                        >
                                          {g}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="mb-2.5">
                                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                                    Texto legal do dispositivo
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={editDraft.texto}
                                    onChange={(e) =>
                                      setEditDraft((p) => ({ ...p, texto: e.target.value }))
                                    }
                                    className="ce-input w-full leading-relaxed"
                                    placeholder="Texto legal..."
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
                                  <div>
                                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                                      Ponto de atenção / Dica de prova (opcional)
                                    </label>
                                    <input
                                      type="text"
                                      value={editDraft.dica}
                                      onChange={(e) =>
                                        setEditDraft((p) => ({ ...p, dica: e.target.value }))
                                      }
                                      className="ce-input w-full"
                                      placeholder="Ex.: pegadinha comum de banca..."
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                                      Observação de prova / banca
                                    </label>
                                    <input
                                      type="text"
                                      value={editDraft.observacao}
                                      onChange={(e) =>
                                        setEditDraft((p) => ({
                                          ...p,
                                          observacao: e.target.value,
                                        }))
                                      }
                                      className="ce-input w-full"
                                      placeholder="Ex.: Cobrado na prova PC-SP 2023..."
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--danger)] text-[var(--danger)] text-[12px] font-bold hover:bg-[var(--danger)] hover:text-white transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Excluir dispositivo
                                  </button>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] text-[12px] font-bold text-[var(--text)] hover:bg-[var(--panel-soft)]"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(item.id)}
                                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] shadow-sm"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Salvar alterações
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const itemDates = [...(item.leituras || [])].sort((a, b) =>
                            b.data.localeCompare(a.data),
                          );
                          const latestItemDate = itemDates[0]?.data;
                          const todayIso = localDateIso();
                          const itemDiffDays = latestItemDate
                            ? Math.round(
                                (new Date(`${todayIso}T00:00:00`).getTime() -
                                  new Date(`${latestItemDate}T00:00:00`).getTime()) /
                                  86400000,
                              )
                            : null;
                          const isDateFormOpen = dateFormItemId === item.id;

                          return (
                            <div
                              key={item.id}
                              onClick={() =>
                                setLawLastPosition(
                                  activeFolder,
                                  (item.artigo_base || item.dispositivo || item.id).trim(),
                                )
                              }
                              className={`${
                                idx > 0 ? 'pt-4 border-t border-[var(--line-soft)]' : ''
                              } ${indentStyle}`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2.5 mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <strong className="text-[14px] font-bold text-[var(--text)]">
                                    {displayLabel}
                                  </strong>
                                  {item.tipo_dispositivo && (
                                    <span className="text-[11px] text-[var(--muted)]">
                                      · {item.tipo_dispositivo}
                                    </span>
                                  )}
                                  {latestItemDate && (
                                    <span
                                      className={`px-2 py-0.5 rounded-md border text-[10.5px] font-bold ${
                                        itemDiffDays !== null && itemDiffDays >= 15
                                          ? 'border-[var(--warning)]/50 bg-[var(--warning)]/12 text-[var(--warning)]'
                                          : 'border-[var(--good)]/40 bg-[var(--good)]/10 text-[var(--good)]'
                                      }`}
                                    >
                                      Lido em {formatIsoDateBr(latestItemDate)}
                                      {itemDiffDays === 0
                                        ? ' (Hoje)'
                                        : itemDiffDays === 1
                                          ? ' (Ontem)'
                                          : itemDiffDays !== null && itemDiffDays > 1
                                            ? ` · há ${itemDiffDays}d`
                                            : ''}
                                      {itemDates.length > 1 ? ` · ${itemDates.length}x` : ''}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-md border text-[10.5px] font-bold ${gradeCls}`}
                                  >
                                    {draft.grau}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      addLawItemReadDate(activeFolder, item.id, localDateIso())
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--good)]/50 bg-[var(--good)]/10 text-[11px] font-bold text-[var(--good)] hover:bg-[var(--good)] hover:text-white transition-colors"
                                    title="Marcar que leu este artigo hoje"
                                  >
                                    <CalendarCheck2 className="w-3 h-3" />
                                    Lido hoje
                                  </button>
                                  {!readingPrefs.cleanMode && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isDateFormOpen) {
                                          setDateFormItemId(null);
                                        } else {
                                          setDateFormItemId(item.id);
                                          setItemReadDateInput(localDateIso());
                                          setItemReadDateNote('');
                                        }
                                      }}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors ${
                                        isDateFormOpen
                                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                                          : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                                      }`}
                                      title="Escolher outro dia de leitura ou gerenciar datas deste artigo"
                                    >
                                      <CalendarPlus className="w-3 h-3 text-[var(--accent)]" />
                                      Escolher dia
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(item)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                                    title="Editar dados deste dispositivo"
                                  >
                                    <Pencil className="w-3 h-3 text-[var(--accent)]" />
                                    {readingPrefs.cleanMode ? '' : 'Editar'}
                                  </button>
                                  {!readingPrefs.cleanMode && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteItem(item)}
                                      className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--panel-soft)] transition-colors"
                                      title="Excluir dispositivo"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <p
                                style={{
                                  fontSize: FONT_SIZE_PX[readingPrefs.fontSize],
                                  lineHeight: LINE_HEIGHT_VAL[readingPrefs.lineHeight],
                                }}
                                className="m-0 text-[var(--text)] whitespace-pre-line"
                              >
                                {renderLawTextWithExamHighlights(
                                  item.texto,
                                  readingPrefs.highlightExamWords,
                                )}
                              </p>

                              {(item.dica || item.observacao) && (
                                <div className="mt-2.5 flex flex-col gap-1.5">
                                  {item.dica && (
                                    <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-3 py-1.5 text-[12px] text-[var(--text)]">
                                      <strong className="text-[var(--warning)]">
                                        Ponto de atenção:
                                      </strong>{' '}
                                      {item.dica}
                                    </div>
                                  )}
                                  {item.observacao && (
                                    <div className="rounded-lg border border-[var(--accent)]/35 bg-[var(--accent-soft)]/60 px-3 py-1.5 text-[12px] text-[var(--text)]">
                                      <strong className="text-[var(--accent)]">
                                        Observação de banca / prova:
                                      </strong>{' '}
                                      {item.observacao}
                                    </div>
                                  )}
                                </div>
                              )}

                              {itemEditalLinks.length > 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {itemEditalLinks.map((lk) => (
                                    <span
                                      key={`${lk.contestId}-${lk.pointId}-${lk.linkId}`}
                                      className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/35 bg-[var(--panel-soft)] pl-2 pr-1 py-0.5 text-[10.5px] text-[var(--text)]"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => openContestEdital(lk.contestId)}
                                        title={`Abrir ponto "${lk.titulo}" no edital de ${lk.contestName}`}
                                        className="inline-flex items-center gap-1 font-bold hover:text-[var(--accent)] text-left"
                                      >
                                        <ExternalLink className="w-3 h-3 text-[var(--accent)] shrink-0" />
                                        <span className="truncate max-w-[320px]">
                                          {lk.contestName} · {lk.materia}: {lk.titulo}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          unlinkEditalPointFromLaw(
                                            lk.contestId,
                                            lk.pointId,
                                            lk.linkId,
                                          )
                                        }
                                        aria-label={`Desvincular ${lk.titulo} do edital`}
                                        title="Desvincular deste ponto do edital"
                                        className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--bad)]"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {!readingPrefs.cleanMode &&
                                (isDateFormOpen || itemDates.length > 0) && (
                                  <div className="mt-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]/70 p-2.5 space-y-2">
                                    {itemDates.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-[11px] font-bold text-[var(--muted)] mr-1">
                                          Dias lidos:
                                        </span>
                                        {itemDates.map((entry) => (
                                          <span
                                            key={entry.id}
                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] text-[var(--text)]"
                                          >
                                            <strong className="font-mono-num">
                                              {formatIsoDateBr(entry.data)}
                                            </strong>
                                            {entry.observacao && (
                                              <span className="text-[var(--muted)]">
                                                · {entry.observacao}
                                              </span>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removeLawItemReadDate(
                                                  activeFolder,
                                                  item.id,
                                                  entry.id,
                                                )
                                              }
                                              aria-label={`Remover leitura de ${formatIsoDateBr(
                                                entry.data,
                                              )}`}
                                              className="text-[var(--muted)] hover:text-[var(--bad)]"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    {isDateFormOpen && (
                                      <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <input
                                          type="date"
                                          aria-label={`Selecionar dia de leitura para ${displayLabel}`}
                                          value={itemReadDateInput}
                                          onChange={(e) => setItemReadDateInput(e.target.value)}
                                          className="ce-input h-[32px] w-auto text-[11.5px]"
                                        />
                                        <input
                                          type="text"
                                          value={itemReadDateNote}
                                          onChange={(e) => setItemReadDateNote(e.target.value)}
                                          placeholder="Obs. opcional (ex.: revisão, grifo...)"
                                          className="ce-input h-[32px] flex-1 min-w-[160px] text-[11.5px]"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            addLawItemReadDate(
                                              activeFolder,
                                              item.id,
                                              itemReadDateInput,
                                              itemReadDateNote,
                                            );
                                            setItemReadDateNote('');
                                            setDateFormItemId(null);
                                          }}
                                          className="inline-flex items-center gap-1 h-[32px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                          Registrar dia
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}

                              {!readingPrefs.cleanMode && (
                                <div className="mt-3 pt-3 border-t border-[var(--line-soft)] grid grid-cols-1 sm:grid-cols-[190px_1fr_auto] gap-2 items-center">
                                  <select
                                    aria-label={`Grau de incidência para ${displayLabel}`}
                                    value={draft.grau}
                                    onChange={(e) => {
                                      const nextGrau = e.target.value as IncidenceGrade;
                                      const nextRow = { ...draft, grau: nextGrau };
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: nextRow,
                                      }));
                                      writeFieldDraft(`law_obs_${activeFolder}_${item.id}`, nextRow);
                                      updateLawItem(
                                        activeFolder,
                                        item.id,
                                        nextGrau,
                                        draft.observacao,
                                        undefined,
                                        undefined,
                                        undefined,
                                        true,
                                      );
                                      clearFieldDraft(`law_obs_${activeFolder}_${item.id}`);
                                    }}
                                    className={`ce-select font-bold ${gradeCls}`}
                                  >
                                    {INCIDENCE_GRADES.map((g) => (
                                      <option
                                        key={g}
                                        value={g}
                                        className="bg-[var(--panel)] text-[var(--text)]"
                                      >
                                        {g}
                                      </option>
                                    ))}
                                  </select>

                                  <input
                                    type="text"
                                    value={draft.observacao}
                                    onChange={(e) => {
                                      const nextRow = { ...draft, observacao: e.target.value };
                                      writeFieldDraft(`law_obs_${activeFolder}_${item.id}`, nextRow);
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: nextRow,
                                      }));
                                    }}
                                    onBlur={() => {
                                      updateLawItem(
                                        activeFolder,
                                        item.id,
                                        draft.grau,
                                        draft.observacao,
                                        undefined,
                                        undefined,
                                        undefined,
                                        true,
                                      );
                                      clearFieldDraft(`law_obs_${activeFolder}_${item.id}`);
                                    }}
                                    placeholder="Observação de incidência, banca ou questão..."
                                    className="ce-input"
                                  />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateLawItem(
                                        activeFolder,
                                        item.id,
                                        draft.grau,
                                        draft.observacao,
                                      );
                                      clearFieldDraft(`law_obs_${activeFolder}_${item.id}`);
                                      setDrafts((prev) => {
                                        const next = { ...prev };
                                        delete next[item.id];
                                        return next;
                                      });
                                    }}
                                    className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                                  >
                                    <Save className="w-3.5 h-3.5 text-[var(--accent)]" />
                                    Salvar
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Panel>
                  </div>
                );
              })
            ) : (
              <EmptyState message="Nenhum dispositivo corresponde aos filtros aplicados." />
            )}
          </div>
        </>
      ) : (
        <EmptyState message="Nenhuma pasta de legislação criada ainda." />
      )}
    </div>
  );
};

