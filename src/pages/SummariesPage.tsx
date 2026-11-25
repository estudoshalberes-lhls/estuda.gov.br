import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Edit3,
  Eye,
  FileDown,
  FilePlus2,
  FileText,
  FolderPlus,
  GitBranch,
  LayoutGrid,
  List,
  ListPlus,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Pencil,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import { formatUploadSize, normalizeSearch, visibleName } from '../lib/parsers';
import {
  exportSummaryNoteDocx,
  htmlToPlainText,
  markdownToInitialHtml,
  sanitizeDocHtml,
} from '../lib/richDocUtils';
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
import {
  ContentStudyStatus,
  MindMapCustomTag,
  MindMapNode,
  Question,
  SummaryFile,
  SummaryItemKind,
} from '../types/study';
import { MindMapBuilder } from '../components/summaries/MindMapBuilder';
import { PdfAttachmentPanel } from '../components/summaries/PdfAttachmentPanel';
import { RichDocumentEditor } from '../components/summaries/RichDocumentEditor';
import { SummaryAiStudioModal } from '../components/summaries/SummaryAiStudioModal';
import { SummaryGoogleDocsPanel } from '../components/workspace/SummaryGoogleDocsPanel';
import {
  PinToggleButton,
  ReadingQueueButton,
  RichHtmlReactRenderer,
  RichNoteRenderer,
  STUDY_STATUS_LIST,
  STUDY_STATUS_META,
  StudyStatusSelect,
  SummaryReaderModal,
} from '../components/ui/ContentReadingSurface';
import { FilePreview } from '../components/ui/FilePreview';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

type ActiveTab = 'notes' | 'attachments' | 'mindmap' | 'downloads';
type KindFilter = 'all' | SummaryItemKind;

interface FolderItemEntry {
  folder: string;
  item: SummaryFile;
}

interface SummaryEditorDraft {
  folder: string;
  editingNoteId?: string;
  title: string;
  subtopic: string;
  tagsInput: string;
  contentHtml: string;
  updatedAt: string;
}

type AutoSaveStatus = 'idle' | 'typing' | 'saving' | 'saved' | 'draft_only' | 'error';

const SUMMARY_DRAFTS_STORAGE_KEY = 'ce-summary-editor-drafts-v1';
const AUTOSAVE_LOCAL_DELAY_MS = 450;
const AUTOSAVE_PERSIST_DELAY_MS = 1500;

function formatClockTime(date = new Date()): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getSummaryDraftKey(folder: string, editingNoteId?: string): string {
  return editingNoteId ? `note:${editingNoteId}` : `new:${folder}`;
}

function buildNoteFingerprint(params: {
  folder: string;
  editingNoteId?: string;
  title: string;
  subtopic: string;
  tagsInput: string;
  contentHtml: string;
}): string {
  return JSON.stringify([
    params.folder,
    params.editingNoteId || '',
    params.title,
    params.subtopic,
    params.tagsInput,
    params.contentHtml,
  ]);
}

