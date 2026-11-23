import { jsPDF } from 'jspdf';
import {
  MindMapEdgeStyle,
  MindMapLayoutMode,
  MindMapNode,
  MindMapNodeTag,
} from '../types/study';
import { cleanSafeName, localDateIso, localDateTimeBrazilian } from './parsers';
import { triggerBlobDownload } from './fileStorage';
import { normalizePdfLegalText } from './legalTextFormatter';

export const MINDMAP_COLORS = [
  { id: 'blue', label: 'Azul Gov', hex: '#1351B4', soft: '#E8F0FE' },
  { id: 'green', label: 'Esmeralda', hex: '#168821', soft: '#E7F6EA' },
  { id: 'amber', label: 'Âmbar', hex: '#B45309', soft: '#FEF3C7' },
  { id: 'red', label: 'Carmesim', hex: '#C53030', soft: '#FEE2E2' },
  { id: 'purple', label: 'Violeta', hex: '#6D28D9', soft: '#EDE9FE' },
  { id: 'teal', label: 'Petróleo', hex: '#0F766E', soft: '#CCFBF1' },
  { id: 'indigo', label: 'Índigo', hex: '#3730A3', soft: '#E0E7FF' },
  { id: 'slate', label: 'Ardósia', hex: '#334155', soft: '#F1F5F9' },
] as const;

export interface MindMapTagMeta {
  id: MindMapNodeTag;
  label: string;
  short: string;
  color: string;
  bg: string;
}

export const MINDMAP_TAGS: MindMapTagMeta[] = [
  { id: 'lei', label: 'Lei Seca', short: 'LEI', color: '#1351B4', bg: '#E8F0FE' },
  { id: 'sumula', label: 'Súmula / Juris', short: 'SÚMULA', color: '#168821', bg: '#E7F6EA' },
  { id: 'excecao', label: 'Exceção', short: 'EXCEÇÃO', color: '#B45309', bg: '#FEF3C7' },
  { id: 'prazo', label: 'Prazo', short: 'PRAZO', color: '#0F766E', bg: '#CCFBF1' },
  { id: 'pegadinha', label: 'Pegadinha', short: 'PEGADINHA', color: '#C53030', bg: '#FEE2E2' },
  { id: 'dica', label: 'Dica / Macete', short: 'MACETE', color: '#6D28D9', bg: '#EDE9FE' },
];

export function getTagMeta(tag?: MindMapNodeTag | ''): MindMapTagMeta | undefined {
  if (!tag) return undefined;
  return MINDMAP_TAGS.find((t) => t.id === tag);
}

export function makeNodeId(): string {
  return `mm-${Math.random().toString(36).slice(2, 9)}`;
}

export interface MindMapTemplate {
  id: string;
  name: string;
  description: string;
  layout: MindMapLayoutMode;
  build: (topicName: string) => MindMapNode;
}

