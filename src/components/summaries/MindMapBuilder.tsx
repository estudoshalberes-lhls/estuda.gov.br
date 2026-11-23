import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileImage,
  FileText,
  Focus,
  Gavel,
  GitBranch,
  Keyboard,
  LayoutGrid,
  Lightbulb,
  Maximize2,
  Minimize2,
  Network,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Scale,
  Search,
  Sparkles,
  Spline,
  Trash2,
  Undo2,
  UnfoldHorizontal,
  UnfoldVertical,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  MindMapEdgeStyle,
  MindMapLayoutMode,
  MindMapNode,
  MindMapNodeTag,
  SummaryFile,
} from '../../types/study';
import { flattenMindMapToOutline, getSummaryDisplayTitle } from '../../lib/summaryPdfExport';
import {
  MINDMAP_COLORS,
  MINDMAP_TAGS,
  MINDMAP_TEMPLATES,
  applyColorToSubtree,
  buildEdgePath,
  cloneSubtreeWithNewIds,
  computeMindMapLayout,
  createDefaultMindMap,
  deleteNodeFromTree,
  exportMindMapPngFile,
  exportMindMapSvgFile,
  exportMindMapVisualPdfFile,
  findNode,
  findParentOf,
  getNodeBreadcrumb,
  getTagMeta,
  getTreeMetrics,
  insertSiblingInTree,
  makeNodeId,
  moveSiblingInTree,
  searchMatchingNodeIds,
  setAllNodesCollapsed,
  updateNodeInTree,
} from '../../lib/mindMapLayout';

export { MINDMAP_COLORS, createDefaultMindMap };

function renderTagIcon(tag: MindMapNodeTag, className = 'w-3 h-3') {
  switch (tag) {
    case 'lei':
      return <Scale className={className} />;
    case 'sumula':
      return <Gavel className={className} />;
    case 'excecao':
      return <AlertTriangle className={className} />;
    case 'prazo':
      return <Clock className={className} />;
    case 'pegadinha':
      return <Zap className={className} />;
    case 'dica':
      return <Lightbulb className={className} />;
  }
}

interface MindMapBuilderProps {
  subjectLabel: string;
  initialId?: string;
  initialTitle?: string;
  initialTree?: MindMapNode | null;
  savedMaps?: SummaryFile[];
  onSelectSavedMap?: (item: SummaryFile) => void;
  onStartNewMap?: () => void;
  onSave: (payload: { id?: string; title: string; mindMap: MindMapNode }) => Promise<void>;
  onNotify: (message: string, isError?: boolean) => void;
}

const MAX_HISTORY = 40;

