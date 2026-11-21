import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  GitBranch,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MindMapNode } from '../../types/study';
import { cleanSafeName, localDateIso } from '../../lib/parsers';
import { triggerBlobDownload } from '../../lib/fileStorage';

export const MINDMAP_COLORS = [
  { id: 'blue', label: 'Azul', hex: '#1351B4', soft: '#E8F0FE' },
  { id: 'green', label: 'Verde', hex: '#168821', soft: '#E7F6EA' },
  { id: 'amber', label: 'Âmbar', hex: '#B45309', soft: '#FEF3C7' },
  { id: 'red', label: 'Vermelho', hex: '#C53030', soft: '#FEE2E2' },
  { id: 'purple', label: 'Roxo', hex: '#6D28D9', soft: '#EDE9FE' },
  { id: 'slate', label: 'Ardósia', hex: '#334155', soft: '#F1F5F9' },
] as const;

function makeNodeId(): string {
  return `mm-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultMindMap(topicName = 'Tema Central'): MindMapNode {
  return {
    id: makeNodeId(),
    label: topicName,
    color: '#1351B4',
    children: [
      {
        id: makeNodeId(),
        label: 'Conceito e Base Legal',
        note: 'Artigos principais',
        color: '#1351B4',
        children: [
          { id: makeNodeId(), label: 'Regra geral', children: [] },
          { id: makeNodeId(), label: 'Requisitos essenciais', children: [] },
        ],
      },
      {
        id: makeNodeId(),
        label: 'Exceções e Pegadinhas',
        note: 'Atenção em prova',
        color: '#C53030',
        children: [
          { id: makeNodeId(), label: 'Casos excepcionais', children: [] },
        ],
      },
      {
        id: makeNodeId(),
        label: 'Jurisprudência (STF / STJ)',
        note: 'Súmulas e informativos',
        color: '#168821',
        children: [],
      },
    ],
  };
}

function findNode(root: MindMapNode, id: string): MindMapNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function updateNodeInTree(
  root: MindMapNode,
  id: string,
  updater: (node: MindMapNode) => MindMapNode,
): MindMapNode {
  if (root.id === id) return updater(root);
  return {
    ...root,
    children: root.children.map((c) => updateNodeInTree(c, id, updater)),
  };
}

function deleteNodeFromTree(root: MindMapNode, id: string): MindMapNode {
  return {
    ...root,
    children: root.children
      .filter((c) => c.id !== id)
      .map((c) => deleteNodeFromTree(c, id)),
  };
}

interface LayoutNode {
  node: MindMapNode;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  parentX?: number;
  parentY?: number;
}

function computeHorizontalTreeLayout(root: MindMapNode): {
  nodes: LayoutNode[];
  width: number;
  height: number;
} {
  const nodes: LayoutNode[] = [];
  const colWidth = 225;
  const nodeW = 188;
  const baseH = 44;
  const gapY = 16;
  let currentY = 24;

  const walk = (
    node: MindMapNode,
    depth: number,
    inheritedColor: string,
    parentAnchor?: { x: number; y: number },
  ): { centerY: number } => {
    const color = node.color || inheritedColor || '#1351B4';
    const hasNote = Boolean(node.note?.trim());
    const h = hasNote ? 56 : baseH;
    const x = 24 + depth * colWidth;

    const visibleChildren = node.collapsed ? [] : node.children || [];

    if (visibleChildren.length === 0) {
      const y = currentY;
      currentY += h + gapY;
      const centerY = y + h / 2;
      nodes.push({
        node,
        depth,
        x,
        y,
        w: nodeW,
        h,
        color,
        parentX: parentAnchor?.x,
        parentY: parentAnchor?.y,
      });
      return { centerY };
    }

    // Reserve index so parent is placed after knowing children vertical span
    const startIdx = nodes.length;
    nodes.push({
      node,
      depth,
      x,
      y: 0,
      w: nodeW,
      h,
      color,
      parentX: parentAnchor?.x,
      parentY: parentAnchor?.y,
    });

    const childCenters: number[] = [];
    for (const child of visibleChildren) {
      const res = walk(child, depth + 1, color, { x: x + nodeW, y: 0 });
      childCenters.push(res.centerY);
    }

    const minCenter = Math.min(...childCenters);
    const maxCenter = Math.max(...childCenters);
    const centerY = (minCenter + maxCenter) / 2;
    const y = Math.max(16, centerY - h / 2);

    nodes[startIdx].y = y;

    // Update direct children's parentY to exact parent vertical center
    for (let i = startIdx + 1; i < nodes.length; i++) {
      if (nodes[i].depth === depth + 1 && nodes[i].parentX === x + nodeW) {
        nodes[i].parentY = y + h / 2;
      }
    }

    return { centerY: y + h / 2 };
  };

  walk(root, 0, root.color || '#1351B4');

  const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 320);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 200);

  return {
    nodes,
    width: maxX + 36,
    height: maxY + 32,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildStandaloneSvg(layout: { nodes: LayoutNode[]; width: number; height: number }): string {
  const paths = layout.nodes
    .filter((n) => n.parentX !== undefined && n.parentY !== undefined)
    .map((n) => {
      const x1 = n.parentX!;
      const y1 = n.parentY!;
      const x2 = n.x;
      const y2 = n.y + n.h / 2;
      const cx = (x1 + x2) / 2;
      return `<path d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}" fill="none" stroke="${n.color}" stroke-width="2" stroke-opacity="0.7" />`;
    })
    .join('\n');

  const boxes = layout.nodes
    .map((n) => {
      const isRoot = n.depth === 0;
      const fill = isRoot ? n.color : '#FFFFFF';
      const stroke = n.color;
      const textFill = isRoot ? '#FFFFFF' : '#0F172A';
      const noteFill = isRoot ? '#E2E8F0' : '#475569';
      const title = n.node.label.trim().slice(0, 30);
      const note = (n.node.note || '').trim().slice(0, 34);
      return `
        <g>
          <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${isRoot ? 2 : 1.6}" />
          <text x="${n.x + 12}" y="${n.y + (note ? 22 : 26)}" font-family="system-ui, -apple-system, sans-serif" font-size="12.5" font-weight="700" fill="${textFill}">${escapeXml(title)}</text>
          ${note ? `<text x="${n.x + 12}" y="${n.y + 40}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${noteFill}">${escapeXml(note)}</text>` : ''}
        </g>
      `;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
    <rect width="100%" height="100%" fill="#F8FAFC" />
    ${paths}
    ${boxes}
  </svg>`;
}

interface MindMapBuilderProps {
  subjectLabel: string;
  initialId?: string;
  initialTitle?: string;
  initialTree?: MindMapNode | null;
  onSave: (payload: { id?: string; title: string; mindMap: MindMapNode }) => Promise<void>;
  onNotify: (message: string, isError?: boolean) => void;
}

export const MindMapBuilder: React.FC<MindMapBuilderProps> = ({
  subjectLabel,
  initialId,
  initialTitle,
  initialTree,
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
  const [selectedId, setSelectedId] = useState<string>(tree.id);
  const [zoom, setZoom] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialTree) {
      setEditingId(initialId);
      setTree(initialTree);
      setMapTitle(initialTitle || initialTree.label || `Mapa Mental — ${subjectLabel}`);
      setSelectedId(initialTree.id);
    }
  }, [initialId, initialTitle, initialTree, subjectLabel]);

  const selectedNode = useMemo(
    () => findNode(tree, selectedId) || tree,
    [tree, selectedId],
  );

  const layout = useMemo(() => computeHorizontalTreeLayout(tree), [tree]);

  const handleUpdateSelected = (patch: Partial<MindMapNode>) => {
    setTree((prev) => updateNodeInTree(prev, selectedNode.id, (n) => ({ ...n, ...patch })));
  };

  const handleAddChild = (parentId: string) => {
    const parent = findNode(tree, parentId);
    const inheritedColor =
      parentId === tree.id
        ? MINDMAP_COLORS[(tree.children.length % MINDMAP_COLORS.length)].hex
        : parent?.color || '#1351B4';

    const newChild: MindMapNode = {
      id: makeNodeId(),
      label: parentId === tree.id ? 'Novo Ramo' : 'Novo Subtópico',
      color: inheritedColor,
      children: [],
    };
    setTree((prev) =>
      updateNodeInTree(prev, parentId, (n) => ({
        ...n,
        collapsed: false,
        children: [...(n.children || []), newChild],
      })),
    );
    setSelectedId(newChild.id);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === tree.id) {
      onNotify('O tema central não pode ser removido.', true);
      return;
    }
    setTree((prev) => deleteNodeFromTree(prev, nodeId));
    setSelectedId(tree.id);
  };

  const handleToggleCollapse = (nodeId: string) => {
    setTree((prev) =>
      updateNodeInTree(prev, nodeId, (n) => ({ ...n, collapsed: !n.collapsed })),
    );
  };

  const handleResetNew = () => {
    const fresh = createDefaultMindMap(subjectLabel || 'Tema Central');
    setEditingId(undefined);
    setMapTitle(`Mapa Mental — ${subjectLabel || 'Estudo'}`);
    setTree(fresh);
    setSelectedId(fresh.id);
  };

  const handleExportPng = () => {
    const svgString = buildStandaloneSvg(layout);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(layout.width * scale);
      canvas.height = Math.round(layout.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(0, 0, layout.width, layout.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((pngBlob) => {
          URL.revokeObjectURL(url);
          if (!pngBlob) {
            onNotify('Falha ao gerar imagem PNG do mapa mental.', true);
            return;
          }
          const slug = cleanSafeName(mapTitle, 'mapa_mental').replace(/\s+/g, '_');
          triggerBlobDownload(pngBlob, `${slug}_${localDateIso()}.png`);
          onNotify('Imagem PNG do mapa mental baixada.');
        }, 'image/png');
      } else {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      onNotify('Erro ao exportar mapa mental para PNG.', true);
    };
    img.src = url;
  };

  const handleSaveMap = async () => {
    setSaving(true);
    try {
      await onSave({
        id: editingId,
        title: mapTitle.trim() || tree.label.trim() || 'Mapa Mental',
        mindMap: tree,
      });
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-2.5">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
            Título do Mapa Mental ({editingId ? 'Editando salvo' : 'Novo mapa'})
          </label>
          <input
            type="text"
            value={mapTitle}
            onChange={(e) => setMapTitle(e.target.value)}
            placeholder="Ex.: Atos Administrativos — Atributos e Extinção"
            className="ce-input"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.7, Math.round((z - 0.15) * 100) / 100))}
              title="Diminuir zoom"
              className="p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono-num tabular-nums text-[11px] font-bold text-[var(--text)]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.4, Math.round((z + 0.15) * 100) / 100))}
              title="Aumentar zoom"
              className="p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetNew}
            className="inline-flex items-center gap-1 h-[36px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Novo
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            className="inline-flex items-center gap-1 h-[36px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar PNG
          </button>

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

      {/* Selected Node Inspector */}
      <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 flex flex-wrap items-end gap-2.5">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
            Texto do nó selecionado
          </label>
          <input
            type="text"
            value={selectedNode.label}
            onChange={(e) => handleUpdateSelected({ label: e.target.value })}
            className="ce-input"
          />
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
            Nota / Artigo / Prazo (opcional)
          </label>
          <input
            type="text"
            value={selectedNode.note || ''}
            onChange={(e) => handleUpdateSelected({ note: e.target.value })}
            placeholder="Ex.: Art. 37, CF · Prazo 5 anos"
            className="ce-input"
          />
        </div>

        <div>
          <span className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
            Cor do ramo
          </span>
          <div className="flex items-center gap-1.5 h-[36px]">
            {MINDMAP_COLORS.map((c) => {
              const active = (selectedNode.color || '#1351B4') === c.hex;
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => handleUpdateSelected({ color: c.hex })}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    active ? 'scale-110 border-[var(--text)]' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleAddChild(selectedNode.id)}
            className="inline-flex items-center gap-1 h-[36px] px-3 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            + Subtópico
          </button>

          {selectedNode.id !== tree.id && (
            <button
              type="button"
              onClick={() => handleDeleteNode(selectedNode.id)}
              className="inline-flex items-center gap-1 h-[36px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover
            </button>
          )}
        </div>
      </div>

      {/* Interactive Visual Canvas */}
      <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] overflow-auto max-h-[520px] p-2">
        <div
          className="relative origin-top-left transition-transform"
          style={{
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `scale(${zoom})`,
          }}
        >
          {/* Bezier Connection Curves */}
          <svg
            width={layout.width}
            height={layout.height}
            className="absolute inset-0 pointer-events-none"
          >
            {layout.nodes.map((n) => {
              if (n.parentX === undefined || n.parentY === undefined) return null;
              const x1 = n.parentX;
              const y1 = n.parentY;
              const x2 = n.x;
              const y2 = n.y + n.h / 2;
              const cx = (x1 + x2) / 2;
              return (
                <path
                  key={`edge-${n.node.id}`}
                  d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={n.color}
                  strokeWidth="2"
                  strokeOpacity="0.65"
                />
              );
            })}
          </svg>

          {/* Interactive Nodes */}
          {layout.nodes.map((n) => {
            const isSelected = n.node.id === selectedNode.id;
            const isRoot = n.depth === 0;
            const hasChildren = (n.node.children || []).length > 0;

            return (
              <div
                key={n.node.id}
                onClick={() => setSelectedId(n.node.id)}
                className={`absolute rounded-xl border px-3 py-1.5 cursor-pointer select-none transition-shadow flex flex-col justify-center ${
                  isSelected ? 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--panel-soft)] shadow-md' : 'hover:shadow-sm'
                }`}
                style={{
                  left: `${n.x}px`,
                  top: `${n.y}px`,
                  width: `${n.w}px`,
                  height: `${n.h}px`,
                  backgroundColor: isRoot ? n.color : 'var(--panel)',
                  borderColor: n.color,
                  borderWidth: isRoot ? '2px' : '1.5px',
                  color: isRoot ? '#FFFFFF' : 'var(--text)',
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[12px] font-bold leading-tight truncate">
                    {n.node.label || 'Sem texto'}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      title="Adicionar subtópico"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddChild(n.node.id);
                      }}
                      className={`p-0.5 rounded hover:opacity-100 ${
                        isRoot ? 'text-white/85 hover:bg-white/15' : 'text-[var(--muted)] hover:bg-[var(--panel-raised)]'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    {hasChildren && (
                      <button
                        type="button"
                        title={n.node.collapsed ? 'Expandir ramo' : 'Recolher ramo'}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleCollapse(n.node.id);
                        }}
                        className={`p-0.5 rounded ${
                          isRoot ? 'text-white/85 hover:bg-white/15' : 'text-[var(--muted)] hover:bg-[var(--panel-raised)]'
                        }`}
                      >
                        {n.node.collapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                {n.node.note?.trim() && (
                  <div
                    className={`text-[10.5px] truncate mt-0.5 ${
                      isRoot ? 'text-white/85' : 'text-[var(--muted)]'
                    }`}
                  >
                    {n.node.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-[var(--muted)]">
        <GitBranch className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span>
          Clique em qualquer nó para editar o texto, trocar a cor ou adicionar subtópicos. Ao salvar, o mapa entra automaticamente no PDF consolidado da matéria.
        </span>
      </div>
    </div>
  );
};
