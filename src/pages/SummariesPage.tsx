import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  Eye,
  FileDown,
  FileText,
  FolderPlus,
  GitBranch,
  Loader2,
  Paperclip,
  Pencil,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import { formatCorrectionTextStructured } from '../lib/legalTextFormatter';
import { formatUploadSize, visibleName } from '../lib/parsers';
import {
  computeMindMapLayout,
  exportMindMapPngFile,
  getTagMeta,
  setAllNodesCollapsed,
} from '../lib/mindMapLayout';
import {
  exportAllSubjectsSummariesPdf,
  exportSingleNotePdf,
  exportSubjectSummariesPdf,
  flattenMindMapToOutline,
  getSummaryDisplayTitle,
  getSummaryItemKind,
} from '../lib/summaryPdfExport';
import { MindMapCustomTag, MindMapNode, Question, SummaryFile, SummaryItemKind } from '../types/study';
import { MindMapBuilder } from '../components/summaries/MindMapBuilder';
import { PdfAttachmentPanel } from '../components/summaries/PdfAttachmentPanel';
import { SummaryAiStudioModal } from '../components/summaries/SummaryAiStudioModal';
import { FilePreview } from '../components/ui/FilePreview';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { StructuredLegalText } from '../components/ui/StructuredLegalText';

type ActiveTab = 'notes' | 'attachments' | 'mindmap' | 'downloads';
type KindFilter = 'all' | SummaryItemKind;

interface FolderItemEntry {
  folder: string;
  item: SummaryFile;
}

