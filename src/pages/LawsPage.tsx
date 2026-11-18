import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarCheck2,
  CalendarPlus,
  Check,
  CheckCircle2,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  Highlighter,
  Link2,
  ListChecks,
  ListOrdered,
  Newspaper,
  Play,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Undo2,
  Volume2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import {
  buildSequentialLawIndex,
  formatCanonicalArticleLabel,
  formatIsoDateBr,
  formatSequentialDeviceLabel,
  formatUploadSize,
  incidenceColorClass,
  itemMatchesMultiArticleSpec,
  localDateIso,
  normalizeSearch,
  parseMultiArticleSpec,
  resolveCanonicalArticleIdentity,
  resolveCanonicalArticleKeyFromQuery,
  visibleName,
} from '../lib/parsers';
import { HIGHLIGHT_COLOR_RGB, exportLawWithHighlightsPdf, buildHighlightedSegments } from '../lib/pdfExport';
import { HighlightColorKey } from '../types/study';
import {
  ArticleJumpBar,
  FONT_SIZE_PX,
  LINE_HEIGHT_VAL,
  LawReadingToolbar,
  buildArticleAnchorId,
  renderLawTextWithExamHighlights,
  useLawReadingPrefs,
} from '../components/ui/LawReadingTools';
import { FilePreview } from '../components/ui/FilePreview';
import { LawVoicePlayerBar, useLawVoiceReader } from '../components/ui/LawVoicePlayer';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

