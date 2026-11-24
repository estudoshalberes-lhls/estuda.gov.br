import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkCheck,
  Check,
  Download,
  Eye,
  FileUp,
  Folder,
  FolderPlus,
  Highlighter,
  LayoutGrid,
  List,
  ListPlus,
  Maximize2,
  Minimize2,
  Pencil,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import { getKnownStudyDriveFolderNames, getPreferredStudyFolder } from '../lib/googleDrive';
import {
  formatUploadSize,
  isReservedBackupFolderName,
  normalizeSearch,
  visibleName,
} from '../lib/parsers';
import { ContentStudyStatus, PersonalPdfFile } from '../types/study';
import { PdfAnnotatorViewer } from '../components/ui/PdfAnnotatorViewer';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import {
  PinToggleButton,
  ReadingQueueButton,
  STUDY_STATUS_LIST,
  STUDY_STATUS_META,
  StudyStatusSelect,
} from '../components/ui/ContentReadingSurface';

export const PersonalPdfsPage: React.FC = () => {
  const {
    db,
    moduleVisibility,
    requestConfirm,
    createPdfFolder,
    renamePdfFolder,
    uploadPersonalPdfs,
    replacePersonalPdf,
    deletePersonalPdf,
    deletePdfFolder,
    updatePersonalPdfMeta,
    setActivePage,
    openLawAt,
    addToReadingQueue,
    removeFromReadingQueue,
    toggleReadingQueueDone,
    clearReadingQueue,
    toast,
    driveConnected,
    activeDriveFolderName,
    driveFolderUrl,
    connectGoogleDrive,
    syncAllLocalFilesToDrive,
    isSyncingDrive,
    examFocusMode,
    setExamFocusMode,
  } = useStudy();

  useEffect(() => {
    if (!examFocusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExamFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [examFocusMode, setExamFocusMode]);

  useEffect(() => () => setExamFocusMode(false), [setExamFocusMode]);

  const hideUpload = moduleVisibility('PDFs Pessoais').hide_upload;
  const folderNames = useMemo(() => {
    const extraBaseNames = [
      activeDriveFolderName,
      getPreferredStudyFolder().name,
      ...getKnownStudyDriveFolderNames(),
    ];
    return Object.keys(db.pdfFolders)
      .filter((name) => !isReservedBackupFolderName(name, extraBaseNames, db.pdfFolders[name]))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [activeDriveFolderName, db.pdfFolders]);

  const [selectedFolder, setSelectedFolder] = useState<string>(folderNames[0] || '');
  const activeFolder = folderNames.includes(selectedFolder)
    ? selectedFolder
    : folderNames[0] || '';

  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamedValue, setRenamedValue] = useState('');
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<PersonalPdfFile | null>(null);

  // Organization & filtering controls
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAllFolders, setSearchAllFolders] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | ContentStudyStatus>('all');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [onlyAnnotated, setOnlyAnnotated] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'lastOpened' | 'alpha' | 'annotated'>('recent');
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards');
  const [editingSubtopicId, setEditingSubtopicId] = useState<string | null>(null);
  const [subtopicDraft, setSubtopicDraft] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceFileId, setReplaceFileId] = useState<string | null>(null);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      toast('Informe o nome da pasta.', true);
      return;
    }
    const created = createPdfFolder(newFolderName);
    setSelectedFolder(created);
    setNewFolderName('');
  };

  const handleFilesUpload = async (targetFolder: string, files: File[]) => {
    if (!targetFolder || !files.length) return;
    try {
      const count = await uploadPersonalPdfs(targetFolder, files);
      toast(`${count} PDF(s) salvo(s) na pasta "${visibleName(targetFolder)}".`);
      setSelectedFolder(targetFolder);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const handleDownload = async (file: PersonalPdfFile) => {
    const blob = await getFileBlob(file.blobKey);
    if (!blob) {
      toast('PDF não encontrado no armazenamento local.', true);
      return;
    }
    triggerBlobDownload(blob, file.name);
  };

  const handleDeleteFolder = async (folder: string) => {
    const ok = await requestConfirm({
      title: 'Remover pasta de PDFs',
      description: `Deseja excluir a pasta "${visibleName(folder)}" e todos os arquivos dentro dela?`,
      confirmLabel: 'Remover pasta',
      danger: true,
    });
    if (!ok) return;
    const removed = await deletePdfFolder(folder);
    toast(`Pasta "${visibleName(folder)}" e ${removed} arquivo(s) removidos.`);
    if (previewPdf) setPreviewPdf(null);
  };

  const handleReplaceTrigger = (id: string) => {
    setReplaceFileId(id);
    replaceInputRef.current?.click();
  };

  const handleReplaceChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = replaceFileId;
    e.target.value = '';
    setReplaceFileId(null);
    if (!file || !id || !activeFolder) return;
    try {
      await replacePersonalPdf(activeFolder, id, file);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const openPdfFile = (folder: string, file: PersonalPdfFile) => {
    if (previewPdf?.id === file.id) {
      setPreviewPdf(null);
      return;
    }
    setSelectedFolder(folder);
    updatePersonalPdfMeta(folder, file.id, { lastOpenedAt: new Date().toISOString() });
    setPreviewPdf(file);
  };

  // Most recently opened PDF across all folders ("Continuar de onde parou")
  const lastOpenedEntry = useMemo(() => {
    let best: { folder: string; file: PersonalPdfFile } | null = null;
    for (const folder of folderNames) {
      for (const file of db.pdfFolders[folder] || []) {
        if (!file.lastOpenedAt) continue;
        if (!best || file.lastOpenedAt > (best.file.lastOpenedAt || '')) {
          best = { folder, file };
        }
      }
    }
    return best;
  }, [db.pdfFolders, folderNames]);

  const activeFiles = useMemo(() => {
    const base: Array<{ folder: string; file: PersonalPdfFile }> = searchAllFolders
      ? folderNames.flatMap((folder) =>
          (db.pdfFolders[folder] || []).map((file) => ({ folder, file })),
        )
      : activeFolder
        ? (db.pdfFolders[activeFolder] || []).map((file) => ({ folder: activeFolder, file }))
        : [];

    const q = normalizeSearch(searchQuery);
    const filtered = base.filter(({ folder, file }) => {
      const fileAnn = db.pdfAnnotations?.[file.blobKey];
      const annCount = (fileAnn?.strokes?.length || 0) + (fileAnn?.notes?.length || 0);
      const isAnnotated = annCount > 0 || Boolean(file.hasAnnotations);
      if (onlyPinned && !file.pinned) return false;
      if (onlyAnnotated && !isAnnotated) return false;
      if (statusFilter !== 'all' && (file.studyStatus || 'a_ler') !== statusFilter) return false;
      if (q) {
        const hay = normalizeSearch(
          `${visibleName(folder)} ${visibleName(file.name)} ${file.subtopic || ''}`,
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const pinDiff = (b.file.pinned ? 1 : 0) - (a.file.pinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      if (sortBy === 'alpha') {
        return visibleName(a.file.name).localeCompare(visibleName(b.file.name), 'pt-BR');
      }
      if (sortBy === 'lastOpened') {
        const ao = a.file.lastOpenedAt || a.file.updatedAt || a.file.createdAt || '';
        const bo = b.file.lastOpenedAt || b.file.updatedAt || b.file.createdAt || '';
        return bo.localeCompare(ao);
      }
      if (sortBy === 'annotated') {
        const aAnn =
          (db.pdfAnnotations?.[a.file.blobKey]?.strokes?.length || 0) +
          (db.pdfAnnotations?.[a.file.blobKey]?.notes?.length || 0);
        const bAnn =
          (db.pdfAnnotations?.[b.file.blobKey]?.strokes?.length || 0) +
          (db.pdfAnnotations?.[b.file.blobKey]?.notes?.length || 0);
        if (bAnn !== aAnn) return bAnn - aAnn;
      }
      return (b.file.updatedAt || b.file.createdAt || '').localeCompare(
        a.file.updatedAt || a.file.createdAt || '',
      );
    });
  }, [
    activeFolder,
    db.pdfAnnotations,
    db.pdfFolders,
    folderNames,
    onlyAnnotated,
    onlyPinned,
    searchAllFolders,
    searchQuery,
    sortBy,
    statusFilter,
  ]);

  const activePreviewEntry = useMemo(() => {
    if (!previewPdf) return null;
    for (const folder of folderNames) {
      const found = (db.pdfFolders[folder] || []).find((f) => f.id === previewPdf.id);
      if (found) return { folder, file: found };
    }
    return activeFolder ? { folder: activeFolder, file: previewPdf } : null;
  }, [activeFolder, db.pdfFolders, folderNames, previewPdf]);

  return (
    <div>
      {examFocusMode ? (
        <div className="mb-3 pb-2.5 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <div className="flex items-center gap-2 font-extrabold uppercase tracking-[0.05em] text-[var(--accent)]">
            <Maximize2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              Modo Leitura ·{' '}
              {activePreviewEntry
                ? visibleName(activePreviewEntry.file.name)
                : activeFolder
                  ? visibleName(activeFolder)
                  : 'PDFs Pessoais'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExamFocusMode(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
            Sair do Modo Leitura (Esc)
          </button>
        </div>
      ) : (
        <PageHeader
          eyebrow="ACERVO PRIVADO · PDFS PESSOAIS"
          title="Biblioteca pessoal de apostilas e materiais"
          description="Organize apostilas em pastas temáticas, arraste arquivos diretamente para qualquer setor, visualize inline e atualize versões."
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
                  } else if (q.kind === 'caselaw') {
                    setActivePage('Súmulas e Jurisprudência');
                  } else if (q.kind === 'pdf' && q.folder && q.itemId) {
                    const target = (db.pdfFolders[q.folder] || []).find((f) => f.id === q.itemId);
                    if (target) openPdfFile(q.folder, target);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setExamFocusMode(true)}
                title="Ativar Modo Leitura (oculta barras laterais e cabeçalho para maximizar a leitura)"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shadow-xs cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                Modo Leitura
              </button>
              {driveConnected ? (
                <>
                  {driveFolderUrl && (
                    <a
                      href={driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors shadow-xs"
                    >
                      Pasta no Drive ↗
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void syncAllLocalFilesToDrive()}
                    disabled={isSyncingDrive}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-90 disabled:opacity-60 transition-all shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                    {isSyncingDrive ? 'Sincronizando...' : 'Sincronizar com Drive'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => connectGoogleDrive()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shadow-xs"
                >
                  Vincular ao Google Drive
                </button>
              )}
            </div>
          }
        />
      )}

      {!examFocusMode && lastOpenedEntry && (!activePreviewEntry || activePreviewEntry.file.id !== lastOpenedEntry.file.id) && (
        <div className="mb-4 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-[12.5px]">
            <BookmarkCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span className="text-[var(--muted)] font-semibold shrink-0">Continuar leitura:</span>
            <strong className="text-[var(--text)] truncate">
              {visibleName(lastOpenedEntry.file.name)}
            </strong>
            <span className="text-[var(--muted)] text-[11.5px] hidden sm:inline">
              · {visibleName(lastOpenedEntry.folder)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openPdfFile(lastOpenedEntry.folder, lastOpenedEntry.file)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            Retomar PDF
          </button>
        </div>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf"
        onChange={(e) => void handleReplaceChange(e)}
        className="hidden"
      />

      {!hideUpload && !examFocusMode && (
        <Panel title="Pastas" className="mb-4">
          <form onSubmit={handleCreateFolder} className="flex flex-wrap gap-2 mb-3.5">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nome da nova pasta (ex.: Direito_Tributario)"
              className="ce-input flex-1 min-w-[220px]"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Criar pasta
            </button>
          </form>

          {folderNames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {folderNames.map((folder) => {
                const count = (db.pdfFolders[folder] || []).length;
                const isSelected = folder === activeFolder && !searchAllFolders;
                const isDrag = dragOverTarget === folder;
                const isRenaming = renamingFolder === folder;

                return (
                  <div
                    key={folder}
                    onClick={() => {
                      if (!isRenaming) {
                        setSearchAllFolders(false);
                        setSelectedFolder(folder);
                        setPreviewPdf(null);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverTarget(folder);
                    }}
                    onDragLeave={() => setDragOverTarget(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverTarget(null);
                      const files = Array.from(e.dataTransfer.files);
                      void handleFilesUpload(folder, files);
                    }}
                    className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                      isDrag
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : isSelected
                          ? 'border-[var(--accent)] bg-[var(--panel-soft)]'
                          : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {isRenaming ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (renamedValue.trim()) {
                              const newKey = renamePdfFolder(folder, renamedValue);
                              setSelectedFolder(newKey);
                            }
                            setRenamingFolder(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 flex-1 min-w-0"
                        >
                          <input
                            type="text"
                            value={renamedValue}
                            onChange={(e) => setRenamedValue(e.target.value)}
                            className="ce-input h-7 py-0 px-2 text-[12.5px] flex-1 min-w-0"
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="p-1 rounded bg-[var(--accent)] text-white hover:opacity-90 shrink-0"
                            title="Salvar novo nome"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingFolder(null)}
                            className="p-1 rounded bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] shrink-0"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
                            <strong className="text-[13.5px] font-bold text-[var(--text)] truncate">
                              {visibleName(folder)}
                            </strong>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingFolder(folder);
                                setRenamedValue(visibleName(folder));
                              }}
                              aria-label={`Renomear pasta ${visibleName(folder)}`}
                              title="Renomear pasta"
                              className="p-1 rounded text-[var(--muted)] hover:text-[var(--accent)]"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteFolder(folder);
                              }}
                              aria-label={`Remover pasta ${visibleName(folder)}`}
                              title="Excluir pasta"
                              className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-[var(--muted)] tabular-nums">
                      {count} {count === 1 ? 'PDF salvo' : 'PDFs salvos'} · Solte arquivos aqui
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {activeFolder ? (
        <Panel
          title={
            searchAllFolders
              ? `Todas as pastas (${activeFiles.length})`
              : `Pasta selecionada: ${visibleName(activeFolder)}`
          }
          subtitle={`${activeFiles.length} documento(s)`}
          stackHeader
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar PDF ou assunto..."
                  className="ce-input pl-8 h-[32px] w-[180px] text-[12px]"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchAllFolders((v) => !v)}
                className={`h-[32px] px-2.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  searchAllFolders
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                Todas pastas
              </button>
              <select
                aria-label="Filtrar por status de leitura"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | ContentStudyStatus)}
                className="ce-select h-[32px] w-auto text-[11.5px]"
              >
                <option value="all">Status: Todos</option>
                {STUDY_STATUS_LIST.map((st) => (
                  <option key={st} value={st}>
                    {STUDY_STATUS_META[st].label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Ordenar PDFs"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'recent' | 'lastOpened' | 'alpha' | 'annotated')
                }
                className="ce-select h-[32px] w-auto text-[11.5px]"
              >
                <option value="recent">Mais recentes</option>
                <option value="lastOpened">Último aberto</option>
                <option value="alpha">Ordem alfabética</option>
                <option value="annotated">Anotados primeiro</option>
              </select>
              <button
                type="button"
                onClick={() => setOnlyPinned((v) => !v)}
                className={`h-[32px] px-2.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  onlyPinned
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                Fixados
              </button>
              <button
                type="button"
                onClick={() => setOnlyAnnotated((v) => !v)}
                className={`h-[32px] px-2.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  onlyAnnotated
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                Anotados
              </button>
              <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
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
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    viewMode === 'compact'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  Compacta
                </button>
              </div>
            </div>
          }
        >
          {!hideUpload && !examFocusMode && !searchAllFolders && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTarget('__dropzone__');
              }}
              onDragLeave={() => setDragOverTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTarget(null);
                void handleFilesUpload(activeFolder, Array.from(e.dataTransfer.files));
              }}
              className={`mb-4 rounded-xl border border-dashed p-5 text-center transition-colors ${
                dragOverTarget === '__dropzone__'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-soft)]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = '';
                  void handleFilesUpload(activeFolder, files);
                }}
                className="hidden"
              />
              <FileUp className="w-5 h-5 text-[var(--accent)] mx-auto mb-2" />
              <div className="text-[13px] font-semibold text-[var(--text)]">
                Arraste PDFs para cá ou clique para adicionar em {visibleName(activeFolder)}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2.5 px-3.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                Selecionar PDF(s)
              </button>
            </div>
          )}

          {activePreviewEntry && (
            <PdfAnnotatorViewer
              folder={activePreviewEntry.folder}
              file={activePreviewEntry.file}
              onClose={() => setPreviewPdf(null)}
            />
          )}

          {activeFiles.length ? (
            viewMode === 'compact' ? (
              <div className="mt-4 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden">
                {activeFiles.map(({ folder, file }) => {
                  const fileAnn = db.pdfAnnotations?.[file.blobKey];
                  const annotationCount =
                    (fileAnn?.strokes?.length || 0) + (fileAnn?.notes?.length || 0);
                  const isAnnotated = annotationCount > 0 || Boolean(file.hasAnnotations);

                  return (
                    <div
                      key={`${folder}-${file.id}`}
                      className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 hover:bg-[var(--panel)] transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-[min(100%,240px)] flex-1">
                        <PinToggleButton
                          pinned={file.pinned}
                          onToggle={() =>
                            updatePersonalPdfMeta(folder, file.id, { pinned: !file.pinned })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => openPdfFile(folder, file)}
                            className="text-left text-[13px] font-bold text-[var(--text)] hover:text-[var(--accent)] truncate block w-full cursor-pointer"
                          >
                            {visibleName(file.name)}
                          </button>
                          <div className="text-[11px] text-[var(--muted)] font-mono-num truncate">
                            {searchAllFolders ? `${visibleName(folder)} · ` : ''}
                            {file.subtopic ? `${file.subtopic} · ` : ''}
                            {formatUploadSize(file.size)}
                            {isAnnotated
                              ? ` · ${annotationCount > 0 ? `${annotationCount} marcação(ões)` : 'Marcado'}`
                              : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <StudyStatusSelect
                          value={file.studyStatus}
                          onChange={(next) =>
                            updatePersonalPdfMeta(folder, file.id, { studyStatus: next })
                          }
                          compact
                        />
                        <button
                          type="button"
                          onClick={() => openPdfFile(folder, file)}
                          className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          {previewPdf?.id === file.id ? 'Fechar' : 'Abrir'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            addToReadingQueue({
                              kind: 'pdf',
                              title: visibleName(file.name),
                              subtitle: visibleName(folder),
                              folder,
                              itemId: file.id,
                            })
                          }
                          title="Adicionar à Fila de Leitura"
                          className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownload(file)}
                          title="Baixar"
                          className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deletePersonalPdf(folder, file.id)}
                          title="Excluir"
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
            <div className="mt-4 flex flex-col gap-2.5">
              {activeFiles.map(({ folder, file }) => {
                const fileAnn = db.pdfAnnotations?.[file.blobKey];
                const annotationCount =
                  (fileAnn?.strokes?.length || 0) + (fileAnn?.notes?.length || 0);
                const isAnnotated = annotationCount > 0 || Boolean(file.hasAnnotations);
                const isEditingSubtopic = editingSubtopicId === file.id;

                return (
                <div
                  key={`${folder}-${file.id}`}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--panel-soft)] p-3 ${
                    file.pinned ? 'border-[var(--accent)]/60' : 'border-[var(--line)]'
                  }`}
                >
                  <div className="min-w-[min(100%,240px)] flex-1 text-left">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                      <strong className="text-[13.5px] font-bold leading-snug text-[var(--text)] break-words">
                        {visibleName(file.name)}
                      </strong>
                      {isAnnotated && (
                        <span
                          title="PDF com marcações salvas automaticamente"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] shrink-0"
                        >
                          <Highlighter className="w-3 h-3" />
                          {annotationCount > 0 ? `${annotationCount} marcação(ões)` : 'Marcado'}
                        </span>
                      )}
                    </div>
                    <span className="block text-[11.5px] text-[var(--muted)] font-mono-num">
                      {searchAllFolders ? `${visibleName(folder)} · ` : ''}
                      {file.subtopic ? `Assunto: ${file.subtopic} · ` : ''}
                      {formatUploadSize(file.size)} · Enviado em {file.createdAt}
                      {file.updatedAt ? ` · Atualizado em ${new Date(file.updatedAt).toLocaleDateString('pt-BR')}` : ''}
                    </span>
                    {isEditingSubtopic && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          updatePersonalPdfMeta(folder, file.id, {
                            subtopic: subtopicDraft.trim(),
                          });
                          setEditingSubtopicId(null);
                        }}
                        className="mt-2 flex items-center gap-1.5 max-w-[340px]"
                      >
                        <input
                          type="text"
                          value={subtopicDraft}
                          onChange={(e) => setSubtopicDraft(e.target.value)}
                          placeholder="Assunto / subtópico do PDF..."
                          className="ce-input h-[28px] text-[11.5px] flex-1"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="h-[28px] px-2.5 rounded-lg bg-[var(--accent)] text-white text-[11px] font-bold cursor-pointer"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSubtopicId(null)}
                          className="h-[28px] px-2 rounded-lg border border-[var(--line)] text-[11px] text-[var(--muted)] cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
                    <PinToggleButton
                      pinned={file.pinned}
                      onToggle={() =>
                        updatePersonalPdfMeta(folder, file.id, { pinned: !file.pinned })
                      }
                    />
                    <StudyStatusSelect
                      value={file.studyStatus}
                      onChange={(next) =>
                        updatePersonalPdfMeta(folder, file.id, { studyStatus: next })
                      }
                      compact
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSubtopicId(file.id);
                        setSubtopicDraft(file.subtopic || '');
                      }}
                      title="Definir assunto / subtópico"
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                    >
                      <Tag className="w-3 h-3" />
                      Assunto
                    </button>
                    <button
                      type="button"
                      onClick={() => openPdfFile(folder, file)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {previewPdf?.id === file.id ? 'Fechar' : 'Abrir / Marcar'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        addToReadingQueue({
                          kind: 'pdf',
                          title: visibleName(file.name),
                          subtitle: visibleName(folder),
                          folder,
                          itemId: file.id,
                        })
                      }
                      title="Adicionar à Fila de Leitura"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                    >
                      <ListPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Na Fila
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownload(file)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReplaceTrigger(file.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Substituir
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePersonalPdf(folder, file.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
            )
          ) : (
            <EmptyState message="Nenhum PDF encontrado para este filtro ou pasta." />
          )}
        </Panel>
      ) : (
        <EmptyState message="Crie uma pasta acima para armazenar seus PDFs pessoais." />
      )}
    </div>
  );
};