export const MINDMAP_TEMPLATES: MindMapTemplate[] = [
  {
    id: 'juridico',
    name: 'Estrutura Jurídica Completa',
    description: 'Conceito, requisitos, exceções, prazos e jurisprudência STF/STJ',
    layout: 'bilateral',
    build: (topicName) => ({
      id: makeNodeId(),
      label: topicName || 'Tema Central',
      color: '#1351B4',
      layout: 'bilateral',
      edgeStyle: 'curved',
      children: [
        {
          id: makeNodeId(),
          label: 'Conceito e Base Legal',
          note: 'Artigos principais',
          color: '#1351B4',
          tag: 'lei',
          children: [
            { id: makeNodeId(), label: 'Regra geral', children: [] },
            { id: makeNodeId(), label: 'Requisitos essenciais', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Exceções e Pegadinhas',
          note: 'Pontos mais cobrados em banca',
          color: '#C53030',
          tag: 'pegadinha',
          children: [
            { id: makeNodeId(), label: 'Casos excepcionais', tag: 'excecao', children: [] },
            { id: makeNodeId(), label: 'Vedações expressas', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Prazos e Procedimento',
          note: 'Datas, quóruns e ritos',
          color: '#0F766E',
          tag: 'prazo',
          children: [
            { id: makeNodeId(), label: 'Prazos-chave', tag: 'prazo', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Jurisprudência (STF / STJ)',
          note: 'Súmulas e informativos recentes',
          color: '#168821',
          tag: 'sumula',
          children: [
            { id: makeNodeId(), label: 'Entendimento consolidado', children: [] },
          ],
        },
      ],
    }),
  },
  {
    id: 'comparativo',
    name: 'Quadro Comparativo (A × B)',
    description: 'Ideal para diferenciar institutos parecidos que a banca confunde',
    layout: 'bilateral',
    build: (topicName) => ({
      id: makeNodeId(),
      label: topicName || 'Comparativo de Institutos',
      color: '#3730A3',
      layout: 'bilateral',
      edgeStyle: 'curved',
      children: [
        {
          id: makeNodeId(),
          label: 'Instituto A',
          color: '#1351B4',
          children: [
            { id: makeNodeId(), label: 'Natureza e finalidade', children: [] },
            { id: makeNodeId(), label: 'Competência / Prazo', tag: 'prazo', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Instituto B',
          color: '#168821',
          children: [
            { id: makeNodeId(), label: 'Natureza e finalidade', children: [] },
            { id: makeNodeId(), label: 'Competência / Prazo', tag: 'prazo', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Diferença Decisiva',
          note: 'O que define a questão',
          color: '#C53030',
          tag: 'pegadinha',
          children: [
            { id: makeNodeId(), label: 'Palavra-chave na prova', tag: 'dica', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Pontos em Comum',
          color: '#B45309',
          children: [
            { id: makeNodeId(), label: 'Regras compartilhadas', children: [] },
          ],
        },
      ],
    }),
  },
  {
    id: 'lei_seca',
    name: 'Dissecação de Lei Seca',
    description: 'Caput, parágrafos, incisos cobrados e vedações do artigo',
    layout: 'horizontal',
    build: (topicName) => ({
      id: makeNodeId(),
      label: topicName || 'Artigo / Lei Seca',
      color: '#1351B4',
      layout: 'horizontal',
      edgeStyle: 'curved',
      tag: 'lei',
      children: [
        {
          id: makeNodeId(),
          label: 'Caput (Regra Matriz)',
          color: '#1351B4',
          tag: 'lei',
          children: [
            { id: makeNodeId(), label: 'Verbo nuclear e alcance', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Incisos Mais Cobrados',
          color: '#6D28D9',
          children: [
            { id: makeNodeId(), label: 'Rol taxativo ou exemplificativo?', tag: 'pegadinha', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Parágrafos e Ressalvas',
          color: '#B45309',
          tag: 'excecao',
          children: [
            { id: makeNodeId(), label: 'Salvo / Exceto / Parágrafo único', children: [] },
          ],
        },
      ],
    }),
  },
  {
    id: 'organograma',
    name: 'Hierarquia / Organograma',
    description: 'Estrutura de cima para baixo para competências, órgãos e classificações',
    layout: 'vertical',
    build: (topicName) => ({
      id: makeNodeId(),
      label: topicName || 'Classificação Geral',
      color: '#1351B4',
      layout: 'vertical',
      edgeStyle: 'orthogonal',
      children: [
        {
          id: makeNodeId(),
          label: 'Categoria 1',
          color: '#1351B4',
          children: [
            { id: makeNodeId(), label: 'Subtipo 1.1', children: [] },
            { id: makeNodeId(), label: 'Subtipo 1.2', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Categoria 2',
          color: '#168821',
          children: [
            { id: makeNodeId(), label: 'Subtipo 2.1', children: [] },
            { id: makeNodeId(), label: 'Subtipo 2.2', children: [] },
          ],
        },
        {
          id: makeNodeId(),
          label: 'Categoria 3',
          color: '#B45309',
          children: [
            { id: makeNodeId(), label: 'Subtipo 3.1', children: [] },
          ],
        },
      ],
    }),
  },
  {
    id: 'em_branco',
    name: 'Mapa Limpo (Minimalista)',
    description: 'Comece do zero com apenas o tema central e dois ramos',
    layout: 'bilateral',
    build: (topicName) => ({
      id: makeNodeId(),
      label: topicName || 'Tema Central',
      color: '#1351B4',
      layout: 'bilateral',
      edgeStyle: 'curved',
      children: [
        { id: makeNodeId(), label: 'Ramo Principal 1', color: '#1351B4', children: [] },
        { id: makeNodeId(), label: 'Ramo Principal 2', color: '#168821', children: [] },
      ],
    }),
  },
];

export function createDefaultMindMap(topicName = 'Tema Central'): MindMapNode {
  return MINDMAP_TEMPLATES[0].build(topicName);
}

// ---------------------------------------------------------------------------
// Immutable Tree Helpers
// ---------------------------------------------------------------------------

export function findNode(root: MindMapNode, id: string): MindMapNode | null {
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function findParentOf(
  root: MindMapNode,
  targetId: string,
): { parent: MindMapNode; index: number } | null {
  const children = root.children || [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].id === targetId) {
      return { parent: root, index: i };
    }
    const nested = findParentOf(children[i], targetId);
    if (nested) return nested;
  }
  return null;
}

export function getNodeBreadcrumb(root: MindMapNode, targetId: string): MindMapNode[] {
  if (root.id === targetId) return [root];
  for (const child of root.children || []) {
    const sub = getNodeBreadcrumb(child, targetId);
    if (sub.length > 0) return [root, ...sub];
  }
  return [];
}

export function updateNodeInTree(
  root: MindMapNode,
  id: string,
  updater: (node: MindMapNode) => MindMapNode,
): MindMapNode {
  if (root.id === id) return updater(root);
  return {
    ...root,
    children: (root.children || []).map((c) => updateNodeInTree(c, id, updater)),
  };
}

export function applyColorToSubtree(node: MindMapNode, color: string): MindMapNode {
  return {
    ...node,
    color,
    children: (node.children || []).map((c) => applyColorToSubtree(c, color)),
  };
}

export function deleteNodeFromTree(root: MindMapNode, id: string): MindMapNode {
  return {
    ...root,
    children: (root.children || [])
      .filter((c) => c.id !== id)
      .map((c) => deleteNodeFromTree(c, id)),
  };
}

export function cloneSubtreeWithNewIds(node: MindMapNode, suffix = ''): MindMapNode {
  return {
    ...node,
    id: makeNodeId(),
    label: suffix ? `${node.label}${suffix}` : node.label,
    children: (node.children || []).map((c) => cloneSubtreeWithNewIds(c)),
  };
}

export function insertSiblingInTree(
  root: MindMapNode,
  targetId: string,
  newSibling: MindMapNode,
): MindMapNode {
  const idx = (root.children || []).findIndex((c) => c.id === targetId);
  if (idx >= 0) {
    const nextChildren = [...root.children];
    nextChildren.splice(idx + 1, 0, newSibling);
    return { ...root, children: nextChildren };
  }
  return {
    ...root,
    children: (root.children || []).map((c) => insertSiblingInTree(c, targetId, newSibling)),
  };
}

export function moveSiblingInTree(
  root: MindMapNode,
  targetId: string,
  delta: -1 | 1,
): MindMapNode {
  const children = root.children || [];
  const idx = children.findIndex((c) => c.id === targetId);
  if (idx >= 0) {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= children.length) return root;
    const copy = [...children];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    return { ...root, children: copy };
  }
  return {
    ...root,
    children: children.map((c) => moveSiblingInTree(c, targetId, delta)),
  };
}

export function setAllNodesCollapsed(root: MindMapNode, collapsed: boolean, depth = 0): MindMapNode {
  return {
    ...root,
    collapsed: depth === 0 ? false : (root.children?.length || 0) > 0 ? collapsed : false,
    children: (root.children || []).map((c) => setAllNodesCollapsed(c, collapsed, depth + 1)),
  };
}

export function countDescendants(node: MindMapNode): number {
  let total = 0;
  for (const child of node.children || []) {
    total += 1 + countDescendants(child);
  }
  return total;
}

export function getTreeMetrics(root: MindMapNode): {
  totalNodes: number;
  branches: number;
  maxDepth: number;
} {
  let totalNodes = 0;
  let maxDepth = 0;
  const walk = (n: MindMapNode, depth: number) => {
    totalNodes += 1;
    if (depth > maxDepth) maxDepth = depth;
    for (const c of n.children || []) walk(c, depth + 1);
  };
  walk(root, 0);
  return {
    totalNodes,
    branches: (root.children || []).length,
    maxDepth,
  };
}

export function searchMatchingNodeIds(root: MindMapNode, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: string[] = [];
  const walk = (n: MindMapNode) => {
    const tagMeta = getTagMeta(n.tag);
    const hay = `${n.label} ${n.note || ''} ${tagMeta?.label || ''}`.toLowerCase();
    if (hay.includes(q)) matches.push(n.id);
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  return matches;
}

// ---------------------------------------------------------------------------
// Dynamic Multi-Line Text Wrapping & Layout Engine (Bilateral / Horizontal / Vertical)
// ---------------------------------------------------------------------------

export function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word.length > maxCharsPerLine ? word.slice(0, maxCharsPerLine - 1) + '…' : word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      if (lines.length >= maxLines) {
        const last = lines[lines.length - 1];
        if (!last.endsWith('…')) {
          lines[lines.length - 1] =
            last.length >= maxCharsPerLine
              ? last.slice(0, maxCharsPerLine - 1) + '…'
              : `${last}…`;
        }
        return lines;
      }
      current = word.length > maxCharsPerLine ? word.slice(0, maxCharsPerLine - 1) + '…' : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

export interface LayoutNode {
  node: MindMapNode;
  depth: number;
  side: 'center' | 'right' | 'left' | 'down';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  titleLines: string[];
  noteLines: string[];
  hiddenCount: number;
  parentId?: string;
  edgeFrom?: { x: number; y: number };
  edgeTo?: { x: number; y: number };
}

export interface ComputedMindMapLayout {
  mode: MindMapLayoutMode;
  nodes: LayoutNode[];
  width: number;
  height: number;
  rootCenter: { x: number; y: number };
}

function measureNodeBox(node: MindMapNode, depth: number, mode: MindMapLayoutMode) {
  const isRoot = depth === 0;
  const w = isRoot
    ? mode === 'vertical'
      ? 236
      : 224
    : mode === 'vertical'
      ? 196
      : depth === 1
        ? 214
        : 204;

  const maxTitleChars = isRoot ? 24 : mode === 'vertical' ? 22 : 25;
  const maxNoteChars = isRoot ? 28 : mode === 'vertical' ? 25 : 29;
  const titleLines = wrapTextLines(node.label || 'Sem texto', maxTitleChars, 3);
  const noteLines = node.note?.trim() ? wrapTextLines(node.note, maxNoteChars, 2) : [];
  const hasTag = Boolean(getTagMeta(node.tag));

  const paddingY = isRoot ? 14 : 10;
  const tagH = hasTag ? 17 : 0;
  const titleH = Math.max(1, titleLines.length) * (isRoot ? 18 : 16);
  const noteH = noteLines.length > 0 ? 4 + noteLines.length * 14 : 0;
  const h = Math.max(isRoot ? 56 : 46, paddingY * 2 + tagH + titleH + noteH);

  return { w, h, titleLines, noteLines };
}

function layoutHorizontalSide(
  branchRoot: MindMapNode,
  side: 'right' | 'left',
  startDepth: number,
  inheritedColor: string,
  startX: number,
  startY: number,
  gapX: number,
  gapY: number,
): { nodes: LayoutNode[]; totalHeight: number; rootNode: LayoutNode } {
  const nodes: LayoutNode[] = [];
  let cursorY = startY;

  const walk = (
    node: MindMapNode,
    depth: number,
    colorIn: string,
    parentId?: string,
  ): { layoutNode: LayoutNode; centerY: number } => {
    const color = node.color || colorIn || '#1351B4';
    const { w, h, titleLines, noteLines } = measureNodeBox(node, depth, 'horizontal');
    const visibleChildren = node.collapsed ? [] : node.children || [];
    const hiddenCount = node.collapsed ? countDescendants(node) : 0;

    // X grows right for 'right', grows left for 'left'
    const step = w + gapX;
    const x =
      side === 'right'
        ? startX + (depth - startDepth) * step
        : startX - w - (depth - startDepth) * step;

    if (visibleChildren.length === 0) {
      const y = cursorY;
      cursorY += h + gapY;
      const ln: LayoutNode = {
        node,
        depth,
        side,
        x,
        y,
        w,
        h,
        color,
        titleLines,
        noteLines,
        hiddenCount,
        parentId,
      };
      nodes.push(ln);
      return { layoutNode: ln, centerY: y + h / 2 };
    }

    const slotIndex = nodes.length;
    const placeholder: LayoutNode = {
      node,
      depth,
      side,
      x,
      y: 0,
      w,
      h,
      color,
      titleLines,
      noteLines,
      hiddenCount,
      parentId,
    };
    nodes.push(placeholder);

    const childResults: Array<{ layoutNode: LayoutNode; centerY: number }> = [];
    for (const child of visibleChildren) {
      childResults.push(walk(child, depth + 1, color, node.id));
    }

    const minCenter = Math.min(...childResults.map((r) => r.centerY));
    const maxCenter = Math.max(...childResults.map((r) => r.centerY));
    const centerY = (minCenter + maxCenter) / 2;
    const y = centerY - h / 2;
    placeholder.y = y;

    // Wire exact edge anchors for direct children
    const fromX = side === 'right' ? x + w : x;
    const fromY = y + h / 2;
    for (const res of childResults) {
      res.layoutNode.edgeFrom = { x: fromX, y: fromY };
      res.layoutNode.edgeTo = {
        x: side === 'right' ? res.layoutNode.x : res.layoutNode.x + res.layoutNode.w,
        y: res.layoutNode.y + res.layoutNode.h / 2,
      };
    }

    return { layoutNode: placeholder, centerY: y + h / 2 };
  };

  const result = walk(branchRoot, startDepth, inheritedColor);
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  return {
    nodes,
    totalHeight: maxY - minY,
    rootNode: result.layoutNode,
  };
}

function computeHorizontalLayout(root: MindMapNode): ComputedMindMapLayout {
  const padX = 48;
  const padY = 44;
  const gapX = 54;
  const gapY = 16;

  const rootColor = root.color || '#1351B4';
  const { w: rootW, h: rootH, titleLines, noteLines } = measureNodeBox(root, 0, 'horizontal');
  const visibleChildren = root.collapsed ? [] : root.children || [];
  const hiddenCount = root.collapsed ? countDescendants(root) : 0;

  if (visibleChildren.length === 0) {
    const rootNode: LayoutNode = {
      node: root,
      depth: 0,
      side: 'center',
      x: padX,
      y: padY,
      w: rootW,
      h: rootH,
      color: rootColor,
      titleLines,
      noteLines,
      hiddenCount,
    };
    return {
      mode: 'horizontal',
      nodes: [rootNode],
      width: rootW + padX * 2,
      height: rootH + padY * 2,
      rootCenter: { x: padX + rootW / 2, y: padY + rootH / 2 },
    };
  }

  let cursorY = padY;
  const allChildNodes: LayoutNode[] = [];
  const branchRoots: LayoutNode[] = [];

  visibleChildren.forEach((child, idx) => {
    const branchColor = child.color || MINDMAP_COLORS[idx % MINDMAP_COLORS.length].hex;
    const res = layoutHorizontalSide(
      child,
      'right',
      1,
      branchColor,
      padX + rootW + gapX,
      cursorY,
      gapX,
      gapY,
    );
    cursorY = Math.max(...res.nodes.map((n) => n.y + n.h)) + gapY + 6;
    res.rootNode.parentId = root.id;
    branchRoots.push(res.rootNode);
    allChildNodes.push(...res.nodes);
  });

  const minBranchCenter = Math.min(...branchRoots.map((b) => b.y + b.h / 2));
  const maxBranchCenter = Math.max(...branchRoots.map((b) => b.y + b.h / 2));
  const rootY = Math.max(padY, (minBranchCenter + maxBranchCenter) / 2 - rootH / 2);

  const rootNode: LayoutNode = {
    node: root,
    depth: 0,
    side: 'center',
    x: padX,
    y: rootY,
    w: rootW,
    h: rootH,
    color: rootColor,
    titleLines,
    noteLines,
    hiddenCount,
  };

  branchRoots.forEach((br) => {
    br.edgeFrom = { x: rootNode.x + rootNode.w, y: rootNode.y + rootNode.h / 2 };
    br.edgeTo = { x: br.x, y: br.y + br.h / 2 };
  });

  const nodes = [rootNode, ...allChildNodes];
  return normalizeLayoutBounds(nodes, 'horizontal', padX, padY, rootNode);
}

function computeBilateralLayout(root: MindMapNode): ComputedMindMapLayout {
  const padX = 56;
  const padY = 48;
  const gapX = 56;
  const gapY = 16;

  const rootColor = root.color || '#1351B4';
  const { w: rootW, h: rootH, titleLines, noteLines } = measureNodeBox(root, 0, 'bilateral');
  const visibleChildren = root.collapsed ? [] : root.children || [];
  const hiddenCount = root.collapsed ? countDescendants(root) : 0;

  if (visibleChildren.length === 0) {
    const rootNode: LayoutNode = {
      node: root,
      depth: 0,
      side: 'center',
      x: padX,
      y: padY,
      w: rootW,
      h: rootH,
      color: rootColor,
      titleLines,
      noteLines,
      hiddenCount,
    };
    return {
      mode: 'bilateral',
      nodes: [rootNode],
      width: rootW + padX * 2,
      height: rootH + padY * 2,
      rootCenter: { x: padX + rootW / 2, y: padY + rootH / 2 },
    };
  }

  // Balance primary branches cleanly between Right and Left sides
  const rightChildren: Array<{ child: MindMapNode; idx: number }> = [];
  const leftChildren: Array<{ child: MindMapNode; idx: number }> = [];
  visibleChildren.forEach((child, idx) => {
    if (idx % 2 === 0) rightChildren.push({ child, idx });
    else leftChildren.push({ child, idx });
  });

  const buildSide = (
    items: Array<{ child: MindMapNode; idx: number }>,
    side: 'right' | 'left',
  ) => {
    let cursorY = 0;
    const sideNodes: LayoutNode[] = [];
    const roots: LayoutNode[] = [];
    const anchorX = side === 'right' ? rootW / 2 + gapX : -rootW / 2 - gapX;

    items.forEach(({ child, idx }) => {
      const branchColor = child.color || MINDMAP_COLORS[idx % MINDMAP_COLORS.length].hex;
      const res = layoutHorizontalSide(child, side, 1, branchColor, anchorX, cursorY, gapX, gapY);
      const maxY = Math.max(...res.nodes.map((n) => n.y + n.h));
      cursorY = maxY + gapY + 10;
      res.rootNode.parentId = root.id;
      roots.push(res.rootNode);
      sideNodes.push(...res.nodes);
    });

    if (sideNodes.length > 0) {
      const minY = Math.min(...sideNodes.map((n) => n.y));
      const maxY = Math.max(...sideNodes.map((n) => n.y + n.h));
      const midY = (minY + maxY) / 2;
      // Center vertically around Y = 0
      sideNodes.forEach((n) => {
        n.y -= midY;
        if (n.edgeFrom) n.edgeFrom.y -= midY;
        if (n.edgeTo) n.edgeTo.y -= midY;
      });
    }

    return { sideNodes, roots };
  };

  const right = buildSide(rightChildren, 'right');
  const left = buildSide(leftChildren, 'left');

  const rootNode: LayoutNode = {
    node: root,
    depth: 0,
    side: 'center',
    x: -rootW / 2,
    y: -rootH / 2,
    w: rootW,
    h: rootH,
    color: rootColor,
    titleLines,
    noteLines,
    hiddenCount,
  };

  right.roots.forEach((br) => {
    br.edgeFrom = { x: rootNode.x + rootNode.w, y: 0 };
    br.edgeTo = { x: br.x, y: br.y + br.h / 2 };
  });
  left.roots.forEach((br) => {
    br.edgeFrom = { x: rootNode.x, y: 0 };
    br.edgeTo = { x: br.x + br.w, y: br.y + br.h / 2 };
  });

  const nodes = [rootNode, ...right.sideNodes, ...left.sideNodes];
  return normalizeLayoutBounds(nodes, 'bilateral', padX, padY, rootNode);
}

function computeVerticalLayout(root: MindMapNode): ComputedMindMapLayout {
  const padX = 48;
  const padY = 44;
  const gapX = 20;
  const gapY = 58;

  const nodes: LayoutNode[] = [];
  let cursorX = padX;

  const walk = (
    node: MindMapNode,
    depth: number,
    colorIn: string,
    parentId?: string,
  ): { layoutNode: LayoutNode; centerX: number } => {
    const color = node.color || colorIn || '#1351B4';
    const { w, h, titleLines, noteLines } = measureNodeBox(node, depth, 'vertical');
    const visibleChildren = node.collapsed ? [] : node.children || [];
    const hiddenCount = node.collapsed ? countDescendants(node) : 0;

    // Approximate level height spacing (generous so multi-line nodes never overlap vertically)
    const y = padY + depth * (96 + gapY);

    if (visibleChildren.length === 0) {
      const x = cursorX;
      cursorX += w + gapX;
      const ln: LayoutNode = {
        node,
        depth,
        side: depth === 0 ? 'center' : 'down',
        x,
        y,
        w,
        h,
        color,
        titleLines,
        noteLines,
        hiddenCount,
        parentId,
      };
      nodes.push(ln);
      return { layoutNode: ln, centerX: x + w / 2 };
    }

    const placeholder: LayoutNode = {
      node,
      depth,
      side: depth === 0 ? 'center' : 'down',
      x: 0,
      y,
      w,
      h,
      color,
      titleLines,
      noteLines,
      hiddenCount,
      parentId,
    };
    nodes.push(placeholder);

    const childResults: Array<{ layoutNode: LayoutNode; centerX: number }> = [];
    visibleChildren.forEach((child, idx) => {
      const nextColor =
        depth === 0
          ? child.color || MINDMAP_COLORS[idx % MINDMAP_COLORS.length].hex
          : child.color || color;
      childResults.push(walk(child, depth + 1, nextColor, node.id));
    });

    const minCenter = Math.min(...childResults.map((r) => r.centerX));
    const maxCenter = Math.max(...childResults.map((r) => r.centerX));
    const centerX = (minCenter + maxCenter) / 2;
    placeholder.x = centerX - w / 2;

    const fromX = placeholder.x + placeholder.w / 2;
    const fromY = placeholder.y + placeholder.h;
    for (const res of childResults) {
      res.layoutNode.edgeFrom = { x: fromX, y: fromY };
      res.layoutNode.edgeTo = {
        x: res.layoutNode.x + res.layoutNode.w / 2,
        y: res.layoutNode.y,
      };
    }

    return { layoutNode: placeholder, centerX };
  };

  const rootRes = walk(root, 0, root.color || '#1351B4');
  return normalizeLayoutBounds(nodes, 'vertical', padX, padY, rootRes.layoutNode);
}

function normalizeLayoutBounds(
  nodes: LayoutNode[],
  mode: MindMapLayoutMode,
  padX: number,
  padY: number,
  rootNode: LayoutNode,
): ComputedMindMapLayout {
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const shiftX = padX - minX;
  const shiftY = padY - minY;

  nodes.forEach((n) => {
    n.x += shiftX;
    n.y += shiftY;
    if (n.edgeFrom) {
      n.edgeFrom = { x: n.edgeFrom.x + shiftX, y: n.edgeFrom.y + shiftY };
    }
    if (n.edgeTo) {
      n.edgeTo = { x: n.edgeTo.x + shiftX, y: n.edgeTo.y + shiftY };
    }
  });

  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));

  return {
    mode,
    nodes,
    width: Math.max(420, Math.ceil(maxX + padX)),
    height: Math.max(260, Math.ceil(maxY + padY)),
    rootCenter: {
      x: rootNode.x + rootNode.w / 2,
      y: rootNode.y + rootNode.h / 2,
    },
  };
}

export function computeMindMapLayout(
  root: MindMapNode,
  mode: MindMapLayoutMode = 'bilateral',
): ComputedMindMapLayout {
  if (mode === 'horizontal') return computeHorizontalLayout(root);
  if (mode === 'vertical') return computeVerticalLayout(root);
  return computeBilateralLayout(root);
}

// ---------------------------------------------------------------------------
// Edge Path Builder (Curved Bezier vs Clean Orthogonal)
// ---------------------------------------------------------------------------

export function buildEdgePath(
  n: LayoutNode,
  mode: MindMapLayoutMode,
  edgeStyle: MindMapEdgeStyle,
): string | null {
  if (!n.edgeFrom || !n.edgeTo) return null;
  const { x: x1, y: y1 } = n.edgeFrom;
  const { x: x2, y: y2 } = n.edgeTo;

  if (mode === 'vertical') {
    const midY = (y1 + y2) / 2;
    if (edgeStyle === 'orthogonal') {
      const r = Math.min(8, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 4);
      if (Math.abs(x2 - x1) < 2) {
        return `M ${x1} ${y1} L ${x2} ${y2}`;
      }
      const dirX = x2 > x1 ? 1 : -1;
      return `M ${x1} ${y1} L ${x1} ${midY - r} Q ${x1} ${midY}, ${x1 + dirX * r} ${midY} L ${x2 - dirX * r} ${midY} Q ${x2} ${midY}, ${x2} ${midY + r} L ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  }

  const midX = (x1 + x2) / 2;
  if (edgeStyle === 'orthogonal') {
    const r = Math.min(8, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 4);
    if (Math.abs(y2 - y1) < 2) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    const dirY = y2 > y1 ? 1 : -1;
    const dirX = x2 > x1 ? 1 : -1;
    return `M ${x1} ${y1} L ${midX - dirX * r} ${y1} Q ${midX} ${y1}, ${midX} ${y1 + dirY * r} L ${midX} ${y2 - dirY * r} Q ${midX} ${y2}, ${midX + dirX * r} ${y2} L ${x2} ${y2}`;
  }

  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

// ---------------------------------------------------------------------------
// High-Resolution Vector SVG, Retina PNG, and A4 Landscape PDF Export
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildStandaloneMindMapSvg(
  layout: ComputedMindMapLayout,
  edgeStyle: MindMapEdgeStyle,
  title: string,
): string {
  const headerH = 44;
  const totalW = layout.width;
  const totalH = layout.height + headerH;

  const paths = layout.nodes
    .map((n) => {
      const d = buildEdgePath(n, layout.mode, edgeStyle);
      if (!d || !n.edgeTo) return '';
      const strokeW = n.depth === 1 ? 2.4 : 1.8;
      return `
        <path d="${d}" fill="none" stroke="${n.color}" stroke-width="${strokeW}" stroke-opacity="0.72" stroke-linecap="round" />
        <circle cx="${n.edgeTo.x}" cy="${n.edgeTo.y}" r="3" fill="${n.color}" />
      `;
    })
    .join('\n');

  const boxes = layout.nodes
    .map((n) => {
      const isRoot = n.depth === 0;
      const isBranch = n.depth === 1;
      const tagMeta = getTagMeta(n.node.tag);
      const fill = isRoot ? n.color : isBranch ? '#FFFFFF' : '#FFFFFF';
      const textFill = isRoot ? '#FFFFFF' : '#0F172A';
      const noteFill = isRoot ? '#E2E8F0' : '#475569';
      const rx = isRoot ? 14 : 10;
      const padX = 12;
      let cursorY = n.y + (isRoot ? 14 : 10);

      let tagSvg = '';
      if (tagMeta) {
        const tagFill = isRoot ? 'rgba(255,255,255,0.2)' : tagMeta.bg;
        const tagTextFill = isRoot ? '#FFFFFF' : tagMeta.color;
        const tagW = Math.max(46, tagMeta.short.length * 6.5 + 12);
        tagSvg = `
          <rect x="${n.x + padX}" y="${cursorY - 2}" width="${tagW}" height="15" rx="4" fill="${tagFill}" />
          <text x="${n.x + padX + 6}" y="${cursorY + 9}" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="800" letter-spacing="0.4" fill="${tagTextFill}">${escapeXml(tagMeta.short)}</text>
        `;
        cursorY += 18;
      }

      const titleSvg = n.titleLines
        .map((line, i) => {
          const lineY = cursorY + (isRoot ? 13 : 12) + i * (isRoot ? 18 : 16);
          return `<text x="${n.x + padX}" y="${lineY}" font-family="system-ui, -apple-system, sans-serif" font-size="${isRoot ? 13.5 : 12}" font-weight="${isRoot || isBranch ? 700 : 600}" fill="${textFill}">${escapeXml(line)}</text>`;
        })
        .join('\n');

      const afterTitleY = cursorY + Math.max(1, n.titleLines.length) * (isRoot ? 18 : 16) + 3;
      const noteSvg = n.noteLines
        .map((line, i) => {
          const lineY = afterTitleY + 10 + i * 14;
          return `<text x="${n.x + padX}" y="${lineY}" font-family="system-ui, -apple-system, sans-serif" font-size="10.2" fill="${noteFill}">${escapeXml(line)}</text>`;
        })
        .join('\n');

      return `
        <g>
          <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" fill="${fill}" stroke="${n.color}" stroke-width="${isRoot ? 2.4 : isBranch ? 2 : 1.4}" />
          ${tagSvg}
          ${titleSvg}
          ${noteSvg}
        </g>
      `;
    })
    .join('\n');

  const safeTitle = escapeXml(title.trim() || 'Mapa Mental');
  const safeDate = escapeXml(localDateTimeBrazilian());

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
    <defs>
      <pattern id="mm-dot-grid" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="#CBD5E1" fill-opacity="0.55" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="#F8FAFC" />
    <rect y="${headerH}" width="100%" height="${layout.height}" fill="url(#mm-dot-grid)" />
    <rect width="100%" height="${headerH}" fill="#071D41" />
    <rect y="${headerH - 2}" width="100%" height="2" fill="#FFCD07" />
    <text x="20" y="27" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF">${safeTitle}</text>
    <text x="${totalW - 20}" y="26" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="#CBD5E1">${safeDate}</text>
    <g transform="translate(0, ${headerH})">
      ${paths}
      ${boxes}
    </g>
  </svg>`;
}

export function exportMindMapSvgFile(
  layout: ComputedMindMapLayout,
  edgeStyle: MindMapEdgeStyle,
  title: string,
): void {
  const svgString = buildStandaloneMindMapSvg(layout, edgeStyle, title);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const slug = cleanSafeName(title, 'mapa_mental').replace(/\s+/g, '_');
  triggerBlobDownload(blob, `${slug}_${localDateIso()}.svg`);
}

function renderSvgToDataUrl(
  svgString: string,
  width: number,
  height: number,
  scale = 2,
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Contexto 2D indisponível para renderização.'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(url);
        if (!pngBlob) {
          reject(new Error('Falha ao gerar imagem PNG do mapa mental.'));
          return;
        }
        resolve({ blob: pngBlob, dataUrl });
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Erro ao renderizar mapa mental em alta resolução.'));
    };
    img.src = url;
  });
}

export async function exportMindMapPngFile(
  layout: ComputedMindMapLayout,
  edgeStyle: MindMapEdgeStyle,
  title: string,
): Promise<void> {
  const svgString = buildStandaloneMindMapSvg(layout, edgeStyle, title);
  const { blob } = await renderSvgToDataUrl(svgString, layout.width, layout.height + 44, 2);
  const slug = cleanSafeName(title, 'mapa_mental').replace(/\s+/g, '_');
  triggerBlobDownload(blob, `${slug}_${localDateIso()}.png`);
}

export async function exportMindMapVisualPdfFile(
  layout: ComputedMindMapLayout,
  edgeStyle: MindMapEdgeStyle,
  title: string,
  subjectLabel: string,
): Promise<void> {
  const svgString = buildStandaloneMindMapSvg(layout, edgeStyle, title);
  const svgW = layout.width;
  const svgH = layout.height + 44;
  const { dataUrl } = await renderSvgToDataUrl(svgString, svgW, svgH, 2);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  // Compact institutional header
  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(0, 18, pageW, 1.2, 'F');

  doc.setTextColor(255, 205, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(
    normalizePdfLegalText(`MAPA MENTAL VISUAL · ${subjectLabel.toUpperCase()}`),
    margin,
    6.5,
  );

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11.5);
  doc.text(normalizePdfLegalText((title || 'Mapa Mental').slice(0, 95)), margin, 13.5);

  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(localDateTimeBrazilian(), pageW - margin, 13.5, { align: 'right' });

  // Fit diagram cleanly inside remaining A4 landscape frame
  const availW = pageW - margin * 2;
  const availH = pageH - 28;
  const ratio = Math.min(availW / svgW, availH / svgH);
  const drawW = svgW * ratio;
  const drawH = svgH * ratio;
  const drawX = margin + (availW - drawW) / 2;
  const drawY = 22 + (availH - drawH) / 2;

  doc.addImage(dataUrl, 'PNG', drawX, drawY, drawW, drawH, undefined, 'FAST');

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7.5);
  doc.text(
    normalizePdfLegalText(`estuda.gov.br · Construtor Visual de Mapas Mentais · ${subjectLabel}`),
    margin,
    pageH - 4,
  );

  const slug = cleanSafeName(title, 'mapa_mental').replace(/\s+/g, '_');
  doc.save(`${slug}_${localDateIso()}.pdf`);
}