export const MindMapBuilder: React.FC<MindMapBuilderProps> = ({
  subjectLabel,
  initialId,
  initialTitle,
  initialTree,
  savedMaps = [],
  onSelectSavedMap,
  onStartNewMap,
  onSave,
  onNotify,
}) => {
  const [editingId, setEditingId] = useState<string | undefined>(initialId);
  const [mapTitle, setMapTitle] = useState<string>(
    initialTitle || initialTree?.label || `Mapa Mental — ${subjectLabel}`,
  );
  const [tree, setTree] = useState<MindMapNode>(
    () => initialTree || createDefaultMindMap(subjectLabel || 'Tema Central'),
  );
  const [layoutMode, setLayoutMode] = useState<MindMapLayoutMode>(
    initialTree?.layout || 'bilateral',
  );
  const [edgeStyle, setEdgeStyle] = useState<MindMapEdgeStyle>(
    initialTree?.edgeStyle || 'curved',
  );
  const [selectedId, setSelectedId] = useState<string>(tree.id);
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<string>('');
  const [dirty, setDirty] = useState(false);

  // Undo / Redo stacks
  const [past, setPast] = useState<MindMapNode[]>([]);
  const [future, setFuture] = useState<MindMapNode[]>([]);

  // Viewport Pan & Zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(
    null,
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  // UI popovers & modes
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTemplatesMenu, setShowTemplatesMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Sync when switching to another saved map or AI-generated map
  useEffect(() => {
    if (initialTree) {
      setEditingId(initialId);
      setTree(initialTree);
      setLayoutMode(initialTree.layout || 'bilateral');
      setEdgeStyle(initialTree.edgeStyle || 'curved');
      setMapTitle(initialTitle || initialTree.label || `Mapa Mental — ${subjectLabel}`);
      setSelectedId(initialTree.id);
      setInlineEditingId(null);
      setPast([]);
      setFuture([]);
      setDirty(false);
    }
  }, [initialId, initialTitle, initialTree, subjectLabel]);

  // Focus inline edit input immediately when opened
  useEffect(() => {
    if (inlineEditingId && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [inlineEditingId]);

  const layout = useMemo(() => computeMindMapLayout(tree, layoutMode), [tree, layoutMode]);
  const selectedNode = useMemo(() => findNode(tree, selectedId) || tree, [tree, selectedId]);
  const selectedParentInfo = useMemo(
    () => (selectedNode.id === tree.id ? null : findParentOf(tree, selectedNode.id)),
    [tree, selectedNode.id],
  );
  const breadcrumb = useMemo(
    () => getNodeBreadcrumb(tree, selectedNode.id),
    [tree, selectedNode.id],
  );
  const metrics = useMemo(() => getTreeMetrics(tree), [tree]);
  const searchMatches = useMemo(
    () => searchMatchingNodeIds(tree, searchQuery),
    [tree, searchQuery],
  );
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

  // Commit tree mutation with Undo history
  const commitTree = useCallback((nextOrFn: MindMapNode | ((prev: MindMapNode) => MindMapNode)) => {
    setTree((prev) => {
      const next = typeof nextOrFn === 'function' ? nextOrFn(prev) : nextOrFn;
      if (next === prev) return prev;
      setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), prev]);
      setFuture([]);
      setDirty(true);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setTree((current) => {
        setFuture((f) => [current, ...f.slice(0, MAX_HISTORY - 1)]);
        return previous;
      });
      setDirty(true);
      return p.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setTree((current) => {
        setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), current]);
        return next;
      });
      setDirty(true);
      return f.slice(1);
    });
  }, []);

  // Fit entire diagram nicely centered in the canvas viewport
  const fitToViewport = useCallback(
    (targetLayout = layout) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      if (vw <= 0 || vh <= 0) return;

      const pad = 28;
      const scaleX = (vw - pad * 2) / targetLayout.width;
      const scaleY = (vh - pad * 2) / targetLayout.height;
      const fitScale = Math.max(0.45, Math.min(1.08, Math.min(scaleX, scaleY)));
      const roundedScale = Math.round(fitScale * 100) / 100;

      const scaledW = targetLayout.width * roundedScale;
      const scaledH = targetLayout.height * roundedScale;
      setZoom(roundedScale);
      setPan({
        x: Math.round((vw - scaledW) / 2),
        y: Math.round((vh - scaledH) / 2),
      });
    },
    [layout],
  );

  // Auto-fit when opening a map, switching layout mode, or toggling fullscreen
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      fitToViewport(layout);
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode, isFullscreen, initialTree]);

  // Center viewport smoothly on a specific node (e.g., search hit)
  const focusNodeOnCanvas = useCallback(
    (nodeId: string) => {
      const vp = viewportRef.current;
      const ln = layout.nodes.find((n) => n.node.id === nodeId);
      if (!vp || !ln) return;
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      const targetX = vw / 2 - (ln.x + ln.w / 2) * zoom;
      const targetY = vh / 2 - (ln.y + ln.h / 2) * zoom;
      setPan({ x: Math.round(targetX), y: Math.round(targetY) });
      setSelectedId(nodeId);
    },
    [layout.nodes, zoom],
  );

  // Node editing operations
  const handleUpdateNode = useCallback(
    (nodeId: string, patch: Partial<MindMapNode>, recordHistory = true) => {
      if (recordHistory) {
        commitTree((prev) => updateNodeInTree(prev, nodeId, (n) => ({ ...n, ...patch })));
      } else {
        setTree((prev) => updateNodeInTree(prev, nodeId, (n) => ({ ...n, ...patch })));
        setDirty(true);
      }
    },
    [commitTree],
  );

  const handleAddChild = useCallback(
    (parentId: string, autoInlineEdit = true) => {
      const parent = findNode(tree, parentId);
      const inheritedColor =
        parentId === tree.id
          ? MINDMAP_COLORS[tree.children.length % MINDMAP_COLORS.length].hex
          : parent?.color || '#1351B4';

      const defaultLabel = parentId === tree.id ? 'Novo Ramo' : 'Novo Subtópico';
      const newChild: MindMapNode = {
        id: makeNodeId(),
        label: defaultLabel,
        color: inheritedColor,
        children: [],
      };
      commitTree((prev) =>
        updateNodeInTree(prev, parentId, (n) => ({
          ...n,
          collapsed: false,
          children: [...(n.children || []), newChild],
        })),
      );
      setSelectedId(newChild.id);
      if (autoInlineEdit) {
        setInlineEditingId(newChild.id);
        setInlineDraft(defaultLabel);
      }
    },
    [commitTree, tree],
  );

  const handleAddSibling = useCallback(
    (targetId: string, autoInlineEdit = true) => {
      if (targetId === tree.id) {
        handleAddChild(tree.id, autoInlineEdit);
        return;
      }
      const parentInfo = findParentOf(tree, targetId);
      const siblingColor =
        parentInfo?.parent.id === tree.id
          ? MINDMAP_COLORS[tree.children.length % MINDMAP_COLORS.length].hex
          : parentInfo?.parent.color || '#1351B4';

      const defaultLabel =
        parentInfo?.parent.id === tree.id ? 'Novo Ramo' : 'Novo Tópico';
      const newSibling: MindMapNode = {
        id: makeNodeId(),
        label: defaultLabel,
        color: siblingColor,
        children: [],
      };
      commitTree((prev) => insertSiblingInTree(prev, targetId, newSibling));
      setSelectedId(newSibling.id);
      if (autoInlineEdit) {
        setInlineEditingId(newSibling.id);
        setInlineDraft(defaultLabel);
      }
    },
    [commitTree, handleAddChild, tree],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (nodeId === tree.id) {
        onNotify('O tema central não pode ser removido.', true);
        return;
      }
      const parentInfo = findParentOf(tree, nodeId);
      commitTree((prev) => deleteNodeFromTree(prev, nodeId));
      setSelectedId(parentInfo?.parent.id || tree.id);
      if (inlineEditingId === nodeId) setInlineEditingId(null);
    },
    [commitTree, inlineEditingId, onNotify, tree],
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      if (nodeId === tree.id) {
        onNotify('Selecione um ramo ou subtópico para duplicar.', true);
        return;
      }
      const target = findNode(tree, nodeId);
      if (!target) return;
      const cloned = cloneSubtreeWithNewIds(target, ' (cópia)');
      commitTree((prev) => insertSiblingInTree(prev, nodeId, cloned));
      setSelectedId(cloned.id);
      onNotify(`Ramo "${target.label}" duplicado.`);
    },
    [commitTree, onNotify, tree],
  );

  const handleMoveSibling = useCallback(
    (nodeId: string, delta: -1 | 1) => {
      if (nodeId === tree.id) return;
      commitTree((prev) => moveSiblingInTree(prev, nodeId, delta));
    },
    [commitTree, tree.id],
  );

  const handleToggleCollapse = useCallback(
    (nodeId: string) => {
      commitTree((prev) =>
        updateNodeInTree(prev, nodeId, (n) => ({ ...n, collapsed: !n.collapsed })),
      );
    },
    [commitTree],
  );

  const handlePropagateColor = useCallback(
    (nodeId: string, color: string) => {
      commitTree((prev) => updateNodeInTree(prev, nodeId, (n) => applyColorToSubtree(n, color)));
      onNotify('Cor aplicada ao ramo e a todos os subtópicos.');
    },
    [commitTree, onNotify],
  );

  const handleApplyTemplate = (templateId: string) => {
    const tpl = MINDMAP_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    const topicBase = tree.label?.trim() || subjectLabel || 'Tema Central';
    const nextTree = tpl.build(topicBase);
    commitTree(nextTree);
    setLayoutMode(tpl.layout);
    setEdgeStyle(nextTree.edgeStyle || 'curved');
    setSelectedId(nextTree.id);
    setInlineEditingId(null);
    setShowTemplatesMenu(false);
    onNotify(`Modelo "${tpl.name}" aplicado. Você pode desfazer com Ctrl+Z.`);
    window.requestAnimationFrame(() => {
      fitToViewport(computeMindMapLayout(nextTree, tpl.layout));
    });
  };

  const handleResetNew = () => {
    const fresh = createDefaultMindMap(subjectLabel || 'Tema Central');
    setEditingId(undefined);
    setMapTitle(`Mapa Mental — ${subjectLabel || 'Estudo'}`);
    setTree(fresh);
    setLayoutMode('bilateral');
    setEdgeStyle('curved');
    setSelectedId(fresh.id);
    setInlineEditingId(null);
    setPast([]);
    setFuture([]);
    setDirty(false);
    onStartNewMap?.();
    window.requestAnimationFrame(() => {
      fitToViewport(computeMindMapLayout(fresh, 'bilateral'));
    });
  };

  const startInlineEdit = useCallback((node: MindMapNode) => {
    setSelectedId(node.id);
    setInlineEditingId(node.id);
    setInlineDraft(node.label);
  }, []);

  const commitInlineEdit = useCallback(() => {
    if (!inlineEditingId) return;
    const trimmed = inlineDraft.trim();
    if (trimmed) {
      handleUpdateNode(inlineEditingId, { label: trimmed }, true);
    }
    setInlineEditingId(null);
  }, [handleUpdateNode, inlineDraft, inlineEditingId]);

  const handleLayoutModeChange = (nextMode: MindMapLayoutMode) => {
    setLayoutMode(nextMode);
    setTree((prev) => ({ ...prev, layout: nextMode }));
    setDirty(true);
  };

  const handleEdgeStyleChange = (nextStyle: MindMapEdgeStyle) => {
    setEdgeStyle(nextStyle);
    setTree((prev) => ({ ...prev, edgeStyle: nextStyle }));
    setDirty(true);
  };

  // Global keyboard shortcuts when working inside the mind map studio
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Undo / Redo works unless actively typing inside an input
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isTextField) {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !isTextField) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.key === 'Escape') {
        if (inlineEditingId) {
          setInlineEditingId(null);
          return;
        }
        if (showTemplatesMenu) setShowTemplatesMenu(false);
        if (showExportMenu) setShowExportMenu(false);
        if (isFullscreen) setIsFullscreen(false);
        return;
      }

      if (isTextField || inlineEditingId) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        handleAddChild(selectedNode.id, true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSibling(selectedNode.id, true);
      } else if (e.key === 'F2') {
        e.preventDefault();
        startInlineEdit(selectedNode);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode.id !== tree.id) {
          e.preventDefault();
          handleDeleteNode(selectedNode.id);
        }
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (selectedParentInfo) {
          e.preventDefault();
          const sibs = selectedParentInfo.parent.children;
          const nextIdx =
            e.key === 'ArrowUp'
              ? Math.max(0, selectedParentInfo.index - 1)
              : Math.min(sibs.length - 1, selectedParentInfo.index + 1);
          setSelectedId(sibs[nextIdx].id);
        }
      } else if (e.key === 'ArrowRight') {
        const visibleChildren = selectedNode.collapsed ? [] : selectedNode.children;
        if (visibleChildren.length > 0) {
          e.preventDefault();
          setSelectedId(visibleChildren[0].id);
        }
      } else if (e.key === 'ArrowLeft') {
        if (selectedParentInfo) {
          e.preventDefault();
          setSelectedId(selectedParentInfo.parent.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleAddChild,
    handleAddSibling,
    handleDeleteNode,
    handleRedo,
    handleUndo,
    inlineEditingId,
    isFullscreen,
    selectedNode,
    selectedParentInfo,
    showExportMenu,
    showTemplatesMenu,
    startInlineEdit,
    tree.id,
  ]);

  // Canvas pointer pan & wheel zoom
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Only pan if dragging background (not clicking inside a node or control button)
    const target = e.target as HTMLElement;
    if (target.closest('[data-mm-node="true"]') || target.closest('[data-mm-control="true"]')) {
      return;
    }
    setShowTemplatesMenu(false);
    setShowExportMenu(false);
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({
      x: Math.round(panStartRef.current.originX + dx),
      y: Math.round(panStartRef.current.originY + dy),
    });
  };

  const stopPanning = () => {
    setIsPanning(false);
    panStartRef.current = null;
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom((z) => Math.max(0.45, Math.min(1.8, Math.round((z + delta) * 100) / 100)));
    }
  };

  // Exports
  const handleExportPng = async () => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      await exportMindMapPngFile(layout, edgeStyle, mapTitle || tree.label);
      onNotify('Imagem PNG em alta resolução baixada.');
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      await exportMindMapVisualPdfFile(layout, edgeStyle, mapTitle || tree.label, subjectLabel);
      onNotify('PDF Visual (A4 Paisagem) do mapa mental baixado.');
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    setShowExportMenu(false);
    exportMindMapSvgFile(layout, edgeStyle, mapTitle || tree.label);
    onNotify('Arquivo SVG vetorial baixado.');
  };

  const handleCopyOutline = async () => {
    setShowExportMenu(false);
    const text = flattenMindMapToOutline(tree).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      onNotify('Estrutura em tópicos copiada para a área de transferência.');
    } catch {
      onNotify('Não foi possível copiar automaticamente.', true);
    }
  };

  const handleSaveMap = async () => {
    setSaving(true);
    try {
      const payloadTree: MindMapNode = {
        ...tree,
        layout: layoutMode,
        edgeStyle,
      };
      await onSave({
        id: editingId,
        title: mapTitle.trim() || tree.label.trim() || 'Mapa Mental',
        mindMap: payloadTree,
      });
      setDirty(false);
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  // Selected path ancestor IDs to softly emphasize the active lineage
  const activeLineageIds = useMemo(() => new Set(breadcrumb.map((b) => b.id)), [breadcrumb]);

  const wrapperClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-[var(--bg)] p-4 flex flex-col gap-3 overflow-hidden'
    : 'flex flex-col gap-3';

  return (
    <div className={wrapperClass}>
      {/* Saved Mind Maps Quick Switcher for current subject */}
      {savedMaps.length > 0 && !isFullscreen && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[var(--line)]">
          <span className="text-[11px] font-bold text-[var(--muted)] whitespace-nowrap shrink-0">
            Mapas salvos ({savedMaps.length}):
          </span>
          <button
            type="button"
            onClick={handleResetNew}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-bold whitespace-nowrap shrink-0 transition-colors ${
              !editingId
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            <Plus className="w-3 h-3" />
            Novo mapa
          </button>
          {savedMaps.map((item) => {
            const active = editingId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSavedMap?.(item)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/60 font-bold'
                    : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)]'
                }`}
              >
                <GitBranch className="w-3 h-3 shrink-0" />
                <span className="max-w-[200px] truncate">{getSummaryDisplayTitle(item)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Primary Workspace Header Bar */}
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 mb-1 text-[11px] text-[var(--muted)]">
            <label htmlFor="mindmap-title-input" className="font-bold text-[var(--text)]">
              Título do Mapa Mental
            </label>
            <span aria-hidden="true">·</span>
            <span>{editingId ? 'Editando salvo' : 'Novo rascunho'}</span>
            {dirty && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[var(--warning)] font-semibold">Alterações não salvas</span>
              </>
            )}
          </div>
          <input
            id="mindmap-title-input"
            type="text"
            value={mapTitle}
            onChange={(e) => {
              setMapTitle(e.target.value);
              setDirty(true);
            }}
            placeholder="Ex.: Atos Administrativos — Atributos, Espécies e Extinção"
            className="ce-input font-semibold"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Layout Mode Segmented Selector */}
          <div
            role="group"
            aria-label="Modo de layout do mapa mental"
            className="inline-flex items-center rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5 h-[36px]"
          >
            {(
              [
                { id: 'bilateral', label: 'Bilateral', icon: Network },
                { id: 'horizontal', label: 'Árvore', icon: GitBranch },
                { id: 'vertical', label: 'Organograma', icon: LayoutGrid },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = layoutMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleLayoutModeChange(opt.id)}
                  className={`inline-flex items-center gap-1 px-2.5 h-[30px] rounded-md text-[11.5px] font-bold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[var(--panel)] text-[var(--accent)] shadow-xs'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Edge Style Toggle */}
          <button
            type="button"
            onClick={() =>
              handleEdgeStyleChange(edgeStyle === 'curved' ? 'orthogonal' : 'curved')
            }
            title={
              edgeStyle === 'curved'
                ? 'Conexões curvas (clique para mudar para linhas ortogonais)'
                : 'Conexões ortogonais (clique para mudar para curvas orgânicas)'
            }
            className="inline-flex items-center gap-1.5 h-[36px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            <Spline className="w-3.5 h-3.5 text-[var(--accent)]" />
            {edgeStyle === 'curved' ? 'Curvas' : 'Retas'}
          </button>

          {/* Templates Picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowTemplatesMenu((v) => !v);
                setShowExportMenu(false);
              }}
              className="inline-flex items-center gap-1.5 h-[36px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              Modelos
              <ChevronDown className="w-3 h-3 text-[var(--muted)]" />
            </button>

            {showTemplatesMenu && (
              <div className="absolute right-0 mt-1.5 w-[290px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-xl p-1.5 z-40">
                <div className="px-2.5 py-1.5 text-[11px] font-bold text-[var(--muted)] border-b border-[var(--line)]">
                  Modelos prontos para estudo
                </div>
                {MINDMAP_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl.id)}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--panel-soft)] transition-colors"
                  >
                    <div className="text-[12px] font-bold text-[var(--text)]">{tpl.name}</div>
                    <div className="text-[11px] text-[var(--muted)] leading-snug mt-0.5">
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Undo / Redo */}
          <div className="inline-flex items-center rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] h-[36px] divide-x divide-[var(--line)]">
            <button
              type="button"
              disabled={past.length === 0}
              onClick={handleUndo}
              title="Desfazer (Ctrl+Z)"
              className="px-2.5 h-full text-[var(--text)] hover:text-[var(--accent)] disabled:opacity-35"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={future.length === 0}
              onClick={handleRedo}
              title="Refazer (Ctrl+Shift+Z)"
              className="px-2.5 h-full text-[var(--text)] hover:text-[var(--accent)] disabled:opacity-35"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Export Popover */}
          <div className="relative">
            <button
              type="button"
              disabled={exporting}
              onClick={() => {
                setShowExportMenu((v) => !v);
                setShowTemplatesMenu(false);
              }}
              className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
              {exporting ? 'Gerando…' : 'Exportar'}
              <ChevronDown className="w-3 h-3 text-[var(--muted)]" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1.5 w-[235px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-xl p-1.5 z-40">
                <button
                  type="button"
                  onClick={() => void handleExportPng()}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel-soft)]"
                >
                  <FileImage className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>Baixar imagem PNG (HD)</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel-soft)]"
                >
                  <FileText className="w-4 h-4 text-[var(--good)] shrink-0" />
                  <span>Baixar PDF Visual (Paisagem)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportSvg}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel-soft)]"
                >
                  <Spline className="w-4 h-4 text-[var(--muted)] shrink-0" />
                  <span>Baixar SVG Vetorial</span>
                </button>
                <div className="my-1 border-t border-[var(--line)]" />
                <button
                  type="button"
                  onClick={() => void handleCopyOutline()}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--panel-soft)]"
                >
                  <Copy className="w-4 h-4 text-[var(--muted)] shrink-0" />
                  <span>Copiar estrutura em texto</span>
                </button>
              </div>
            )}
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Expandir para tela cheia'}
            className="inline-flex items-center gap-1 h-[36px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{isFullscreen ? 'Sair' : 'Tela cheia'}</span>
          </button>

          {/* Primary Save CTA */}
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveMap()}
            className="inline-flex items-center gap-1.5 h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando…' : 'Salvar na matéria'}
          </button>
        </div>
      </div>

      {/* Two-Zone Visual Sandbox: Large Interactive Canvas (Left) + Structured Node Inspector (Right) */}
      <div
        className={`grid grid-cols-1 xl:grid-cols-[1fr_316px] gap-3 ${
          isFullscreen ? 'flex-1 min-h-0' : ''
        }`}
      >
        {/* LEFT ZONE: Interactive Blueprint Canvas */}
        <div
          ref={viewportRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={stopPanning}
          onMouseLeave={stopPanning}
          onWheel={handleCanvasWheel}
          className={`relative rounded-xl border border-[var(--line-strong)] overflow-hidden select-none ${
            isFullscreen ? 'h-full min-h-[460px]' : 'h-[580px]'
          } ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            backgroundColor: 'var(--panel-soft)',
            backgroundImage: 'radial-gradient(circle, var(--line-strong) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            backgroundPosition: `${pan.x % 22}px ${pan.y % 22}px`,
          }}
        >
          {/* Floating Top-Left Search Bar */}
          <div
            data-mm-control="true"
            className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)]/95 backdrop-blur-xs px-2.5 h-[34px] shadow-xs"
          >
            <Search className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchMatches.length > 0) {
                  e.preventDefault();
                  focusNodeOnCanvas(searchMatches[0]);
                }
              }}
              placeholder="Buscar nó ou artigo..."
              className="bg-transparent text-[12px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none w-[155px] sm:w-[190px]"
            />
            {searchQuery && (
              <>
                <span className="font-mono-num tabular-nums text-[11px] font-bold text-[var(--accent)]">
                  {searchMatches.length}
                </span>
                {searchMatches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => focusNodeOnCanvas(searchMatches[0])}
                    title="Centralizar primeiro resultado"
                    className="text-[11px] font-bold text-[var(--accent)] hover:underline"
                  >
                    Ir
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpar busca"
                  className="text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Floating Top-Right Clean Metrics Readout */}
          <div
            data-mm-control="true"
            className="hidden sm:flex absolute top-3 right-3 z-20 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur-xs px-3 h-[34px] text-[11px] text-[var(--muted)] font-mono-num tabular-nums"
          >
            <span>{metrics.totalNodes} nós</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.branches} ramos</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.maxDepth + 1} níveis</span>
          </div>

          {/* Transformed Infinite-Style Diagram Layer */}
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: `${layout.width}px`,
              height: `${layout.height}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              willChange: 'transform',
            }}
          >
            {/* SVG Connections */}
            <svg
              width={layout.width}
              height={layout.height}
              className="absolute inset-0 pointer-events-none overflow-visible"
            >
              {layout.nodes.map((n) => {
                const d = buildEdgePath(n, layout.mode, edgeStyle);
                if (!d || !n.edgeTo) return null;
                const isLineage = activeLineageIds.has(n.node.id);
                const strokeW = n.depth === 1 ? 2.6 : 1.9;
                return (
                  <g key={`edge-${n.node.id}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={n.color}
                      strokeWidth={isLineage ? strokeW + 0.8 : strokeW}
                      strokeOpacity={isLineage ? 0.95 : 0.62}
                      strokeLinecap="round"
                    />
                    <circle
                      cx={n.edgeTo.x}
                      cy={n.edgeTo.y}
                      r={isLineage ? 3.8 : 3}
                      fill={n.color}
                      fillOpacity={isLineage ? 1 : 0.78}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Interactive Multi-Line Nodes */}
            {layout.nodes.map((n) => {
              const isSelected = n.node.id === selectedNode.id;
              const isEditingThis = inlineEditingId === n.node.id;
              const isRoot = n.depth === 0;
              const isBranch = n.depth === 1;
              const hasChildren = (n.node.children || []).length > 0;
              const isSearchHit = searchMatchSet.has(n.node.id);
              const tagMeta = getTagMeta(n.node.tag);

              // Position quick action handle on the outward edge
              const isLeftSide = n.side === 'left';
              const isVertical = layout.mode === 'vertical';

              return (
                <div
                  key={n.node.id}
                  data-mm-node="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (inlineEditingId && inlineEditingId !== n.node.id) {
                      commitInlineEdit();
                    }
                    setSelectedId(n.node.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startInlineEdit(n.node);
                  }}
                  className={`group absolute px-3 flex flex-col justify-center cursor-pointer transition-shadow ${
                    isRoot ? 'rounded-2xl py-2.5' : 'rounded-xl py-2'
                  } ${
                    isSelected
                      ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--panel-soft)] shadow-lg z-10'
                      : isSearchHit
                        ? 'ring-2 ring-[var(--warning)] ring-offset-1 ring-offset-[var(--panel-soft)] shadow-md z-10'
                        : 'hover:shadow-md'
                  }`}
                  style={{
                    left: `${n.x}px`,
                    top: `${n.y}px`,
                    width: `${n.w}px`,
                    minHeight: `${n.h}px`,
                    backgroundColor: isRoot ? n.color : 'var(--panel)',
                    borderStyle: 'solid',
                    borderColor: n.color,
                    borderWidth: isRoot ? '2px' : isBranch ? '2px' : '1.5px',
                    color: isRoot ? '#FFFFFF' : 'var(--text)',
                  }}
                >
                  {/* Semantic Tag Line (Icon + Text, dual-coded) */}
                  {tagMeta && (
                    <div
                      className="inline-flex items-center gap-1 self-start text-[9.5px] font-extrabold tracking-wide mb-1 px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: isRoot ? 'rgba(255,255,255,0.18)' : tagMeta.bg,
                        color: isRoot ? '#FFFFFF' : tagMeta.color,
                      }}
                    >
                      {renderTagIcon(tagMeta.id, 'w-2.5 h-2.5')}
                      <span>{tagMeta.short}</span>
                    </div>
                  )}

                  {/* Inline Edit Input OR Multi-Line Label */}
                  {isEditingThis ? (
                    <input
                      ref={inlineInputRef}
                      type="text"
                      value={inlineDraft}
                      onChange={(e) => setInlineDraft(e.target.value)}
                      onBlur={commitInlineEdit}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineEdit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setInlineEditingId(null);
                        }
                      }}
                      className={`w-full rounded px-1.5 py-0.5 text-[12.5px] font-bold outline-none ${
                        isRoot
                          ? 'bg-white/20 text-white placeholder:text-white/70'
                          : 'bg-[var(--panel-soft)] text-[var(--text)] ring-1 ring-[var(--accent)]'
                      }`}
                    />
                  ) : (
                    <div
                      className={`leading-[1.3] break-words ${
                        isRoot
                          ? 'text-[13.5px] font-extrabold'
                          : isBranch
                            ? 'text-[12.5px] font-bold'
                            : 'text-[12px] font-semibold'
                      }`}
                    >
                      {n.node.label || 'Sem texto'}
                    </div>
                  )}

                  {/* Multi-Line Note */}
                  {n.node.note?.trim() && !isEditingThis && (
                    <div
                      className={`text-[10.5px] leading-[1.3] mt-1 break-words ${
                        isRoot ? 'text-white/85' : 'text-[var(--muted)]'
                      }`}
                    >
                      {n.node.note}
                    </div>
                  )}

                  {/* Quick Outward Action Handles (+ Child & Collapse/Count) */}
                  <div
                    className={`absolute flex items-center gap-1 transition-opacity ${
                      isSelected || n.node.collapsed
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    } ${
                      isVertical
                        ? 'left-1/2 -translate-x-1/2 -bottom-3'
                        : isLeftSide
                          ? '-left-3 top-1/2 -translate-y-1/2 -translate-x-1/2'
                          : '-right-3 top-1/2 -translate-y-1/2 translate-x-1/2'
                    }`}
                  >
                    <button
                      type="button"
                      title="Adicionar subtópico (Tab)"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddChild(n.node.id, true);
                      }}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-sm hover:scale-110 transition-transform"
                      style={{ backgroundColor: n.color }}
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    {hasChildren && (
                      <button
                        type="button"
                        title={
                          n.node.collapsed
                            ? `Expandir ${n.hiddenCount} subtópico(s)`
                            : 'Recolher ramo'
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCollapse(n.node.id);
                        }}
                        className="h-5 min-w-5 px-1 rounded-full flex items-center justify-center bg-[var(--panel)] border text-[10px] font-mono-num tabular-nums font-extrabold shadow-sm hover:scale-105 transition-transform"
                        style={{ borderColor: n.color, color: n.color }}
                      >
                        {n.node.collapsed ? (
                          `+${n.hiddenCount}`
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating Bottom-Left Zoom & Fit Controls */}
          <div
            data-mm-control="true"
            className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-1.5"
          >
            <div className="inline-flex items-center rounded-lg border border-[var(--line-strong)] bg-[var(--panel)]/95 backdrop-blur-xs shadow-xs p-0.5">
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.max(0.45, Math.round((z - 0.15) * 100) / 100))
                }
                title="Diminuir zoom"
                className="p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 font-mono-num tabular-nums text-[11px] font-bold text-[var(--text)] min-w-[42px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.min(1.8, Math.round((z + 0.15) * 100) / 100))
                }
                title="Aumentar zoom"
                className="p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => fitToViewport(layout)}
              title="Centralizar e ajustar todo o mapa à tela"
              className="inline-flex items-center gap-1.5 h-[32px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)]/95 backdrop-blur-xs text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] shadow-xs"
            >
              <Focus className="w-3.5 h-3.5 text-[var(--accent)]" />
              Ajustar tela
            </button>

            <button
              type="button"
              onClick={() => commitTree((prev) => setAllNodesCollapsed(prev, false))}
              title="Expandir todos os ramos"
              className="inline-flex items-center gap-1 h-[32px] px-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)]/95 backdrop-blur-xs text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] shadow-xs"
            >
              <UnfoldVertical className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Expandir</span>
            </button>

            <button
              type="button"
              onClick={() => commitTree((prev) => setAllNodesCollapsed(prev, true))}
              title="Recolher ramos secundários"
              className="inline-flex items-center gap-1 h-[32px] px-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)]/95 backdrop-blur-xs text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] shadow-xs"
            >
              <UnfoldHorizontal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Recolher</span>
            </button>
          </div>

          {/* Subtle Canvas Hint Bottom-Right */}
          <div
            data-mm-control="true"
            className="hidden lg:block absolute bottom-3 right-3 z-20 text-[11px] text-[var(--muted)] bg-[var(--panel)]/85 backdrop-blur-xs px-2.5 py-1 rounded-md border border-[var(--line)]"
          >
            Duplo clique no nó edita · Arraste o fundo para mover · Ctrl+Roda aproxima
          </div>
        </div>

        {/* RIGHT ZONE: Structured Node Inspector & Action Deck */}
        <aside
          className={`rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-4 flex flex-col gap-4 ${
            isFullscreen ? 'overflow-y-auto' : ''
          }`}
        >
          {/* Hierarchy Breadcrumb */}
          <div className="border-b border-[var(--line)] pb-3">
            <div className="text-[11px] font-bold text-[var(--muted)] mb-1">
              Nó selecionado
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[11.5px]">
              {breadcrumb.map((crumb, idx) => {
                const isLast = idx === breadcrumb.length - 1;
                return (
                  <React.Fragment key={crumb.id}>
                    {idx > 0 && <ChevronRight className="w-3 h-3 text-[var(--muted)] shrink-0" />}
                    <button
                      type="button"
                      onClick={() => focusNodeOnCanvas(crumb.id)}
                      className={`max-w-[125px] truncate transition-colors ${
                        isLast
                          ? 'font-bold text-[var(--accent)]'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {crumb.label || 'Sem texto'}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Text & Note Fields */}
          <div className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="mm-node-label"
                className="block text-[11.5px] font-bold text-[var(--text)] mb-1"
              >
                Texto principal
              </label>
              <input
                id="mm-node-label"
                type="text"
                value={selectedNode.label}
                onChange={(e) => handleUpdateNode(selectedNode.id, { label: e.target.value }, false)}
                onBlur={() => setDirty(true)}
                placeholder="Digite o conceito ou tópico"
                className="ce-input text-[12.5px] font-semibold"
              />
            </div>

            <div>
              <label
                htmlFor="mm-node-note"
                className="block text-[11.5px] font-bold text-[var(--text)] mb-1"
              >
                Nota / Artigo / Prazo (opcional)
              </label>
              <textarea
                id="mm-node-note"
                rows={2}
                value={selectedNode.note || ''}
                onChange={(e) => handleUpdateNode(selectedNode.id, { note: e.target.value }, false)}
                placeholder="Ex.: Art. 37, CF · Prazo de 5 anos · Súmula 473 STF"
                className="ce-input text-[12px] py-2 resize-none"
              />
            </div>
          </div>

          {/* Semantic Exam Marker Selector */}
          <div className="border-t border-[var(--line)] pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11.5px] font-bold text-[var(--text)]">
                Marcador de estudo
              </span>
              {selectedNode.tag && (
                <button
                  type="button"
                  onClick={() => handleUpdateNode(selectedNode.id, { tag: '' }, true)}
                  className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {MINDMAP_TAGS.map((tag) => {
                const active = selectedNode.tag === tag.id;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      handleUpdateNode(
                        selectedNode.id,
                        { tag: active ? '' : tag.id },
                        true,
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11.5px] font-semibold transition-colors text-left ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)] font-bold'
                        : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <span style={{ color: tag.color }}>{renderTagIcon(tag.id, 'w-3.5 h-3.5')}</span>
                    <span className="truncate">{tag.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Palette + Subtree Propagation */}
          <div className="border-t border-[var(--line)] pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11.5px] font-bold text-[var(--text)]">Cor do ramo</span>
              {(selectedNode.children?.length || 0) > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    handlePropagateColor(selectedNode.id, selectedNode.color || '#1351B4')
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline"
                >
                  <Palette className="w-3 h-3" />
                  Aplicar aos filhos
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {MINDMAP_COLORS.map((c) => {
                const active = (selectedNode.color || '#1351B4') === c.hex;
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={`Cor ${c.label}`}
                    onClick={() => handleUpdateNode(selectedNode.id, { color: c.hex }, true)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      active
                        ? 'scale-115 border-[var(--text)]'
                        : 'border-transparent opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                );
              })}
            </div>
          </div>

          {/* Structural Node Actions */}
          <div className="border-t border-[var(--line)] pt-3">
            <span className="block text-[11.5px] font-bold text-[var(--text)] mb-2">
              Estrutura do mapa
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleAddChild(selectedNode.id, true)}
                className="inline-flex items-center justify-center gap-1.5 h-[34px] px-2.5 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Subtópico
              </button>

              <button
                type="button"
                disabled={selectedNode.id === tree.id}
                onClick={() => handleAddSibling(selectedNode.id, true)}
                className="inline-flex items-center justify-center gap-1.5 h-[34px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40 whitespace-nowrap"
              >
                <GitBranch className="w-3.5 h-3.5 text-[var(--accent)]" />
                Irmão
              </button>

              <button
                type="button"
                disabled={!selectedParentInfo || selectedParentInfo.index === 0}
                onClick={() => handleMoveSibling(selectedNode.id, -1)}
                className="inline-flex items-center justify-center gap-1 h-[32px] px-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-35 whitespace-nowrap"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                Subir
              </button>

              <button
                type="button"
                disabled={
                  !selectedParentInfo ||
                  selectedParentInfo.index >= selectedParentInfo.parent.children.length - 1
                }
                onClick={() => handleMoveSibling(selectedNode.id, 1)}
                className="inline-flex items-center justify-center gap-1 h-[32px] px-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-35 whitespace-nowrap"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                Descer
              </button>

              <button
                type="button"
                disabled={selectedNode.id === tree.id}
                onClick={() => handleDuplicateNode(selectedNode.id)}
                className="inline-flex items-center justify-center gap-1 h-[32px] px-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-35 whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" />
                Duplicar
              </button>

              <button
                type="button"
                disabled={selectedNode.id === tree.id}
                onClick={() => handleDeleteNode(selectedNode.id)}
                className="inline-flex items-center justify-center gap-1 h-[32px] px-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] disabled:opacity-35 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remover
              </button>
            </div>
          </div>

          {/* Collapsible Keyboard Shortcuts + Reset */}
          <div className="border-t border-[var(--line)] pt-3 mt-auto flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowShortcuts((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                <Keyboard className="w-3.5 h-3.5" />
                Atalhos de teclado
              </button>
              <button
                type="button"
                onClick={handleResetNew}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                <RotateCcw className="w-3 h-3" />
                Reiniciar mapa
              </button>
            </div>

            {showShortcuts && (
              <div className="rounded-lg bg-[var(--panel-soft)] p-2.5 text-[11px] text-[var(--muted)] grid grid-cols-2 gap-y-1.5 gap-x-2">
                <span>
                  <strong className="text-[var(--text)] font-mono-num">Tab</strong> · Novo filho
                </span>
                <span>
                  <strong className="text-[var(--text)] font-mono-num">Enter</strong> · Novo irmão
                </span>
                <span>
                  <strong className="text-[var(--text)] font-mono-num">F2</strong> · Editar nó
                </span>
                <span>
                  <strong className="text-[var(--text)] font-mono-num">Del</strong> · Remover nó
                </span>
                <span>
                  <strong className="text-[var(--text)] font-mono-num">Setas</strong> · Navegar
                </span>
                <span>
                  <strong className="text-[var(--text)] font-mono-num">Ctrl+Z</strong> · Desfazer
                </span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
