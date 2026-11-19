import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  Download,
  Eraser,
  ExternalLink,
  FileText,
  Hand,
  Highlighter,
  Loader2,
  PenTool,
  Save,
  StickyNote,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { getFileBlob, saveFileBlob, triggerBlobDownload } from '../../lib/fileStorage';
import { visibleName } from '../../lib/parsers';
import {
  PDF_ANNOTATION_PALETTE,
  bakeAnnotationsIntoPdf,
  readPdfBakedTimestamp,
  simplifyStrokePoints,
} from '../../lib/pdfAnnotator';
import {
  PdfAnnotationColor,
  PdfFileAnnotations,
  PdfInkStroke,
  PdfTextNote,
  PersonalPdfFile,
} from '../../types/study';
import { FilePreview } from './FilePreview';

type AnnotatorTool = 'read' | 'highlighter' | 'pen' | 'note' | 'eraser';

interface PageDimension {
  pageNumber: number;
  width: number; // at scale 1
  height: number; // at scale 1
}

interface PdfAnnotatorViewerProps {
  folder: string;
  file: PersonalPdfFile;
  onClose: () => void;
}

let pdfJsLoaderPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function getPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfJsLoaderPromise) {
    pdfJsLoaderPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjsLib, workerMod]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
      return pdfjsLib;
    });
  }
  return pdfJsLoaderPromise;
}