export const LawsPage: React.FC = () => {
  const {
    db,
    moduleVisibility,
    lawDeepLink,
    clearLawDeepLink,
    selectedEditalContestId,
    openContestEdital,
    linkEditalPointToLaw,
    unlinkEditalPointFromLaw,
    addLawHighlight,
    cycleLawHighlightColor,
    removeLawHighlightText,
    removeLastLawHighlight,
    saveLawNote,
    toggleLawItemRead,
    markLawItemsRead,
    addLawReadDate,
    removeLawReadDate,
    addLawItemReadDate,
    setLawLastPosition,
    reprocessLawFolder,
    deleteLawPdf,
    requestConfirm,
    toast,
  } = useStudy();
  const [reprocessingLaw, setReprocessingLaw] = useState(false);
  const [eraserModeActive, setEraserModeActive] = useState(false);
  const [visibleArticleLimit, setVisibleArticleLimit] = useState(80);
  const [showStructuralOutline, setShowStructuralOutline] = useState(false);

  const {
    prefs: readingPrefs,
    stepFontSize,
    cycleLineHeight,
    toggleComfortableWidth,
    toggleHighlightExamWords,
  } = useLawReadingPrefs();

  const hideSearch = moduleVisibility('Lei Seca').hide_search;
  const folderNames = useMemo(
    () => Object.keys(db.laws).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [db.laws],
  );

  const [selectedFolder, setSelectedFolder] = useState<string>(folderNames[0] || '');
  const activeFolder = folderNames.includes(selectedFolder)
    ? selectedFolder
    : folderNames[0] || '';
  const folderData = activeFolder ? db.laws[activeFolder] : undefined;

  const [search, setSearch] = useState('');
  const [focusSearchTerm, setFocusSearchTerm] = useState('');
  const [filterOnlyMatches, setFilterOnlyMatches] = useState(false);
  const [editalFilterContestId, setEditalFilterContestId] = useState<string>('all');
  const [readerTab, setReaderTab] = useState<'continuous' | 'devices'>('continuous');
  const [checklistFilter, setChecklistFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [previewPdf, setPreviewPdf] = useState<{ blobKey: string; name: string } | null>(null);
  const [readDateInput, setReadDateInput] = useState<string>(() => localDateIso());
  const [readDateNote, setReadDateNote] = useState('');
  const [showAllReadDates, setShowAllReadDates] = useState(false);
  const focusMarkRef = useRef<HTMLSpanElement | null>(null);

  // Quick Edital association states (both Continuous & Devices tabs)
  const [showContinuousLinker, setShowContinuousLinker] = useState(false);
  const [continuousArticleSpec, setContinuousArticleSpec] = useState('');
  const [showMatrixGuidesInContinuous, setShowMatrixGuidesInContinuous] = useState(true);
  const [douMode, setDouMode] = useState(false);
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);
  const [assocContestId, setAssocContestId] = useState<string>('');
  const [assocPointId, setAssocPointId] = useState<string>('');
  const [assocScope, setAssocScope] = useState<'article' | 'device'>('article');
  const [showGapDetails, setShowGapDetails] = useState(false);
  const [pendingJumpTarget, setPendingJumpTarget] = useState<{
    canonicalKey: string;
    label: string;
    nonce: number;
  } | null>(null);

  // Strict sequential index rebuilt deterministically on every folder change or async store update
  const sequentialIndex = useMemo(
    () => buildSequentialLawIndex(folderData?.items || []),
    [folderData?.items],
  );

  useEffect(() => {
    setShowGapDetails(false);
    setVisibleArticleLimit(80);
  }, [activeFolder]);

  const savedLawNote = activeFolder ? db.lawNotes?.[activeFolder] || '' : '';
  const [lawNoteDraft, setLawNoteDraft] = useState<string>(savedLawNote);

  useEffect(() => {
    setLawNoteDraft((prev) => (prev === savedLawNote ? prev : savedLawNote));
  }, [activeFolder, savedLawNote]);

  useEffect(() => {
    if (!activeFolder) return;
    if (lawNoteDraft === savedLawNote) return;
    const t = window.setTimeout(() => {
      saveLawNote(activeFolder, lawNoteDraft, true);
    }, 650);
    return () => window.clearTimeout(t);
  }, [activeFolder, lawNoteDraft, savedLawNote, saveLawNote]);

  const handleJumpToArticle = (articleKey: string) => {
    const canonicalKey = resolveCanonicalArticleKeyFromQuery(articleKey);
    const matchedGroup = canonicalKey
      ? sequentialIndex.groupByCanonicalKey.get(canonicalKey)
      : undefined;
    const resolvedLabel = matchedGroup?.canonicalLabel || articleKey;

    if (activeFolder) {
      setLawLastPosition(activeFolder, resolvedLabel);
    }

    if (readerTab === 'devices' && checklistFilter !== 'all' && matchedGroup) {
      const hasVisibleInChecklist = matchedGroup.items.some((it) => {
        const isRead = readSet.has(it.id);
        return checklistFilter === 'read' ? isRead : !isRead;
      });
      if (!hasVisibleInChecklist) {
        setChecklistFilter('all');
      }
    }

    if (filterOnlyMatches) {
      setFilterOnlyMatches(false);
    }
    if (editalFilterContestId !== 'all') {
      setEditalFilterContestId('all');
    }

    if (readerTab === 'continuous' && !showMatrixGuidesInContinuous) {
      setFocusSearchTerm(resolvedLabel);
      return;
    }

    const targetIdx = groupedContinuousArticles.findIndex(
      (g) => g.canonicalKey === (canonicalKey || resolveCanonicalArticleIdentity({ dispositivo: articleKey }).canonicalKey),
    );
    if (targetIdx >= visibleArticleLimit) {
      setVisibleArticleLimit(Math.max(visibleArticleLimit, targetIdx + 40));
    }

    setPendingJumpTarget({
      canonicalKey: canonicalKey || resolveCanonicalArticleIdentity({ dispositivo: articleKey }).canonicalKey,
      label: resolvedLabel,
      nonce: Date.now(),
    });
  };

  useEffect(() => {
    if (!pendingJumpTarget) return;
    let cancelled = false;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const prefix = readerTab === 'continuous' ? 'law-cont-art' : 'law-dev-art';
        const anchorId = buildArticleAnchorId(prefix, pendingJumpTarget.canonicalKey);
        const el =
          document.getElementById(anchorId) ||
          document.getElementById(buildArticleAnchorId(prefix, pendingJumpTarget.label));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setPendingJumpTarget(null);
        } else if (sequentialIndex.orderedItems.length > 0) {
          setFocusSearchTerm(pendingJumpTarget.label);
          setPendingJumpTarget(null);
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [pendingJumpTarget, readerTab, checklistFilter, filterOnlyMatches, sequentialIndex.orderedItems.length]);

  useEffect(() => {
    if (!lawDeepLink) return;
    if (lawDeepLink.folder && db.laws[lawDeepLink.folder]) {
      setSelectedFolder(lawDeepLink.folder);
      const q = (lawDeepLink.search || '').trim();
      setSearch(q);
      setFocusSearchTerm(q);
      setFilterOnlyMatches(Boolean(lawDeepLink.onlyMatches));
      setEditalFilterContestId('all');
      setReaderTab(lawDeepLink.tab || 'continuous');
    }
    clearLawDeepLink();
  }, [lawDeepLink, db.laws, clearLawDeepLink]);

  useEffect(() => {
    if (!focusSearchTerm || readerTab !== 'continuous') return;
    const t = window.setTimeout(() => {
      if (focusMarkRef.current) {
        focusMarkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const spec = parseMultiArticleSpec(focusSearchTerm);
      const firstArtKey = Array.from(spec.exactKeys)[0];
      if (firstArtKey) {
        const canonical = resolveCanonicalArticleKeyFromQuery(firstArtKey);
        const anchorEl =
          document.getElementById(buildArticleAnchorId('law-cont-art', canonical)) ||
          document.getElementById(buildArticleAnchorId('law-cont-art', `Art. ${firstArtKey}`));
        anchorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusSearchTerm, activeFolder, readerTab, sequentialIndex.orderedItems.length]);

  const highlights = db.lawHighlights[activeFolder] || [];
  const readSet = useMemo(
    () => new Set(db.readLawItems?.[activeFolder] || []),
    [db.readLawItems, activeFolder],
  );
  const readDates = useMemo(() => {
    const list = db.lawReadDates?.[activeFolder] || [];
    return [...list].sort((a, b) => b.data.localeCompare(a.data));
  }, [db.lawReadDates, activeFolder]);

  const lastReadMeta = useMemo(() => {
    if (!readDates.length) return { text: null as string | null, diffDays: null as number | null };
    const latest = readDates[0].data;
    const today = localDateIso();
    if (latest === today) return { text: `${formatIsoDateBr(latest)} (Hoje)`, diffDays: 0 };
    const latestMs = new Date(`${latest}T00:00:00`).getTime();
    const todayMs = new Date(`${today}T00:00:00`).getTime();
    const diffDays = Number.isFinite(latestMs) && Number.isFinite(todayMs)
      ? Math.round((todayMs - latestMs) / 86400000)
      : null;
    if (diffDays === 1) return { text: `${formatIsoDateBr(latest)} (Ontem)`, diffDays: 1 };
    if (diffDays !== null && diffDays > 1) return { text: `${formatIsoDateBr(latest)} (há ${diffDays} dias)`, diffDays };
    return { text: formatIsoDateBr(latest), diffDays };
  }, [readDates]);
  const lastReadSummary = lastReadMeta.text;
  const lawReviewOverdue = lastReadMeta.diffDays !== null && lastReadMeta.diffDays >= 15;

  const readingStats = useMemo(() => {
    const items = sequentialIndex.orderedItems;
    const total = items.length;
    const read = items.filter((it) => readSet.has(it.id)).length;
    const priorityItems = items.filter(
      (it) => it.grau === 'Muito Alto' || it.grau === 'Alto',
    );
    const priorityRead = priorityItems.filter((it) => readSet.has(it.id)).length;
    return {
      total,
      read,
      pct: total ? Math.round((read / total) * 100) : 0,
      priorityTotal: priorityItems.length,
      priorityRead,
      priorityPct: priorityItems.length
        ? Math.round((priorityRead / priorityItems.length) * 100)
        : 0,
    };
  }, [sequentialIndex.orderedItems, readSet]);

  const activeFolderLinks = useMemo(() => {
    const list: Array<{
      linkId: string;
      contestId: string;
      contestName: string;
      pointId: string;
      materia: string;
      titulo: string;
      filtroArtigos: string;
      label?: string;
      spec: ReturnType<typeof parseMultiArticleSpec>;
    }> = [];
    if (!activeFolder) return list;
    const targetLawNorm = normalizeSearch(activeFolder);
    for (const c of db.contests) {
      for (const pt of c.edital_pontos || []) {
        for (const lk of pt.artigos_vinculados || []) {
          if (normalizeSearch(lk.pastaLei) === targetLawNorm) {
            list.push({
              linkId: lk.id,
              contestId: c.id,
              contestName: c.concurso,
              pointId: pt.id,
              materia: pt.materia || 'Geral',
              titulo: pt.titulo,
              filtroArtigos: lk.filtroArtigos,
              label: lk.label,
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
    if (!sequentialIndex.orderedItems.length || !activeFolderLinks.length) return map;
    for (const item of sequentialIndex.orderedItems) {
      const matched = activeFolderLinks.filter((lk) => {
        if (lk.spec.exactKeys.size > 0) {
          return itemMatchesMultiArticleSpec(item, lk.spec);
        }
        const hay = normalizeSearch(`${item.artigo_base || ''} ${item.dispositivo} ${item.texto}`);
        return hay.includes(normalizeSearch(lk.filtroArtigos));
      });
      if (matched.length) {
        map.set(item.id, matched);
      }
    }
    return map;
  }, [sequentialIndex.orderedItems, activeFolderLinks]);

  const resolvedAssocContest = useMemo(() => {
    if (!db.contests.length) return null;
    if (assocContestId) {
      const found = db.contests.find((c) => c.id === assocContestId);
      if (found) return found;
    }
    if (selectedEditalContestId) {
      const found = db.contests.find((c) => c.id === selectedEditalContestId);
      if (found) return found;
    }
    return db.contests.find((c) => (c.edital_pontos?.length || 0) > 0) || db.contests[0];
  }, [db.contests, assocContestId, selectedEditalContestId]);

  const resolvedAssocPoints = resolvedAssocContest?.edital_pontos || [];

  const resolvedAssocPointsBySubject = useMemo(() => {
    const map = new Map<string, typeof resolvedAssocPoints>();
    for (const pt of resolvedAssocPoints) {
      const subj = pt.materia?.trim() || 'Geral';
      const arr = map.get(subj) || [];
      arr.push(pt);
      map.set(subj, arr);
    }
    return Array.from(map.entries());
  }, [resolvedAssocPoints]);

  const resolvedAssocPointId = resolvedAssocPoints.some((p) => p.id === assocPointId)
    ? assocPointId
    : resolvedAssocPoints[0]?.id || '';

  const searchSpec = useMemo(() => parseMultiArticleSpec(search), [search]);

  const itemMatchesCurrentSearch = (item: NonNullable<typeof folderData>['items'][number]) => {
    const term = normalizeSearch(search);
    if (!term) return true;
    if (searchSpec.exactKeys.size > 0) {
      return itemMatchesMultiArticleSpec(item, searchSpec);
    }
    return normalizeSearch(
      `${item.artigo_base || ''} ${item.dispositivo} ${item.texto} ${item.dica} ${item.observacao}`,
    ).includes(term);
  };

  const matchedIds = useMemo(() => {
    if (!sequentialIndex.orderedItems.length) return new Set<string>();
    const term = normalizeSearch(search);
    if (!term) return new Set<string>();
    return new Set(
      sequentialIndex.orderedItems
        .filter((item) => {
          if (searchSpec.exactKeys.size > 0) {
            return itemMatchesMultiArticleSpec(item, searchSpec);
          }
          return normalizeSearch(
            `${item.artigo_base || ''} ${item.dispositivo} ${item.texto} ${item.dica} ${item.observacao}`,
          ).includes(term);
        })
        .map((item) => item.id),
    );
  }, [sequentialIndex.orderedItems, search, searchSpec]);

  const filteredItems = useMemo(() => {
    if (!sequentialIndex.orderedItems.length) return [];
    const term = normalizeSearch(search);
    const shouldApplySearchFilter = Boolean(term) && (filterOnlyMatches || focusSearchTerm !== search);
    return sequentialIndex.orderedItems.filter((item) => {
      if (editalFilterContestId !== 'all') {
        const links = itemToLinksMap.get(item.id) || [];
        if (editalFilterContestId === '__any__') {
          if (!links.length) return false;
        } else if (!links.some((l) => l.contestId === editalFilterContestId)) {
          return false;
        }
      }
      if (shouldApplySearchFilter && !itemMatchesCurrentSearch(item)) {
        return false;
      }
      return true;
    });
  }, [
    sequentialIndex.orderedItems,
    search,
    searchSpec,
    filterOnlyMatches,
    focusSearchTerm,
    editalFilterContestId,
    itemToLinksMap,
  ]);

  const voiceReader = useLawVoiceReader({
    activeFolder,
    items: filteredItems,
    onPositionChange: (articleKey) => {
      if (activeFolder) {
        setLawLastPosition(activeFolder, articleKey);
      }
    },
    onAutoMarkItemRead: (item) => {
      if (activeFolder && !readSet.has(item.id)) {
        markLawItemsRead(activeFolder, [item.id], true);
      }
    },
  });

  useEffect(() => {
    if (!voiceReader.speakingItemId) return;
    const t = window.setTimeout(() => {
      const targetEl = document.querySelector(
        `[data-voice-item-id="${CSS.escape(voiceReader.speakingItemId!)}"]`,
      );
      if (targetEl instanceof HTMLElement) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [voiceReader.speakingItemId, readerTab]);

  const continuousText = useMemo(() => {
    if (!filteredItems.length) return '';
    let text = '';
    let lastArtigoBase = '';
    filteredItems.forEach((item, index) => {
      const meta = sequentialIndex.itemMetaById.get(item.id);
      const currentBase = meta?.canonicalKey || (item.artigo_base || item.dispositivo);
      const displayDevice = formatSequentialDeviceLabel(item.dispositivo, item.artigo_base);
      const isParagraph =
        item.tipo_dispositivo === 'Parágrafo' ||
        item.tipo_dispositivo === 'Pena' ||
        /^(?:§|Par[áa]grafo\b|Pena\b)/i.test(displayDevice);
      const isInciso =
        item.tipo_dispositivo === 'Inciso' || /^(?:Inciso\s+)?[IVXLCDM]{1,8}\b/.test(displayDevice);
      const isAlinea =
        item.tipo_dispositivo === 'Alínea' || /^(?:Al[íi]nea\s+|[a-z]\))/i.test(displayDevice);
      const indent = isAlinea ? '         ' : isInciso ? '      ' : isParagraph ? '   ' : '';

      if (index === 0) {
        text += `${indent}${displayDevice} — ${item.texto}`;
      } else if (lastArtigoBase && currentBase === lastArtigoBase) {
        text += `\n${indent}${displayDevice} — ${item.texto}`;
      } else {
        text += `\n\n${indent}${displayDevice} — ${item.texto}`;
      }
      lastArtigoBase = currentBase;
    });
    return text;
  }, [filteredItems, sequentialIndex.itemMetaById]);

  const groupedContinuousArticles = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        uid: string;
        canonicalKey: string;
        key: string;
        seqIndex: number;
        isFirstAnchor: boolean;
        items: typeof filteredItems;
      }
    >();

    for (let idx = 0; idx < filteredItems.length; idx++) {
      const item = filteredItems[idx];
      const meta = sequentialIndex.itemMetaById.get(item.id);
      const identity = meta || resolveCanonicalArticleIdentity(item);
      const canonicalKey = identity.canonicalKey;
      const key = identity.canonicalLabel;
      const seqIndex = meta ? meta.articleSeqIndex : 0;

      const existing = groupsMap.get(canonicalKey);
      if (existing) {
        existing.items.push(item);
      } else {
        groupsMap.set(canonicalKey, {
          uid: `${canonicalKey}::${item.id || idx}`,
          canonicalKey,
          key,
          seqIndex,
          isFirstAnchor: true,
          items: [item],
        });
      }
    }

    return Array.from(groupsMap.values());
  }, [filteredItems, sequentialIndex.itemMetaById]);

  const structuralOutline = useMemo(() => {
    const entries: Array<{
      id: string;
      heading: string;
      articleKey: string;
      articleLabel: string;
    }> = [];
    const headingRegex = /\b((?:LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+[IVXLCDM0-9A-Zº°ª-]+(?:\s*[-–—:]\s*[^\n.]{2,90})?)/i;
    const seen = new Set<string>();
    for (const group of groupedContinuousArticles) {
      for (const item of group.items) {
        const hay = `${item.dispositivo || ''}\n${item.texto || ''}`;
        const m = headingRegex.exec(hay);
        if (m) {
          const clean = m[1].replace(/\s+/g, ' ').trim();
          const norm = clean.toUpperCase();
          if (!seen.has(norm)) {
            seen.add(norm);
            entries.push({
              id: `${group.canonicalKey}-${entries.length}`,
              heading: clean,
              articleKey: group.canonicalKey,
              articleLabel: group.key,
            });
          }
        }
      }
    }
    return entries;
  }, [groupedContinuousArticles]);

  const visibleContinuousGroups = useMemo(
    () => groupedContinuousArticles.slice(0, visibleArticleLimit),
    [groupedContinuousArticles, visibleArticleLimit],
  );

  const highlightedSegments = useMemo(
    () => buildHighlightedSegments(continuousText, highlights),
    [continuousText, highlights],
  );

  const focusSpec = useMemo(
    () => parseMultiArticleSpec(focusSearchTerm || search),
    [focusSearchTerm, search],
  );

  const renderSegmentWithSearchFocus = (segText: string, segIdx: number, isFirstMatchRef: { used: boolean }) => {
    const q = (focusSearchTerm || search).trim();
    if (!q || filterOnlyMatches) {
      return renderLawTextWithExamHighlights(segText, readingPrefs.highlightExamWords);
    }

    let pos = -1;
    let matchLen = q.length;

    if (focusSpec.exactKeys.size > 0) {
      const keysArr = Array.from(focusSpec.exactKeys).slice(0, 12);
      for (const k of keysArr) {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\bArt\\.?\\s*${escaped}(?:[º°ªo]|-[a-z0-9]+)*\\b`, 'i');
        const m = re.exec(segText);
        if (m && (pos === -1 || m.index < pos)) {
          pos = m.index;
          matchLen = m[0].length;
        }
      }
    }

    if (pos === -1) {
      const lowerText = segText.toLowerCase();
      const lowerQ = q.toLowerCase();
      pos = lowerText.indexOf(lowerQ);
      matchLen = q.length;
    }

    if (pos === -1) {
      return renderLawTextWithExamHighlights(segText, readingPrefs.highlightExamWords);
    }

    const before = segText.slice(0, pos);
    const match = segText.slice(pos, pos + matchLen);
    const after = segText.slice(pos + matchLen);
    const attachRef = !isFirstMatchRef.used;
    if (attachRef) isFirstMatchRef.used = true;

    return (
      <>
        {renderLawTextWithExamHighlights(before, readingPrefs.highlightExamWords)}
        <span
          key={`focus-${segIdx}`}
          ref={attachRef ? focusMarkRef : undefined}
          className="px-1 py-0.5 rounded bg-[var(--accent)]/25 ring-2 ring-[var(--accent)] text-[var(--text)] font-bold"
        >
          {match}
        </span>
        {renderLawTextWithExamHighlights(after, readingPrefs.highlightExamWords)}
      </>
    );
  };

  const handleApplyHighlight = (color: HighlightColorKey) => {
    if (!activeFolder) return;
    setEraserModeActive(false);
    const selection = window.getSelection();
    const rawText = selection?.toString().trim() || '';
    if (!rawText) {
      toast('Selecione um trecho do texto legal antes de escolher a cor do marca-texto.', true);
      return;
    }
    const readerEl = document.getElementById('law-reader');
    if (readerEl && selection?.anchorNode && !readerEl.contains(selection.anchorNode)) {
      toast('Selecione o trecho diretamente no leitor de Lei Seca abaixo.', true);
      return;
    }
    let targetItemId: string | undefined;
    const anchorEl =
      selection?.anchorNode instanceof HTMLElement
        ? selection.anchorNode
        : selection?.anchorNode?.parentElement;
    const voiceContainer = anchorEl?.closest?.('[data-voice-item-id]');
    if (voiceContainer instanceof HTMLElement && voiceContainer.dataset.voiceItemId) {
      targetItemId = voiceContainer.dataset.voiceItemId;
    }
    addLawHighlight(activeFolder, rawText, color, targetItemId ? { itemId: targetItemId } : undefined);
    selection?.removeAllRanges();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeFolder) return;
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        voiceReader.togglePlayPause();
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const keyMap: Record<string, HighlightColorKey> = {
          '1': 'yellow',
          '2': 'green',
          '3': 'blue',
          '4': 'pink',
          '5': 'orange',
        };
        if (keyMap[e.key]) {
          const sel = window.getSelection()?.toString().trim();
          if (sel) {
            e.preventDefault();
            handleApplyHighlight(keyMap[e.key]);
          }
          return;
        }
        if (e.key.toLowerCase() === 'e') {
          const sel = window.getSelection()?.toString().trim();
          if (sel || highlights.length > 0) {
            e.preventDefault();
            handleEraseHighlightSelection();
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFolder, highlights.length, voiceReader]);

  const handleEraseHighlightSelection = () => {
    if (!activeFolder) return;
    const selection = window.getSelection();
    const rawText = selection?.toString().trim() || '';
    if (rawText) {
      const removed = removeLawHighlightText(activeFolder, rawText);
      if (removed) {
        selection?.removeAllRanges();
        setEraserModeActive(false);
      }
      return;
    }
    setEraserModeActive((prev) => {
      const next = !prev;
      if (next) {
        toast('Selecione um trecho grifado e clique em "Remover marcação", ou clique diretamente sobre qualquer trecho grifado.');
      }
      return next;
    });
  };

  const handleExportPdf = () => {
    if (!activeFolder || !continuousText) {
      toast('Não há dispositivos nesta pasta para exportar.', true);
      return;
    }
    try {
      exportLawWithHighlightsPdf(activeFolder, continuousText, highlights, savedLawNote);
      toast('PDF da Lei Seca com grifos e observações gerado.');
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const handleDownloadPdf = async (blobKey: string, name: string) => {
    const blob = await getFileBlob(blobKey);
    if (!blob) {
      toast('PDF não encontrado no armazenamento local.', true);
      return;
    }
    triggerBlobDownload(blob, name);
  };

  const firstMatchRefTracker = { used: false };

  return (
    <div>
      <PageHeader
        eyebrow="DIÁRIO OFICIAL · LEI SECA"
        title="Leitura direcionada com marca-texto e progresso"
        description="Acompanhe seu percentual lido no Vade Mecum Federal, localize artigos no contexto completo da lei, aplique grifos persistentes e exporte PDF."
        actions={
          folderNames.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setReaderTab('continuous')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors ${
                  readerTab === 'continuous'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)]'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5" />
                Leitor Contínuo
              </button>
              <button
                type="button"
                onClick={() => setReaderTab('devices')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors ${
                  readerTab === 'devices'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)]'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                Checklist de Leitura ({readingStats.read}/{readingStats.total})
              </button>
            </div>
          ) : undefined
        }
      />

      {folderNames.length ? (
        <>
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <select
              aria-label="Selecionar legislação"
              value={activeFolder}
              onChange={(e) => {
                setSelectedFolder(e.target.value);
                setPreviewPdf(null);
                setFocusSearchTerm('');
              }}
              className="ce-select w-auto min-w-[230px]"
            >
              {folderNames.map((name) => {
                const dates = [...(db.lawReadDates?.[name] || [])].sort((a, b) =>
                  b.data.localeCompare(a.data),
                );
                const latest = dates[0]?.data;
                let freshTag = '';
                if (latest) {
                  const today = localDateIso();
                  if (latest === today) {
                    freshTag = ' · lida hoje';
                  } else {
                    const diff = Math.round(
                      (new Date(`${today}T00:00:00`).getTime() - new Date(`${latest}T00:00:00`).getTime()) /
                        86400000,
                    );
                    freshTag =
                      Number.isFinite(diff) && diff > 0
                        ? ` · há ${diff}d`
                        : ` · ${formatIsoDateBr(latest)}`;
                  }
                }
                return (
                  <option key={name} value={name}>
                    {visibleName(name)} ({db.laws[name].items.length}
                    {freshTag})
                  </option>
                );
              })}
            </select>

            {!hideSearch && (
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setFocusSearchTerm(e.target.value);
                  }}
                  placeholder="Buscar artigo (ex: 5, 37-41), dispositivo ou termo..."
                  className="ce-input pl-8"
                />
              </div>
            )}

            {db.contests.length > 0 && (
              <select
                aria-label="Filtrar artigos vinculados ao edital"
                value={editalFilterContestId}
                onChange={(e) => setEditalFilterContestId(e.target.value)}
                className="ce-select w-auto max-w-[260px]"
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

            {search.trim() && (
              <button
                type="button"
                onClick={() => setFilterOnlyMatches((v) => !v)}
                className={`px-3 py-2 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap ${
                  filterOnlyMatches
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
                title="Alternar entre ver somente os artigos encontrados ou a lei inteira com destaque"
              >
                {filterOnlyMatches
                  ? `Mostrando só filtrados (${matchedIds.size}) · Ver lei completa`
                  : `Lei completa (${matchedIds.size} destaque(s)) · Filtrar só correspondências`}
              </button>
            )}
          </div>

          {/* Progresso de leitura da norma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-2.5">
              <div className="flex items-center justify-between text-[11.5px] mb-1.5">
                <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text)]">
                  <BookOpenCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Progresso geral na norma
                </span>
                <span className="font-mono-num font-bold text-[var(--accent)]">
                  {readingStats.read}/{readingStats.total} ({readingStats.pct}%)
                </span>
              </div>
              <div className="h-2 rounded-full border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${readingStats.pct}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-2.5">
              <div className="flex items-center justify-between text-[11.5px] mb-1.5">
                <span className="font-bold text-[var(--text)]">
                  Alta Incidência (Muito Alto / Alto)
                </span>
                <span className="font-mono-num font-bold text-[var(--good)]">
                  {readingStats.priorityTotal > 0
                    ? `${readingStats.priorityRead}/${readingStats.priorityTotal} (${readingStats.priorityPct}%)`
                    : 'Sem marcações'}
                </span>
              </div>
              <div className="h-2 rounded-full border border-[var(--line)] bg-[var(--panel-soft)] overflow-hidden">
                <div
                  className="h-full bg-[var(--good)] transition-all duration-300"
                  style={{ width: `${readingStats.priorityPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Dias em que leu esta lei */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-3 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--text)]">
                  <CalendarCheck2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  Dias em que leu esta lei
                </span>
                {lastReadSummary ? (
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                      lawReviewOverdue
                        ? 'border-[var(--warning)]/50 bg-[var(--warning)]/12 text-[var(--warning)]'
                        : 'border-[var(--good)]/40 bg-[var(--good)]/10 text-[var(--good)]'
                    }`}
                  >
                    Última leitura: {lastReadSummary} · {readDates.length} registro(s)
                    {lawReviewOverdue ? ' · Revisão recomendada' : ''}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-[var(--muted)]">
                    Nenhum dia registrado para esta lei ainda.
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => addLawReadDate(activeFolder, localDateIso())}
                  className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                >
                  <CalendarCheck2 className="w-3.5 h-3.5" />
                  Marcar lida hoje
                </button>
                <input
                  type="date"
                  aria-label="Selecionar data da leitura da lei"
                  value={readDateInput}
                  onChange={(e) => setReadDateInput(e.target.value)}
                  className="ce-input h-[34px] w-auto text-[12px]"
                />
                <input
                  type="text"
                  value={readDateNote}
                  onChange={(e) => setReadDateNote(e.target.value)}
                  placeholder="Obs. (opcional: ex. Arts. 1º a 20)"
                  className="ce-input h-[34px] w-[195px] text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    addLawReadDate(activeFolder, readDateInput, readDateNote);
                    setReadDateNote('');
                  }}
                  className="inline-flex items-center gap-1 h-[34px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                >
                  <CalendarPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Registrar dia
                </button>
              </div>
            </div>

            {readDates.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-[var(--line)]/60 flex flex-wrap items-center gap-1.5">
                {(showAllReadDates ? readDates : readDates.slice(0, 8)).map((entry) => (
                  <span
                    key={entry.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11.5px] text-[var(--text)]"
                  >
                    <strong className="font-mono-num">{formatIsoDateBr(entry.data)}</strong>
                    {entry.observacao && (
                      <span className="text-[var(--muted)] max-w-[200px] truncate" title={entry.observacao}>
                        · {entry.observacao}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeLawReadDate(activeFolder, entry.id)}
                      aria-label={`Remover leitura de ${formatIsoDateBr(entry.data)}`}
                      className="text-[var(--muted)] hover:text-[var(--bad)]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {readDates.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllReadDates((v) => !v)}
                    className="text-[11px] font-bold text-[var(--accent)] hover:underline px-1.5"
                  >
                    {showAllReadDates ? 'Mostrar menos' : `Ver todos (${readDates.length})`}
                  </button>
                )}
              </div>
            )}
          </div>

          {folderData?.pdfs.length ? (
            <Panel
              title="Arquivo(s) originais da norma (na íntegra)"
              className="mb-4"
              action={
                <button
                  type="button"
                  disabled={reprocessingLaw}
                  onClick={async () => {
                    if (!activeFolder) return;
                    setReprocessingLaw(true);
                    try {
                      await reprocessLawFolder(activeFolder);
                    } catch (err) {
                      toast((err as Error).message, true);
                    } finally {
                      setReprocessingLaw(false);
                    }
                  }}
                  title="Reprocessar o(s) arquivo(s) anexado(s) para extrair dispositivos e garantir a ordem Art. 1º, Art. 2º, Art. 3º... mantendo suas anotações e leituras."
                  className={
                    folderData.items.length === 0
                      ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-55 whitespace-nowrap'
                      : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[11.5px] font-bold hover:border-[var(--accent)] disabled:opacity-55 whitespace-nowrap'
                  }
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${reprocessingLaw ? 'animate-spin' : ''}`} />
                  {reprocessingLaw
                    ? 'Extraindo dispositivos…'
                    : folderData.items.length === 0
                      ? `Extrair dispositivos do arquivo (${folderData.pdfs.length})`
                      : 'Reprocessar e ordenar'}
                </button>
              }
            >
              <div className="flex flex-wrap gap-2">
                {folderData.pdfs.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-[12px]"
                  >
                    <strong className="text-[var(--text)]">{visibleName(p.name)}</strong>
                    <span className="text-[var(--muted)] font-mono-num">
                      {formatUploadSize(p.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPdf(
                          previewPdf?.blobKey === p.blobKey
                            ? null
                            : { blobKey: p.blobKey, name: p.name },
                        )
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                    >
                      <Eye className="w-3 h-3" />
                      {previewPdf?.blobKey === p.blobKey ? 'Fechar arquivo' : 'Visualizar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadPdf(p.blobKey, p.name)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                    >
                      <Download className="w-3 h-3" />
                      Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeFolder) return;
                        void requestConfirm({
                          title: `Excluir "${visibleName(p.name)}"?`,
                          description:
                            'O arquivo original será removido desta legislação e enviado à lixeira do Google Drive.',
                          confirmLabel: 'Excluir arquivo',
                          danger: true,
                        }).then(async (ok) => {
                          if (!ok) return;
                          await deleteLawPdf(activeFolder, p.id);
                          if (previewPdf?.blobKey === p.blobKey) {
                            setPreviewPdf(null);
                          }
                        });
                      }}
                      aria-label={`Excluir ${visibleName(p.name)}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--bad)] hover:border-[var(--bad)]"
                    >
                      <Trash2 className="w-3 h-3" />
                      Excluir
                    </button>
                  </div>
                ))}
              </div>
              {previewPdf && (
                <FilePreview
                  blobKey={previewPdf.blobKey}
                  filename={previewPdf.name}
                  mimeType="application/pdf"
                  title={visibleName(previewPdf.name)}
                  onClose={() => setPreviewPdf(null)}
                />
              )}
            </Panel>
          ) : null}

          <LawReadingToolbar
            prefs={readingPrefs}
            onStepFontSize={stepFontSize}
            onCycleLineHeight={cycleLineHeight}
            onToggleComfortableWidth={toggleComfortableWidth}
            onToggleHighlightExamWords={toggleHighlightExamWords}
            lastReadPosition={db.lawLastReadPosition?.[activeFolder]}
            onResumeLastPosition={handleJumpToArticle}
          />

          {sequentialIndex.orderedItems.length > 0 && (
            <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                <div className="flex flex-wrap items-center gap-2 text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text)]">
                    <ListOrdered className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Indexação sequencial rigorosa:
                  </span>
                  {sequentialIndex.minArticleNumber !== null && sequentialIndex.maxArticleNumber !== null ? (
                    <span className="font-semibold text-[var(--text)]">
                      {formatCanonicalArticleLabel(sequentialIndex.minArticleNumber)} →{' '}
                      {formatCanonicalArticleLabel(sequentialIndex.maxArticleNumber)}
                    </span>
                  ) : null}
                  <span>
                    {sequentialIndex.totalArticles > 0
                      ? `${sequentialIndex.totalArticles} artigo(s) · ${sequentialIndex.orderedItems.length} dispositivo(s)`
                      : `${sequentialIndex.orderedItems.length} dispositivo(s)`}
                  </span>
                </div>

                {sequentialIndex.missingArticleNumbers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowGapDetails((v) => !v)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/12 text-[11px] font-bold text-[var(--warning)] hover:border-[var(--warning)]"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {sequentialIndex.missingArticleNumbers.length} lacuna(s) na sequência
                    </button>
                    {folderData?.pdfs?.length ? (
                      <button
                        type="button"
                        disabled={reprocessingLaw}
                        onClick={async () => {
                          if (!activeFolder) return;
                          setReprocessingLaw(true);
                          try {
                            await reprocessLawFolder(activeFolder);
                          } catch (err) {
                            toast((err as Error).message, true);
                          } finally {
                            setReprocessingLaw(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-55"
                      >
                        <RefreshCw className={`w-3 h-3 ${reprocessingLaw ? 'animate-spin' : ''}`} />
                        {reprocessingLaw ? 'Reprocessando…' : 'Reprocessar PDF'}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {showGapDetails && sequentialIndex.missingArticleNumbers.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[var(--line)]/60 text-[11px] text-[var(--muted)]">
                  <strong className="text-[var(--text)]">Numeração ausente no intervalo extraído:</strong>{' '}
                  {sequentialIndex.missingArticleNumbers
                    .slice(0, 40)
                    .map((n) => formatCanonicalArticleLabel(n))
                    .join(', ')}
                  {sequentialIndex.missingArticleNumbers.length > 40
                    ? ` e mais ${sequentialIndex.missingArticleNumbers.length - 40} artigo(s)`
                    : ''}
                  . (Pode indicar artigos revogados/vetados não presentes no arquivo ou salto de leitura no PDF.)
                </div>
              )}
            </div>
          )}

          <ArticleJumpBar
            items={sequentialIndex.orderedItems}
            readSet={readSet}
            lastReadPosition={db.lawLastReadPosition?.[activeFolder]}
            activeArticleKey={
              voiceReader.isPlaying && voiceReader.currentItem
                ? (voiceReader.currentItem.artigo_base || voiceReader.currentItem.dispositivo || '').trim()
                : undefined
            }
            onSelectArticle={handleJumpToArticle}
          />

          <LawVoicePlayerBar
            isSupported={voiceReader.isSupported}
            isPlaying={voiceReader.isPlaying}
            isPaused={voiceReader.isPaused}
            activeIndex={voiceReader.activeIndex}
            totalItems={filteredItems.length}
            currentItem={voiceReader.currentItem}
            voices={voiceReader.voices}
            rate={voiceReader.rate}
            voiceURI={voiceReader.voiceURI}
            autoMarkRead={voiceReader.autoMarkRead}
            onTogglePlayPause={voiceReader.togglePlayPause}
            onStop={voiceReader.stop}
            onStepArticle={voiceReader.stepArticle}
            onChangeRate={voiceReader.setRate}
            onChangeVoice={voiceReader.setVoiceURI}
            onToggleAutoMarkRead={voiceReader.toggleAutoMarkRead}
          />

          {readerTab === 'continuous' ? (
            <Panel
              title={`Texto contínuo · ${visibleName(activeFolder)}`}
              subtitle="Selecione qualquer trecho abaixo e clique em uma cor para grifar, ou use Remover marcação para apagar um trecho já marcado."
              className="mb-4"
              stackHeader
              action={
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(HIGHLIGHT_COLOR_RGB) as HighlightColorKey[]).map((key) => {
                    const spec = HIGHLIGHT_COLOR_RGB[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleApplyHighlight(key)}
                        title={`Grifar em ${spec.label}`}
                        style={{ backgroundColor: spec.bg, color: spec.fg }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-black/15 text-[11px] font-bold hover:opacity-90 whitespace-nowrap"
                      >
                        <Highlighter className="w-3 h-3" />
                        {spec.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={handleEraseHighlightSelection}
                    disabled={!highlights.length}
                    title="Selecione um trecho já grifado e clique aqui para remover sua marcação (ou ative e clique sobre o grifo)"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors whitespace-nowrap disabled:opacity-45 ${
                      eraserModeActive
                        ? 'border-[var(--bad)] bg-[var(--bad)] text-white'
                        : 'border-[var(--bad)]/45 bg-[var(--bad)]/10 text-[var(--bad)] hover:bg-[var(--bad)]/20'
                    }`}
                  >
                    <Eraser className="w-3 h-3" />
                    {eraserModeActive ? 'Clique no grifo para apagar' : 'Remover marcação'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLastLawHighlight(activeFolder)}
                    disabled={!highlights.length}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap"
                  >
                    <Undo2 className="w-3 h-3" />
                    Remover último ({highlights.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                  >
                    <Download className="w-3 h-3" />
                    PDF com grifos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const selectionText = window.getSelection()?.toString().trim() || '';
                      const artMatch = selectionText.match(/\bArt(?:igo)?\.?\s*(\d+[º°ªo]?(?:-[a-zA-Z0-9]+)?)/i);
                      if (!showContinuousLinker) {
                        setContinuousArticleSpec(artMatch ? artMatch[1] : search.trim());
                      }
                      setShowContinuousLinker((v) => !v);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap ${
                      showContinuousLinker
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                    }`}
                    title="Associar artigo(s) desta lei a um ponto do Edital"
                  >
                    <Link2 className="w-3 h-3 text-[var(--accent)]" />
                    Associar ao Edital
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMatrixGuidesInContinuous((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap ${
                      showMatrixGuidesInContinuous
                        ? 'border-[var(--good)]/50 bg-[var(--good)]/12 text-[var(--good)]'
                        : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                    title="Mostrar ou ocultar grau de incidência, dicas da Matriz e botão de marcar lido por artigo no Leitor Contínuo"
                  >
                    <Sparkles className="w-3 h-3" />
                    Guias da Matriz {showMatrixGuidesInContinuous ? '(Ativo)' : '(Oculto)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDouMode((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      douMode
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                    }`}
                    title="Alternar layout em 2 colunas estilo Diário Oficial / Vade Mecum"
                  >
                    <Newspaper className="w-3 h-3" />
                    Modo Diário Oficial {douMode ? '(Ativo)' : ''}
                  </button>
                  {structuralOutline.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowStructuralOutline((v) => !v)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap ${
                        showStructuralOutline
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                      }`}
                      title="Abrir Sumário Estrutural por Títulos, Capítulos e Seções"
                    >
                      <ListOrdered className="w-3 h-3 text-[var(--accent)]" />
                      Sumário ({structuralOutline.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                  >
                    Imprimir
                  </button>
                </div>
              }
            >
              {showStructuralOutline && structuralOutline.length > 0 && (
                <div className="mb-3 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
                      Sumário Estrutural · Títulos, Capítulos e Seções
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowStructuralOutline(false)}
                      className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      Ocultar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {structuralOutline.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => handleJumpToArticle(entry.articleLabel)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] hover:border-[var(--accent)] text-[11px] font-semibold text-[var(--text)] transition-colors text-left"
                      >
                        <span className="font-extrabold text-[var(--accent)]">{entry.articleLabel}</span>
                        <span className="truncate max-w-[260px]">{entry.heading}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {showContinuousLinker && (
                <div className="mb-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--panel-soft)] p-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--text)]">
                    <Link2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Vincular ao Edital:
                  </span>
                  <input
                    type="text"
                    aria-label="Artigo ou faixa para vincular ao edital"
                    value={continuousArticleSpec}
                    onChange={(e) => setContinuousArticleSpec(e.target.value)}
                    placeholder="Ex.: 5, 37-41 ou Art. 14"
                    className="ce-input h-[32px] w-[170px] text-[11.5px]"
                  />
                  {db.contests.length === 0 ? (
                    <span className="text-[11.5px] text-[var(--muted)]">
                      Cadastre um concurso em Datas & Locais e pontos em Editais primeiro.
                    </span>
                  ) : (
                    <>
                      <select
                        aria-label="Concurso do edital"
                        value={resolvedAssocContest?.id || ''}
                        onChange={(e) => setAssocContestId(e.target.value)}
                        className="ce-select h-[32px] w-auto max-w-[200px] text-[11.5px] py-0.5"
                      >
                        {db.contests.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.concurso} ({c.edital_pontos?.length || 0})
                          </option>
                        ))}
                      </select>
                      {resolvedAssocPoints.length > 0 && resolvedAssocContest ? (
                        <>
                          <select
                            aria-label="Ponto do edital para vincular"
                            value={resolvedAssocPointId}
                            onChange={(e) => setAssocPointId(e.target.value)}
                            className="ce-select h-[32px] w-auto max-w-[300px] text-[11.5px] py-0.5"
                          >
                            {resolvedAssocPointsBySubject.map(([subj, list]) => (
                              <optgroup key={subj} label={subj}>
                                {list.map((pt) => (
                                  <option key={pt.id} value={pt.id}>
                                    {pt.titulo}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                linkEditalPointToLaw(resolvedAssocContest.id, resolvedAssocPointId, {
                                  pastaLei: activeFolder,
                                  filtroArtigos: continuousArticleSpec,
                                })
                              ) {
                                setContinuousArticleSpec('');
                                setShowContinuousLinker(false);
                              }
                            }}
                            className="inline-flex items-center gap-1 h-[32px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Vincular
                          </button>
                        </>
                      ) : resolvedAssocContest ? (
                        <button
                          type="button"
                          onClick={() => openContestEdital(resolvedAssocContest.id)}
                          className="inline-flex items-center gap-1 h-[32px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Cadastrar pontos em {resolvedAssocContest.concurso}
                        </button>
                      ) : null}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowContinuousLinker(false)}
                    className="h-[32px] px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    Fechar
                  </button>
                </div>
              )}
                  { continuousText ? (
                <div
                  id="law-reader"
                  onScroll={(e) => {
                    if (visibleArticleLimit >= groupedContinuousArticles.length) return;
                    const el = e.currentTarget;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 420) {
                      setVisibleArticleLimit((prev) =>
                        Math.min(groupedContinuousArticles.length, prev + 60),
                      );
                    }
                  }}
                  style={{
                    fontSize: FONT_SIZE_PX[readingPrefs.fontSize],
                    lineHeight: LINE_HEIGHT_VAL[readingPrefs.lineHeight],
                  }}
                  className={`law-reader min-h-[350px] max-h-[650px] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-5 text-[var(--text)] select-text ${
                    !douMode && readingPrefs.comfortableWidth ? 'max-w-[82ch] mx-auto' : ''
                  }`}
                >
                  {douMode && (
                    <div
                      className="mb-5 pb-3 border-b-2 border-[var(--line-strong)] text-center select-none"
                      contentEditable={false}
                    >
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                        REPÚBLICA FEDERATIVA DOS CONCURSOS · PORTAL ESTUDA.GOV.BR
                      </div>
                      <h4 className="m-0 mt-1 font-display text-[17px] sm:text-[19px] font-extrabold uppercase tracking-[0.04em] text-[var(--text)]">
                        DIÁRIO OFICIAL DA ESTUDÂNCIA — SEÇÃO ÚNICA
                      </h4>
                      <div className="mt-1 text-[11px] text-[var(--muted)] font-mono-num">
                        {visibleName(activeFolder)} · Edição Permanente em Duas Colunas · ISSN 2026-CAFE
                      </div>
                    </div>
                  )}
                  <div className={douMode ? 'md:columns-2 md:gap-8 md:[column-rule:1px_solid_var(--line)]' : ''}>
                  {showMatrixGuidesInContinuous ? (
                    <div className="space-y-4">
                      {visibleContinuousGroups.map((group) => {
                        const groupReadCount = group.items.filter((it) => readSet.has(it.id)).length;
                        const allGroupRead = groupReadCount === group.items.length && group.items.length > 0;
                        const topGradeItem = group.items.find(
                          (it) => it.grau && it.grau !== 'Não Classificado',
                        );
                        const groupDates = group.items
                          .flatMap((it) => it.leituras || [])
                          .sort((a, b) => b.data.localeCompare(a.data));
                        const latestDate = groupDates[0]?.data;
                        const groupEditalLinks = Array.from(
                          new Map(
                            group.items
                              .flatMap((it) => itemToLinksMap.get(it.id) || [])
                              .map((lk) => [`${lk.contestId}-${lk.pointId}`, lk]),
                          ).values(),
                        );

                        return (
                          <div
                            key={group.uid}
                            id={
                              group.isFirstAnchor
                                ? buildArticleAnchorId('law-cont-art', group.canonicalKey)
                                : undefined
                            }
                            onClick={() => setLawLastPosition(activeFolder, group.key)}
                            className={`rounded-lg border p-3.5 transition-colors ${
                              allGroupRead
                                ? 'border-[var(--good)]/35 bg-[var(--good)]/[0.03]'
                                : 'border-[var(--line)]/80 bg-[var(--panel)]/60'
                            }`}
                          >
                            <div
                              className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-[var(--line)]/60 select-none"
                              contentEditable={false}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                {group.seqIndex > 0 && (
                                  <span
                                    title={`Posição sequencial no documento: #${group.seqIndex}`}
                                    className="px-1.5 py-0.5 rounded bg-[var(--panel-soft)] border border-[var(--line)] text-[10px] font-mono-num font-bold text-[var(--muted)]"
                                  >
                                    #{group.seqIndex}
                                  </span>
                                )}
                                <span className="text-[12.5px] font-extrabold text-[var(--accent)]">
                                  {group.key}
                                </span>
                                {topGradeItem && (
                                  <span
                                    className={`px-2 py-0.5 rounded border text-[10px] font-bold grade-badge-${incidenceColorClass(
                                      topGradeItem.grau,
                                    )}`}
                                  >
                                    {topGradeItem.grau}
                                  </span>
                                )}
                                {latestDate && (
                                  <span className="px-2 py-0.5 rounded border border-[var(--good)]/40 bg-[var(--good)]/10 text-[10px] font-bold text-[var(--good)]">
                                    Lido em {formatIsoDateBr(latestDate)}
                                  </span>
                                )}
                                {groupEditalLinks.map((lk) => (
                                  <button
                                    key={`${lk.contestId}-${lk.pointId}`}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openContestEdital(lk.contestId);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--accent)]/35 bg-[var(--accent-soft)]/70 text-[10px] font-bold text-[var(--text)] hover:text-[var(--accent)]"
                                    title={`Vinculado ao edital ${lk.contestName}: ${lk.titulo}`}
                                  >
                                    <ExternalLink className="w-2.5 h-2.5 text-[var(--accent)]" />
                                    {lk.contestName} · {lk.materia}
                                  </button>
                                ))}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {voiceReader.isSupported && group.items[0] && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      voiceReader.playFromItemId(group.items[0].id);
                                    }}
                                    title={`Ouvir a partir de ${group.key}`}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold transition-colors ${
                                      group.items.some((it) => it.id === voiceReader.speakingItemId)
                                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                        : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--accent)] hover:border-[var(--accent)]'
                                    }`}
                                  >
                                    <Volume2 className="w-3 h-3" />
                                    Ouvir
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (allGroupRead) {
                                      markLawItemsRead(
                                        activeFolder,
                                        group.items.map((it) => it.id),
                                        false,
                                      );
                                    } else {
                                      addLawItemReadDate(
                                        activeFolder,
                                        group.items.map((it) => it.id),
                                        localDateIso(),
                                      );
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors ${
                                    allGroupRead
                                      ? 'border-[var(--good)] bg-[var(--good)] text-white'
                                      : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--good)]'
                                  }`}
                                >
                                  <Check className="w-3 h-3" />
                                  {allGroupRead
                                    ? 'Artigo lido'
                                    : `Marcar lido (${groupReadCount}/${group.items.length})`}
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2 whitespace-pre-wrap">
                              {group.items.map((item, idx) => {
                                const displayDevice = formatSequentialDeviceLabel(
                                  item.dispositivo,
                                  item.artigo_base,
                                );
                                const isParagraph =
                                  item.tipo_dispositivo === 'Parágrafo' ||
                                  item.tipo_dispositivo === 'Pena' ||
                                  /^(?:§|Par[áa]grafo\b|Pena\b)/i.test(displayDevice);
                                const isInciso =
                                  item.tipo_dispositivo === 'Inciso' ||
                                  /^(?:Inciso\s+)?[IVXLCDM]{1,8}\b/.test(displayDevice);
                                const isAlinea =
                                  item.tipo_dispositivo === 'Alínea' ||
                                  /^(?:Al[íi]nea\s+|[a-z]\))/i.test(displayDevice);
                                const indentCls = isAlinea
                                  ? 'pl-9'
                                  : isInciso
                                  ? 'pl-6'
                                  : isParagraph
                                  ? 'pl-3'
                                  : '';
                                const lineStr = `${displayDevice} — ${item.texto}`;
                                const lineSegments = buildHighlightedSegments(lineStr, highlights, {
                                  itemId: item.id,
                                });
                                const isSpeakingThis = voiceReader.speakingItemId === item.id;

                                return (
                                  <div
                                    key={item.id}
                                    data-voice-item-id={item.id}
                                    className={`${indentCls} transition-colors ${
                                      isSpeakingThis
                                        ? 'rounded-lg bg-[var(--accent)]/12 ring-2 ring-[var(--accent)] px-2.5 py-1.5 -mx-1'
                                        : ''
                                    }`}
                                  >
                                    {isSpeakingThis && (
                                      <div
                                        className="inline-flex items-center gap-1 mb-1 px-2 py-0.5 rounded bg-[var(--accent)] text-white text-[10px] font-bold select-none"
                                        contentEditable={false}
                                      >
                                        <Volume2 className="w-3 h-3 animate-pulse" />
                                        Lendo em voz alta
                                      </div>
                                    )}
                                    <div>
                                      {lineSegments.map((seg, sIdx) =>
                                        seg.color ? (
                                          <mark
                                            key={sIdx}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (eraserModeActive) {
                                                removeLawHighlightText(activeFolder, seg.text);
                                                setEraserModeActive(false);
                                              } else {
                                                cycleLawHighlightColor(
                                                  activeFolder,
                                                  seg.highlightId || seg.text,
                                                  item.id,
                                                );
                                              }
                                            }}
                                            title={
                                              eraserModeActive
                                                ? 'Clique para remover esta marcação'
                                                : 'Clique para alternar a cor da marcação'
                                            }
                                            className={
                                              eraserModeActive
                                                ? 'cursor-pointer ring-1 ring-[var(--bad)] hover:opacity-75'
                                                : 'cursor-pointer hover:brightness-95 transition-all'
                                            }
                                            style={{
                                              backgroundColor: HIGHLIGHT_COLOR_RGB[seg.color].bg,
                                              color: HIGHLIGHT_COLOR_RGB[seg.color].fg,
                                            }}
                                          >
                                            {renderSegmentWithSearchFocus(
                                              seg.text,
                                              idx * 100 + sIdx,
                                              firstMatchRefTracker,
                                            )}
                                          </mark>
                                        ) : (
                                          <React.Fragment key={sIdx}>
                                            {renderSegmentWithSearchFocus(
                                              seg.text,
                                              idx * 100 + sIdx,
                                              firstMatchRefTracker,
                                            )}
                                          </React.Fragment>
                                        ),
                                      )}
                                    </div>
                                    {(item.dica || item.observacao) && (
                                      <div
                                        className="mt-1.5 flex flex-col gap-1 select-none"
                                        contentEditable={false}
                                      >
                                        {item.dica && (
                                          <div className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2.5 py-1 text-[11.5px] text-[var(--text)]">
                                            <strong className="text-[var(--warning)]">
                                              Ponto de atenção:
                                            </strong>{' '}
                                            {item.dica}
                                          </div>
                                        )}
                                        {item.observacao && (
                                          <div className="rounded-md border border-[var(--accent)]/35 bg-[var(--accent-soft)]/50 px-2.5 py-1 text-[11.5px] text-[var(--text)]">
                                            <strong className="text-[var(--accent)]">
                                              Obs. de prova:
                                            </strong>{' '}
                                            {item.observacao}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {visibleArticleLimit < groupedContinuousArticles.length && (
                        <div className="pt-2 pb-1 flex flex-wrap items-center justify-center gap-2 select-none">
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleArticleLimit((prev) =>
                                Math.min(groupedContinuousArticles.length, prev + 100),
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[12px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
                          >
                            Carregar mais artigos ({visibleContinuousGroups.length} de{' '}
                            {groupedContinuousArticles.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisibleArticleLimit(groupedContinuousArticles.length)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                          >
                            Exibir todos os {groupedContinuousArticles.length} artigos
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {highlightedSegments.map((seg, i) =>
                        seg.color ? (
                          <mark
                            key={i}
                            onClick={() => {
                              if (eraserModeActive) {
                                removeLawHighlightText(activeFolder, seg.text);
                                setEraserModeActive(false);
                              } else {
                                cycleLawHighlightColor(activeFolder, seg.highlightId || seg.text);
                              }
                            }}
                            title={
                              eraserModeActive
                                ? 'Clique para remover esta marcação'
                                : 'Clique para alternar a cor da marcação'
                            }
                            className={
                              eraserModeActive
                                ? 'cursor-pointer ring-1 ring-[var(--bad)] hover:opacity-75'
                                : 'cursor-pointer hover:brightness-95 transition-all'
                            }
                            style={{
                              backgroundColor: HIGHLIGHT_COLOR_RGB[seg.color].bg,
                              color: HIGHLIGHT_COLOR_RGB[seg.color].fg,
                            }}
                          >
                            {renderSegmentWithSearchFocus(seg.text, i, firstMatchRefTracker)}
                          </mark>
                        ) : (
                          <React.Fragment key={i}>
                            {renderSegmentWithSearchFocus(seg.text, i, firstMatchRefTracker)}
                          </React.Fragment>
                        ),
                      )}
                    </div>
                  )}
                  </div>
                </div>
              ) : folderData && folderData.items.length === 0 && folderData.pdfs.length > 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-6 text-center">
                  <p className="m-0 text-[13px] text-[var(--text)] font-semibold mb-2">
                    Esta legislação possui {folderData.pdfs.length} arquivo(s) anexado(s), mas ainda está com 0 dispositivos extraídos.
                  </p>
                  <button
                    type="button"
                    disabled={reprocessingLaw}
                    onClick={async () => {
                      if (!activeFolder) return;
                      setReprocessingLaw(true);
                      try {
                        await reprocessLawFolder(activeFolder);
                      } catch (err) {
                        toast((err as Error).message, true);
                      } finally {
                        setReprocessingLaw(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-55"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reprocessingLaw ? 'animate-spin' : ''}`} />
                    {reprocessingLaw
                      ? 'Extraindo dispositivos…'
                      : `Extrair dispositivos do arquivo (${folderData.pdfs.length})`}
                  </button>
                </div>
              ) : (
                <EmptyState message="Nenhum dispositivo encontrado nesta pasta ou com o filtro aplicado." />
              )}

              <div className="mt-4 pt-4 border-t border-[var(--line)]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text)]">
                      <StickyNote className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      Quadro de Observações · {visibleName(activeFolder)}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--muted)]">
                      {lawNoteDraft !== savedLawNote
                        ? 'Salvando alterações…'
                        : savedLawNote.trim()
                          ? 'Salvo automaticamente nesta lei'
                          : 'Associado exclusivamente a esta lei'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {lawNoteDraft.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setLawNoteDraft('');
                          saveLawNote(activeFolder, '', false);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]"
                      >
                        <Trash2 className="w-3 h-3" />
                        Limpar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => saveLawNote(activeFolder, lawNoteDraft, false)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)]"
                    >
                      <Save className="w-3 h-3" />
                      Salvar observações
                    </button>
                  </div>
                </div>
                <textarea
                  aria-label={`Observações importantes de ${visibleName(activeFolder)}`}
                  value={lawNoteDraft}
                  onChange={(e) => setLawNoteDraft(e.target.value)}
                  onBlur={() => {
                    if (activeFolder && lawNoteDraft !== savedLawNote) {
                      saveLawNote(activeFolder, lawNoteDraft, true);
                    }
                  }}
                  rows={4}
                  placeholder={`Digite aqui pontos importantes, prazos, exceções, súmulas ou pegadinhas de banca sobre ${visibleName(activeFolder)}...`}
                  className="ce-textarea w-full min-h-[105px] text-[13px] leading-relaxed"
                />
              </div>
            </Panel>
          ) : (
            <Panel
              title={`Dispositivos · ${visibleName(activeFolder)}`}
              subtitle="Marque artigos e parágrafos como lidos ou revisados para acompanhar sua evolução."
              className="mb-4"
              action={
                filteredItems.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5 mr-1">
                      {(
                        [
                          { key: 'all', label: 'Todos' },
                          { key: 'unread', label: 'Não lidos' },
                          { key: 'read', label: 'Lidos' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setChecklistFilter(tab.key)}
                          className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors ${
                            checklistFilter === tab.key
                              ? 'bg-[var(--accent)] text-white'
                              : 'text-[var(--muted)] hover:text-[var(--text)]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        markLawItemsRead(
                          activeFolder,
                          filteredItems.map((it) => it.id),
                          true,
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--good)]/50 bg-[var(--good)]/15 text-[var(--good)] text-[11px] font-bold hover:bg-[var(--good)] hover:text-white transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Marcar todos visíveis
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        markLawItemsRead(
                          activeFolder,
                          filteredItems.map((it) => it.id),
                          false,
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      Limpar seleção
                    </button>
                  </div>
                ) : undefined
              }
            >
              {(() => {
                const checklistItems = filteredItems.filter((item) => {
                  const isRead = readSet.has(item.id);
                  if (checklistFilter === 'unread') return !isRead;
                  if (checklistFilter === 'read') return isRead;
                  return true;
                });
                const seenChecklistArticleAnchors = new Set<string>();
                return checklistItems.length ? (
                <div
                  className={`flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1 ${
                    readingPrefs.comfortableWidth ? 'max-w-[82ch] mx-auto' : ''
                  }`}
                >
                  {checklistItems.map((item) => {
                    const isRead = readSet.has(item.id);
                    const isMatched = matchedIds.has(item.id);
                    const itemEditalLinks = itemToLinksMap.get(item.id) || [];
                    const isLinkingThis = linkingItemId === item.id;
                    const itemMeta = sequentialIndex.itemMetaById.get(item.id);
                    const canonicalKey =
                      itemMeta?.canonicalKey || resolveCanonicalArticleIdentity(item).canonicalKey;
                    const articleTarget =
                      itemMeta?.canonicalLabel || (item.artigo_base || item.dispositivo || '').trim();
                    const deviceTarget = formatSequentialDeviceLabel(item.dispositivo, item.artigo_base);
                    const latestReadDate = [...(item.leituras || [])].sort((a, b) =>
                      b.data.localeCompare(a.data),
                    )[0]?.data;
                    const anchorCandidate = buildArticleAnchorId('law-dev-art', canonicalKey);
                    const assignAnchor = !seenChecklistArticleAnchors.has(anchorCandidate);
                    if (assignAnchor) seenChecklistArticleAnchors.add(anchorCandidate);

                    const isSpeakingThis = voiceReader.speakingItemId === item.id;

                    return (
                      <div
                        key={item.id}
                        id={assignAnchor ? anchorCandidate : undefined}
                        data-voice-item-id={item.id}
                        onClick={() => setLawLastPosition(activeFolder, articleTarget)}
                        className={`rounded-xl border p-3 transition-colors ${
                          isSpeakingThis
                            ? 'border-[var(--accent)] bg-[var(--accent)]/12 ring-2 ring-[var(--accent)]'
                            : isMatched
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                            : isRead
                            ? 'border-[var(--good)]/40 bg-[var(--good)]/5'
                            : 'border-[var(--line)] bg-[var(--panel-soft)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {itemMeta && (
                                <span
                                  title={`Dispositivo #${itemMeta.docSeqIndex} do documento`}
                                  className="px-1.5 py-0.5 rounded bg-[var(--panel)] border border-[var(--line)] text-[10px] font-mono-num font-bold text-[var(--muted)]"
                                >
                                  #{itemMeta.docSeqIndex}
                                </span>
                              )}
                              <strong className="text-[13px] font-bold text-[var(--text)]">
                                {deviceTarget}
                              </strong>
                              {isSpeakingThis && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent)] text-white text-[10px] font-bold">
                                  <Volume2 className="w-3 h-3 animate-pulse" />
                                  Ouvindo
                                </span>
                              )}
                              {item.grau && item.grau !== 'Não Classificado' && (
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-bold grade-badge-${incidenceColorClass(
                                    item.grau,
                                  )}`}
                                >
                                  {item.grau}
                                </span>
                              )}
                              {latestReadDate && (
                                <span className="px-1.5 py-0.5 rounded border border-[var(--good)]/40 bg-[var(--good)]/10 text-[10px] font-bold text-[var(--good)]">
                                  Lido em {formatIsoDateBr(latestReadDate)}
                                </span>
                              )}
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
                              <div className="mt-2 flex flex-col gap-1">
                                {item.dica && (
                                  <div className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2.5 py-1 text-[11.5px] text-[var(--text)]">
                                    <strong className="text-[var(--warning)]">
                                      Ponto de atenção:
                                    </strong>{' '}
                                    {item.dica}
                                  </div>
                                )}
                                {item.observacao && (
                                  <div className="rounded-md border border-[var(--accent)]/35 bg-[var(--accent-soft)]/50 px-2.5 py-1 text-[11.5px] text-[var(--text)]">
                                    <strong className="text-[var(--accent)]">
                                      Obs. de prova:
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
                                    className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/35 bg-[var(--panel)] pl-2 pr-1 py-0.5 text-[10.5px] text-[var(--text)]"
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
                                      onClick={() => unlinkEditalPointFromLaw(lk.contestId, lk.pointId, lk.linkId)}
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
                          </div>
                          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                            {voiceReader.isSupported && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  voiceReader.playFromItemId(item.id);
                                }}
                                title="Ouvir em voz a partir deste dispositivo"
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                  isSpeakingThis
                                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--accent)] hover:border-[var(--accent)]'
                                }`}
                              >
                                <Play className="w-3 h-3" />
                                Ouvir
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (isLinkingThis) {
                                  setLinkingItemId(null);
                                } else {
                                  setLinkingItemId(item.id);
                                  setAssocScope('article');
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                isLinkingThis
                                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]'
                              }`}
                              title="Associar este artigo/dispositivo a um ponto do Edital"
                            >
                              <Link2 className="w-3 h-3 text-[var(--accent)]" />
                              Edital
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleLawItemRead(activeFolder, item.id)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                isRead
                                  ? 'border-[var(--good)] bg-[var(--good)] text-white'
                                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                              {isRead ? 'Lido' : 'Marcar lido'}
                            </button>
                          </div>
                        </div>

                        {isLinkingThis && (
                          <div className="mt-2.5 pt-2.5 border-t border-[var(--line)]/60 flex flex-wrap items-center gap-2">
                            {db.contests.length === 0 ? (
                              <span className="text-[11.5px] text-[var(--muted)]">
                                Nenhum concurso cadastrado em Datas & Locais / Editais.
                              </span>
                            ) : (
                              <>
                                <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--text)]">
                                  <Link2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                                  Associar ao Edital:
                                </span>
                                <select
                                  aria-label="Selecionar concurso para associar artigo"
                                  value={resolvedAssocContest?.id || ''}
                                  onChange={(e) => setAssocContestId(e.target.value)}
                                  className="ce-select h-[32px] w-auto max-w-[200px] text-[11.5px] py-0.5"
                                >
                                  {db.contests.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.concurso} ({c.edital_pontos?.length || 0})
                                    </option>
                                  ))}
                                </select>
                                {resolvedAssocPoints.length > 0 && resolvedAssocContest ? (
                                  <>
                                    <select
                                      aria-label="Selecionar ponto do edital"
                                      value={resolvedAssocPointId}
                                      onChange={(e) => setAssocPointId(e.target.value)}
                                      className="ce-select h-[32px] w-auto max-w-[300px] text-[11.5px] py-0.5"
                                    >
                                      {resolvedAssocPointsBySubject.map(([subj, list]) => (
                                        <optgroup key={subj} label={subj}>
                                          {list.map((pt) => (
                                            <option key={pt.id} value={pt.id}>
                                              {pt.titulo}
                                            </option>
                                          ))}
                                        </optgroup>
                                      ))}
                                    </select>
                                    <select
                                      aria-label="Escopo do vínculo"
                                      value={assocScope}
                                      onChange={(e) => setAssocScope(e.target.value as 'article' | 'device')}
                                      className="ce-select h-[32px] w-auto text-[11.5px] py-0.5"
                                    >
                                      <option value="article">
                                        Artigo completo ({articleTarget})
                                      </option>
                                      <option value="device">
                                        Só dispositivo ({deviceTarget})
                                      </option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const filtro =
                                          assocScope === 'device' ? deviceTarget : articleTarget;
                                        if (
                                          linkEditalPointToLaw(
                                            resolvedAssocContest.id,
                                            resolvedAssocPointId,
                                            {
                                              pastaLei: activeFolder,
                                              filtroArtigos: filtro,
                                            },
                                          )
                                        ) {
                                          setLinkingItemId(null);
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 h-[32px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Vincular
                                    </button>
                                  </>
                                ) : resolvedAssocContest ? (
                                  <button
                                    type="button"
                                    onClick={() => openContestEdital(resolvedAssocContest.id)}
                                    className="inline-flex items-center gap-1 h-[32px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)]"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Cadastrar pontos no edital
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => setLinkingItemId(null)}
                                  className="h-[32px] px-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                                >
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : folderData && folderData.items.length === 0 && folderData.pdfs.length > 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-6 text-center">
                  <p className="m-0 text-[13px] text-[var(--text)] font-semibold mb-2">
                    Esta legislação possui {folderData.pdfs.length} arquivo(s) anexado(s), mas ainda está com 0 dispositivos extraídos.
                  </p>
                  <button
                    type="button"
                    disabled={reprocessingLaw}
                    onClick={async () => {
                      if (!activeFolder) return;
                      setReprocessingLaw(true);
                      try {
                        await reprocessLawFolder(activeFolder);
                      } catch (err) {
                        toast((err as Error).message, true);
                      } finally {
                        setReprocessingLaw(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-55"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reprocessingLaw ? 'animate-spin' : ''}`} />
                    {reprocessingLaw
                      ? 'Extraindo dispositivos…'
                      : `Extrair dispositivos do arquivo (${folderData.pdfs.length})`}
                  </button>
                </div>
              ) : (
                <EmptyState message="Nenhum dispositivo encontrado nesta pasta ou com o filtro aplicado." />
              );
              })()}

              <div className="mt-4 pt-4 border-t border-[var(--line)]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--text)]">
                      <StickyNote className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      Quadro de Observações · {visibleName(activeFolder)}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--muted)]">
                      {lawNoteDraft !== savedLawNote
                        ? 'Salvando alterações…'
                        : savedLawNote.trim()
                          ? 'Salvo automaticamente nesta lei'
                          : 'Associado exclusivamente a esta lei'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {lawNoteDraft.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setLawNoteDraft('');
                          saveLawNote(activeFolder, '', false);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]"
                      >
                        <Trash2 className="w-3 h-3" />
                        Limpar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => saveLawNote(activeFolder, lawNoteDraft, false)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)]"
                    >
                      <Save className="w-3 h-3" />
                      Salvar observações
                    </button>
                  </div>
                </div>
                <textarea
                  aria-label={`Observações importantes de ${visibleName(activeFolder)}`}
                  value={lawNoteDraft}
                  onChange={(e) => setLawNoteDraft(e.target.value)}
                  onBlur={() => {
                    if (activeFolder && lawNoteDraft !== savedLawNote) {
                      saveLawNote(activeFolder, lawNoteDraft, true);
                    }
                  }}
                  rows={4}
                  placeholder={`Digite aqui pontos importantes, prazos, exceções, súmulas ou pegadinhas de banca sobre ${visibleName(activeFolder)}...`}
                  className="ce-textarea w-full min-h-[105px] text-[13px] leading-relaxed"
                />
              </div>
            </Panel>
          )}
        </>
      ) : (
        <EmptyState message="Nenhuma pasta de legislação disponível. Crie uma em Matriz de Incidência ou converta um PDF em Utilidades." />
      )}
    </div>
  );
};

