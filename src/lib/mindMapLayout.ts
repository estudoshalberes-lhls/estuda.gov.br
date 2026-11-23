import { jsPDF } from 'jspdf';
import {
  MindMapCustomTag,
  MindMapDirection,
  MindMapEdgeStyle,
  MindMapLayoutMode,
  MindMapNode,
  MindMapNodeTag,
  MindMapThemeId,
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

export const MINDMAP_NODE_BG_COLORS = [
  { id: 'white', label: 'Branco', hex: '#FFFFFF' },
  { id: 'ice', label: 'Azul Claro', hex: '#EFF6FF' },
  { id: 'mint', label: 'Verde Claro', hex: '#ECFDF5' },
  { id: 'sand', label: 'Amarelo Suave', hex: '#FEF9C3' },
  { id: 'rose', label: 'Rosa Claro', hex: '#FFF1F2' },
  { id: 'lavender', label: 'Lilás Suave', hex: '#F5F3FF' },
  { id: 'cream', label: 'Sépia Claro', hex: '#FAF3E0' },
  { id: 'slate-dark', label: 'Ardósia Escuro', hex: '#1E293B' },
  { id: 'navy-dark', label: 'Marinho Escuro', hex: '#0F2942' },
  { id: 'forest-dark', label: 'Verde Lousa', hex: '#14332A' },
] as const;

export const MINDMAP_CANVAS_BG_COLORS = [
  { id: 'pure-white', label: 'Branco Puro', hex: '#FFFFFF' },
  { id: 'gov-light', label: 'Azul Gelo', hex: '#F4F7FB' },
  { id: 'paper-cream', label: 'Papel Creme', hex: '#FAF5E8' },
  { id: 'soft-mint', label: 'Menta Suave', hex: '#F0F7F4' },
  { id: 'soft-lavender', label: 'Lavanda Claro', hex: '#F5F3FF' },
  { id: 'cool-gray', label: 'Cinza Técnico', hex: '#EDF1F7' },
  { id: 'dark-slate', label: 'Noturno Slate', hex: '#0B1220' },
  { id: 'chalk-green', label: 'Lousa Verde', hex: '#0F241D' },
  { id: 'blueprint-navy', label: 'Blueprint Azul', hex: '#0A1931' },
  { id: 'obsidian', label: 'Preto Ônix', hex: '#09090B' },
] as const;

export interface MindMapThemeSpec {
  id: MindMapThemeId;
  name: string;
  description: string;
  isDark: boolean;
  useSystemVars?: boolean;
  canvasBg: string;
  exportCanvasBg: string;
  dotColor: string;
  cardBg: string;
  exportCardBg: string;
  textColor: string;
  exportTextColor: string;
  noteColor: string;
  exportNoteColor: string;
  headerBg: string;
  headerAccent: string;
  rootColor: string;
  branchPalette: string[];
}

export const MINDMAP_THEMES: MindMapThemeSpec[] = [
  {
    id: 'padrao',
    name: 'Padrão do Sistema',
    description: 'Acompanha automaticamente o tema ativo do estuda.gov.br',
    isDark: false,
    useSystemVars: true,
    canvasBg: 'var(--panel-soft)',
    exportCanvasBg: '#F8FAFC',
    dotColor: 'var(--line-strong)',
    cardBg: 'var(--panel)',
    exportCardBg: '#FFFFFF',
    textColor: 'var(--text)',
    exportTextColor: '#0F172A',
    noteColor: 'var(--muted)',
    exportNoteColor: '#475569',
    headerBg: '#071D41',
    headerAccent: '#FFCD07',
    rootColor: '#1351B4',
    branchPalette: ['#1351B4', '#168821', '#B45309', '#C53030', '#6D28D9', '#0F766E'],
  },
  {
    id: 'institucional',
    name: 'Institucional Gov',
    description: 'Fundo claro azul-gelo com cartões brancos e paleta oficial',
    isDark: false,
    canvasBg: '#F4F7FB',
    exportCanvasBg: '#F4F7FB',
    dotColor: '#CBD5E1',
    cardBg: '#FFFFFF',
    exportCardBg: '#FFFFFF',
    textColor: '#0F172A',
    exportTextColor: '#0F172A',
    noteColor: '#475569',
    exportNoteColor: '#475569',
    headerBg: '#071D41',
    headerAccent: '#FFCD07',
    rootColor: '#071D41',
    branchPalette: ['#1351B4', '#168821', '#B45309', '#C53030', '#3730A3', '#0F766E'],
  },
  {
    id: 'papel-creme',
    name: 'Papel de Estudo (Sépia)',
    description: 'Conforto visual para longas revisões com tons quentes de papel',
    isDark: false,
    canvasBg: '#FAF5E8',
    exportCanvasBg: '#FAF5E8',
    dotColor: '#DFD3B8',
    cardBg: '#FFFDF7',
    exportCardBg: '#FFFDF7',
    textColor: '#292018',
    exportTextColor: '#292018',
    noteColor: '#6B5B4A',
    exportNoteColor: '#6B5B4A',
    headerBg: '#3E2C1E',
    headerAccent: '#EAB308',
    rootColor: '#7C2D12',
    branchPalette: ['#9A3412', '#2E6F40', '#1D4E89', '#854D0E', '#6B21A8', '#0F766E'],
  },
  {
    id: 'noturno-slate',
    name: 'Noturno Executivo',
    description: 'Fundo escuro profundo com ramos luminosos de alto destaque',
    isDark: true,
    canvasBg: '#0B1220',
    exportCanvasBg: '#0B1220',
    dotColor: '#23324D',
    cardBg: '#131E32',
    exportCardBg: '#131E32',
    textColor: '#F1F5F9',
    exportTextColor: '#F1F5F9',
    noteColor: '#94A3B8',
    exportNoteColor: '#94A3B8',
    headerBg: '#0F172A',
    headerAccent: '#38BDF8',
    rootColor: '#0284C7',
    branchPalette: ['#38BDF8', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#2DD4BF'],
  },
  {
    id: 'lousa-verde',
    name: 'Lousa Acadêmica',
    description: 'Quadro verde clássico de sala de aula com traços em giz suave',
    isDark: true,
    canvasBg: '#0F241D',
    exportCanvasBg: '#0F241D',
    dotColor: '#244A3D',
    cardBg: '#163329',
    exportCardBg: '#163329',
    textColor: '#F0FDF4',
    exportTextColor: '#F0FDF4',
    noteColor: '#A7F3D0',
    exportNoteColor: '#A7F3D0',
    headerBg: '#0A1A15',
    headerAccent: '#FDE047',
    rootColor: '#15803D',
    branchPalette: ['#FDE047', '#6EE7B7', '#7DD3FC', '#FCA5A5', '#DDD6FE', '#FDBA74'],
  },
  {
    id: 'blueprint',
    name: 'Blueprint Técnico',
    description: 'Estética de planta técnica em azul-marinho com linhas ciano',
    isDark: true,
    canvasBg: '#0A1931',
    exportCanvasBg: '#0A1931',
    dotColor: '#1E3A63',
    cardBg: '#10264A',
    exportCardBg: '#10264A',
    textColor: '#EFF6FF',
    exportTextColor: '#EFF6FF',
    noteColor: '#93C5FD',
    exportNoteColor: '#93C5FD',
    headerBg: '#061124',
    headerAccent: '#38BDF8',
    rootColor: '#1D4ED8',
    branchPalette: ['#38BDF8', '#FACC15', '#4ADE80', '#FB7185', '#C084FC', '#22D3EE'],
  },
  {
    id: 'alto-contraste',
    name: 'Alto Contraste (Impressão)',
    description: 'Fundo branco puro e tinta preta forte ideal para impressão P&B',
    isDark: false,
    canvasBg: '#FFFFFF',
    exportCanvasBg: '#FFFFFF',
    dotColor: '#D4D4D8',
    cardBg: '#FFFFFF',
    exportCardBg: '#FFFFFF',
    textColor: '#000000',
    exportTextColor: '#000000',
    noteColor: '#374151',
    exportNoteColor: '#374151',
    headerBg: '#000000',
    headerAccent: '#FFFFFF',
    rootColor: '#111827',
    branchPalette: ['#111827', '#0B4F9C', '#14532D', '#991B1B', '#581C87', '#92400E'],
  },
];

export function getMindMapTheme(themeId?: MindMapThemeId): MindMapThemeSpec {
  return MINDMAP_THEMES.find((t) => t.id === themeId) || MINDMAP_THEMES[0];
}

export function isHexColorDark(hex?: string): boolean {
  if (!hex) return false;
  const cleaned = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(cleaned)) return false;
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.54;
}

export function getReadableTextOnHex(hex: string): { text: string; note: string; isDark: boolean } {
  const dark = isHexColorDark(hex);
  return dark
    ? { text: '#FFFFFF', note: 'rgba(241, 245, 249, 0.84)', isDark: true }
    : { text: '#0F172A', note: '#475569', isDark: false };
}

export function applyBgColorToSubtree(node: MindMapNode, bgColor?: string): MindMapNode {
  return {
    ...node,
    bgColor: bgColor || undefined,
    children: (node.children || []).map((c) => applyBgColorToSubtree(c, bgColor)),
  };
}

export function applyThemePaletteToTree(
  root: MindMapNode,
  themeId: MindMapThemeId,
  recolorBranches: boolean,
): MindMapNode {
  const theme = getMindMapTheme(themeId);
  const applyBranch = (node: MindMapNode, color: string): MindMapNode => ({
    ...node,
    color,
    bgColor: undefined,
    children: (node.children || []).map((c) => applyBranch(c, color)),
  });

  return {
    ...root,
    themeId,
    canvasBg: undefined,
    bgColor: recolorBranches ? undefined : root.bgColor,
    color: recolorBranches ? theme.rootColor : root.color,
    children: recolorBranches
      ? (root.children || []).map((branch, idx) =>
          applyBranch(branch, theme.branchPalette[idx % theme.branchPalette.length]),
        )
      : root.children,
  };
}

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

export function hexToSoftBg(hex: string): string {
  const cleaned = (hex || '#1351B4').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(cleaned)) return '#E8F0FE';
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Blend 14% color + 86% white for crisp accessible light-card chip background
  const blend = (c: number) => Math.round(c * 0.14 + 255 * 0.86);
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(blend(r))}${toHex(blend(g))}${toHex(blend(b))}`;
}

export function getTagMeta(
  tag?: MindMapNodeTag | '',
  customTags?: MindMapCustomTag[],
): MindMapTagMeta | undefined {
  if (!tag) return undefined;
  const builtIn = MINDMAP_TAGS.find((t) => t.id === tag);
  if (builtIn) return builtIn;
  if (customTags && customTags.length > 0) {
    const custom = customTags.find((t) => t.id === tag);
    if (custom) return custom;
  }
  return undefined;
}

export function clearTagFromTree(root: MindMapNode, tagId: string): MindMapNode {
  return {
    ...root,
    tag: root.tag === tagId ? '' : root.tag,
    children: (root.children || []).map((c) => clearTagFromTree(c, tagId)),
  };
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

export function searchMatchingNodeIds(
  root: MindMapNode,
  query: string,
  extraCustomTags?: MindMapCustomTag[],
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tagPool = extraCustomTags || root.customTags;
  const matches: string[] = [];
  const walk = (n: MindMapNode) => {
    const tagMeta = getTagMeta(n.tag, tagPool);
    const hay = `${n.label} ${n.note || ''} ${tagMeta?.label || ''}`.toLowerCase();
    if (hay.includes(q)) matches.push(n.id);
    for (const c of n.children || []) walk(c);
  };
  walk(root);
  return matches;
}

// ---------------------------------------------------------------------------
// Pixel-Accurate Unlimited Multi-Line Text Wrapping & Layout Engine
// ---------------------------------------------------------------------------

let _measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx !== undefined) return _measureCtx;
  if (typeof document === 'undefined') {
    _measureCtx = null;
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    _measureCtx = canvas.getContext('2d');
  } catch {
    _measureCtx = null;
  }
  return _measureCtx;
}

function measureTextPx(text: string, font: string, fallbackCharW: number): number {
  const ctx = getMeasureCtx();
  if (ctx) {
    ctx.font = font;
    return ctx.measureText(text).width;
  }
  return text.length * fallbackCharW;
}

function splitLongTokenByWidth(
  token: string,
  maxWidthPx: number,
  font: string,
  fallbackCharW: number,
): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const ch of token) {
    const candidate = current + ch;
    if (current && measureTextPx(candidate, font, fallbackCharW) > maxWidthPx) {
      chunks.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapParagraphByPixelWidth(
  text: string,
  maxWidthPx: number,
  font: string,
  fallbackCharW: number,
): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const wordWidth = measureTextPx(word, font, fallbackCharW);
    if (!current) {
      if (wordWidth > maxWidthPx) {
        const parts = splitLongTokenByWidth(word, maxWidthPx, font, fallbackCharW);
        lines.push(...parts.slice(0, -1));
        current = parts[parts.length - 1] || '';
      } else {
        current = word;
      }
    } else {
      const candidate = `${current} ${word}`;
      if (measureTextPx(candidate, font, fallbackCharW) <= maxWidthPx) {
        current = candidate;
      } else {
        lines.push(current);
        if (wordWidth > maxWidthPx) {
          const parts = splitLongTokenByWidth(word, maxWidthPx, font, fallbackCharW);
          lines.push(...parts.slice(0, -1));
          current = parts[parts.length - 1] || '';
        } else {
          current = word;
        }
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapMultilineByPixelWidth(
  text: string,
  maxWidthPx: number,
  font: string,
  fallbackCharW: number,
): string[] {
  const paragraphs = (text || '').split(/\r?\n/);
  const allLines: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    allLines.push(...wrapParagraphByPixelWidth(trimmed, maxWidthPx, font, fallbackCharW));
  }
  return allLines;
}

export function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  const pushWordUnbroken = (word: string) => {
    if (word.length <= maxCharsPerLine) {
      current = word;
      return;
    }
    for (let i = 0; i < word.length; i += maxCharsPerLine) {
      const slice = word.slice(i, i + maxCharsPerLine);
      if (i + maxCharsPerLine < word.length) {
        lines.push(slice);
      } else {
        current = slice;
      }
    }
  };

  for (const word of words) {
    if (!current) {
      pushWordUnbroken(word);
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      if (maxLines > 0 && lines.length >= maxLines) {
        const last = lines[lines.length - 1];
        if (!last.endsWith('…')) {
          lines[lines.length - 1] =
            last.length >= maxCharsPerLine
              ? last.slice(0, maxCharsPerLine - 1) + '…'
              : `${last}…`;
        }
        return lines;
      }
      current = '';
      pushWordUnbroken(word);
    }
  }
  if (current) lines.push(current);
  return maxLines > 0 ? lines.slice(0, maxLines) : lines;
}

export interface LayoutNode {
  node: MindMapNode;
  depth: number;
  side: 'center' | MindMapDirection;
  edgeAxis?: 'horizontal' | 'vertical';
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

export function hasAnyNodeOffset(root: MindMapNode): boolean {
  if ((root.offsetX || 0) !== 0 || (root.offsetY || 0) !== 0) return true;
  return (root.children || []).some((child) => hasAnyNodeOffset(child));
}

export function countOffsetNodes(root: MindMapNode): number {
  const self = (root.offsetX || 0) !== 0 || (root.offsetY || 0) !== 0 ? 1 : 0;
  return self + (root.children || []).reduce((acc, c) => acc + countOffsetNodes(c), 0);
}

export function resetAllNodeOffsets(root: MindMapNode): MindMapNode {
  return {
    ...root,
    offsetX: undefined,
    offsetY: undefined,
    children: (root.children || []).map((child) => resetAllNodeOffsets(child)),
  };
}

export function moveNodeOffsetInTree(
  root: MindMapNode,
  nodeId: string,
  dx: number,
  dy: number,
  moveSubtree: boolean,
): MindMapNode {
  const rdx = Math.round(dx);
  const rdy = Math.round(dy);
  if (rdx === 0 && rdy === 0) return root;

  const walk = (n: MindMapNode): MindMapNode => {
    if (n.id === nodeId) {
      const nextOffsetX = Math.round((n.offsetX || 0) + rdx);
      const nextOffsetY = Math.round((n.offsetY || 0) + rdy);
      const nextChildren = moveSubtree
        ? n.children
        : (n.children || []).map((child) => ({
            ...child,
            offsetX: Math.round((child.offsetX || 0) - rdx),
            offsetY: Math.round((child.offsetY || 0) - rdy),
          }));
      return {
        ...n,
        offsetX: nextOffsetX === 0 ? undefined : nextOffsetX,
        offsetY: nextOffsetY === 0 ? undefined : nextOffsetY,
        children: nextChildren,
      };
    }
    if (!n.children || n.children.length === 0) return n;
    let changed = false;
    const mapped = n.children.map((c) => {
      const next = walk(c);
      if (next !== c) changed = true;
      return next;
    });
    return changed ? { ...n, children: mapped } : n;
  };

  return walk(root);
}

function measureNodeBox(
  node: MindMapNode,
  depth: number,
  mode: MindMapLayoutMode,
  customTags?: MindMapCustomTag[],
) {
  const isRoot = depth === 0;
  const isBranch = depth === 1;
  const labelText = (node.label || 'Sem texto').trim() || 'Sem texto';
  const noteText = (node.note || '').trim();
  const labelLen = labelText.length;
  const noteLen = noteText.length;
  const isVeryLongText = labelLen > 120 || noteLen > 160;
  const isLongText = labelLen > 52 || noteLen > 72;

  const baseW = isRoot
    ? mode === 'vertical'
      ? 252
      : 242
    : mode === 'vertical'
      ? 216
      : isBranch
        ? 230
        : 220;
  const w = isVeryLongText ? baseW + 88 : isLongText ? baseW + 46 : baseW;

  // Use exact SVG/DOM font metrics with safe horizontal padding so zero characters ever clip
  const innerMaxPx = w - 28;
  const titleFont = isRoot
    ? '700 13.5px system-ui, -apple-system, sans-serif'
    : isBranch
      ? '700 12.5px system-ui, -apple-system, sans-serif'
      : '600 12px system-ui, -apple-system, sans-serif';
  const noteFont = '400 10.5px system-ui, -apple-system, sans-serif';

  const titleLines = wrapMultilineByPixelWidth(
    labelText,
    innerMaxPx,
    titleFont,
    isRoot ? 8.2 : 7.4,
  );
  const noteLines = noteText
    ? wrapMultilineByPixelWidth(noteText, innerMaxPx, noteFont, 6.2)
    : [];
  const hasTag = Boolean(getTagMeta(node.tag, customTags));

  const paddingY = isRoot ? 14 : 11;
  const tagH = hasTag ? 20 : 0;
  const titleLineH = isRoot ? 18.5 : 16.5;
  const noteLineH = 14.5;
  const titleH = Math.max(1, titleLines.length) * titleLineH;
  const noteH = noteLines.length > 0 ? 7 + noteLines.length * noteLineH : 0;
  const safetyBuffer = titleLines.length + noteLines.length > 3 ? 10 : 6;
  const h = Math.ceil(
    Math.max(isRoot ? 56 : 46, paddingY * 2 + tagH + titleH + noteH + safetyBuffer),
  );

  return { w, h, titleLines, noteLines };
}

interface LayoutBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface SubtreeLayout {
  nodes: LayoutNode[];
  rootNode: LayoutNode;
  bounds: LayoutBounds;
}

function shiftSubtree(sub: SubtreeLayout, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const n of sub.nodes) {
    n.x += dx;
    n.y += dy;
    if (n.edgeFrom) {
      n.edgeFrom = { x: n.edgeFrom.x + dx, y: n.edgeFrom.y + dy };
    }
    if (n.edgeTo) {
      n.edgeTo = { x: n.edgeTo.x + dx, y: n.edgeTo.y + dy };
    }
  }
  sub.bounds.minX += dx;
  sub.bounds.maxX += dx;
  sub.bounds.minY += dy;
  sub.bounds.maxY += dy;
}

function mergeBoundsList(subs: SubtreeLayout[]): LayoutBounds | null {
  if (subs.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of subs) {
    if (s.bounds.minX < minX) minX = s.bounds.minX;
    if (s.bounds.maxX > maxX) maxX = s.bounds.maxX;
    if (s.bounds.minY < minY) minY = s.bounds.minY;
    if (s.bounds.maxY > maxY) maxY = s.bounds.maxY;
  }
  return { minX, maxX, minY, maxY };
}

function layoutOmnidirectionalSubtree(
  node: MindMapNode,
  depth: number,
  primaryDir: MindMapDirection,
  colorIn: string,
  mode: MindMapLayoutMode,
  customTags?: MindMapCustomTag[],
): SubtreeLayout {
  const color = node.color || colorIn || '#1351B4';
  const { w, h, titleLines, noteLines } = measureNodeBox(node, depth, mode, customTags);
  const visibleChildren = node.collapsed ? [] : node.children || [];
  const hiddenCount = node.collapsed ? countDescendants(node) : 0;

  const rootNode: LayoutNode = {
    node,
    depth,
    side: depth === 0 ? 'center' : primaryDir,
    edgeAxis:
      depth === 0
        ? undefined
        : primaryDir === 'up' || primaryDir === 'down'
          ? 'vertical'
          : 'horizontal',
    x: 0,
    y: 0,
    w,
    h,
    color,
    titleLines,
    noteLines,
    hiddenCount,
  };

  if (visibleChildren.length === 0) {
    return {
      nodes: [rootNode],
      rootNode,
      bounds: { minX: 0, maxX: w, minY: 0, maxY: h },
    };
  }

  const gapX = mode === 'bilateral' ? 56 : 54;
  const gapY = depth === 0 ? 22 : 16;
  const gapVertY = 56;
  const gapHorizX = 24;

  const rightSubs: SubtreeLayout[] = [];
  const leftSubs: SubtreeLayout[] = [];
  const upSubs: SubtreeLayout[] = [];
  const downSubs: SubtreeLayout[] = [];

  let autoRootIdx = 0;
  visibleChildren.forEach((child, idx) => {
    const branchColor =
      depth === 0
        ? child.color || MINDMAP_COLORS[idx % MINDMAP_COLORS.length].hex
        : child.color || color;

    let effectiveDir: MindMapDirection;
    if (child.direction) {
      effectiveDir = child.direction;
    } else if (depth === 0) {
      if (mode === 'bilateral') {
        effectiveDir = autoRootIdx % 2 === 0 ? 'right' : 'left';
        autoRootIdx += 1;
      } else if (mode === 'horizontal') {
        effectiveDir = 'right';
      } else {
        effectiveDir = 'down';
      }
    } else {
      effectiveDir = primaryDir;
    }

    const sub = layoutOmnidirectionalSubtree(
      child,
      depth + 1,
      effectiveDir,
      branchColor,
      mode,
      customTags,
    );
    sub.rootNode.parentId = node.id;

    if (effectiveDir === 'right') rightSubs.push(sub);
    else if (effectiveDir === 'left') leftSubs.push(sub);
    else if (effectiveDir === 'up') upSubs.push(sub);
    else downSubs.push(sub);
  });

  // 1. Place Right children vertically stacked to the right of node
  if (rightSubs.length > 0) {
    let cursorY = 0;
    for (const sub of rightSubs) {
      shiftSubtree(sub, w + gapX - sub.bounds.minX, cursorY - sub.bounds.minY);
      cursorY = sub.bounds.maxY + gapY;
    }
    const firstCy = rightSubs[0].rootNode.y + rightSubs[0].rootNode.h / 2;
    const lastCy =
      rightSubs[rightSubs.length - 1].rootNode.y + rightSubs[rightSubs.length - 1].rootNode.h / 2;
    const dyCenter = h / 2 - (firstCy + lastCy) / 2;
    for (const sub of rightSubs) {
      shiftSubtree(sub, 0, dyCenter);
      sub.rootNode.side = 'right';
      sub.rootNode.edgeAxis = 'horizontal';
      sub.rootNode.edgeFrom = { x: w, y: h / 2 };
      sub.rootNode.edgeTo = {
        x: sub.rootNode.x,
        y: sub.rootNode.y + sub.rootNode.h / 2,
      };
    }
  }

  // 2. Place Left children vertically stacked to the left of node
  if (leftSubs.length > 0) {
    let cursorY = 0;
    for (const sub of leftSubs) {
      shiftSubtree(sub, -gapX - sub.bounds.maxX, cursorY - sub.bounds.minY);
      cursorY = sub.bounds.maxY + gapY;
    }
    const firstCy = leftSubs[0].rootNode.y + leftSubs[0].rootNode.h / 2;
    const lastCy =
      leftSubs[leftSubs.length - 1].rootNode.y + leftSubs[leftSubs.length - 1].rootNode.h / 2;
    const dyCenter = h / 2 - (firstCy + lastCy) / 2;
    for (const sub of leftSubs) {
      shiftSubtree(sub, 0, dyCenter);
      sub.rootNode.side = 'left';
      sub.rootNode.edgeAxis = 'horizontal';
      sub.rootNode.edgeFrom = { x: 0, y: h / 2 };
      sub.rootNode.edgeTo = {
        x: sub.rootNode.x + sub.rootNode.w,
        y: sub.rootNode.y + sub.rootNode.h / 2,
      };
    }
  }

  const rightBounds = mergeBoundsList(rightSubs);
  const leftBounds = mergeBoundsList(leftSubs);

  // 3. Place Up children horizontally arranged above node
  if (upSubs.length > 0) {
    let cursorX = 0;
    for (const sub of upSubs) {
      shiftSubtree(sub, cursorX - sub.bounds.minX, -sub.bounds.maxY);
      cursorX = sub.bounds.maxX + gapHorizX;
    }
    const firstCx = upSubs[0].rootNode.x + upSubs[0].rootNode.w / 2;
    const lastCx =
      upSubs[upSubs.length - 1].rootNode.x + upSubs[upSubs.length - 1].rootNode.w / 2;
    const dxCenter = w / 2 - (firstCx + lastCx) / 2;
    for (const sub of upSubs) {
      shiftSubtree(sub, dxCenter, 0);
    }

    const upBoundsX = mergeBoundsList(upSubs)!;
    let targetMaxY = -gapVertY;
    if (leftBounds && upBoundsX.minX < leftBounds.maxX + 14) {
      targetMaxY = Math.min(targetMaxY, leftBounds.minY - 24);
    }
    if (rightBounds && upBoundsX.maxX > rightBounds.minX - 14) {
      targetMaxY = Math.min(targetMaxY, rightBounds.minY - 24);
    }

    for (const sub of upSubs) {
      shiftSubtree(sub, 0, targetMaxY);
      sub.rootNode.side = 'up';
      sub.rootNode.edgeAxis = 'vertical';
      sub.rootNode.edgeFrom = { x: w / 2, y: 0 };
      sub.rootNode.edgeTo = {
        x: sub.rootNode.x + sub.rootNode.w / 2,
        y: sub.rootNode.y + sub.rootNode.h,
      };
    }
  }

  // 4. Place Down children horizontally arranged below node
  if (downSubs.length > 0) {
    let cursorX = 0;
    for (const sub of downSubs) {
      shiftSubtree(sub, cursorX - sub.bounds.minX, -sub.bounds.minY);
      cursorX = sub.bounds.maxX + gapHorizX;
    }
    const firstCx = downSubs[0].rootNode.x + downSubs[0].rootNode.w / 2;
    const lastCx =
      downSubs[downSubs.length - 1].rootNode.x + downSubs[downSubs.length - 1].rootNode.w / 2;
    const dxCenter = w / 2 - (firstCx + lastCx) / 2;
    for (const sub of downSubs) {
      shiftSubtree(sub, dxCenter, 0);
    }

    const downBoundsX = mergeBoundsList(downSubs)!;
    let targetMinY = h + gapVertY;
    if (leftBounds && downBoundsX.minX < leftBounds.maxX + 14) {
      targetMinY = Math.max(targetMinY, leftBounds.maxY + 24);
    }
    if (rightBounds && downBoundsX.maxX > rightBounds.minX - 14) {
      targetMinY = Math.max(targetMinY, rightBounds.maxY + 24);
    }

    for (const sub of downSubs) {
      shiftSubtree(sub, 0, targetMinY);
      sub.rootNode.side = 'down';
      sub.rootNode.edgeAxis = 'vertical';
      sub.rootNode.edgeFrom = { x: w / 2, y: h };
      sub.rootNode.edgeTo = {
        x: sub.rootNode.x + sub.rootNode.w / 2,
        y: sub.rootNode.y,
      };
    }
  }

  const allNodes: LayoutNode[] = [rootNode];
  for (const s of rightSubs) allNodes.push(...s.nodes);
  for (const s of leftSubs) allNodes.push(...s.nodes);
  for (const s of upSubs) allNodes.push(...s.nodes);
  for (const s of downSubs) allNodes.push(...s.nodes);

  let minX = 0;
  let maxX = w;
  let minY = 0;
  let maxY = h;
  for (const n of allNodes) {
    if (n.x < minX) minX = n.x;
    if (n.x + n.w > maxX) maxX = n.x + n.w;
    if (n.y < minY) minY = n.y;
    if (n.y + n.h > maxY) maxY = n.y + n.h;
  }

  return {
    nodes: allNodes,
    rootNode,
    bounds: { minX, maxX, minY, maxY },
  };
}

function reanchorEdgeSmart(parent: LayoutNode, child: LayoutNode): void {
  const parentCx = parent.x + parent.w / 2;
  const parentCy = parent.y + parent.h / 2;
  const childCx = child.x + child.w / 2;
  const childCy = child.y + child.h / 2;
  const dx = childCx - parentCx;
  const dy = childCy - parentCy;

  const nx = Math.abs(dx) / Math.max(1, (parent.w + child.w) / 2);
  const ny = Math.abs(dy) / Math.max(1, (parent.h + child.h) / 2);

  if (ny > nx) {
    child.edgeAxis = 'vertical';
    if (dy >= 0) {
      child.side = 'down';
      child.edgeFrom = { x: parentCx, y: parent.y + parent.h };
      child.edgeTo = { x: childCx, y: child.y };
    } else {
      child.side = 'up';
      child.edgeFrom = { x: parentCx, y: parent.y };
      child.edgeTo = { x: childCx, y: child.y + child.h };
    }
  } else {
    child.edgeAxis = 'horizontal';
    if (dx >= 0) {
      child.side = 'right';
      child.edgeFrom = { x: parent.x + parent.w, y: parentCy };
      child.edgeTo = { x: child.x, y: childCy };
    } else {
      child.side = 'left';
      child.edgeFrom = { x: parent.x, y: parentCy };
      child.edgeTo = { x: child.x + child.w, y: childCy };
    }
  }
}

function applyHierarchicalOffsetsAndReanchor(
  nodes: LayoutNode[],
  _mode: MindMapLayoutMode,
  rootNode: LayoutNode,
) {
  const byId = new Map<string, LayoutNode>(nodes.map((n) => [n.node.id, n]));
  const cumulativeCache = new Map<string, { dx: number; dy: number }>();

  const getCumulativeOffset = (id: string): { dx: number; dy: number } => {
    const cached = cumulativeCache.get(id);
    if (cached) return cached;
    const ln = byId.get(id);
    if (!ln) return { dx: 0, dy: 0 };
    const parentOff = ln.parentId ? getCumulativeOffset(ln.parentId) : { dx: 0, dy: 0 };
    const ownDx = Number.isFinite(ln.node.offsetX) ? (ln.node.offsetX as number) : 0;
    const ownDy = Number.isFinite(ln.node.offsetY) ? (ln.node.offsetY as number) : 0;
    const combined = { dx: parentOff.dx + ownDx, dy: parentOff.dy + ownDy };
    cumulativeCache.set(id, combined);
    return combined;
  };

  let anyOffset = false;
  for (const n of nodes) {
    const off = getCumulativeOffset(n.node.id);
    if (off.dx !== 0 || off.dy !== 0) {
      anyOffset = true;
      n.x += off.dx;
      n.y += off.dy;
      if (n.edgeTo) {
        n.edgeTo = { x: n.edgeTo.x + off.dx, y: n.edgeTo.y + off.dy };
      }
    }
    if (n.parentId && n.edgeFrom) {
      const pOff = getCumulativeOffset(n.parentId);
      if (pOff.dx !== 0 || pOff.dy !== 0) {
        n.edgeFrom = { x: n.edgeFrom.x + pOff.dx, y: n.edgeFrom.y + pOff.dy };
      }
    }
  }

  if (!anyOffset) return;

  // Re-anchor edges smartly only where a node has a manual offset relative to its parent
  for (const n of nodes) {
    if (!n.parentId) continue;
    const ownDx = Number.isFinite(n.node.offsetX) ? (n.node.offsetX as number) : 0;
    const ownDy = Number.isFinite(n.node.offsetY) ? (n.node.offsetY as number) : 0;
    if (ownDx === 0 && ownDy === 0) continue;
    const parent = byId.get(n.parentId);
    if (!parent) continue;
    reanchorEdgeSmart(parent, n);
  }

  void rootNode;
}

function normalizeLayoutBounds(
  nodes: LayoutNode[],
  mode: MindMapLayoutMode,
  padX: number,
  padY: number,
  rootNode: LayoutNode,
): ComputedMindMapLayout {
  applyHierarchicalOffsetsAndReanchor(nodes, mode, rootNode);

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
  extraCustomTags?: MindMapCustomTag[],
): ComputedMindMapLayout {
  const padX = mode === 'bilateral' ? 56 : 48;
  const padY = mode === 'bilateral' ? 48 : 44;
  const defaultRootDir: MindMapDirection = mode === 'vertical' ? 'down' : 'right';
  const result = layoutOmnidirectionalSubtree(
    root,
    0,
    defaultRootDir,
    root.color || '#1351B4',
    mode,
    extraCustomTags || root.customTags,
  );
  return normalizeLayoutBounds(result.nodes, mode, padX, padY, result.rootNode);
}

/**
 * Applies an active mouse drag preview directly on top of a computed layout
 * without re-normalizing canvas bounds, preventing any background shift during drag.
 */
export function applyLiveDragPreview(
  baseLayout: ComputedMindMapLayout,
  drag: { nodeId: string; dx: number; dy: number; moveSubtree: boolean } | null,
): ComputedMindMapLayout {
  if (!drag || (drag.dx === 0 && drag.dy === 0)) return baseLayout;

  const movedIds = new Set<string>([drag.nodeId]);
  if (drag.moveSubtree) {
    // Collect all descendants present in the layout
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const n of baseLayout.nodes) {
        if (n.parentId && movedIds.has(n.parentId) && !movedIds.has(n.node.id)) {
          movedIds.add(n.node.id);
          expanded = true;
        }
      }
    }
  }

  const clonedNodes: LayoutNode[] = baseLayout.nodes.map((n) => {
    const isMoved = movedIds.has(n.node.id);
    return {
      ...n,
      x: isMoved ? n.x + drag.dx : n.x,
      y: isMoved ? n.y + drag.dy : n.y,
      edgeFrom: n.edgeFrom ? { ...n.edgeFrom } : undefined,
      edgeTo: n.edgeTo ? { ...n.edgeTo } : undefined,
    };
  });

  const byId = new Map<string, LayoutNode>(clonedNodes.map((n) => [n.node.id, n]));
  for (const n of clonedNodes) {
    if (!n.parentId) continue;
    const parent = byId.get(n.parentId);
    if (!parent) continue;
    const childMoved = movedIds.has(n.node.id);
    const parentMoved = movedIds.has(parent.node.id);
    if (!childMoved && !parentMoved) continue;

    if (childMoved && parentMoved) {
      // Whole subtree translated together: shift existing edge anchors cleanly
      if (n.edgeFrom) {
        n.edgeFrom = { x: n.edgeFrom.x + drag.dx, y: n.edgeFrom.y + drag.dy };
      }
      if (n.edgeTo) {
        n.edgeTo = { x: n.edgeTo.x + drag.dx, y: n.edgeTo.y + drag.dy };
      }
    } else {
      // Relative position between parent and child changed: snap to best 4-way face
      reanchorEdgeSmart(parent, n);
    }
  }

  return {
    ...baseLayout,
    nodes: clonedNodes,
  };
}

// ---------------------------------------------------------------------------
// Edge Path Builder (Curved Bezier vs Clean Orthogonal — All 4 Directions)
// ---------------------------------------------------------------------------

export function buildEdgePath(
  n: LayoutNode,
  mode: MindMapLayoutMode,
  edgeStyle: MindMapEdgeStyle,
): string | null {
  if (!n.edgeFrom || !n.edgeTo) return null;
  const { x: x1, y: y1 } = n.edgeFrom;
  const { x: x2, y: y2 } = n.edgeTo;

  const isVerticalEdge = n.edgeAxis
    ? n.edgeAxis === 'vertical'
    : n.side === 'up' || n.side === 'down' || (n.side !== 'left' && n.side !== 'right' && mode === 'vertical');

  if (isVerticalEdge) {
    const midY = (y1 + y2) / 2;
    if (edgeStyle === 'orthogonal') {
      const r = Math.min(8, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 4);
      if (Math.abs(x2 - x1) < 2) {
        return `M ${x1} ${y1} L ${x2} ${y2}`;
      }
      const dirX = x2 > x1 ? 1 : -1;
      const dirY = y2 > y1 ? 1 : -1;
      return `M ${x1} ${y1} L ${x1} ${midY - dirY * r} Q ${x1} ${midY}, ${x1 + dirX * r} ${midY} L ${x2 - dirX * r} ${midY} Q ${x2} ${midY}, ${x2} ${midY + dirY * r} L ${x2} ${y2}`;
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

export interface MindMapVisualExportOptions {
  themeId?: MindMapThemeId;
  canvasBg?: string;
  customTags?: MindMapCustomTag[];
  omitHeader?: boolean;
}

export function buildStandaloneMindMapSvg(
  layout: ComputedMindMapLayout,
  edgeStyle: MindMapEdgeStyle,
  title: string,
  visualOptions?: MindMapVisualExportOptions,
): string {
  const headerH = visualOptions?.omitHeader ? 0 : 44;
  const totalW = layout.width;
  const totalH = layout.height + headerH;
  const theme = getMindMapTheme(visualOptions?.themeId);
  const resolvedCanvasBg = visualOptions?.canvasBg || theme.exportCanvasBg;
  const canvasIsDark = isHexColorDark(resolvedCanvasBg);
  const resolvedDotColor = visualOptions?.canvasBg
    ? canvasIsDark
      ? '#334155'
      : '#CBD5E1'
    : theme.useSystemVars
      ? '#CBD5E1'
      : theme.dotColor;

  const paths = layout.nodes
    .map((n) => {
      const d = buildEdgePath(n, layout.mode, edgeStyle);
      if (!d || !n.edgeTo) return '';
      const strokeW = n.depth === 1 ? 2.4 : 1.8;
      return `
        <path d="${d}" fill="none" stroke="${n.color}" stroke-width="${strokeW}" stroke-opacity="0.82" stroke-linecap="round" />
        <circle cx="${n.edgeTo.x}" cy="${n.edgeTo.y}" r="3" fill="${n.color}" />
      `;
    })
    .join('\n');

  const boxes = layout.nodes
    .map((n) => {
      const isRoot = n.depth === 0;
      const isBranch = n.depth === 1;
      const tagMeta = getTagMeta(n.node.tag, visualOptions?.customTags);
      const customBg = n.node.bgColor?.trim();
      const fill = customBg || (isRoot ? n.color : theme.exportCardBg);
      const readable = customBg
        ? getReadableTextOnHex(customBg)
        : isRoot
          ? getReadableTextOnHex(n.color)
          : {
              text: theme.exportTextColor,
              note: theme.exportNoteColor,
              isDark: theme.isDark,
            };
      const textFill = readable.text;
      const noteFill = readable.isDark ? '#CBD5E1' : readable.note;
      const rx = isRoot ? 14 : 10;
      const padX = 12;
      const titleLineH = isRoot ? 18.5 : 16.5;
      const noteLineH = 14.5;
      let cursorY = n.y + (isRoot ? 14 : 11);

      let tagSvg = '';
      if (tagMeta) {
        const tagFill = readable.isDark ? 'rgba(255,255,255,0.16)' : tagMeta.bg;
        const tagTextFill = readable.isDark ? '#FFFFFF' : tagMeta.color;
        const measuredTagW = Math.ceil(
          measureTextPx(tagMeta.short, '800 8.5px system-ui, -apple-system, sans-serif', 6.4) + 14,
        );
        const tagW = Math.min(n.w - padX * 2, Math.max(44, measuredTagW));
        tagSvg = `
          <rect x="${n.x + padX}" y="${cursorY - 1}" width="${tagW}" height="16" rx="4" fill="${tagFill}" />
          <text x="${n.x + padX + 6}" y="${cursorY + 10.5}" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="800" letter-spacing="0.3" fill="${tagTextFill}">${escapeXml(tagMeta.short)}</text>
        `;
        cursorY += 20;
      }

      const titleFontSize = isRoot ? 13.5 : isBranch ? 12.5 : 12;
      const titleSvg = n.titleLines
        .map((line, i) => {
          const lineY = cursorY + (isRoot ? 13 : 12) + i * titleLineH;
          return `<text x="${n.x + padX}" y="${lineY}" font-family="system-ui, -apple-system, sans-serif" font-size="${titleFontSize}" font-weight="${isRoot || isBranch ? 700 : 600}" fill="${textFill}">${escapeXml(line)}</text>`;
        })
        .join('\n');

      const afterTitleY = cursorY + Math.max(1, n.titleLines.length) * titleLineH + 5;
      const noteSvg = n.noteLines
        .map((line, i) => {
          const lineY = afterTitleY + 10 + i * noteLineH;
          return `<text x="${n.x + padX}" y="${lineY}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="${noteFill}">${escapeXml(line)}</text>`;
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
  const headerSvg =
    headerH > 0
      ? `
    <rect width="100%" height="${headerH}" fill="${theme.headerBg}" />
    <rect y="${headerH - 2}" width="100%" height="2" fill="${theme.headerAccent}" />
    <text x="20" y="27" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="#FFFFFF">${safeTitle}</text>
    <text x="${totalW - 20}" y="26" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" fill="#CBD5E1">${safeDate}</text>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
    <defs>
      <pattern id="mm-dot-grid" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1" fill="${resolvedDotColor}" fill-opacity="0.55" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="${resolvedCanvasBg}" />
    <rect y="${headerH}" width="100%" height="${layout.height}" fill="url(#mm-dot-grid)" />
    ${headerSvg}
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
  visualOptions?: MindMapVisualExportOptions,
): void {
  const svgString = buildStandaloneMindMapSvg(layout, edgeStyle, title, visualOptions);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const slug = cleanSafeName(title, 'mapa_mental').replace(/\s+/g, '_');
  triggerBlobDownload(blob, `${slug}_${localDateIso()}.svg`);
}

function renderSvgToDataUrl(
  svgString: string,
  width: number,
  height: number,
  scale = 2.5,
  bgColor = '#F8FAFC',
): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const maxDim = Math.max(width, height, 1);
      const safeMaxScale = Math.max(1, Math.floor((7600 / maxDim) * 100) / 100);
      const effectiveScale = Math.max(1, Math.min(scale, safeMaxScale));

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * effectiveScale);
      canvas.height = Math.round(height * effectiveScale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Contexto 2D indisponível para renderização.'));
        return;
      }
      ctx.scale(effectiveScale, effectiveScale);
      ctx.fillStyle = bgColor;
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

/**
 * Renders any MindMapNode tree with ALL branches and subgroups expanded into
 * PNG bytes + dimensions, ready for standalone PNG download or PDF embedding.
 */
export async function renderExpandedMindMapPngBytes(
  root: MindMapNode,
  title: string,
  visualOptions?: MindMapVisualExportOptions,
): Promise<{ bytes: Uint8Array; blob: Blob; dataUrl: string; width: number; height: number }> {
  const expanded = setAllNodesCollapsed(root, false);
  const mode = expanded.layout || 'bilateral';
  const edgeStyle = expanded.edgeStyle || 'curved';
  const mergedOptions: MindMapVisualExportOptions = {
    themeId: visualOptions?.themeId ?? expanded.themeId,
    canvasBg: visualOptions?.canvasBg ?? expanded.canvasBg,
    customTags: visualOptions?.customTags ?? expanded.customTags,
    omitHeader: visualOptions?.omitHeader,
  };
  const layout = computeMindMapLayout(expanded, mode, mergedOptions.customTags);
  const theme = getMindMapTheme(mergedOptions.themeId);
  const resolvedCanvasBg = mergedOptions.canvasBg || theme.exportCanvasBg;
  const headerH = mergedOptions.omitHeader ? 0 : 44;
  const svgString = buildStandaloneMindMapSvg(layout, edgeStyle, title, mergedOptions);
  const { blob, dataUrl } = await renderSvgToDataUrl(
    svgString,
    layout.width,
    layout.height + headerH,
    2.5,
    resolvedCanvasBg,
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, blob, dataUrl, width: layout.width, height: layout.height + headerH };
}

export async function exportMindMapPngFile(
  layout: ComputedMindMapLayout,
  edgeStyle: MindMapEdgeStyle,
  title: string,
  visualOptions?: MindMapVisualExportOptions,
): Promise<void> {
  const theme = getMindMapTheme(visualOptions?.themeId);
  const resolvedCanvasBg = visualOptions?.canvasBg || theme.exportCanvasBg;
  const svgString = buildStandaloneMindMapSvg(layout, edgeStyle, title, visualOptions);
  const { blob } = await renderSvgToDataUrl(
    svgString,
    layout.width,
    layout.height + 44,
    2.5,
    resolvedCanvasBg,
  );
  const slug = cleanSafeName(title, 'mapa_mental').replace(/\s+/g, '_');
  triggerBlobDownload(blob, `${slug}_${localDateIso()}.png`);
}

export async function exportMindMapVisualPdfFile(
  layout: ComputedMindMapLayout,
  edgeStyle: MindMapEdgeStyle,
  title: string,
  subjectLabel: string,
  visualOptions?: MindMapVisualExportOptions,
): Promise<void> {
  const theme = getMindMapTheme(visualOptions?.themeId);
  const resolvedCanvasBg = visualOptions?.canvasBg || theme.exportCanvasBg;
  const svgString = buildStandaloneMindMapSvg(layout, edgeStyle, title, {
    ...visualOptions,
    omitHeader: true,
  });
  const svgW = layout.width;
  const svgH = layout.height;
  const { dataUrl } = await renderSvgToDataUrl(svgString, svgW, svgH, 2.5, resolvedCanvasBg);

  const orientation = svgH > svgW * 1.15 ? 'portrait' : 'landscape';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;

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
  doc.text(normalizePdfLegalText((title || 'Mapa Mental').slice(0, 110)), margin, 13.5);

  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(localDateTimeBrazilian(), pageW - margin, 13.5, { align: 'right' });

  // Fit full expanded diagram cleanly inside remaining A4 frame
  const availW = pageW - margin * 2;
  const availH = pageH - 27;
  const ratio = Math.min(availW / svgW, availH / svgH);
  const drawW = svgW * ratio;
  const drawH = svgH * ratio;
  const drawX = margin + (availW - drawW) / 2;
  const drawY = 21 + (availH - drawH) / 2;

  doc.addImage(dataUrl, 'PNG', drawX, drawY, drawW, drawH, undefined, 'FAST');

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7.5);
  doc.text(
    normalizePdfLegalText(`estuda.gov.br · Construtor Visual de Mapas Mentais · ${subjectLabel}`),
    margin,
    pageH - 3.5,
  );

  const slug = cleanSafeName(title, 'mapa_mental').replace(/\s+/g, '_');
  doc.save(`${slug}_${localDateIso()}.pdf`);
}