function makeShortId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 12);
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTestStroke(stroke: PdfInkStroke, nx: number, ny: number, threshold = 0.025): boolean {
  const pts = stroke.points;
  const r = Math.max(threshold, stroke.width * 0.75);
  if (pts.length < 2) return false;
  if (pts.length === 2) {
    return Math.hypot(nx - pts[0], ny - pts[1]) <= r;
  }
  for (let i = 0; i < pts.length - 3; i += 2) {
    if (distToSegment(nx, ny, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= r) {
      return true;
    }
  }
  return false;
}

export const PdfAnnotatorViewer: React.FC<PdfAnnotatorViewerProps> = ({
  folder,
  file,
  onClose,
}) => {
  const {
    db,
    driveConnected,
    recoverFileFromDrive,
    savePdfAnnotations,
    commitAnnotatedPersonalPdf,
    toast,
  } = useStudy();

  const [useSystemViewer, setUseSystemViewer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfDocProxy, setPdfDocProxy] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const [pageDims, setPageDims] = useState<PageDimension[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.15);

  const [tool, setTool] = useState<AnnotatorTool>('highlighter');
  const [color, setColor] = useState<PdfAnnotationColor>('yellow');
  const [penSize, setPenSize] = useState<'thin' | 'medium' | 'thick'>('medium');

  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [draftNote, setDraftNote] = useState<{ page: number; x: number; y: number; text: string } | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Base PDF references for re-baking cleanly without double-drawing
  const cleanBaseBlobRef = useRef<Blob | null>(null);
  const currentBlobRef = useRef<Blob | null>(null);
  const bakedCutoffIsoRef = useRef<string | null>(null);

  // Local editable annotations mirror synced with db.pdfAnnotations[file.blobKey]
  const persistedAnnotations = db.pdfAnnotations?.[file.blobKey];
  const [annotations, setAnnotations] = useState<PdfFileAnnotations>(() => ({
    strokes: persistedAnnotations?.strokes || [],
    notes: persistedAnnotations?.notes || [],
    updatedAt: persistedAnnotations?.updatedAt || '',
    lastBakedAt: persistedAnnotations?.lastBakedAt,
  }));

  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const dirtyBakeRef = useRef(false);
  const bakeTimerRef = useRef<number | null>(null);
  const isBakingRef = useRef(false);

  // Sync incoming cloud annotation updates when not actively drawing
  const activeStrokeRef = useRef<{ page: number; points: number[] } | null>(null);
  useEffect(() => {
    if (!persistedAnnotations) return;
    if (activeStrokeRef.current || dirtyBakeRef.current) return;
    if (persistedAnnotations.updatedAt && persistedAnnotations.updatedAt !== annotationsRef.current.updatedAt) {
      setAnnotations({
        strokes: persistedAnnotations.strokes || [],
        notes: persistedAnnotations.notes || [],
        updatedAt: persistedAnnotations.updatedAt || '',
        lastBakedAt: persistedAnnotations.lastBakedAt,
      });
    }
  }, [persistedAnnotations]);

  // Canvas refs per page
  const bgCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const overlayCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const renderedPagesRef = useRef<Map<number, number>>(new Map()); // pageNumber -> rendered zoom
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map());

  const flushBakeToPdf = useCallback(
    async (explicitAnnotations?: PdfFileAnnotations): Promise<boolean> => {
      if (bakeTimerRef.current !== null) {
        window.clearTimeout(bakeTimerRef.current);
        bakeTimerRef.current = null;
      }
      if (isBakingRef.current) return false;
      const baseBlob = cleanBaseBlobRef.current || currentBlobRef.current;
      if (!baseBlob) return false;

      const targetAnnotations = explicitAnnotations || annotationsRef.current;
      isBakingRef.current = true;
      setSaveStatus('saving');

      try {
        const nowIso = new Date().toISOString();
        const isCleanBase = Boolean(cleanBaseBlobRef.current);
        const bakedBlob = await bakeAnnotationsIntoPdf(baseBlob, targetAnnotations, {
          onlyAfterIso: isCleanBase ? undefined : bakedCutoffIsoRef.current || undefined,
          bakedAtIso: nowIso,
        });

        currentBlobRef.current = bakedBlob;
        if (!isCleanBase) {
          // Since we baked onto a previously-baked file without clean base, update cutoff
          bakedCutoffIsoRef.current = nowIso;
        }

        const updatedAnn: PdfFileAnnotations = {
          ...targetAnnotations,
          lastBakedAt: nowIso,
        };
        savePdfAnnotations(file.blobKey, updatedAnn);
        setAnnotations(updatedAnn);

        const hasAny = updatedAnn.strokes.length > 0 || updatedAnn.notes.length > 0;
        await commitAnnotatedPersonalPdf(folder, file.id, bakedBlob, hasAny, { silent: true });

        dirtyBakeRef.current = false;
        setSaveStatus('saved');
        setLastSavedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        return true;
      } catch (err) {
        console.error('[PdfAnnotatorViewer] Erro ao gravar anotações no PDF:', err);
        setSaveStatus('error');
        toast('Não foi possível gravar as marcações dentro do PDF automaticamente.', true);
        return false;
      } finally {
        isBakingRef.current = false;
      }
    },
    [commitAnnotatedPersonalPdf, file.blobKey, file.id, folder, savePdfAnnotations, toast],
  );

  const scheduleAutoSave = useCallback(
    (nextAnnotations: PdfFileAnnotations) => {
      dirtyBakeRef.current = true;
      setSaveStatus('pending');
      savePdfAnnotations(file.blobKey, nextAnnotations);
      if (bakeTimerRef.current !== null) {
        window.clearTimeout(bakeTimerRef.current);
      }
      bakeTimerRef.current = window.setTimeout(() => {
        bakeTimerRef.current = null;
        void flushBakeToPdf(nextAnnotations);
      }, 1400);
    },
    [file.blobKey, flushBakeToPdf, savePdfAnnotations],
  );

  // Flush pending save before unmount
  useEffect(() => {
    return () => {
      if (bakeTimerRef.current !== null) {
        window.clearTimeout(bakeTimerRef.current);
        bakeTimerRef.current = null;
      }
      if (dirtyBakeRef.current) {
        void flushBakeToPdf();
      }
    };
  }, [flushBakeToPdf]);

  const handleClose = useCallback(async () => {
    if (dirtyBakeRef.current) {
      await flushBakeToPdf();
    }
    onClose();
  }, [flushBakeToPdf, onClose]);

  const loadPdfDocument = useCallback(async (blobToOpen: Blob, cleanCandidate?: Blob | null) => {
    const pdfjsLib = await getPdfJs();
    const buf = await blobToOpen.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;

    const dims: PageDimension[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      dims.push({ pageNumber: i, width: vp.width, height: vp.height });
    }

    if (cleanCandidate) {
      cleanBaseBlobRef.current = cleanCandidate;
      bakedCutoffIsoRef.current = null;
    } else {
      const bakedAt = await readPdfBakedTimestamp(blobToOpen);
      if (!bakedAt) {
        // Original untouched PDF: preserve a clean copy locally for full Undo/Eraser support
        cleanBaseBlobRef.current = blobToOpen;
        bakedCutoffIsoRef.current = null;
        void saveFileBlob(`${file.blobKey}::clean`, blobToOpen);
      } else {
        cleanBaseBlobRef.current = null;
        bakedCutoffIsoRef.current = bakedAt;
      }
    }

    currentBlobRef.current = blobToOpen;
    renderedPagesRef.current.clear();
    setPdfDocProxy(doc);
    setPageDims(dims);
    setCurrentPage(1);
    setLoadError(null);
  }, [file.blobKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setPdfDocProxy(null);
    setPageDims([]);

    const init = async () => {
      try {
        const cleanKey = `${file.blobKey}::clean`;
        let cleanBlob = await getFileBlob(cleanKey);
        let mainBlob = await getFileBlob(file.blobKey);

        if (!mainBlob && !cleanBlob && driveConnected) {
          mainBlob = await recoverFileFromDrive(file.blobKey, file.name);
        }

        if (!active) return;
        const blobToRender = cleanBlob || mainBlob;
        if (!blobToRender) {
          setLoading(false);
          return;
        }
        await loadPdfDocument(blobToRender, cleanBlob);
      } catch (err) {
        if (!active) return;
        setLoadError((err as Error).message || 'Não foi possível carregar o PDF para anotação.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void init();
    return () => {
      active = false;
      renderTasksRef.current.forEach((task) => {
        try {
          task.cancel();
        } catch {
          // ignore
        }
      });
      renderTasksRef.current.clear();
    };
  }, [driveConnected, file.blobKey, file.name, loadPdfDocument, recoverFileFromDrive]);

  const drawOverlayForPage = useCallback(
    (pageNumber: number, previewStroke?: { tool: 'pen' | 'highlighter'; color: PdfAnnotationColor; width: number; points: number[] }) => {
      const canvas = overlayCanvasRefs.current.get(pageNumber);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cutoff = bakedCutoffIsoRef.current;
      const strokesToDraw = annotationsRef.current.strokes.filter(
        (s) => s.page === pageNumber && (!cutoff || (s.createdAt && s.createdAt > cutoff)),
      );

      const drawStrokeList = previewStroke
        ? [
            ...strokesToDraw,
            {
              id: '__preview__',
              page: pageNumber,
              tool: previewStroke.tool,
              color: previewStroke.color,
              width: previewStroke.width,
              points: previewStroke.points,
              createdAt: '',
            } satisfies PdfInkStroke,
          ]
        : strokesToDraw;

      for (const s of drawStrokeList) {
        const pts = s.points;
        if (pts.length < 2) continue;
        const pal = PDF_ANNOTATION_PALETTE[s.color] || PDF_ANNOTATION_PALETTE.yellow;
        const isHl = s.tool === 'highlighter';
        ctx.save();
        ctx.strokeStyle = pal.hex;
        ctx.fillStyle = pal.hex;
        ctx.globalAlpha = isHl ? 0.35 : 0.94;
        ctx.globalCompositeOperation = isHl ? 'multiply' : 'source-over';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(1.5, s.width * w);

        if (pts.length === 2) {
          ctx.beginPath();
          ctx.arc(pts[0] * w, pts[1] * h, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(pts[0] * w, pts[1] * h);
          for (let i = 2; i < pts.length - 1; i += 2) {
            const prevX = pts[i - 2] * w;
            const prevY = pts[i - 1] * h;
            const curX = pts[i] * w;
            const curY = pts[i + 1] * h;
            const midX = (prevX + curX) / 2;
            const midY = (prevY + curY) / 2;
            ctx.quadraticCurveTo(prevX, prevY, midX, midY);
          }
          ctx.lineTo(pts[pts.length - 2] * w, pts[pts.length - 1] * h);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
    [],
  );

  const renderSinglePage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDocProxy) return;
      if (renderedPagesRef.current.get(pageNumber) === zoom) {
        drawOverlayForPage(pageNumber);
        return;
      }

      const bgCanvas = bgCanvasRefs.current.get(pageNumber);
      const ovCanvas = overlayCanvasRefs.current.get(pageNumber);
      if (!bgCanvas || !ovCanvas) return;

      const prevTask = renderTasksRef.current.get(pageNumber);
      if (prevTask) {
        try {
          prevTask.cancel();
        } catch {
          // ignore
        }
      }

      try {
        const page = await pdfDocProxy.getPage(pageNumber);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssViewport = page.getViewport({ scale: zoom });
        const renderViewport = page.getViewport({ scale: zoom * dpr });

        bgCanvas.width = Math.floor(renderViewport.width);
        bgCanvas.height = Math.floor(renderViewport.height);
        bgCanvas.style.width = `${cssViewport.width}px`;
        bgCanvas.style.height = `${cssViewport.height}px`;

        ovCanvas.width = Math.floor(renderViewport.width);
        ovCanvas.height = Math.floor(renderViewport.height);
        ovCanvas.style.width = `${cssViewport.width}px`;
        ovCanvas.style.height = `${cssViewport.height}px`;

        const ctx = bgCanvas.getContext('2d');
        if (!ctx) return;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
          canvas: bgCanvas,
        });
        renderTasksRef.current.set(pageNumber, renderTask);
        await renderTask.promise;
        renderedPagesRef.current.set(pageNumber, zoom);
        drawOverlayForPage(pageNumber);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn(`[PdfAnnotatorViewer] Falha ao renderizar pág ${pageNumber}:`, err);
        }
      }
    },
    [drawOverlayForPage, pdfDocProxy, zoom],
  );

  // Redraw overlays whenever annotations change
  useEffect(() => {
    pageDims.forEach((p) => {
      drawOverlayForPage(p.pageNumber);
    });
  }, [annotations, drawOverlayForPage, pageDims]);

  // Clear rendered cache on zoom change and re-observe visible pages
  useEffect(() => {
    renderedPagesRef.current.clear();
  }, [zoom]);

  useEffect(() => {
    if (!pdfDocProxy || !pageDims.length || !scrollContainerRef.current) return;

    const rootEl = scrollContainerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestVisiblePage: number | null = null;
        let bestRatio = 0;

        for (const entry of entries) {
          const pNum = Number((entry.target as HTMLElement).dataset.pageNumber || 0);
          if (!pNum) continue;
          if (entry.isIntersecting) {
            void renderSinglePage(pNum);
            if (entry.intersectionRatio > bestRatio) {
              bestRatio = entry.intersectionRatio;
              bestVisiblePage = pNum;
            }
          }
        }
        if (bestVisiblePage !== null) {
          setCurrentPage(bestVisiblePage);
        }
      },
      {
        root: rootEl,
        rootMargin: '500px 0px',
        threshold: [0.05, 0.25, 0.5],
      },
    );

    pageDims.forEach((p) => {
      const el = pageContainerRefs.current.get(p.pageNumber);
      if (el) observer.observe(el);
    });

    // Also render page 1..2 immediately
    void renderSinglePage(1);
    if (pageDims.length > 1) void renderSinglePage(2);

    return () => observer.disconnect();
  }, [pageDims, pdfDocProxy, renderSinglePage, zoom]);

  const jumpToPage = (pageNum: number) => {
    const clamped = Math.max(1, Math.min(pageDims.length || 1, pageNum));
    setCurrentPage(clamped);
    const el = pageContainerRefs.current.get(clamped);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void renderSinglePage(clamped);
  };

  const getNormalizedCoords = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
    const ny = rect.height > 0 ? Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) : 0;
    return [nx, ny];
  };

  const getStrokeWidthNorm = useCallback((): number => {
    if (tool === 'highlighter') {
      return penSize === 'thin' ? 0.015 : penSize === 'thick' ? 0.034 : 0.024;
    }
    return penSize === 'thin' ? 0.0024 : penSize === 'thick' ? 0.0085 : 0.0046;
  }, [penSize, tool]);

  const eraseAt = useCallback(
    (pageNumber: number, nx: number, ny: number) => {
      const cutoff = bakedCutoffIsoRef.current;
      const cur = annotationsRef.current;
      const remainingStrokes = cur.strokes.filter((s) => {
        if (s.page !== pageNumber) return true;
        if (cutoff && (!s.createdAt || s.createdAt <= cutoff)) return true;
        return !hitTestStroke(s, nx, ny);
      });
      const remainingNotes = cur.notes.filter((n) => {
        if (n.page !== pageNumber) return true;
        if (cutoff && (!n.createdAt || n.createdAt <= cutoff)) return true;
        return Math.hypot(nx - n.x, ny - n.y) > 0.035;
      });
      if (remainingStrokes.length !== cur.strokes.length || remainingNotes.length !== cur.notes.length) {
        const next: PdfFileAnnotations = {
          ...cur,
          strokes: remainingStrokes,
          notes: remainingNotes,
          updatedAt: new Date().toISOString(),
        };
        setAnnotations(next);
        scheduleAutoSave(next);
      }
    },
    [scheduleAutoSave],
  );

  const handlePointerDown = (pageNumber: number, e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'read') return;
    e.preventDefault();
    const [nx, ny] = getNormalizedCoords(e);

    if (tool === 'note') {
      setDraftNote({ page: pageNumber, x: nx, y: ny, text: '' });
      return;
    }

    if (tool === 'eraser') {
      e.currentTarget.setPointerCapture(e.pointerId);
      activeStrokeRef.current = { page: pageNumber, points: [nx, ny] };
      eraseAt(pageNumber, nx, ny);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    activeStrokeRef.current = { page: pageNumber, points: [nx, ny] };
    drawOverlayForPage(pageNumber, {
      tool: tool === 'highlighter' ? 'highlighter' : 'pen',
      color,
      width: getStrokeWidthNorm(),
      points: [nx, ny],
    });
  };

  const handlePointerMove = (pageNumber: number, e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current;
    if (!active || active.page !== pageNumber) return;
    const [nx, ny] = getNormalizedCoords(e);

    if (tool === 'eraser') {
      eraseAt(pageNumber, nx, ny);
      return;
    }

    active.points.push(nx, ny);
    drawOverlayForPage(pageNumber, {
      tool: tool === 'highlighter' ? 'highlighter' : 'pen',
      color,
      width: getStrokeWidthNorm(),
      points: active.points,
    });
  };

  const handlePointerUp = (pageNumber: number, e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current;
    if (!active || active.page !== pageNumber) return;
    activeStrokeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (tool === 'eraser') return;

    const simplified = simplifyStrokePoints(active.points);
    if (simplified.length < 2) {
      drawOverlayForPage(pageNumber);
      return;
    }

    const newStroke: PdfInkStroke = {
      id: makeShortId(),
      page: pageNumber,
      tool: tool === 'highlighter' ? 'highlighter' : 'pen',
      color,
      width: getStrokeWidthNorm(),
      points: simplified,
      createdAt: new Date().toISOString(),
    };

    const next: PdfFileAnnotations = {
      ...annotationsRef.current,
      strokes: [...annotationsRef.current.strokes, newStroke],
      updatedAt: new Date().toISOString(),
    };
    setAnnotations(next);
    scheduleAutoSave(next);
  };

  const handleSaveNoteDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftNote) return;
    const text = draftNote.text.trim();
    if (!text) {
      setDraftNote(null);
      return;
    }
    const note: PdfTextNote = {
      id: makeShortId(),
      page: draftNote.page,
      x: draftNote.x,
      y: draftNote.y,
      text,
      color,
      createdAt: new Date().toISOString(),
    };
    const next: PdfFileAnnotations = {
      ...annotationsRef.current,
      notes: [...annotationsRef.current.notes, note],
      updatedAt: new Date().toISOString(),
    };
    setAnnotations(next);
    setDraftNote(null);
    scheduleAutoSave(next);
  };

  const handleDeleteNote = (noteId: string) => {
    const next: PdfFileAnnotations = {
      ...annotationsRef.current,
      notes: annotationsRef.current.notes.filter((n) => n.id !== noteId),
      updatedAt: new Date().toISOString(),
    };
    setAnnotations(next);
    setSelectedNoteId(null);
    scheduleAutoSave(next);
  };

  const handleUndo = () => {
    const cur = annotationsRef.current;
    const cutoff = bakedCutoffIsoRef.current;
    const editableStrokes = cur.strokes.filter((s) => !cutoff || (s.createdAt && s.createdAt > cutoff));
    const editableNotes = cur.notes.filter((n) => !cutoff || (n.createdAt && n.createdAt > cutoff));
    if (!editableStrokes.length && !editableNotes.length) {
      toast('Não há marcações recentes para desfazer nesta sessão.', true);
      return;
    }

    const lastStroke = editableStrokes[editableStrokes.length - 1];
    const lastNote = editableNotes[editableNotes.length - 1];
    const removeNote =
      lastNote && (!lastStroke || (lastNote.createdAt || '') > (lastStroke.createdAt || ''));

    const next: PdfFileAnnotations = {
      ...cur,
      strokes: removeNote
        ? cur.strokes
        : cur.strokes.filter((s) => s.id !== lastStroke.id),
      notes: removeNote
        ? cur.notes.filter((n) => n.id !== lastNote.id)
        : cur.notes,
      updatedAt: new Date().toISOString(),
    };
    setAnnotations(next);
    scheduleAutoSave(next);
  };

  const handleClearAllEditable = () => {
    const cur = annotationsRef.current;
    if (!cur.strokes.length && !cur.notes.length) return;
    const cutoff = bakedCutoffIsoRef.current;
    const next: PdfFileAnnotations = {
      ...cur,
      strokes: cutoff ? cur.strokes.filter((s) => !s.createdAt || s.createdAt <= cutoff) : [],
      notes: cutoff ? cur.notes.filter((n) => !n.createdAt || n.createdAt <= cutoff) : [],
      updatedAt: new Date().toISOString(),
    };
    setAnnotations(next);
    scheduleAutoSave(next);
  };

  const handleDownloadAnnotated = async () => {
    if (dirtyBakeRef.current) {
      await flushBakeToPdf();
    }
    const blob = currentBlobRef.current || (await getFileBlob(file.blobKey));
    if (blob) {
      triggerBlobDownload(blob, file.name);
    }
  };

  const handleManualRecover = async () => {
    setRecovering(true);
    try {
      const recovered = await recoverFileFromDrive(file.blobKey, file.name);
      if (!recovered) {
        toast('Arquivo não encontrado na pasta do Google Drive.', true);
        return;
      }
      await loadPdfDocument(recovered);
      toast('Arquivo restaurado do Google Drive!');
    } finally {
      setRecovering(false);
    }
  };

  const totalAnnotationsCount = useMemo(
    () => (annotations.strokes?.length || 0) + (annotations.notes?.length || 0),
    [annotations.notes?.length, annotations.strokes?.length],
  );

  if (useSystemViewer) {
    return (
      <div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setUseSystemViewer(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)]"
          >
            <Highlighter className="w-3.5 h-3.5" />
            Voltar para Editor com Auto-Save
          </button>
        </div>
        <FilePreview
          blobKey={file.blobKey}
          filename={file.name}
          mimeType="application/pdf"
          title={`${visibleName(folder)} — ${visibleName(file.name)}`}
          onClose={onClose}
        />
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3.5">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[12.5px] font-bold text-[var(--text)] truncate">
                {visibleName(folder)} — {visibleName(file.name)}
              </strong>
              {saveStatus === 'saving' || saveStatus === 'pending' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--warning)]/15 text-[var(--warning)] text-[10.5px] font-bold">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {saveStatus === 'saving' ? 'Gravando no PDF…' : 'Alteração pendente…'}
                </span>
              ) : saveStatus === 'saved' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--good)]/15 text-[var(--good)] text-[10.5px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  Salvo no PDF{lastSavedAt ? ` (${lastSavedAt})` : ''}
                </span>
              ) : saveStatus === 'error' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bad)]/15 text-[var(--bad)] text-[10.5px] font-bold">
                  Erro ao gravar
                </span>
              ) : totalAnnotationsCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[10.5px] font-bold">
                  {totalAnnotationsCount} marcação(ões) salva(s)
                </span>
              ) : null}
            </div>
            <span className="block text-[11px] text-[var(--muted)]">
              Marca-texto, rabiscos e notas são gravados automaticamente dentro do arquivo PDF e sincronizados.
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void flushBakeToPdf()}
            disabled={saveStatus === 'saving'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-55 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar agora
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadAnnotated()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar PDF
          </button>
          <button
            type="button"
            onClick={() => setUseSystemViewer(true)}
            title="Alternar para o visualizador nativo do navegador (sem auto-save de rabiscos)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap"
          >
            <ExternalLink className="w-3 h-3" />
            Navegador
          </button>
          <button
            type="button"
            onClick={() => void handleClose()}
            aria-label="Fechar visualizador"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Annotation Toolbar */}
      {pdfDocProxy && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'read', label: 'Ler / Rolar', icon: Hand },
                { id: 'highlighter', label: 'Marca-texto', icon: Highlighter },
                { id: 'pen', label: 'Rabiscar', icon: PenTool },
                { id: 'note', label: 'Nota', icon: StickyNote },
                { id: 'eraser', label: 'Borracha', icon: Eraser },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}

            <div className="h-5 w-px bg-[var(--line)] mx-1" />

            {/* Colors */}
            <div className="flex items-center gap-1" role="group" aria-label="Cor da marcação">
              {(Object.keys(PDF_ANNOTATION_PALETTE) as PdfAnnotationColor[]).map((cKey) => {
                const pal = PDF_ANNOTATION_PALETTE[cKey];
                const active = color === cKey;
                return (
                  <button
                    key={cKey}
                    type="button"
                    onClick={() => setColor(cKey)}
                    title={pal.label}
                    aria-label={`Cor ${pal.label}`}
                    style={{ backgroundColor: pal.hex }}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                      active ? 'border-[var(--text)] scale-115 ring-2 ring-[var(--accent)]' : 'border-black/25 opacity-85 hover:opacity-100'
                    }`}
                  />
                );
              })}
            </div>

            {(tool === 'pen' || tool === 'highlighter') && (
              <>
                <div className="h-5 w-px bg-[var(--line)] mx-1" />
                <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                  {(
                    [
                      { id: 'thin', label: 'Fino' },
                      { id: 'medium', label: 'Médio' },
                      { id: 'thick', label: 'Grosso' },
                    ] as const
                  ).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setPenSize(sz.id)}
                      className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                        penSize === sz.id
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="h-5 w-px bg-[var(--line)] mx-1" />

            <button
              type="button"
              onClick={handleUndo}
              title="Desfazer última marcação"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Desfazer
            </button>
            {totalAnnotationsCount > 0 && !bakedCutoffIsoRef.current && (
              <button
                type="button"
                onClick={handleClearAllEditable}
                title="Limpar todas as marcações deste PDF"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--bad)] hover:border-[var(--bad)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar
              </button>
            )}
          </div>

          {/* Page Navigation & Zoom */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => jumpToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Página anterior"
                className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono-num text-[11.5px] font-bold text-[var(--text)] px-1.5">
                Pág. {currentPage} / {pageDims.length}
              </span>
              <button
                type="button"
                onClick={() => jumpToPage(currentPage + 1)}
                disabled={currentPage >= pageDims.length}
                aria-label="Próxima página"
                className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.65, Math.round((z - 0.15) * 100) / 100))}
                aria-label="Diminuir zoom"
                className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)]"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono-num text-[11px] font-bold text-[var(--muted)] min-w-[42px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.2, Math.round((z + 0.15) * 100) / 100))}
                aria-label="Aumentar zoom"
                className="p-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)]"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="py-14 text-center text-[13px] text-[var(--muted)] flex flex-col items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
          Abrindo apostila para leitura e marcações…
        </div>
      ) : loadError ? (
        <div className="py-10 text-center text-[13px] text-[var(--bad)]">
          {loadError}
        </div>
      ) : !pdfDocProxy ? (
        <div className="py-10 text-center text-[13px] text-[var(--muted)] flex flex-col items-center gap-3">
          <span>Conteúdo do PDF não encontrado no cache deste navegador.</span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {driveConnected && (
              <button
                type="button"
                onClick={() => void handleManualRecover()}
                disabled={recovering}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold"
              >
                <CloudDownload className="w-3.5 h-3.5" />
                {recovering ? 'Buscando no Google Drive…' : 'Restaurar do Google Drive'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="mt-3 max-h-[min(76vh,880px)] overflow-auto rounded-xl border border-[var(--line)] bg-neutral-800/85 p-3 sm:p-5 flex flex-col items-center gap-4"
        >
          {pageDims.map((dim) => {
            const cssW = Math.round(dim.width * zoom);
            const cssH = Math.round(dim.height * zoom);
            const cutoff = bakedCutoffIsoRef.current;
            const pageNotes = annotations.notes.filter(
              (n) => n.page === dim.pageNumber && (!cutoff || (n.createdAt && n.createdAt > cutoff)),
            );

            return (
              <div
                key={dim.pageNumber}
                ref={(el) => {
                  if (el) pageContainerRefs.current.set(dim.pageNumber, el);
                  else pageContainerRefs.current.delete(dim.pageNumber);
                }}
                data-page-number={dim.pageNumber}
                style={{ width: cssW, height: cssH }}
                className="relative bg-white shadow-lg shrink-0 select-none"
              >
                <canvas
                  ref={(el) => {
                    if (el) bgCanvasRefs.current.set(dim.pageNumber, el);
                    else bgCanvasRefs.current.delete(dim.pageNumber);
                  }}
                  className="block w-full h-full"
                />
                <canvas
                  ref={(el) => {
                    if (el) overlayCanvasRefs.current.set(dim.pageNumber, el);
                    else overlayCanvasRefs.current.delete(dim.pageNumber);
                  }}
                  onPointerDown={(e) => handlePointerDown(dim.pageNumber, e)}
                  onPointerMove={(e) => handlePointerMove(dim.pageNumber, e)}
                  onPointerUp={(e) => handlePointerUp(dim.pageNumber, e)}
                  onPointerCancel={(e) => handlePointerUp(dim.pageNumber, e)}
                  style={{
                    touchAction: tool === 'read' ? 'auto' : 'none',
                    pointerEvents: tool === 'read' ? 'none' : 'auto',
                    cursor:
                      tool === 'read'
                        ? 'default'
                        : tool === 'eraser'
                        ? 'cell'
                        : tool === 'note'
                        ? 'copy'
                        : 'crosshair',
                  }}
                  className="absolute inset-0 w-full h-full"
                />

                {/* Editable sticky notes overlay */}
                {pageNotes.map((note) => {
                  const pal = PDF_ANNOTATION_PALETTE[note.color] || PDF_ANNOTATION_PALETTE.yellow;
                  const isOpen = selectedNoteId === note.id;
                  return (
                    <div
                      key={note.id}
                      style={{
                        left: `${Math.min(82, Math.max(2, note.x * 100))}%`,
                        top: `${Math.min(88, Math.max(2, note.y * 100))}%`,
                      }}
                      className="absolute z-10 max-w-[220px]"
                    >
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tool === 'eraser') {
                            handleDeleteNote(note.id);
                          } else {
                            setSelectedNoteId(isOpen ? null : note.id);
                          }
                        }}
                        style={{ borderColor: pal.hex }}
                        className="cursor-pointer rounded-md border-2 bg-amber-50/95 text-neutral-900 shadow-md px-2 py-1 text-[11px] leading-snug"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-semibold break-words whitespace-pre-wrap">
                            {note.text}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNote(note.id);
                            }}
                            aria-label="Excluir nota"
                            className="text-neutral-500 hover:text-red-600 shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Inline note creation popover */}
                {draftNote && draftNote.page === dim.pageNumber && (
                  <form
                    onSubmit={handleSaveNoteDraft}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      left: `${Math.min(68, Math.max(3, draftNote.x * 100))}%`,
                      top: `${Math.min(75, Math.max(3, draftNote.y * 100))}%`,
                    }}
                    className="absolute z-20 w-[230px] rounded-lg border border-[var(--accent)] bg-[var(--panel)] p-2 shadow-xl"
                  >
                    <textarea
                      rows={2}
                      autoFocus
                      value={draftNote.text}
                      onChange={(e) => setDraftNote({ ...draftNote, text: e.target.value })}
                      placeholder="Digite a anotação..."
                      className="ce-input min-h-[54px] text-[11.5px] py-1"
                    />
                    <div className="mt-1.5 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDraftNote(null)}
                        className="px-2 py-1 rounded border border-[var(--line)] text-[10.5px] font-bold text-[var(--muted)]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-2.5 py-1 rounded bg-[var(--accent)] text-white text-[10.5px] font-bold"
                      >
                        Salvar nota
                      </button>
                    </div>
                  </form>
                )}

                <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-mono-num text-white">
                  {dim.pageNumber}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