export const SummariesPage: React.FC = () => {
  const {
    db,
    disciplines,
    moduleVisibility,
    createSummaryFolder,
    renameSummaryFolder,
    deleteSummaryFolder,
    uploadSummaryFiles,
    saveSummaryNote,
    saveSummaryMindMap,
    deleteSummaryFile,
    moveSummaryFileToFolder,
    importParsedQuestions,
    addAnnotation,
    requestConfirm,
    toast,
  } = useStudy();

  const hideUpload = moduleVisibility('Resumos & Mapas').hide_upload;

  const folderNames = useMemo(
    () => Object.keys(db.summaryFolders).sort((a, b) => visibleName(a).localeCompare(visibleName(b), 'pt-BR')),
    [db.summaryFolders],
  );

  // '__ALL__' displays all subjects together; otherwise a specific folder key
  const [selectedFolder, setSelectedFolder] = useState<string>(folderNames[0] || '__ALL__');
  const activeFolder =
    selectedFolder === '__ALL__'
      ? '__ALL__'
      : folderNames.includes(selectedFolder)
        ? selectedFolder
        : folderNames[0] || '';

  const [activeTab, setActiveTab] = useState<ActiveTab>('notes');

  // New / rename folder controls
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  // Note editor state
  const [editingNoteId, setEditingNoteId] = useState<string | undefined>(undefined);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteTagsInput, setNoteTagsInput] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteEditorExpanded, setNoteEditorExpanded] = useState(true);

  // Mind map builder state
  const [mindMapEditing, setMindMapEditing] = useState<{
    id?: string;
    title?: string;
    tree?: MindMapNode | null;
    folder?: string;
  }>({});

  // List search, filter, preview & AI modal
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [previewItem, setPreviewItem] = useState<SummaryFile | null>(null);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Record<string, boolean>>({});
  const [aiModalTarget, setAiModalTarget] = useState<FolderItemEntry | null>(null);

  // PDF export state
  const [includeAttachedPdfs, setIncludeAttachedPdfs] = useState(true);
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const suggestedSubjects = useMemo(() => {
    const set = new Set<string>(disciplines.map((d) => visibleName(d)).filter(Boolean));
    for (const f of folderNames) set.add(visibleName(f));
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [disciplines, folderNames]);

  const totalCounts = useMemo(() => {
    let notes = 0;
    let pdfs = 0;
    let maps = 0;
    for (const list of Object.values(db.summaryFolders)) {
      for (const item of list) {
        const k = getSummaryItemKind(item);
        if (k === 'note') notes += 1;
        else if (k === 'pdf') pdfs += 1;
        else if (k === 'mindmap') maps += 1;
      }
    }
    return {
      subjects: folderNames.length,
      notes,
      pdfs,
      maps,
      total: notes + pdfs + maps + Object.values(db.summaryFolders).reduce((s, l) => s + l.filter((i) => getSummaryItemKind(i) === 'image').length, 0),
    };
  }, [db.summaryFolders, folderNames.length]);

  const visibleEntries = useMemo<FolderItemEntry[]>(() => {
    const base: FolderItemEntry[] =
      activeFolder === '__ALL__'
        ? folderNames.flatMap((folder) =>
            (db.summaryFolders[folder] || []).map((item) => ({ folder, item })),
          )
        : activeFolder
          ? (db.summaryFolders[activeFolder] || []).map((item) => ({
              folder: activeFolder,
              item,
            }))
          : [];

    const q = searchQuery.trim().toLowerCase();
    return base.filter(({ folder, item }) => {
      const k = getSummaryItemKind(item);
      if (kindFilter !== 'all' && k !== kindFilter) return false;
      if (!q) return true;
      const haystack = [
        visibleName(folder),
        getSummaryDisplayTitle(item),
        item.name,
        item.content || '',
        (item.tags || []).join(' '),
        item.mindMap ? flattenMindMapToOutline(item.mindMap).join(' ') : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [activeFolder, db.summaryFolders, folderNames, kindFilter, searchQuery]);

  // Ensure a concrete target folder for creating notes/uploads/mindmaps
  const targetWriteFolder =
    activeFolder && activeFolder !== '__ALL__' ? activeFolder : folderNames[0] || '';

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = createSummaryFolder(newFolderName);
    setSelectedFolder(created);
    setNewFolderName('');
  };

  const handleConfirmRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWriteFolder || !renameDraft.trim()) return;
    const nextKey = renameSummaryFolder(targetWriteFolder, renameDraft);
    setSelectedFolder(nextKey);
    setRenamingFolder(false);
    setRenameDraft('');
  };

  const handleDeleteFolder = () => {
    if (!targetWriteFolder) return;
    void requestConfirm({
      title: `Excluir matéria "${visibleName(targetWriteFolder)}"?`,
      description:
        'Todas as anotações, PDFs anexados e mapas mentais desta matéria serão removidos do aplicativo e enviados para a lixeira do Google Drive.',
      confirmLabel: 'Excluir matéria',
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      await deleteSummaryFolder(targetWriteFolder);
      setSelectedFolder('__ALL__');
      setPreviewItem(null);
    });
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWriteFolder) {
      toast('Crie ou selecione uma matéria primeiro.', true);
      return;
    }
    setSavingNote(true);
    try {
      const parsedTags = noteTagsInput
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      await saveSummaryNote(targetWriteFolder, {
        id: editingNoteId,
        title: noteTitle,
        content: noteContent,
        tags: parsedTags,
      });
      setEditingNoteId(undefined);
      setNoteTitle('');
      setNoteTagsInput('');
      setNoteContent('');
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSavingNote(false);
    }
  };

  const handleEditNote = (folder: string, item: SummaryFile) => {
    setSelectedFolder(folder);
    setActiveTab('notes');
    setNoteEditorExpanded(true);
    setEditingNoteId(item.id);
    setNoteTitle(getSummaryDisplayTitle(item));
    setNoteTagsInput((item.tags || []).join(', '));
    setNoteContent(item.content || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(undefined);
    setNoteTitle('');
    setNoteTagsInput('');
    setNoteContent('');
  };

  const handleDownloadIndividual = async (folder: string, item: SummaryFile) => {
    const kind = getSummaryItemKind(item);
    if (kind === 'note' || kind === 'mindmap') {
      try {
        await exportSingleNotePdf(folder, item);
        toast(`PDF de "${getSummaryDisplayTitle(item)}" baixado.`);
      } catch (err) {
        toast((err as Error).message, true);
      }
      return;
    }
    const blob = await getFileBlob(item.blobKey);
    if (!blob) {
      toast('Arquivo não encontrado no armazenamento local.', true);
      return;
    }
    triggerBlobDownload(blob, item.name);
  };

  const handleDownloadMindMapPng = async (item: SummaryFile) => {
    if (!item.mindMap) return;
    try {
      const expanded = setAllNodesCollapsed(item.mindMap, false);
      const layout = computeMindMapLayout(
        expanded,
        expanded.layout || 'bilateral',
        expanded.customTags,
      );
      await exportMindMapPngFile(
        layout,
        expanded.edgeStyle || 'curved',
        getSummaryDisplayTitle(item),
        {
          themeId: expanded.themeId,
          canvasBg: expanded.canvasBg,
          customTags: expanded.customTags,
        },
      );
      toast(`PNG de "${getSummaryDisplayTitle(item)}" baixado com todos os ramos expandidos.`);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const renderExpandedMindMapBranch = (
    node: MindMapNode,
    depth: number,
    customTags?: MindMapCustomTag[],
  ): React.ReactNode => {
    const tagMeta = getTagMeta(node.tag, customTags);
    return (
      <div
        key={node.id}
        className={depth > 0 ? 'mt-1.5 pl-3 border-l border-[var(--line-strong)]' : ''}
      >
        <div className="flex flex-wrap items-baseline gap-1.5 text-[12px] leading-relaxed">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0 translate-y-[-1px]"
            style={{ backgroundColor: node.color || '#1351B4' }}
          />
          {tagMeta && (
            <span
              className="text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ backgroundColor: tagMeta.bg, color: tagMeta.color }}
            >
              {tagMeta.short}
            </span>
          )}
          <span
            className={
              depth === 0
                ? 'font-bold text-[var(--text)]'
                : 'font-semibold text-[var(--text)]'
            }
          >
            {node.label || 'Sem texto'}
          </span>
          {node.note?.trim() && (
            <span className="text-[11.5px] text-[var(--muted)] break-words">
              — {node.note.trim()}
            </span>
          )}
        </div>
        {node.children && node.children.length > 0 && (
          <div className="mt-1">
            {node.children.map((child) =>
              renderExpandedMindMapBranch(child, depth + 1, customTags),
            )}
          </div>
        )}
      </div>
    );
  };

  const handleExportSubjectPdf = async (folderKey: string) => {
    const items = db.summaryFolders[folderKey] || [];
    if (items.length === 0) {
      toast(`A matéria "${visibleName(folderKey)}" ainda não possui conteúdo para exportar.`, true);
      return;
    }
    setExportingKey(folderKey);
    try {
      const res = await exportSubjectSummariesPdf(folderKey, items, {
        includeAttachedPdfs,
      });
      toast(
        `PDF de ${visibleName(folderKey)} gerado (${res.totalPages} página(s))${res.warnings.length ? ` · ${res.warnings.length} aviso(s)` : ''}.`,
      );
    } catch (err) {
      toast((err as Error).message || 'Erro ao gerar PDF da matéria.', true);
    } finally {
      setExportingKey(null);
    }
  };

  const handleExportAllPdf = async () => {
    setExportingKey('__ALL__');
    try {
      const res = await exportAllSubjectsSummariesPdf(db.summaryFolders, {
        includeAttachedPdfs,
      });
      toast(
        `Dossiê completo gerado (${res.subjectCount} matéria(s), ${res.totalPages} página(s))${res.warnings.length ? ` · ${res.warnings.length} aviso(s)` : ''}.`,
      );
    } catch (err) {
      toast((err as Error).message || 'Erro ao gerar PDF consolidado.', true);
    } finally {
      setExportingKey(null);
    }
  };

  const handleDeleteItem = (folder: string, item: SummaryFile) => {
    void requestConfirm({
      title: `Excluir "${getSummaryDisplayTitle(item)}"?`,
      description:
        'Este item será removido do Dossiê de Resumos e enviado para a lixeira do Google Drive.',
      confirmLabel: 'Excluir item',
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      await deleteSummaryFile(folder, item.id);
      if (previewItem?.id === item.id) setPreviewItem(null);
      if (editingNoteId === item.id) handleCancelEditNote();
    });
  };

  const handleOpenMindMap = (folder: string, item: SummaryFile) => {
    if (!item.mindMap) return;
    setSelectedFolder(folder);
    setMindMapEditing({
      id: item.id,
      title: getSummaryDisplayTitle(item),
      tree: item.mindMap,
      folder,
    });
    setActiveTab('mindmap');
  };

  return (
    <div>
      <PageHeader
        eyebrow="DOSSIÊ DE RESUMOS · ANOTAÇÕES, PDFs & MAPAS"
        title="Anotações de resumo e PDFs por matéria"
        description="Escreva anotações estruturadas por matéria, anexe seus PDFs, gere questões ou resumos com IA, monte mapas mentais visuais e baixe o PDF por matéria ou tudo de uma vez."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {targetWriteFolder && (db.summaryFolders[targetWriteFolder] || []).length > 0 && (
              <button
                type="button"
                disabled={exportingKey !== null}
                onClick={() => void handleExportSubjectPdf(targetWriteFolder)}
                className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-55 whitespace-nowrap"
              >
                {exportingKey === targetWriteFolder ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 text-[var(--accent)]" />
                )}
                PDF: {visibleName(targetWriteFolder)}
              </button>
            )}

            <button
              type="button"
              disabled={exportingKey !== null || totalCounts.total === 0}
              onClick={() => void handleExportAllPdf()}
              className="inline-flex items-center gap-1.5 h-[36px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-55 whitespace-nowrap"
            >
              {exportingKey === '__ALL__' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Baixar Todas em PDF
            </button>
          </div>
        }
      />

      {/* Subject Selector + Create New Subject */}
      <Panel className="mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedFolder('__ALL__');
                  setPreviewItem(null);
                  setRenamingFolder(false);
                }}
                className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors ${
                  activeFolder === '__ALL__'
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                Todas as matérias ({totalCounts.total})
              </button>

              {folderNames.map((folder) => {
                const count = (db.summaryFolders[folder] || []).length;
                const isSelected = activeFolder === folder;
                return (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => {
                      setSelectedFolder(folder);
                      setPreviewItem(null);
                      setRenamingFolder(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    {visibleName(folder)}{' '}
                    <span className="font-mono-num tabular-nums opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            {!hideUpload && (
              <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
                <input
                  type="text"
                  list="summary-subjects-datalist"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nova matéria (ex.: Direito Penal)..."
                  className="ce-input w-[210px] text-[12px]"
                />
                <datalist id="summary-subjects-datalist">
                  {suggestedSubjects.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 h-[36px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Criar
                </button>
              </form>
            )}
          </div>

          {/* Active Subject Controls & Mode Tabs */}
          <div className="pt-2.5 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2.5">
            <div className="inline-flex flex-wrap rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('notes')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors cursor-pointer ${
                  activeTab === 'notes'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Anotações & PDFs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('attachments')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors cursor-pointer ${
                  activeTab === 'attachments'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                <Paperclip className="w-3.5 h-3.5" />
                Anexos PDF{' '}
                <span className="font-mono-num tabular-nums opacity-80">({totalCounts.pdfs})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('mindmap')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors cursor-pointer ${
                  activeTab === 'mindmap'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                Construtor de Mapas Mentais
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('downloads')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors cursor-pointer ${
                  activeTab === 'downloads'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                <FileDown className="w-3.5 h-3.5" />
                Baixar PDFs por Matéria
              </button>
            </div>

            {activeFolder && activeFolder !== '__ALL__' && !hideUpload && (
              <div className="flex flex-wrap items-center gap-2">
                {renamingFolder ? (
                  <form onSubmit={handleConfirmRename} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      placeholder="Novo nome da matéria"
                      className="ce-input w-[180px] text-[12px]"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[11.5px] font-bold"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingFolder(false)}
                      className="p-1.5 rounded-lg border border-[var(--line)] text-[var(--muted)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameDraft(visibleName(activeFolder));
                        setRenamingFolder(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)]"
                    >
                      <Pencil className="w-3 h-3" />
                      Renomear matéria
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteFolder}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)]"
                    >
                      <Trash2 className="w-3 h-3" />
                      Excluir matéria
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* TAB 1: NOTES & ATTACHED PDFs */}
      {activeTab === 'notes' && (
        <div className="flex flex-col gap-4">
          {!hideUpload && (
            <div
              className={
                folderNames.length > 0
                  ? 'grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-3.5 items-start'
                  : 'flex flex-col gap-3.5'
              }
            >
              {/* Written Note Composer (shown when at least one subject folder exists) */}
              {folderNames.length > 0 && (
                <Panel
                  title={
                    editingNoteId
                      ? `Editando anotação em ${visibleName(targetWriteFolder)}`
                      : `Nova anotação de resumo · ${visibleName(targetWriteFolder)}`
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => setNoteEditorExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      {noteEditorExpanded ? (
                        <>
                          Recolher <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          Expandir <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  }
                >
                  {noteEditorExpanded && (
                    <form onSubmit={handleSaveNote} className="flex flex-col gap-2.5">
                      {activeFolder === '__ALL__' && (
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                            Salvar na matéria
                          </label>
                          <select
                            value={targetWriteFolder}
                            onChange={(e) => setSelectedFolder(e.target.value)}
                            className="ce-input"
                          >
                            {folderNames.map((f) => (
                              <option key={f} value={f}>
                                {visibleName(f)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                            Título da anotação *
                          </label>
                          <input
                            type="text"
                            value={noteTitle}
                            onChange={(e) => setNoteTitle(e.target.value)}
                            placeholder="Ex.: Poderes Administrativos — Poder de Polícia"
                            className="ce-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                            Tópicos / Etiquetas (separados por vírgula)
                          </label>
                          <input
                            type="text"
                            value={noteTagsInput}
                            onChange={(e) => setNoteTagsInput(e.target.value)}
                            placeholder="Ex.: Art. 78 CTN, Decoreba, FGV"
                            className="ce-input"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <label className="text-[11px] font-bold text-[var(--muted)]">
                            Conteúdo do resumo / anotações
                          </label>
                          <button
                            type="button"
                            disabled={!noteContent.trim()}
                            onClick={() => {
                              setNoteContent(formatCorrectionTextStructured(noteContent));
                              toast('Anotação estruturada com quebras de artigos e tópicos.');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45"
                          >
                            <Wand2 className="w-3 h-3" />
                            Estruturar texto
                          </button>
                        </div>
                        <textarea
                          value={noteContent}
                          onChange={(e) => setNoteContent(e.target.value)}
                          rows={6}
                          placeholder="Anote conceitos, regras, exceções, artigos de lei, súmulas e pegadinhas da banca..."
                          className="ce-textarea leading-relaxed"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {editingNoteId && (
                          <button
                            type="button"
                            onClick={handleCancelEditNote}
                            className="h-[36px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                          >
                            Cancelar edição
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={savingNote}
                          className="inline-flex items-center gap-1.5 h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingNote
                            ? 'Salvando…'
                            : editingNoteId
                              ? 'Atualizar anotação'
                              : 'Salvar anotação'}
                        </button>
                      </div>
                    </form>
                  )}
                </Panel>
              )}

              {/* Dedicated PDF Attachment Component (always accessible, with explicit discipline selector) */}
              <PdfAttachmentPanel
                summaryFolders={db.summaryFolders}
                disciplines={disciplines}
                activeFolder={activeFolder}
                hideUpload={hideUpload}
                mode="compact"
                previewItemId={previewItem?.id || null}
                onCreateFolder={createSummaryFolder}
                onUploadFiles={uploadSummaryFiles}
                onMoveFile={moveSummaryFileToFolder}
                onPreviewItem={(item) =>
                  setPreviewItem(previewItem?.id === item.id ? null : item)
                }
                onDownloadItem={handleDownloadIndividual}
                onOpenAiStudio={(folder, item) => setAiModalTarget({ folder, item })}
                onDeleteItem={handleDeleteItem}
                onOpenFullAttachmentsTab={() => setActiveTab('attachments')}
                onNotify={toast}
              />
            </div>
          )}

          {/* Inline File Preview */}
          {previewItem && (
            <FilePreview
              blobKey={previewItem.blobKey}
              filename={previewItem.name}
              mimeType={previewItem.mimeType}
              title={getSummaryDisplayTitle(previewItem)}
              onClose={() => setPreviewItem(null)}
            />
          )}

          {/* Search & Kind Filter Bar */}
          {folderNames.length > 0 ? (
            <Panel
              title={
                activeFolder === '__ALL__'
                  ? `Todos os itens (${visibleEntries.length})`
                  : `${visibleName(activeFolder)} (${visibleEntries.length})`
              }
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar título, texto, tag..."
                      className="ce-input pl-8 h-[34px] w-[200px] text-[12px]"
                    />
                  </div>
                  <select
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                    className="ce-select h-[34px] w-auto text-[12px]"
                  >
                    <option value="all">Todos os tipos</option>
                    <option value="note">Anotações</option>
                    <option value="pdf">PDFs anexados</option>
                    <option value="mindmap">Mapas mentais</option>
                    <option value="image">Imagens</option>
                  </select>
                </div>
              }
            >
              {visibleEntries.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {visibleEntries.map(({ folder, item }) => {
                    const kind = getSummaryItemKind(item);
                    const displayTitle = getSummaryDisplayTitle(item);
                    const isExpanded = Boolean(expandedNoteIds[item.id]);
                    const kindLabel =
                      kind === 'note'
                        ? 'Anotação'
                        : kind === 'pdf'
                          ? 'PDF Anexo'
                          : kind === 'mindmap'
                            ? 'Mapa Mental'
                            : 'Imagem';

                    return (
                      <article
                        key={`${folder}-${item.id}`}
                        className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[min(100%,260px)] flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <strong className="text-[14.5px] font-bold text-[var(--text)] leading-snug">
                                {displayTitle}
                              </strong>
                              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                                {kindLabel}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11.5px] text-[var(--muted)] font-mono-num">
                              {visibleName(folder)}
                              {' · '}
                              {item.createdAt}
                              {kind !== 'note' && kind !== 'mindmap'
                                ? ` · ${formatUploadSize(item.size)}`
                                : ''}
                              {item.tags && item.tags.length > 0
                                ? ` · Tópicos: ${item.tags.join(', ')}`
                                : ''}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {kind === 'note' && (
                              <button
                                type="button"
                                onClick={() => handleEditNote(folder, item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Editar
                              </button>
                            )}

                            {kind === 'mindmap' && item.mindMap && (
                              <button
                                type="button"
                                onClick={() => handleOpenMindMap(folder, item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                Abrir no Construtor
                              </button>
                            )}

                            {(kind === 'pdf' || kind === 'image') && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewItem(previewItem?.id === item.id ? null : item)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                {previewItem?.id === item.id ? 'Fechar' : 'Visualizar'}
                              </button>
                            )}

                            {kind !== 'image' && (
                              <button
                                type="button"
                                onClick={() => setAiModalTarget({ folder, item })}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                Gerar com IA
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => void handleDownloadIndividual(folder, item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {kind === 'note' || kind === 'mindmap' ? 'Baixar PDF' : 'Baixar'}
                            </button>

                            {kind === 'mindmap' && item.mindMap && (
                              <button
                                type="button"
                                onClick={() => void handleDownloadMindMapPng(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Baixar PNG
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteItem(folder, item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                          </div>
                        </div>

                        {/* Inline structured reading for Notes */}
                        {kind === 'note' && item.content && (
                          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
                            <div
                              className={
                                !isExpanded && item.content.length > 420
                                  ? 'max-h-[160px] overflow-hidden relative'
                                  : undefined
                              }
                            >
                              <StructuredLegalText
                                text={item.content}
                                className="text-[12.5px] text-[var(--text)]"
                              />
                            </div>
                            {item.content.length > 420 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedNoteIds((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                                className="mt-2 text-[11.5px] font-bold text-[var(--accent)] hover:underline"
                              >
                                {isExpanded ? 'Mostrar menos' : 'Ler anotação completa'}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Full expanded tree preview for saved Mind Maps (all groups, subgroups & notes) */}
                        {kind === 'mindmap' && item.mindMap && (
                          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
                            <div className="text-[12.5px] font-extrabold text-[var(--text)] mb-1">
                              {item.mindMap.label}
                            </div>
                            {item.mindMap.note?.trim() && (
                              <div className="text-[11.5px] text-[var(--muted)] mb-2 break-words">
                                {item.mindMap.note.trim()}
                              </div>
                            )}
                            {item.mindMap.children && item.mindMap.children.length > 0 ? (
                              <div className="flex flex-col gap-1.5 pt-1 border-t border-[var(--line)]">
                                {item.mindMap.children.map((branch) =>
                                  renderExpandedMindMapBranch(branch, 0, item.mindMap?.customTags),
                                )}
                              </div>
                            ) : (
                              <div className="text-[11.5px] text-[var(--muted)]">
                                Sem ramos adicionados.
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState message="Nenhum resumo, anotação ou PDF encontrado para este filtro." />
              )}
            </Panel>
          ) : (
            <EmptyState message="Crie sua primeira matéria acima para começar a escrever anotações e anexar PDFs." />
          )}
        </div>
      )}

      {/* TAB 2: DEDICATED PDF ATTACHMENTS */}
      {activeTab === 'attachments' && (
        <div className="flex flex-col gap-4">
          {previewItem && (
            <FilePreview
              blobKey={previewItem.blobKey}
              filename={previewItem.name}
              mimeType={previewItem.mimeType}
              title={getSummaryDisplayTitle(previewItem)}
              onClose={() => setPreviewItem(null)}
            />
          )}

          <PdfAttachmentPanel
            summaryFolders={db.summaryFolders}
            disciplines={disciplines}
            activeFolder={activeFolder}
            hideUpload={hideUpload}
            mode="full"
            previewItemId={previewItem?.id || null}
            onCreateFolder={createSummaryFolder}
            onUploadFiles={uploadSummaryFiles}
            onMoveFile={moveSummaryFileToFolder}
            onPreviewItem={(item) =>
              setPreviewItem(previewItem?.id === item.id ? null : item)
            }
            onDownloadItem={handleDownloadIndividual}
            onOpenAiStudio={(folder, item) => setAiModalTarget({ folder, item })}
            onDeleteItem={handleDeleteItem}
            onNotify={toast}
          />
        </div>
      )}

      {/* TAB 3: VISUAL MIND MAP BUILDER */}
      {activeTab === 'mindmap' && (
        <Panel
          title={
            targetWriteFolder
              ? `Construtor Visual de Mapas Mentais · ${visibleName(targetWriteFolder)}`
              : 'Construtor Visual de Mapas Mentais'
          }
          action={
            folderNames.length > 0 ? (
              <select
                value={mindMapEditing.folder || targetWriteFolder}
                onChange={(e) => {
                  setSelectedFolder(e.target.value);
                  setMindMapEditing((prev) => ({ ...prev, folder: e.target.value }));
                }}
                className="ce-select h-[34px] w-auto text-[12px]"
              >
                {folderNames.map((f) => (
                  <option key={f} value={f}>
                    Salvar em: {visibleName(f)}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        >
          {folderNames.length === 0 ? (
            <EmptyState message="Crie uma matéria acima para construir e salvar seus mapas mentais visuais." />
          ) : (
            <MindMapBuilder
              subjectLabel={visibleName(mindMapEditing.folder || targetWriteFolder)}
              initialId={mindMapEditing.id}
              initialTitle={mindMapEditing.title}
              initialTree={mindMapEditing.tree}
              savedMaps={(
                db.summaryFolders[mindMapEditing.folder || targetWriteFolder] || []
              ).filter((it) => getSummaryItemKind(it) === 'mindmap' && it.mindMap)}
              onSelectSavedMap={(item) =>
                handleOpenMindMap(mindMapEditing.folder || targetWriteFolder, item)
              }
              onStartNewMap={() =>
                setMindMapEditing({
                  folder: mindMapEditing.folder || targetWriteFolder,
                })
              }
              onSave={async (payload) => {
                const folderToSave = mindMapEditing.folder || targetWriteFolder;
                const saved = await saveSummaryMindMap(folderToSave, payload);
                setMindMapEditing({
                  id: saved.id,
                  title: getSummaryDisplayTitle(saved),
                  tree: saved.mindMap,
                  folder: folderToSave,
                });
              }}
              onNotify={toast}
            />
          )}
        </Panel>
      )}

      {/* TAB 3: PER-SUBJECT & ALL-SUBJECTS PDF DOWNLOAD HUB */}
      {activeTab === 'downloads' && (
        <Panel
          title="Exportação e Download de PDFs por Matéria ou Consolidado"
          action={
            <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAttachedPdfs}
                onChange={(e) => setIncludeAttachedPdfs(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Mesclar PDFs anexados junto com as anotações
            </label>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong className="block text-[14px] font-bold text-[var(--text)]">
                  Baixar Dossiê Completo (Todas as Matérias em 1 PDF)
                </strong>
                <span className="block text-[12px] text-[var(--muted)] mt-0.5">
                  Inclui sumário inicial, todas as anotações formatadas, tópicos dos mapas mentais
                  {includeAttachedPdfs ? ' e todas as páginas dos PDFs anexados.' : '.'}
                </span>
              </div>
              <button
                type="button"
                disabled={exportingKey !== null || totalCounts.total === 0}
                onClick={() => void handleExportAllPdf()}
                className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-55 whitespace-nowrap"
              >
                {exportingKey === '__ALL__' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Baixar Todas as Matérias ({totalCounts.subjects})
              </button>
            </div>

            {folderNames.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {folderNames.map((folder) => {
                  const list = db.summaryFolders[folder] || [];
                  const notesCount = list.filter((i) => getSummaryItemKind(i) === 'note').length;
                  const pdfCount = list.filter((i) => getSummaryItemKind(i) === 'pdf').length;
                  const mapCount = list.filter((i) => getSummaryItemKind(i) === 'mindmap').length;
                  const isBusy = exportingKey === folder;

                  return (
                    <div
                      key={folder}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <strong className="block text-[13.5px] font-bold text-[var(--text)] truncate">
                          {visibleName(folder)}
                        </strong>
                        <span className="block text-[11.5px] text-[var(--muted)] font-mono-num">
                          {notesCount} anotação(ões) · {pdfCount} PDF(s) · {mapCount} mapa(s)
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={exportingKey !== null || list.length === 0}
                        onClick={() => void handleExportSubjectPdf(folder)}
                        className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap shrink-0"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5 text-[var(--accent)]" />
                        )}
                        Baixar PDF
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState message="Nenhuma matéria cadastrada ainda." />
            )}
          </div>
        </Panel>
      )}

      {/* AI Studio Modal */}
      {aiModalTarget && (
        <SummaryAiStudioModal
          subjectKey={aiModalTarget.folder}
          item={aiModalTarget.item}
          onClose={() => setAiModalTarget(null)}
          onSaveAsNote={async (title, content) => {
            await saveSummaryNote(aiModalTarget.folder, {
              title,
              content,
              tags: ['Gerado por IA'],
            });
          }}
          onSaveQuestions={async (questions: Question[], title: string) => {
            await importParsedQuestions(questions, {
              subject: visibleName(aiModalTarget.folder),
              asSimulation: false,
              title,
            });
          }}
          onSaveFlashcardsToNotebook={(cards) => {
            const subjectLabel = visibleName(aiModalTarget.folder);
            cards.forEach((c) => {
              addAnnotation(
                subjectLabel,
                'Flashcard IA',
                `Pergunta: ${c.front}\nResposta: ${c.back}`,
              );
            });
            toast(`${cards.length} flashcards enviados ao Caderno de Erros (${subjectLabel}).`);
          }}
          onOpenMindMapInBuilder={(title, tree) => {
            setSelectedFolder(aiModalTarget.folder);
            setMindMapEditing({
              id: undefined,
              title,
              tree,
              folder: aiModalTarget.folder,
            });
            setActiveTab('mindmap');
            toast('Mapa mental gerado por IA aberto no Construtor Visual! Salve quando terminar.');
          }}
          onNotify={toast}
        />
      )}
    </div>
  );
};