function readAllSummaryDrafts(): Record<string, SummaryEditorDraft> {
  try {
    const raw = localStorage.getItem(SUMMARY_DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, SummaryEditorDraft>;
  } catch {
    return {};
  }
}

function readSummaryDraft(key: string): SummaryEditorDraft | null {
  const all = readAllSummaryDrafts();
  return all[key] || null;
}

function writeSummaryDraft(key: string, draft: SummaryEditorDraft): void {
  try {
    const all = readAllSummaryDrafts();
    all[key] = draft;
    const entries = Object.entries(all)
      .sort((a, b) => (b[1].updatedAt || '').localeCompare(a[1].updatedAt || ''))
      .slice(0, 20);
    localStorage.setItem(SUMMARY_DRAFTS_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // ignore storage quota errors
  }
}

function removeSummaryDraft(key: string): void {
  try {
    const all = readAllSummaryDrafts();
    if (!(key in all)) return;
    delete all[key];
    localStorage.setItem(SUMMARY_DRAFTS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
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
    updateSummaryItemMeta,
    deleteSummaryFile,
    moveSummaryFileToFolder,
    importParsedQuestions,
    addAnnotation,
    setActivePage,
    openLawAt,
    addToReadingQueue,
    removeFromReadingQueue,
    toggleReadingQueueDone,
    clearReadingQueue,
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

  // Note editor state (Word / Google Docs-like rich editor + debounced auto-save)
  const [editingNoteId, setEditingNoteId] = useState<string | undefined>(undefined);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteSubtopic, setNoteSubtopic] = useState('');
  const [noteTagsInput, setNoteTagsInput] = useState('');
  const [noteContentHtml, setNoteContentHtml] = useState('');
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [savingNote, setSavingNote] = useState(false);
  const [noteEditorExpanded, setNoteEditorExpanded] = useState(true);
  const [composerMode, setComposerMode] = useState<'local' | 'gdocs'>('local');
  const [activeGoogleDoc, setActiveGoogleDoc] = useState<{
    id: string;
    name: string;
    webViewLink?: string;
  } | null>(null);
  const [readingExpanded, setReadingExpanded] = useState(false);
  const [readingComfortableWidth, setReadingComfortableWidth] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<{
    status: AutoSaveStatus;
    lastSavedAt: string | null;
    restoredDraft?: boolean;
    error?: string;
  }>({ status: 'idle', lastSavedAt: null });

  const localDraftTimerRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const autoSavePendingRerunRef = useRef(false);
  const lastSavedFingerprintRef = useRef<string>('');
  const lastRestoredFolderRef = useRef<string>('');

  // Mind map builder state
  const [mindMapEditing, setMindMapEditing] = useState<{
    id?: string;
    title?: string;
    tree?: MindMapNode | null;
    folder?: string;
  }>({});

  // List search, filter, sort, view mode, reader & AI modal
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ContentStudyStatus>('all');
  const [subtopicFilter, setSubtopicFilter] = useState<string>('__ALL__');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'lastOpened' | 'alpha' | 'status'>('recent');
  const [viewMode, setViewMode] = useState<'cards' | 'compact'>('cards');
  const [previewItem, setPreviewItem] = useState<SummaryFile | null>(null);
  const [readerTarget, setReaderTarget] = useState<{ folder: string; itemId: string } | null>(null);
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

  const availableSubtopics = useMemo(() => {
    const base =
      activeFolder === '__ALL__'
        ? folderNames.flatMap((folder) => db.summaryFolders[folder] || [])
        : activeFolder
          ? db.summaryFolders[activeFolder] || []
          : [];
    const set = new Set<string>();
    base.forEach((it) => {
      if (it.subtopic?.trim()) set.add(it.subtopic.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [activeFolder, db.summaryFolders, folderNames]);

  const editalSubtopicSuggestions = useMemo(() => {
    const set = new Set<string>(availableSubtopics);
    const subjNorm = activeFolder && activeFolder !== '__ALL__' ? normalizeSearch(visibleName(activeFolder)) : '';
    db.contests.forEach((c) => {
      (c.edital_pontos || []).forEach((pt) => {
        if (!subjNorm || normalizeSearch(pt.materia).includes(subjNorm) || subjNorm.includes(normalizeSearch(pt.materia))) {
          if (pt.titulo?.trim()) set.add(pt.titulo.trim());
        }
      });
    });
    return Array.from(set).slice(0, 60);
  }, [activeFolder, availableSubtopics, db.contests]);

  // Cross-module Subject Hub counts for active subject folder
  const subjectHubCounts = useMemo(() => {
    if (!activeFolder || activeFolder === '__ALL__') return null;
    const subjNorm = normalizeSearch(visibleName(activeFolder));
    if (!subjNorm) return null;
    const matchesSubject = (candidate?: string) => {
      const c = normalizeSearch(candidate || '');
      return Boolean(c && (c.includes(subjNorm) || subjNorm.includes(c)));
    };
    const matchingLaws = Object.keys(db.laws).filter((lf) => matchesSubject(visibleName(lf)));
    const matchingCaseLaw = db.caseLaw.filter(
      (c) => matchesSubject(c.materia) || matchesSubject(c.titulo) || matchesSubject(c.texto),
    );
    const matchingPdfs = Object.entries(db.pdfFolders).reduce(
      (acc, [pf, list]) => (matchesSubject(visibleName(pf)) ? acc + list.length : acc),
      0,
    );
    const matchingErrors = db.annotations.filter((a) => matchesSubject(a.materia));
    return {
      laws: matchingLaws,
      caseLawCount: matchingCaseLaw.length,
      pdfsCount: matchingPdfs,
      errorsCount: matchingErrors.length,
      pendingErrorsCount: matchingErrors.filter((a) => !a.corrigido).length,
    };
  }, [activeFolder, db.annotations, db.caseLaw, db.laws, db.pdfFolders]);

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
    const filtered = base.filter(({ folder, item }) => {
      const k = getSummaryItemKind(item);
      if (kindFilter !== 'all' && k !== kindFilter) return false;
      if (onlyPinned && !item.pinned) return false;
      if (statusFilter !== 'all' && (item.studyStatus || 'a_ler') !== statusFilter) return false;
      if (
        subtopicFilter !== '__ALL__' &&
        (item.subtopic?.trim() || '') !== subtopicFilter
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        visibleName(folder),
        getSummaryDisplayTitle(item),
        item.subtopic || '',
        item.name,
        item.content || '',
        (item.tags || []).join(' '),
        item.mindMap ? flattenMindMapToOutline(item.mindMap).join(' ') : '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    return filtered.sort((a, b) => {
      const pinDiff = (b.item.pinned ? 1 : 0) - (a.item.pinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      if (sortBy === 'alpha') {
        return getSummaryDisplayTitle(a.item).localeCompare(
          getSummaryDisplayTitle(b.item),
          'pt-BR',
        );
      }
      if (sortBy === 'lastOpened') {
        const ao = a.item.lastOpenedAt || a.item.updatedAt || a.item.createdAt || '';
        const bo = b.item.lastOpenedAt || b.item.updatedAt || b.item.createdAt || '';
        return bo.localeCompare(ao);
      }
      if (sortBy === 'status') {
        const as = STUDY_STATUS_META[a.item.studyStatus || 'a_ler'].order;
        const bs = STUDY_STATUS_META[b.item.studyStatus || 'a_ler'].order;
        if (as !== bs) return as - bs;
      }
      const ad = a.item.updatedAt || a.item.createdAt || '';
      const bd = b.item.updatedAt || b.item.createdAt || '';
      return bd.localeCompare(ad);
    });
  }, [
    activeFolder,
    db.summaryFolders,
    folderNames,
    kindFilter,
    onlyPinned,
    searchQuery,
    sortBy,
    statusFilter,
    subtopicFilter,
  ]);

  const activeReaderEntry = useMemo(() => {
    if (!readerTarget) return null;
    const found = (db.summaryFolders[readerTarget.folder] || []).find(
      (it) => it.id === readerTarget.itemId,
    );
    return found ? { folder: readerTarget.folder, item: found } : null;
  }, [db.summaryFolders, readerTarget]);

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

  const draftSnapshotRef = useRef({
    folder: targetWriteFolder,
    editingNoteId,
    title: noteTitle,
    subtopic: noteSubtopic,
    tagsInput: noteTagsInput,
    contentHtml: noteContentHtml,
  });

  useEffect(() => {
    draftSnapshotRef.current = {
      folder: targetWriteFolder,
      editingNoteId,
      title: noteTitle,
      subtopic: noteSubtopic,
      tagsInput: noteTagsInput,
      contentHtml: noteContentHtml,
    };
  }, [targetWriteFolder, editingNoteId, noteTitle, noteSubtopic, noteTagsInput, noteContentHtml]);

  const clearAutoSaveTimers = useCallback(() => {
    if (localDraftTimerRef.current !== null) {
      window.clearTimeout(localDraftTimerRef.current);
      localDraftTimerRef.current = null;
    }
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const persistLocalDraftNow = useCallback(() => {
    const snap = draftSnapshotRef.current;
    if (!snap.folder) return;
    const key = getSummaryDraftKey(snap.folder, snap.editingNoteId);
    const safeHtml = sanitizeDocHtml(snap.contentHtml);
    const plain = htmlToPlainText(safeHtml).trim();
    const hasAnyInput = Boolean(
      snap.title.trim() || snap.subtopic.trim() || snap.tagsInput.trim() || plain,
    );
    if (!hasAnyInput) {
      removeSummaryDraft(key);
      return;
    }
    const fp = buildNoteFingerprint(snap);
    if (fp === lastSavedFingerprintRef.current) {
      removeSummaryDraft(key);
      return;
    }
    writeSummaryDraft(key, {
      folder: snap.folder,
      editingNoteId: snap.editingNoteId,
      title: snap.title,
      subtopic: snap.subtopic,
      tagsInput: snap.tagsInput,
      contentHtml: safeHtml,
      updatedAt: new Date().toISOString(),
    });
  }, []);

  const runDebouncedAutoSave = useCallback(async () => {
    const snap = draftSnapshotRef.current;
    if (!snap.folder) return;

    const currentFp = buildNoteFingerprint(snap);
    if (currentFp === lastSavedFingerprintRef.current) {
      removeSummaryDraft(getSummaryDraftKey(snap.folder, snap.editingNoteId));
      return;
    }

    const safeHtml = sanitizeDocHtml(snap.contentHtml);
    const plainText = htmlToPlainText(safeHtml).trim();
    const cleanTitle = snap.title.trim();
    const hasAnyInput = Boolean(
      cleanTitle || snap.subtopic.trim() || snap.tagsInput.trim() || plainText,
    );

    if (!hasAnyInput) {
      removeSummaryDraft(getSummaryDraftKey(snap.folder, snap.editingNoteId));
      setAutoSaveState({ status: 'idle', lastSavedAt: null });
      return;
    }

    // Always keep recovery draft up to date before async persistence
    persistLocalDraftNow();

    // If user hasn't entered both title and body yet, keep safely persisted as local draft
    if (!cleanTitle || !plainText) {
      setAutoSaveState((prev) => ({
        status: 'draft_only',
        lastSavedAt: formatClockTime(),
        restoredDraft: prev.restoredDraft,
      }));
      return;
    }

    if (autoSaveInFlightRef.current) {
      autoSavePendingRerunRef.current = true;
      return;
    }

    autoSaveInFlightRef.current = true;
    setAutoSaveState((prev) => ({ ...prev, status: 'saving', error: undefined }));

    try {
      const parsedTags = snap.tagsInput
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const saved = await saveSummaryNote(snap.folder, {
        id: snap.editingNoteId,
        title: cleanTitle,
        content: plainText,
        contentHtml: safeHtml,
        tags: parsedTags,
        subtopic: snap.subtopic.trim(),
        silent: true,
        skipDriveUpload: true,
      });

      const wasNew = !snap.editingNoteId;
      if (wasNew) {
        removeSummaryDraft(getSummaryDraftKey(snap.folder, undefined));
        draftSnapshotRef.current = {
          ...draftSnapshotRef.current,
          editingNoteId: saved.id,
        };
        setEditingNoteId(saved.id);
      }

      const savedFp = buildNoteFingerprint({
        folder: snap.folder,
        editingNoteId: saved.id,
        title: snap.title,
        subtopic: snap.subtopic,
        tagsInput: snap.tagsInput,
        contentHtml: snap.contentHtml,
      });
      lastSavedFingerprintRef.current = savedFp;

      // Clear local recovery draft only if no newer edits happened during the async save
      if (buildNoteFingerprint(draftSnapshotRef.current) === savedFp) {
        removeSummaryDraft(getSummaryDraftKey(snap.folder, saved.id));
        setAutoSaveState({
          status: 'saved',
          lastSavedAt: formatClockTime(),
          restoredDraft: false,
        });
      }
    } catch (err) {
      setAutoSaveState((prev) => ({
        status: 'error',
        lastSavedAt: prev.lastSavedAt,
        error: (err as Error).message || 'Erro no auto-salvamento.',
      }));
    } finally {
      autoSaveInFlightRef.current = false;
      if (autoSavePendingRerunRef.current) {
        autoSavePendingRerunRef.current = false;
        autoSaveTimerRef.current = window.setTimeout(() => {
          void runDebouncedAutoSave();
        }, 350);
      }
    }
  }, [persistLocalDraftNow, saveSummaryNote]);

  // Restore unfinished local draft for the selected subject folder when opening a fresh editor
  useEffect(() => {
    if (!targetWriteFolder || editingNoteId) return;
    if (lastRestoredFolderRef.current === targetWriteFolder) return;
    lastRestoredFolderRef.current = targetWriteFolder;

    const currentPlain = htmlToPlainText(noteContentHtml).trim();
    const editorIsClean =
      !noteTitle.trim() && !noteSubtopic.trim() && !noteTagsInput.trim() && !currentPlain;
    if (!editorIsClean) return;

    const draft = readSummaryDraft(getSummaryDraftKey(targetWriteFolder, undefined));
    if (!draft) return;
    const restoredSafeHtml = sanitizeDocHtml(draft.contentHtml || '');
    const restoredPlain = htmlToPlainText(restoredSafeHtml).trim();
    if (!draft.title.trim() && !restoredPlain) {
      removeSummaryDraft(getSummaryDraftKey(targetWriteFolder, undefined));
      return;
    }

    setNoteTitle(draft.title || '');
    setNoteSubtopic(draft.subtopic || '');
    setNoteTagsInput(draft.tagsInput || '');
    setNoteContentHtml(restoredSafeHtml);
    setEditorResetKey((k) => k + 1);
    lastSavedFingerprintRef.current = '';
    setAutoSaveState({
      status: 'draft_only',
      lastSavedAt: draft.updatedAt ? formatClockTime(new Date(draft.updatedAt)) : formatClockTime(),
      restoredDraft: true,
    });
  }, [editingNoteId, noteContentHtml, noteSubtopic, noteTagsInput, noteTitle, targetWriteFolder]);

  // Debounced auto-save watcher (450ms local draft backup + 1500ms subject persistence)
  useEffect(() => {
    if (!targetWriteFolder) return;
    const currentFp = buildNoteFingerprint({
      folder: targetWriteFolder,
      editingNoteId,
      title: noteTitle,
      subtopic: noteSubtopic,
      tagsInput: noteTagsInput,
      contentHtml: noteContentHtml,
    });

    if (currentFp === lastSavedFingerprintRef.current) {
      clearAutoSaveTimers();
      return;
    }

    const plainText = htmlToPlainText(noteContentHtml).trim();
    const hasAnyInput = Boolean(
      noteTitle.trim() || noteSubtopic.trim() || noteTagsInput.trim() || plainText,
    );

    if (!hasAnyInput) {
      clearAutoSaveTimers();
      removeSummaryDraft(getSummaryDraftKey(targetWriteFolder, editingNoteId));
      setAutoSaveState({ status: 'idle', lastSavedAt: null });
      return;
    }

    setAutoSaveState((prev) =>
      prev.status === 'saving' ? prev : { ...prev, status: 'typing', error: undefined },
    );

    clearAutoSaveTimers();
    localDraftTimerRef.current = window.setTimeout(() => {
      persistLocalDraftNow();
    }, AUTOSAVE_LOCAL_DELAY_MS);

    autoSaveTimerRef.current = window.setTimeout(() => {
      void runDebouncedAutoSave();
    }, AUTOSAVE_PERSIST_DELAY_MS);

    return () => {
      clearAutoSaveTimers();
    };
  }, [
    clearAutoSaveTimers,
    editingNoteId,
    noteContentHtml,
    noteSubtopic,
    noteTagsInput,
    noteTitle,
    persistLocalDraftNow,
    runDebouncedAutoSave,
    targetWriteFolder,
  ]);

  // Safety flush on page refresh, tab close, or navigation to another module
  useEffect(() => {
    const onBeforeUnload = () => {
      persistLocalDraftNow();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearAutoSaveTimers();
      persistLocalDraftNow();
      const snap = draftSnapshotRef.current;
      const fp = buildNoteFingerprint(snap);
      const plain = htmlToPlainText(snap.contentHtml).trim();
      if (
        snap.folder &&
        fp !== lastSavedFingerprintRef.current &&
        snap.title.trim() &&
        plain &&
        !autoSaveInFlightRef.current
      ) {
        void runDebouncedAutoSave();
      }
    };
  }, [clearAutoSaveTimers, persistLocalDraftNow, runDebouncedAutoSave]);

  const resetEditorToBlank = useCallback(
    (clearLocalDraftForFolder?: string, clearNoteId?: string) => {
      clearAutoSaveTimers();
      if (clearLocalDraftForFolder) {
        removeSummaryDraft(getSummaryDraftKey(clearLocalDraftForFolder, clearNoteId));
        removeSummaryDraft(getSummaryDraftKey(clearLocalDraftForFolder, undefined));
      }
      setEditingNoteId(undefined);
      setActiveGoogleDoc(null);
      setNoteTitle('');
      setNoteSubtopic('');
      setNoteTagsInput('');
      setNoteContentHtml('');
      setEditorResetKey((k) => k + 1);
      lastSavedFingerprintRef.current = buildNoteFingerprint({
        folder: clearLocalDraftForFolder || targetWriteFolder,
        editingNoteId: undefined,
        title: '',
        subtopic: '',
        tagsInput: '',
        contentHtml: '',
      });
      setAutoSaveState({ status: 'idle', lastSavedAt: null });
    },
    [clearAutoSaveTimers, targetWriteFolder],
  );

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetWriteFolder) {
      toast('Crie ou selecione uma matéria primeiro.', true);
      return;
    }
    clearAutoSaveTimers();
    setSavingNote(true);
    try {
      const parsedTags = noteTagsInput
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const safeHtml = sanitizeDocHtml(noteContentHtml);
      const plainText = htmlToPlainText(safeHtml).trim();
      const saved = await saveSummaryNote(targetWriteFolder, {
        id: editingNoteId,
        title: noteTitle,
        content: plainText,
        contentHtml: safeHtml,
        tags: parsedTags,
        subtopic: noteSubtopic.trim(),
      });
      resetEditorToBlank(targetWriteFolder, saved.id);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSavingNote(false);
    }
  };

  const handleEditNote = (folder: string, item: SummaryFile) => {
    // Persist any unsaved work on the current document before switching
    clearAutoSaveTimers();
    persistLocalDraftNow();

    setSelectedFolder(folder);
    setActiveTab('notes');
    setNoteEditorExpanded(true);

    const itemTitle = getSummaryDisplayTitle(item);
    const itemSubtopic = item.subtopic || '';
    const itemTags = (item.tags || []).join(', ');
    const baseHtml = item.contentHtml?.trim()
      ? sanitizeDocHtml(item.contentHtml)
      : markdownToInitialHtml(item.content || '');

    const savedDraft = readSummaryDraft(getSummaryDraftKey(folder, item.id));
    const useRecoveredDraft = Boolean(
      savedDraft &&
        (!item.updatedAt || (savedDraft.updatedAt && savedDraft.updatedAt > item.updatedAt)),
    );

    const nextTitle = useRecoveredDraft && savedDraft ? savedDraft.title : itemTitle;
    const nextSubtopic = useRecoveredDraft && savedDraft ? savedDraft.subtopic : itemSubtopic;
    const nextTags = useRecoveredDraft && savedDraft ? savedDraft.tagsInput : itemTags;
    const nextHtml =
      useRecoveredDraft && savedDraft ? sanitizeDocHtml(savedDraft.contentHtml) : baseHtml;

    setEditingNoteId(item.id);
    if (item.googleDocId) {
      setActiveGoogleDoc({
        id: item.googleDocId,
        name: nextTitle,
        webViewLink: item.googleDocUrl,
      });
      setComposerMode('gdocs');
    } else {
      setActiveGoogleDoc(null);
      setComposerMode('local');
    }
    setNoteTitle(nextTitle);
    setNoteSubtopic(nextSubtopic);
    setNoteTagsInput(nextTags);
    setNoteContentHtml(nextHtml);
    setEditorResetKey((k) => k + 1);

    if (useRecoveredDraft && savedDraft) {
      lastSavedFingerprintRef.current = '';
      setAutoSaveState({
        status: 'draft_only',
        lastSavedAt: formatClockTime(new Date(savedDraft.updatedAt)),
        restoredDraft: true,
      });
    } else {
      lastSavedFingerprintRef.current = buildNoteFingerprint({
        folder,
        editingNoteId: item.id,
        title: nextTitle,
        subtopic: nextSubtopic,
        tagsInput: nextTags,
        contentHtml: nextHtml,
      });
      setAutoSaveState({
        status: 'saved',
        lastSavedAt: item.updatedAt ? formatClockTime(new Date(item.updatedAt)) : null,
        restoredDraft: false,
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditNote = () => {
    resetEditorToBlank(targetWriteFolder, editingNoteId);
  };

  const handleSwitchFolder = (nextFolder: string) => {
    if (nextFolder === selectedFolder) return;
    const prevFolder = targetWriteFolder;
    const snap = draftSnapshotRef.current;
    const fp = buildNoteFingerprint(snap);
    const plain = htmlToPlainText(snap.contentHtml).trim();
    clearAutoSaveTimers();
    persistLocalDraftNow();
    if (
      snap.folder &&
      fp !== lastSavedFingerprintRef.current &&
      snap.title.trim() &&
      plain &&
      !autoSaveInFlightRef.current
    ) {
      void runDebouncedAutoSave();
    }

    const willChangeWriteTarget =
      nextFolder !== '__ALL__' && prevFolder && nextFolder !== prevFolder;
    if (willChangeWriteTarget && (editingNoteId || snap.title.trim() || plain)) {
      setEditingNoteId(undefined);
      setNoteTitle('');
      setNoteSubtopic('');
      setNoteTagsInput('');
      setNoteContentHtml('');
      setEditorResetKey((k) => k + 1);
      lastSavedFingerprintRef.current = buildNoteFingerprint({
        folder: nextFolder,
        editingNoteId: undefined,
        title: '',
        subtopic: '',
        tagsInput: '',
        contentHtml: '',
      });
      lastRestoredFolderRef.current = '';
      setAutoSaveState({ status: 'idle', lastSavedAt: null });
    }

    setSelectedFolder(nextFolder);
    setPreviewItem(null);
    setRenamingFolder(false);
  };

  const handleDownloadNoteDocx = async (folder: string, item: SummaryFile) => {
    try {
      await exportSummaryNoteDocx(folder, item);
      toast(`Documento "${getSummaryDisplayTitle(item)}.docx" baixado.`);
    } catch (err) {
      toast((err as Error).message || 'Erro ao gerar arquivo .docx.', true);
    }
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
            <ReadingQueueButton
              queue={db.preferences.reading_queue || []}
              onToggleDone={toggleReadingQueueDone}
              onRemove={removeFromReadingQueue}
              onClearDone={() => clearReadingQueue(true)}
              onOpenItem={(q) => {
                if (q.kind === 'law' && q.folder) {
                  openLawAt(q.folder);
                } else if (q.kind === 'summary' && q.folder && q.itemId) {
                  setSelectedFolder(q.folder);
                  setActiveTab('notes');
                  const target = (db.summaryFolders[q.folder] || []).find((i) => i.id === q.itemId);
                  if (target && getSummaryItemKind(target) === 'note') {
                    setReaderTarget({ folder: q.folder, itemId: target.id });
                  } else if (target && getSummaryItemKind(target) === 'mindmap') {
                    handleOpenMindMap(q.folder, target);
                  } else if (target) {
                    setPreviewItem(target);
                  }
                } else if (q.kind === 'caselaw') {
                  setActivePage('Súmulas e Jurisprudência');
                } else if (q.kind === 'pdf') {
                  setActivePage('PDFs Pessoais');
                }
              }}
            />
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
              onClick={() => setReadingExpanded((v) => !v)}
              aria-pressed={readingExpanded}
              title="Expandir área de leitura e escrita (oculta painel superior de pastas)"
              className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] whitespace-nowrap cursor-pointer transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
              Expandir Leitura
            </button>

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

      {readingExpanded ? (
        <div className="mb-4 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-[12.5px]">
            <BookOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <strong className="font-bold text-[var(--text)] truncate">
              {activeFolder === '__ALL__' ? 'Todas as matérias' : visibleName(activeFolder)}
            </strong>
            <span className="text-[11px] text-[var(--muted)] hidden sm:inline">
              · Modo Leitura Expandida
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setReadingComfortableWidth((v) => !v)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
              title="Alternar largura da coluna de leitura e edição"
            >
              {readingComfortableWidth ? 'Largura: Confortável' : 'Largura: Ampla'}
            </button>
            <button
              type="button"
              onClick={() => setReadingExpanded(false)}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] cursor-pointer whitespace-nowrap"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              Restaurar painéis
            </button>
          </div>
        </div>
      ) : (
      /* Subject Selector + Create New Subject */
      <Panel className="mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleSwitchFolder('__ALL__')}
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
                    onClick={() => handleSwitchFolder(folder)}
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

          {subjectHubCounts && (
            <div className="pt-2.5 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--muted)]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold text-[var(--text)]">
                  Hub de {visibleName(activeFolder)}:
                </span>
                {subjectHubCounts.laws.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => openLawAt(subjectHubCounts.laws[0])}
                    className="font-semibold text-[var(--accent)] hover:underline cursor-pointer tabular-nums"
                  >
                    {subjectHubCounts.laws.length} lei(s)
                  </button>
                ) : (
                  <span className="tabular-nums">0 leis</span>
                )}
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setActivePage('Súmulas e Jurisprudência')}
                  className="font-semibold text-[var(--text)] hover:text-[var(--accent)] hover:underline cursor-pointer tabular-nums"
                >
                  {subjectHubCounts.caseLawCount} súmula(s)/tese(s)
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setActivePage('PDFs Pessoais')}
                  className="font-semibold text-[var(--text)] hover:text-[var(--accent)] hover:underline cursor-pointer tabular-nums"
                >
                  {subjectHubCounts.pdfsCount} PDF(s) pessoais
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setActivePage('Caderno de Erros')}
                  className="font-semibold text-[var(--text)] hover:text-[var(--accent)] hover:underline cursor-pointer tabular-nums"
                >
                  {subjectHubCounts.errorsCount} erro(s)
                  {subjectHubCounts.pendingErrorsCount > 0
                    ? ` (${subjectHubCounts.pendingErrorsCount} pendentes)`
                    : ''}
                </button>
              </div>
              {availableSubtopics.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[var(--muted)]">Assuntos:</span>
                  <button
                    type="button"
                    onClick={() => setSubtopicFilter('__ALL__')}
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-bold cursor-pointer ${
                      subtopicFilter === '__ALL__'
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                    }`}
                  >
                    Todos
                  </button>
                  {availableSubtopics.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() =>
                        setSubtopicFilter((prev) => (prev === st ? '__ALL__' : st))
                      }
                      className={`px-2 py-0.5 rounded-md border text-[11px] font-bold cursor-pointer ${
                        subtopicFilter === st
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>
      )}

      {/* TAB 1: NOTES & ATTACHED PDFs */}
      {activeTab === 'notes' && (
        <div className={`flex flex-col gap-4 ${readingExpanded && readingComfortableWidth ? 'max-w-[920px] mx-auto w-full' : ''}`}>
          {!hideUpload && (
            <div className="flex flex-col gap-4">
              {/* Full-Width Word / Google Docs-like Document Composer */}
              {folderNames.length > 0 && (
                <Panel
                  title={
                    editingNoteId
                      ? `Editando documento em ${visibleName(targetWriteFolder)}`
                      : `Nova anotação de resumo (.docx) · ${visibleName(targetWriteFolder)}`
                  }
                  action={
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)]">
                        <button
                          type="button"
                          onClick={() => setComposerMode('local')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                            composerMode === 'local'
                              ? 'bg-[var(--accent)] text-white'
                              : 'text-[var(--muted)] hover:text-[var(--text)]'
                          }`}
                        >
                          Editor (.docx)
                        </button>
                        <button
                          type="button"
                          onClick={() => setComposerMode('gdocs')}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                            composerMode === 'gdocs'
                              ? 'bg-[var(--accent)] text-white'
                              : 'text-[var(--muted)] hover:text-[var(--text)]'
                          }`}
                        >
                          Google Docs
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReadingExpanded((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                        title="Expandir ou restaurar área de leitura e edição"
                      >
                        {readingExpanded ? (
                          <>
                            <Minimize2 className="w-3.5 h-3.5" /> Restaurar
                          </>
                        ) : (
                          <>
                            <Maximize2 className="w-3.5 h-3.5" /> Expandir Leitura
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteEditorExpanded((prev) => !prev)}
                        className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
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
                    </div>
                  }
                >
                  {noteEditorExpanded && composerMode === 'gdocs' && (
                    <div className="flex flex-col gap-3">
                      <div
                        className={`grid grid-cols-1 gap-2.5 ${
                          activeFolder === '__ALL__' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                        }`}
                      >
                        {activeFolder === '__ALL__' && (
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                              Matéria de destino *
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
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                            Assunto / Subtópico (2º nível)
                          </label>
                          <input
                            type="text"
                            list="summary-subtopics-datalist"
                            value={noteSubtopic}
                            onChange={(e) => setNoteSubtopic(e.target.value)}
                            placeholder="Ex.: Atos Administrativos"
                            className="ce-input"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                            Etiquetas (separadas por vírgula)
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

                      <SummaryGoogleDocsPanel
                        subjectLabel={visibleName(targetWriteFolder)}
                        title={noteTitle}
                        onChangeTitle={setNoteTitle}
                        initialLocalHtml={noteContentHtml}
                        activeDoc={activeGoogleDoc}
                        onSelectDoc={setActiveGoogleDoc}
                        onSyncDocToSummary={async ({
                          googleDocId,
                          googleDocUrl,
                          title: syncedTitle,
                          html,
                          plainText,
                        }) => {
                          if (!targetWriteFolder) return;
                          const parsedTags = noteTagsInput
                            .split(/[,;]+/)
                            .map((t) => t.trim())
                            .filter(Boolean);
                          const saved = await saveSummaryNote(targetWriteFolder, {
                            id: editingNoteId,
                            title: syncedTitle,
                            content: plainText,
                            contentHtml: html,
                            tags: parsedTags,
                            subtopic: noteSubtopic.trim(),
                            googleDocId,
                            googleDocUrl,
                            silent: true,
                          });
                          setEditingNoteId(saved.id);
                          setNoteContentHtml(html);
                        }}
                      />
                    </div>
                  )}

                  {noteEditorExpanded && composerMode === 'local' && (
                    <form onSubmit={handleSaveNote} className="flex flex-col gap-3">
                      <div
                        className={`grid grid-cols-1 gap-2.5 ${
                          activeFolder === '__ALL__' ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
                        }`}
                      >
                        {activeFolder === '__ALL__' && (
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                              Salvar na matéria *
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
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                            Título do documento *
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
                            Assunto / Subtópico (2º nível)
                          </label>
                          <input
                            type="text"
                            list="summary-subtopics-datalist"
                            value={noteSubtopic}
                            onChange={(e) => setNoteSubtopic(e.target.value)}
                            placeholder="Ex.: Atos Administrativos"
                            className="ce-input"
                          />
                          <datalist id="summary-subtopics-datalist">
                            {editalSubtopicSuggestions.map((st) => (
                              <option key={st} value={st} />
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                            Etiquetas (separadas por vírgula)
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

                      {autoSaveState.restoredDraft && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)]/50 px-3 py-2 text-[12px] text-[var(--text)]">
                          <span>
                            Rascunho não finalizado recuperado automaticamente
                            {autoSaveState.lastSavedAt ? ` (às ${autoSaveState.lastSavedAt})` : ''}.
                          </span>
                          <button
                            type="button"
                            onClick={handleCancelEditNote}
                            className="text-[11.5px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                          >
                            Descartar rascunho
                          </button>
                        </div>
                      )}

                      <RichDocumentEditor
                        valueHtml={noteContentHtml}
                        resetKey={editorResetKey}
                        title={noteTitle}
                        subjectLabel={visibleName(targetWriteFolder)}
                        subtopic={noteSubtopic}
                        tags={noteTagsInput
                          .split(/[,;]+/)
                          .map((t) => t.trim())
                          .filter(Boolean)}
                        onChangeHtml={setNoteContentHtml}
                        onImportTitle={(importedTitle) => setNoteTitle(importedTitle)}
                        onNotify={toast}
                        autoSaveIndicator={
                          autoSaveState.status === 'saving' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--accent)]">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Salvando automaticamente…
                            </span>
                          ) : autoSaveState.status === 'saved' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--good)]">
                              <Check className="w-3 h-3" />
                              Salvo automaticamente
                              {autoSaveState.lastSavedAt ? ` às ${autoSaveState.lastSavedAt}` : ''}
                            </span>
                          ) : autoSaveState.status === 'typing' ? (
                            <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                              <Clock className="w-3 h-3" />
                              Aguardando pausa para salvar…
                            </span>
                          ) : autoSaveState.status === 'draft_only' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--accent)]">
                              <Clock className="w-3 h-3" />
                              Rascunho salvo localmente
                              {autoSaveState.lastSavedAt ? ` às ${autoSaveState.lastSavedAt}` : ''} ·
                              informe título e conteúdo para gravar na matéria
                            </span>
                          ) : autoSaveState.status === 'error' ? (
                            <span
                              className="inline-flex items-center gap-1 font-semibold text-[var(--warning)]"
                              title={autoSaveState.error}
                            >
                              <AlertCircle className="w-3 h-3" />
                              Rascunho protegido localmente · clique em Salvar para tentar novamente
                            </span>
                          ) : (
                            <span>
                              Auto-salvamento ativo · {visibleName(targetWriteFolder)} (.docx)
                            </span>
                          )
                        }
                      />

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {editingNoteId ? (
                          <button
                            type="button"
                            onClick={handleCancelEditNote}
                            className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                          >
                            <FilePlus2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                            Novo documento
                          </button>
                        ) : (
                          (noteTitle.trim() || htmlToPlainText(noteContentHtml).trim()) && (
                            <button
                              type="button"
                              onClick={handleCancelEditNote}
                              className="h-[36px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap cursor-pointer"
                            >
                              Limpar rascunho
                            </button>
                          )
                        )}
                        <button
                          type="submit"
                          disabled={savingNote}
                          className="inline-flex items-center gap-1.5 h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingNote
                            ? 'Salvando…'
                            : editingNoteId
                              ? 'Salvar e concluir'
                              : `Salvar em ${visibleName(targetWriteFolder)}`}
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
              stackHeader
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar título, assunto, texto..."
                      className="ce-input pl-8 h-[34px] w-[190px] text-[12px]"
                    />
                  </div>
                  <select
                    aria-label="Filtrar por tipo"
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
                  <select
                    aria-label="Filtrar por status de estudo"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'all' | ContentStudyStatus)}
                    className="ce-select h-[34px] w-auto text-[12px]"
                  >
                    <option value="all">Status: Todos</option>
                    {STUDY_STATUS_LIST.map((st) => (
                      <option key={st} value={st}>
                        {STUDY_STATUS_META[st].label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Ordenar itens"
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as 'recent' | 'lastOpened' | 'alpha' | 'status')
                    }
                    className="ce-select h-[34px] w-auto text-[12px]"
                  >
                    <option value="recent">Mais recentes</option>
                    <option value="lastOpened">Último acessado</option>
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
                    Fixados
                  </button>
                  <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      title="Visualização em cartões"
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
                      title="Lista compacta de alta densidade"
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-bold cursor-pointer ${
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
              {visibleEntries.length > 0 ? (
                viewMode === 'compact' ? (
                  <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden">
                    {visibleEntries.map(({ folder, item }) => {
                      const kind = getSummaryItemKind(item);
                      const displayTitle = getSummaryDisplayTitle(item);
                      const kindLabel =
                        kind === 'note'
                          ? 'Anotação'
                          : kind === 'pdf'
                            ? 'PDF'
                            : kind === 'mindmap'
                              ? 'Mapa'
                              : 'Imagem';
                      return (
                        <div
                          key={`${folder}-${item.id}`}
                          className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 hover:bg-[var(--panel)] transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-[min(100%,240px)] flex-1">
                            <PinToggleButton
                              pinned={item.pinned}
                              onToggle={() =>
                                updateSummaryItemMeta(folder, item.id, { pinned: !item.pinned })
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (kind === 'note') {
                                    setReaderTarget({ folder, itemId: item.id });
                                  } else if (kind === 'mindmap' && item.mindMap) {
                                    handleOpenMindMap(folder, item);
                                  } else {
                                    setPreviewItem(previewItem?.id === item.id ? null : item);
                                  }
                                }}
                                className="text-left text-[13px] font-bold text-[var(--text)] hover:text-[var(--accent)] truncate block w-full cursor-pointer"
                              >
                                {displayTitle}
                              </button>
                              <div className="text-[11px] text-[var(--muted)] tabular-nums truncate">
                                {visibleName(folder)}
                                {item.subtopic ? ` / ${item.subtopic}` : ''}
                                {' · '}
                                {kindLabel}
                                {' · '}
                                {item.createdAt}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <StudyStatusSelect
                              value={item.studyStatus}
                              onChange={(next) =>
                                updateSummaryItemMeta(folder, item.id, { studyStatus: next })
                              }
                              compact
                            />
                            {kind === 'note' && (
                              <button
                                type="button"
                                onClick={() => setReaderTarget({ folder, itemId: item.id })}
                                className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap cursor-pointer"
                              >
                                <BookOpen className="w-3 h-3" />
                                Ler
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                addToReadingQueue({
                                  kind: 'summary',
                                  title: displayTitle,
                                  subtitle: visibleName(folder),
                                  folder,
                                  itemId: item.id,
                                })
                              }
                              title="Adicionar à Fila de Leitura"
                              className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                            >
                              <ListPlus className="w-3.5 h-3.5" />
                            </button>
                            {kind === 'note' && (
                              <button
                                type="button"
                                onClick={() => void handleDownloadNoteDocx(folder, item)}
                                title="Baixar em formato Word (.docx)"
                                className="inline-flex items-center justify-center h-[28px] px-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[10.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer whitespace-nowrap"
                              >
                                .docx
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDownloadIndividual(folder, item)}
                              title={kind === 'note' || kind === 'mindmap' ? 'Baixar PDF' : 'Baixar'}
                              className="inline-flex items-center justify-center w-[28px] h-[28px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(folder, item)}
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
                        className={`rounded-xl border bg-[var(--panel-soft)] p-3.5 flex flex-col gap-2.5 ${
                          item.pinned ? 'border-[var(--accent)]/60' : 'border-[var(--line)]'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[min(100%,260px)] flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <strong className="text-[14.5px] font-bold text-[var(--text)] leading-snug">
                                {displayTitle}
                              </strong>
                              <span className="text-[11px] font-bold text-[var(--accent)]">
                                {kindLabel}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11.5px] text-[var(--muted)] font-mono-num">
                              {visibleName(folder)}
                              {item.subtopic ? ` / ${item.subtopic}` : ''}
                              {' · '}
                              {item.createdAt}
                              {kind !== 'note' && kind !== 'mindmap'
                                ? ` · ${formatUploadSize(item.size)}`
                                : ''}
                              {item.tags && item.tags.length > 0
                                ? ` · ${item.tags.join(', ')}`
                                : ''}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <PinToggleButton
                              pinned={item.pinned}
                              onToggle={() =>
                                updateSummaryItemMeta(folder, item.id, { pinned: !item.pinned })
                              }
                            />
                            <StudyStatusSelect
                              value={item.studyStatus}
                              onChange={(next) =>
                                updateSummaryItemMeta(folder, item.id, { studyStatus: next })
                              }
                              compact
                            />

                            {kind === 'note' && (
                              <button
                                type="button"
                                onClick={() => setReaderTarget({ folder, itemId: item.id })}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                Modo Leitura
                              </button>
                            )}

                            {kind === 'note' && (
                              <button
                                type="button"
                                onClick={() => handleEditNote(folder, item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Editar
                              </button>
                            )}

                            {kind === 'mindmap' && item.mindMap && (
                              <button
                                type="button"
                                onClick={() => handleOpenMindMap(folder, item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap cursor-pointer"
                              >
                                <GitBranch className="w-3.5 h-3.5" />
                                Abrir no Construtor
                              </button>
                            )}

                            {(kind === 'pdf' || kind === 'image') && (
                              <button
                                type="button"
                                onClick={() => {
                                  updateSummaryItemMeta(folder, item.id, {
                                    lastOpenedAt: new Date().toISOString(),
                                  });
                                  setPreviewItem(previewItem?.id === item.id ? null : item);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                {previewItem?.id === item.id ? 'Fechar' : 'Visualizar'}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                addToReadingQueue({
                                  kind: 'summary',
                                  title: displayTitle,
                                  subtitle: visibleName(folder),
                                  folder,
                                  itemId: item.id,
                                })
                              }
                              title="Adicionar à Fila de Leitura"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                            >
                              <ListPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                              Na Fila
                            </button>

                            {kind !== 'image' && (
                              <button
                                type="button"
                                onClick={() => setAiModalTarget({ folder, item })}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                Gerar com IA
                              </button>
                            )}

                            {kind === 'note' && (
                              <button
                                type="button"
                                onClick={() => void handleDownloadNoteDocx(folder, item)}
                                title="Baixar documento editável no Word / Google Docs (.docx)"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                              >
                                <FileDown className="w-3.5 h-3.5 text-[var(--accent)]" />
                                Baixar .docx
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => void handleDownloadIndividual(folder, item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {kind === 'note' || kind === 'mindmap' ? 'Baixar PDF' : 'Baixar'}
                            </button>

                            {kind === 'mindmap' && item.mindMap && (
                              <button
                                type="button"
                                onClick={() => void handleDownloadMindMapPng(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Baixar PNG
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteItem(folder, item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                          </div>
                        </div>

                        {/* Inline structured reading for Notes (supports both rich Word/Docs HTML and legacy Markdown) */}
                        {kind === 'note' && (item.contentHtml?.trim() || item.content?.trim()) && (
                          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
                            <div
                              className={
                                !isExpanded && (item.content?.length || 0) > 420
                                  ? 'max-h-[185px] overflow-hidden relative'
                                  : undefined
                              }
                            >
                              {item.contentHtml?.trim() ? (
                                <RichHtmlReactRenderer
                                  html={item.contentHtml}
                                  scopeKey={`card-html-${item.id}`}
                                  className="text-[13.5px] leading-relaxed text-[var(--text)]"
                                />
                              ) : (
                                <RichNoteRenderer
                                  content={item.content || ''}
                                  scopeKey={`card-${item.id}`}
                                  className="text-[13px] leading-relaxed text-[var(--text)]"
                                />
                              )}
                            </div>
                            {(item.content?.length || 0) > 420 && (
                              <div className="mt-2 flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedNoteIds((prev) => ({
                                      ...prev,
                                      [item.id]: !prev[item.id],
                                    }))
                                  }
                                  className="text-[11.5px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                                >
                                  {isExpanded ? 'Mostrar menos' : 'Expandir aqui'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReaderTarget({ folder, itemId: item.id })}
                                  className="text-[11.5px] font-bold text-[var(--text)] hover:text-[var(--accent)] hover:underline cursor-pointer"
                                >
                                  Abrir em Modo Leitura →
                                </button>
                              </div>
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
                )
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

      {/* Full-Focus Summary Reader Modal */}
      {activeReaderEntry && (
        <SummaryReaderModal
          folder={activeReaderEntry.folder}
          item={activeReaderEntry.item}
          onClose={() => setReaderTarget(null)}
          onEdit={() => {
            const { folder, item } = activeReaderEntry;
            setReaderTarget(null);
            handleEditNote(folder, item);
          }}
          onUpdateMeta={(patch) =>
            updateSummaryItemMeta(activeReaderEntry.folder, activeReaderEntry.item.id, patch)
          }
          onAddToQueue={() =>
            addToReadingQueue({
              kind: 'summary',
              title: getSummaryDisplayTitle(activeReaderEntry.item),
              subtitle: visibleName(activeReaderEntry.folder),
              folder: activeReaderEntry.folder,
              itemId: activeReaderEntry.item.id,
            })
          }
        />
      )}
    </div>
  );
};
