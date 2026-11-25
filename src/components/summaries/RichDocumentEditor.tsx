import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Clock,
  Columns3,
  FileDown,
  FileUp,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Lightbulb,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  Scale,
  Strikethrough,
  Subscript,
  Superscript,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
  Wand2,
} from 'lucide-react';
import { triggerBlobDownload } from '../../lib/fileStorage';
import { formatCorrectionTextStructured } from '../../lib/legalTextFormatter';
import { cleanSafeName, localDateIso } from '../../lib/parsers';
import {
  buildDocxBlobFromHtml,
  htmlToPlainText,
  importDocxFileToHtml,
  markdownToInitialHtml,
  sanitizeDocHtml,
} from '../../lib/richDocUtils';

export interface RichDocumentEditorProps {
  valueHtml: string;
  resetKey: number;
  title: string;
  subjectLabel: string;
  subtopic?: string;
  tags?: string[];
  onChangeHtml: (nextHtml: string) => void;
  onImportTitle?: (importedTitle: string) => void;
  onNotify?: (message: string, isError?: boolean) => void;
  autoSaveIndicator?: React.ReactNode;
  placeholder?: string;
  documentBadge?: string;
  downloadPrefix?: string;
  minEditorHeightClass?: string;
  defaultLayout?: 'fluid' | 'a4';
  onBlurEditor?: () => void;
  footerNote?: string;
}

const FONT_FAMILIES = [
  { label: 'Padrão (Sans)', value: 'inherit', matchKey: '' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif', matchKey: 'arial' },
  { label: 'Calibri', value: 'Calibri, "Segoe UI", sans-serif', matchKey: 'calibri' },
  { label: 'Georgia (Serif)', value: 'Georgia, Cambria, serif', matchKey: 'georgia' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif', matchKey: 'times' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif', matchKey: 'verdana' },
  { label: 'Monospace', value: '"JetBrains Mono", Consolas, monospace', matchKey: 'mono' },
];

const BASE_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36];

const LINE_HEIGHTS = [
  { label: '1.15', value: '1.15' },
  { label: '1.40', value: '1.4' },
  { label: '1.60', value: '1.6' },
  { label: '1.80', value: '1.8' },
  { label: '2.00', value: '2' },
];

const TEXT_COLORS = [
  { label: 'Automático', value: '' },
  { label: 'Preto Grafite', value: '#0f172a' },
  { label: 'Cinza Escuro', value: '#475569' },
  { label: 'Azul Institucional', value: '#1351b4' },
  { label: 'Azul Marinho', value: '#071d41' },
  { label: 'Vermelho Alerta', value: '#b91c1c' },
  { label: 'Verde Esmeralda', value: '#15803d' },
  { label: 'Âmbar / Laranja', value: '#b45309' },
  { label: 'Roxo Jurídico', value: '#6d28d9' },
  { label: 'Petróleo', value: '#0f766e' },
];

const HIGHLIGHT_COLORS = [
  { label: 'Sem destaque', value: 'transparent' },
  { label: 'Amarelo Marca-texto', value: '#fef08a' },
  { label: 'Verde Menta', value: '#bbf7d0' },
  { label: 'Azul Claro', value: '#bae6fd' },
  { label: 'Rosa Suave', value: '#fbcfe8' },
  { label: 'Laranja Pastel', value: '#fed7aa' },
  { label: 'Lilás Suave', value: '#e9d5ff' },
  { label: 'Vermelho Claro', value: '#fecaca' },
];

const CALLOUT_PRESETS = [
  {
    id: 'atencao',
    label: 'Atenção / Pegadinha',
    title: 'ATENÇÃO / PEGADINHA DE BANCA',
    placeholder: 'Descreva aqui a pegadinha recorrente ou detalhe que a banca costuma inverter.',
    icon: AlertTriangle,
    accentClass: 'text-[var(--warning)]',
  },
  {
    id: 'prazo',
    label: 'Prazo / Regra Temporal',
    title: 'PRAZO LEGAL',
    placeholder: 'Ex.: Prazo de 15 dias úteis contados da intimação (Art. ...).',
    icon: Clock,
    accentClass: 'text-[var(--accent)]',
  },
  {
    id: 'excecao',
    label: 'Exceção Importante',
    title: 'EXCEÇÃO À REGRA',
    placeholder: 'Salvo nos casos previstos expressamente em lei...',
    icon: Scale,
    accentClass: 'text-[var(--bad)]',
  },
  {
    id: 'dica',
    label: 'Dica / Mnemônico',
    title: 'DICA DE MEMORIZAÇÃO',
    placeholder: 'Use um mnemônico ou resumo rápido para revisão de véspera.',
    icon: Lightbulb,
    accentClass: 'text-[var(--good)]',
  },
] as const;

type OpenPopover = 'color' | 'highlight' | 'table' | 'callout' | null;
type AlignValue = 'left' | 'center' | 'right' | 'justify';

interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  subscript: boolean;
  superscript: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  align: AlignValue;
  blockTag: string;
  fontSizePx: number;
  fontFamily: string;
  textColor: string;
  highlightColor: string;
  inTable: boolean;
}

const DEFAULT_ACTIVE_FORMATS: ActiveFormats = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  subscript: false,
  superscript: false,
  unorderedList: false,
  orderedList: false,
  align: 'left',
  blockTag: 'p',
  fontSizePx: 15,
  fontFamily: 'inherit',
  textColor: '',
  highlightColor: 'transparent',
  inTable: false,
};

const BLOCK_TAG_SET = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'pre',
  'td',
  'th',
]);

const ALIGNABLE_LEAF_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'div', 'pre']);

function hydrateElementFromSafeHtml(container: HTMLElement, rawHtml: string): void {
  const safe = sanitizeDocHtml(rawHtml);
  if (!safe.trim()) {
    container.replaceChildren();
    return;
  }
  const parser = new DOMParser();
  const parsed = parser.parseFromString(safe, 'text/html');
  const nodes = Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true));
  container.replaceChildren(...nodes);
}

function serializeContainerHtml(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  // Remove any leftover temporary selection bookmarks before serializing
  clone.querySelectorAll('[data-ce-bm]').forEach((bm) => bm.remove());
  const serializer = new XMLSerializer();
  const raw = Array.from(clone.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType === Node.ELEMENT_NODE) {
        return serializer
          .serializeToString(node)
          .replace(/\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
      }
      return '';
    })
    .join('');
  return sanitizeDocHtml(raw);
}

function isBlockElement(node: Node): node is HTMLElement {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    BLOCK_TAG_SET.has((node as HTMLElement).tagName.toLowerCase())
  );
}

function hasBlockChildren(el: HTMLElement): boolean {
  return Array.from(el.children).some((child) => {
    const tag = child.tagName.toLowerCase();
    return BLOCK_TAG_SET.has(tag) || tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'hr';
  });
}

/**
 * Ensures direct inline/text nodes inside the editor root are wrapped into proper <p> paragraphs,
 * splitting at <br> boundaries so aligning one line never aligns the entire document.
 */
function normalizeRootInlineNodes(root: HTMLElement): void {
  const children = Array.from(root.childNodes);
  let inlineBuffer: Node[] = [];

  const flushBuffer = (beforeNode: Node | null) => {
    if (inlineBuffer.length === 0) return;
    const hasMeaningful = inlineBuffer.some(
      (n) =>
        (n.nodeType === Node.TEXT_NODE && (n.textContent || '').length > 0) ||
        n.nodeType === Node.ELEMENT_NODE,
    );
    if (!hasMeaningful) {
      inlineBuffer = [];
      return;
    }
    const p = document.createElement('p');
    inlineBuffer.forEach((n) => p.appendChild(n));
    if (p.childNodes.length === 0) {
      p.appendChild(document.createElement('br'));
    }
    root.insertBefore(p, beforeNode);
    inlineBuffer = [];
  };

  for (const child of children) {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      (isBlockElement(child) ||
        ['ul', 'ol', 'table', 'hr'].includes((child as HTMLElement).tagName.toLowerCase()))
    ) {
      flushBuffer(child);
      continue;
    }
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === 'br') {
      flushBuffer(child);
      child.remove();
      continue;
    }
    inlineBuffer.push(child);
  }
  flushBuffer(null);
}

/**
 * If a single <p> or <div> contains <br> separating multiple visual lines,
 * splits it into separate <p> elements (preserving existing alignment on untouched lines)
 * so alignment applies strictly to the selected line(s).
 */
function splitBlockOnBrIfMultiline(block: HTMLElement): void {
  const tag = block.tagName.toLowerCase();
  if (tag !== 'p' && tag !== 'div') return;
  if (hasBlockChildren(block)) return;

  const directBrs = Array.from(block.childNodes).filter(
    (n) => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName.toLowerCase() === 'br',
  );
  if (directBrs.length === 0) return;

  // Ignore a single trailing <br> used as an empty-line placeholder
  const nonEmptyNodes = Array.from(block.childNodes).filter((n) => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').length > 0;
    return true;
  });
  if (
    directBrs.length === 1 &&
    nonEmptyNodes[nonEmptyNodes.length - 1] === directBrs[0]
  ) {
    return;
  }

  const parent = block.parentNode;
  if (!parent) return;

  const existingAlign = block.style.textAlign;
  const groups: Node[][] = [[]];
  Array.from(block.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === 'br') {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(child);
    }
  });

  // Drop trailing empty group caused by a final <br>
  while (groups.length > 1 && groups[groups.length - 1].length === 0) {
    groups.pop();
  }
  if (groups.length <= 1) return;

  const frag = document.createDocumentFragment();
  groups.forEach((group) => {
    const p = document.createElement('p');
    if (existingAlign) p.style.textAlign = existingAlign;
    if (group.length === 0) {
      p.appendChild(document.createElement('br'));
    } else {
      group.forEach((n) => p.appendChild(n));
    }
    frag.appendChild(p);
  });

  parent.replaceChild(frag, block);
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return rgb.startsWith('#') ? rgb.toLowerCase() : '';
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return 'transparent';
  const hex = [m[1], m[2], m[3]]
    .map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

function matchFontFamilyValue(computedFamily: string): string {
  const lower = (computedFamily || '').toLowerCase();
  for (const f of FONT_FAMILIES) {
    if (f.matchKey && lower.includes(f.matchKey)) {
      return f.value;
    }
  }
  return 'inherit';
}

export const RichDocumentEditor: React.FC<RichDocumentEditorProps> = ({
  valueHtml,
  resetKey,
  title,
  subjectLabel,
  subtopic,
  tags,
  onChangeHtml,
  onImportTitle,
  onNotify,
  autoSaveIndicator,
  placeholder,
  documentBadge = 'Documento .docx',
  downloadPrefix = 'resumo',
  minEditorHeightClass = 'min-h-[420px]',
  defaultLayout = 'fluid',
  onBlurEditor,
  footerNote,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const docxInputRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const [tableHover, setTableHover] = useState<{ rows: number; cols: number }>({
    rows: 3,
    cols: 3,
  });
  const [lineHeight, setLineHeight] = useState<string>('1.6');
  const [pageLayout, setPageLayout] = useState<'a4' | 'fluid'>(defaultLayout);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>(DEFAULT_ACTIVE_FORMATS);
  const [busyDocx, setBusyDocx] = useState(false);
  const [isEmpty, setIsEmpty] = useState(() => !htmlToPlainText(valueHtml).trim());

  // Hydrate contentEditable ONLY when resetKey changes
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.textAlign = '';
    hydrateElementFromSafeHtml(el, valueHtml);
    setIsEmpty(!htmlToPlainText(valueHtml).trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Close popovers on outside click or Escape
  useEffect(() => {
    if (!openPopover) return;
    const onDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPopover(null);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openPopover]);

  // Escape exits fullscreen canvas
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !openPopover) {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, openPopover]);

  const stats = useMemo(() => {
    const plain = htmlToPlainText(valueHtml).trim();
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
    const chars = plain.length;
    const minutes = Math.max(1, Math.round(words / 200));
    return { words, chars, minutes };
  }, [valueHtml]);

  const fontSizeOptions = useMemo(() => {
    const current = activeFormats.fontSizePx;
    if (!current || BASE_FONT_SIZES.includes(current)) {
      return BASE_FONT_SIZES;
    }
    return [...BASE_FONT_SIZES, current].sort((a, b) => a - b);
  }, [activeFormats.fontSizePx]);

  const saveSelection = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = savedRangeRef.current;
    if (range && el.contains(range.commonAncestorContainer)) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, []);

  const focusEditorAtEnd = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    savedRangeRef.current = range.cloneRange();
  }, []);

  const refreshActiveFormats = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;

    saveSelection();

    const safeState = (cmd: string): boolean => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };

    const anchorEl: HTMLElement | null =
      sel.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (sel.anchorNode as HTMLElement)
        : sel.anchorNode?.parentElement || el;

    let blockTag = 'p';
    let alignBlock: HTMLElement | null = null;
    let inTable = false;

    let cursor: HTMLElement | null = anchorEl;
    while (cursor && cursor !== el) {
      const tag = cursor.tagName.toLowerCase();
      if (tag === 'table' || tag === 'td' || tag === 'th') {
        inTable = true;
      }
      if (!alignBlock && ALIGNABLE_LEAF_TAGS.has(tag)) {
        alignBlock = cursor;
      }
      if (
        blockTag === 'p' &&
        ['h1', 'h2', 'h3', 'h4', 'blockquote', 'p'].includes(tag)
      ) {
        blockTag = tag;
      }
      cursor = cursor.parentElement;
    }

    // Read real alignment from the active paragraph/block
    let align: AlignValue = 'left';
    const rawAlign =
      alignBlock?.style.textAlign ||
      (alignBlock ? window.getComputedStyle(alignBlock).textAlign : 'left');
    if (rawAlign === 'center') align = 'center';
    else if (rawAlign === 'right' || rawAlign === 'end') align = 'right';
    else if (rawAlign === 'justify') align = 'justify';
    else align = 'left';

    // Read real computed fontSize, fontFamily, textColor, highlightColor at the caret
    const inspectTarget = anchorEl && el.contains(anchorEl) ? anchorEl : el;
    const computed = window.getComputedStyle(inspectTarget);
    const parsedSize = Math.round(parseFloat(computed.fontSize || '15')) || 15;
    const matchedFamily = matchFontFamilyValue(computed.fontFamily);

    // Walk up from anchorEl to editorRef for explicit text color & background highlight
    let foundTextColor = '';
    let foundHighlight = 'transparent';
    let styleWalker: HTMLElement | null = inspectTarget;
    while (styleWalker && styleWalker !== el) {
      if (!foundTextColor && styleWalker.style.color) {
        foundTextColor = rgbToHex(styleWalker.style.color);
      }
      if (
        foundHighlight === 'transparent' &&
        (styleWalker.style.backgroundColor || styleWalker.tagName.toLowerCase() === 'mark')
      ) {
        const bg =
          styleWalker.style.backgroundColor ||
          window.getComputedStyle(styleWalker).backgroundColor;
        const hex = rgbToHex(bg);
        if (hex && hex !== 'transparent') {
          foundHighlight = hex;
        }
      }
      styleWalker = styleWalker.parentElement;
    }

    setActiveFormats({
      bold: safeState('bold'),
      italic: safeState('italic'),
      underline: safeState('underline'),
      strikeThrough: safeState('strikeThrough'),
      subscript: safeState('subscript'),
      superscript: safeState('superscript'),
      unorderedList: safeState('insertUnorderedList'),
      orderedList: safeState('insertOrderedList'),
      align,
      blockTag,
      fontSizePx: parsedSize,
      fontFamily: matchedFamily,
      textColor: foundTextColor,
      highlightColor: foundHighlight,
      inTable,
    });
  }, [saveSelection]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    // Never allow alignment styles to leak onto the root editor container
    if (el.style.textAlign) {
      el.style.textAlign = '';
    }
    const clean = serializeContainerHtml(el);
    setIsEmpty(!htmlToPlainText(clean).trim());
    onChangeHtml(clean);
    refreshActiveFormats();
  }, [onChangeHtml, refreshActiveFormats]);

  const ensureParagraphSeparator = useCallback(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // ignore unsupported browsers
    }
  }, []);

  const runCmd = useCallback(
    (command: string, value?: string) => {
      restoreSelection();
      ensureParagraphSeparator();
      try {
        document.execCommand('styleWithCSS', false, 'true');
      } catch {
        // ignore unsupported browser toggle
      }
      try {
        document.execCommand(command, false, value);
      } catch {
        // ignore unsupported command
      }
      emitChange();
    },
    [emitChange, ensureParagraphSeparator, restoreSelection],
  );

  /**
   * Paragraph/line-scoped alignment that NEVER aligns the entire document by accident.
   * Splits <br>-separated lines and bare root text into independent <p> blocks before applying text-align.
   */
  const applyAlignment = useCallback(
    (align: AlignValue) => {
      restoreSelection();
      const el = editorRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return;

      el.style.textAlign = '';

      let range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) {
        focusEditorAtEnd();
        if (sel.rangeCount === 0) return;
        range = sel.getRangeAt(0);
      }

      // If editor is empty, create a styled paragraph ready for typing
      if (!el.textContent?.trim() && el.children.length === 0) {
        const p = document.createElement('p');
        if (align !== 'left') p.style.textAlign = align;
        p.appendChild(document.createElement('br'));
        el.appendChild(p);
        const nextRange = document.createRange();
        nextRange.setStart(p, 0);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
        savedRangeRef.current = nextRange.cloneRange();
        emitChange();
        return;
      }

      // 1. Insert temporary selection bookmarks (end first so start offset stays valid)
      const isCollapsed = range.collapsed;
      const endBm = document.createElement('span');
      endBm.setAttribute('data-ce-bm', 'end');
      const startBm = document.createElement('span');
      startBm.setAttribute('data-ce-bm', 'start');

      if (!isCollapsed) {
        const endRange = range.cloneRange();
        endRange.collapse(false);
        endRange.insertNode(endBm);
      }
      const startRange = range.cloneRange();
      startRange.collapse(true);
      startRange.insertNode(startBm);

      // 2. Normalize any bare top-level text/inline nodes into <p>
      normalizeRootInlineNodes(el);

      // 3. Split any <p>/<div> containing <br> that holds a bookmark so only selected line(s) align
      const findNearestBlock = (node: Node | null): HTMLElement | null => {
        let cur: Node | null = node;
        while (cur && cur !== el) {
          if (
            cur.nodeType === Node.ELEMENT_NODE &&
            ALIGNABLE_LEAF_TAGS.has((cur as HTMLElement).tagName.toLowerCase()) &&
            !hasBlockChildren(cur as HTMLElement)
          ) {
            return cur as HTMLElement;
          }
          cur = cur.parentNode;
        }
        return null;
      };

      const startBlockPre = findNearestBlock(startBm);
      const endBlockPre = isCollapsed ? startBlockPre : findNearestBlock(endBm);
      if (startBlockPre) splitBlockOnBrIfMultiline(startBlockPre);
      if (endBlockPre && endBlockPre !== startBlockPre && el.contains(endBlockPre)) {
        splitBlockOnBrIfMultiline(endBlockPre);
      }

      // 4. Collect all leaf alignable blocks inside editorRef in document order
      const allLeafBlocks: HTMLElement[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
      let current = walker.nextNode();
      while (current) {
        const elem = current as HTMLElement;
        const tag = elem.tagName.toLowerCase();
        if (ALIGNABLE_LEAF_TAGS.has(tag) && !hasBlockChildren(elem)) {
          allLeafBlocks.push(elem);
        }
        current = walker.nextNode();
      }

      const startBlock = findNearestBlock(startBm);
      const endBlock = isCollapsed ? startBlock : findNearestBlock(endBm);

      let targetBlocks: HTMLElement[] = [];
      if (startBlock && endBlock) {
        const startIdx = allLeafBlocks.indexOf(startBlock);
        const endIdx = allLeafBlocks.indexOf(endBlock);
        if (startIdx !== -1 && endIdx !== -1) {
          const from = Math.min(startIdx, endIdx);
          const to = Math.max(startIdx, endIdx);
          targetBlocks = allLeafBlocks.slice(from, to + 1);
        } else {
          targetBlocks = startBlock === endBlock ? [startBlock] : [startBlock, endBlock];
        }
      } else if (startBlock) {
        targetBlocks = [startBlock];
      }

      // 5. Apply alignment ONLY to target blocks
      targetBlocks.forEach((blk) => {
        blk.style.textAlign = align === 'left' ? 'left' : align;
      });

      // 6. Restore selection from bookmarks and remove them
      const restored = document.createRange();
      if (startBm.parentNode) {
        restored.setStartAfter(startBm);
      }
      if (!isCollapsed && endBm.parentNode) {
        restored.setEndBefore(endBm);
      } else {
        restored.collapse(true);
      }
      startBm.remove();
      if (!isCollapsed) endBm.remove();

      sel.removeAllRanges();
      sel.addRange(restored);
      savedRangeRef.current = restored.cloneRange();

      emitChange();
    },
    [emitChange, focusEditorAtEnd, restoreSelection],
  );

  const applyBlockStyle = (tag: string) => {
    restoreSelection();
    ensureParagraphSeparator();
    const formatted = tag === 'p' ? 'P' : tag.toUpperCase();
    try {
      document.execCommand('formatBlock', false, `<${formatted}>`);
    } catch {
      try {
        document.execCommand('formatBlock', false, formatted);
      } catch {
        // ignore
      }
    }
    // When changing block heading level, clear conflicting explicit font-size spans directly on the heading
    // if the entire heading was toggled, so Heading 1/2/3 renders at its real semantic size immediately
    const el = editorRef.current;
    const sel = window.getSelection();
    if (el && sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      let cur: HTMLElement | null =
        sel.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (sel.anchorNode as HTMLElement)
          : sel.anchorNode?.parentElement || null;
      while (cur && cur !== el) {
        if (cur.tagName.toLowerCase() === tag) {
          cur.style.fontSize = '';
          break;
        }
        cur = cur.parentElement;
      }
    }
    emitChange();
  };

  /**
   * Accurate text-node-level inline style applicator.
   * Never wraps block elements (<p>, <h1>, <li>) inside <span> and properly overrides
   * any nested span styles so font size, font family, color, and highlight ALWAYS match what is chosen.
   */
  const applyInlineStyle = useCallback(
    (
      cssProp: 'fontSize' | 'fontFamily' | 'color' | 'backgroundColor',
      cssVal: string,
    ) => {
      restoreSelection();
      const el = editorRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return;

      let range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) {
        focusEditorAtEnd();
        if (sel.rangeCount === 0) return;
        range = sel.getRangeAt(0);
      }

      const isClearing = !cssVal || cssVal === 'inherit' || cssVal === 'transparent';
      const effectiveVal = isClearing ? '' : cssVal;

      if (range.collapsed) {
        // Insert a clean typing anchor span right at the caret with the exact desired style
        const span = document.createElement('span');
        if (effectiveVal) {
          span.style[cssProp] = effectiveVal;
        } else if (cssProp === 'fontSize') {
          span.style.fontSize = '15px';
        } else if (cssProp === 'backgroundColor') {
          span.style.backgroundColor = 'transparent';
        }
        const zws = document.createTextNode('\u200B');
        span.appendChild(zws);
        range.insertNode(span);

        const nextRange = document.createRange();
        nextRange.setStart(zws, 1);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
        savedRangeRef.current = nextRange.cloneRange();

        // Immediately sync toolbar state to the newly selected value
        setActiveFormats((prev) => ({
          ...prev,
          fontSizePx:
            cssProp === 'fontSize'
              ? parseInt(cssVal, 10) || prev.fontSizePx
              : prev.fontSizePx,
          fontFamily: cssProp === 'fontFamily' ? cssVal : prev.fontFamily,
          textColor: cssProp === 'color' ? effectiveVal : prev.textColor,
          highlightColor:
            cssProp === 'backgroundColor' ? cssVal || 'transparent' : prev.highlightColor,
        }));
        emitChange();
        return;
      }

      // Non-collapsed selection: gather all intersecting text nodes safely
      const intersectingTextNodes: Text[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (range.intersectsNode(node)) {
          intersectingTextNodes.push(node as Text);
        }
        node = walker.nextNode();
      }

      if (intersectingTextNodes.length === 0) {
        emitChange();
        return;
      }

      const startContainer = range.startContainer;
      const startOffset = range.startOffset;
      const endContainer = range.endContainer;
      const endOffset = range.endOffset;

      const styledNodes: Text[] = [];

      for (const rawTextNode of intersectingTextNodes) {
        let targetText: Text = rawTextNode;

        // If this text node is the end boundary, split off the unselected tail first
        if (targetText === endContainer && endOffset < targetText.data.length) {
          if (endOffset === 0) continue;
          targetText.splitText(endOffset);
        }

        // If this text node is the start boundary, split off the unselected head
        if (targetText === startContainer && startOffset > 0) {
          if (startOffset >= targetText.data.length) continue;
          targetText = targetText.splitText(startOffset);
        }

        // Skip pure structural whitespace between blocks
        if (!targetText.data || (!targetText.data.trim() && targetText.data.includes('\n'))) {
          continue;
        }

        const parentEl = targetText.parentElement;
        const canMutateParentSpan =
          parentEl &&
          parentEl !== el &&
          parentEl.tagName.toLowerCase() === 'span' &&
          parentEl.childNodes.length === 1;

        if (canMutateParentSpan) {
          parentEl.style[cssProp] = effectiveVal;
          // If clearing backgroundColor on a highlighted span, also restore dark-mode readable text color if it was forced
          if (cssProp === 'backgroundColor' && isClearing) {
            parentEl.style.backgroundColor = '';
          }
          // If parent span now has no style and no attributes, unwrap it
          if (!parentEl.getAttribute('style')?.trim() && parentEl.attributes.length <= 1) {
            parentEl.replaceWith(targetText);
          }
        } else {
          // If clearing a property that exists on an ancestor span/mark inside the editor, explicitly override it
          const wrapper = document.createElement('span');
          if (effectiveVal) {
            wrapper.style[cssProp] = effectiveVal;
          } else if (cssProp === 'backgroundColor') {
            wrapper.style.backgroundColor = 'transparent';
          } else if (cssProp === 'color') {
            wrapper.style.color = 'inherit';
          } else if (cssProp === 'fontFamily') {
            wrapper.style.fontFamily = 'inherit';
          } else if (cssProp === 'fontSize') {
            wrapper.style.fontSize = '15px';
          }
          targetText.parentNode?.insertBefore(wrapper, targetText);
          wrapper.appendChild(targetText);
        }

        styledNodes.push(targetText);
      }

      if (styledNodes.length > 0) {
        const nextRange = document.createRange();
        nextRange.setStart(styledNodes[0], 0);
        const last = styledNodes[styledNodes.length - 1];
        nextRange.setEnd(last, last.data.length);
        sel.removeAllRanges();
        sel.addRange(nextRange);
        savedRangeRef.current = nextRange.cloneRange();
      }

      emitChange();
    },
    [emitChange, focusEditorAtEnd, restoreSelection],
  );

  const stepFontSize = (delta: -1 | 1) => {
    const current = activeFormats.fontSizePx || 15;
    let next: number;
    if (delta > 0) {
      const higher = BASE_FONT_SIZES.find((s) => s > current);
      next = higher ?? Math.min(48, current + 2);
    } else {
      const lower = [...BASE_FONT_SIZES].reverse().find((s) => s < current);
      next = lower ?? Math.max(10, current - 1);
    }
    applyInlineStyle('fontSize', `${next}px`);
  };

  const handleClearFormatting = () => {
    restoreSelection();
    runCmd('removeFormat');
    // Also strip inline span styles inside the current selection cleanly
    const el = editorRef.current;
    const sel = window.getSelection();
    if (el && sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
      const range = sel.getRangeAt(0);
      el.querySelectorAll('span, mark').forEach((node) => {
        if (range.intersectsNode(node)) {
          const spanEl = node as HTMLElement;
          spanEl.removeAttribute('style');
        }
      });
    }
    emitChange();
  };

  const insertDomNodeAtCursor = useCallback(
    (node: Node, focusNode?: Node) => {
      restoreSelection();
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);
        const target = focusNode || node;
        const afterRange = document.createRange();
        if (focusNode) {
          afterRange.selectNodeContents(target);
          afterRange.collapse(false);
        } else {
          afterRange.setStartAfter(target);
          afterRange.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(afterRange);
        savedRangeRef.current = afterRange.cloneRange();
      } else {
        el.appendChild(node);
      }
      emitChange();
    },
    [emitChange, restoreSelection],
  );

  const handleInsertTable = (rows: number, cols: number) => {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headTr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      th.textContent = `Coluna ${c + 1}`;
      headTr.appendChild(th);
    }
    thead.appendChild(headTr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let r = 1; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        td.textContent = '\u00A0';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    const spacer = document.createElement('p');
    spacer.appendChild(document.createElement('br'));

    const frag = document.createDocumentFragment();
    frag.appendChild(table);
    frag.appendChild(spacer);
    insertDomNodeAtCursor(frag, table.querySelector('th') || undefined);
    setOpenPopover(null);
  };

  // Contextual table row/column operations
  const getActiveTableCell = (): { cell: HTMLTableCellElement; row: HTMLTableRowElement; table: HTMLTableElement } | null => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return null;
    let cur: Node | null = sel.anchorNode;
    let cell: HTMLTableCellElement | null = null;
    while (cur && cur !== el) {
      if (cur.nodeType === Node.ELEMENT_NODE) {
        const tag = (cur as HTMLElement).tagName.toLowerCase();
        if (tag === 'td' || tag === 'th') {
          cell = cur as HTMLTableCellElement;
          break;
        }
      }
      cur = cur.parentNode;
    }
    if (!cell) return null;
    const row = cell.closest('tr') as HTMLTableRowElement | null;
    const table = cell.closest('table') as HTMLTableElement | null;
    if (!row || !table) return null;
    return { cell, row, table };
  };

  const handleTableAction = (action: 'add-row' | 'del-row' | 'add-col' | 'del-col' | 'del-table') => {
    restoreSelection();
    const ctx = getActiveTableCell();
    if (!ctx) return;
    const { cell, row, table } = ctx;
    const colIdx = Array.from(row.children).indexOf(cell);

    if (action === 'del-table') {
      table.remove();
      emitChange();
      return;
    }

    if (action === 'add-row') {
      const cols = Math.max(1, row.children.length);
      const newTr = document.createElement('tr');
      for (let i = 0; i < cols; i++) {
        const td = document.createElement('td');
        td.textContent = '\u00A0';
        newTr.appendChild(td);
      }
      if (row.parentElement?.tagName.toLowerCase() === 'thead') {
        const tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
        tbody.insertBefore(newTr, tbody.firstChild);
      } else {
        row.parentNode?.insertBefore(newTr, row.nextSibling);
      }
      emitChange();
      return;
    }

    if (action === 'del-row') {
      const allRows = table.querySelectorAll('tr');
      if (allRows.length <= 1) {
        table.remove();
      } else {
        row.remove();
      }
      emitChange();
      return;
    }

    if (action === 'add-col') {
      table.querySelectorAll('tr').forEach((tr) => {
        const isHead = tr.parentElement?.tagName.toLowerCase() === 'thead';
        const newCell = document.createElement(isHead ? 'th' : 'td');
        newCell.textContent = isHead ? `Coluna ${tr.children.length + 1}` : '\u00A0';
        const refCell = tr.children[colIdx + 1] || null;
        tr.insertBefore(newCell, refCell);
      });
      emitChange();
      return;
    }

    if (action === 'del-col') {
      const colCount = row.children.length;
      if (colCount <= 1) {
        table.remove();
      } else {
        table.querySelectorAll('tr').forEach((tr) => {
          const target = tr.children[colIdx];
          if (target) target.remove();
        });
      }
      emitChange();
    }
  };

  const handleInsertCallout = (preset: (typeof CALLOUT_PRESETS)[number]) => {
    const bq = document.createElement('blockquote');
    bq.setAttribute('data-callout', preset.id);

    const pTitle = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = preset.title;
    pTitle.appendChild(strong);

    const pBody = document.createElement('p');
    pBody.textContent = preset.placeholder;

    bq.appendChild(pTitle);
    bq.appendChild(pBody);

    const spacer = document.createElement('p');
    spacer.appendChild(document.createElement('br'));

    const frag = document.createDocumentFragment();
    frag.appendChild(bq);
    frag.appendChild(spacer);

    insertDomNodeAtCursor(frag, pBody);
    setOpenPopover(null);
  };

  const handleInsertHr = () => {
    const hr = document.createElement('hr');
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    const frag = document.createDocumentFragment();
    frag.appendChild(hr);
    frag.appendChild(p);
    insertDomNodeAtCursor(frag, p);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const htmlData = e.clipboardData.getData('text/html');
    const textData = e.clipboardData.getData('text/plain');

    let safeToInsert = '';
    if (htmlData && htmlData.trim()) {
      safeToInsert = sanitizeDocHtml(htmlData);
    } else if (textData) {
      safeToInsert = markdownToInitialHtml(textData);
    }
    if (!safeToInsert) return;

    const parser = new DOMParser();
    const parsed = parser.parseFromString(safeToInsert, 'text/html');
    const frag = document.createDocumentFragment();
    const nodes = Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true));
    let lastInserted: Node | null = null;
    nodes.forEach((n) => {
      frag.appendChild(n);
      lastInserted = n;
    });

    const el = editorRef.current;
    const sel = window.getSelection();
    if (el && sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(frag);
      if (lastInserted) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(lastInserted);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
        savedRangeRef.current = nextRange.cloneRange();
      }
    } else if (el) {
      el.appendChild(frag);
    }
    emitChange();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    ensureParagraphSeparator();

    if (e.key === 'Tab') {
      e.preventDefault();
      // Navigate between cells when inside a table (Word / Google Docs behavior)
      const ctx = getActiveTableCell();
      if (ctx) {
        const cells = Array.from(ctx.table.querySelectorAll('th, td')) as HTMLTableCellElement[];
        const idx = cells.indexOf(ctx.cell);
        const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
        if (nextIdx >= 0 && nextIdx < cells.length) {
          const sel = window.getSelection();
          if (sel) {
            const r = document.createRange();
            r.selectNodeContents(cells[nextIdx]);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
            savedRangeRef.current = r.cloneRange();
            refreshActiveFormats();
          }
          return;
        }
        if (!e.shiftKey && nextIdx === cells.length) {
          handleTableAction('add-row');
          return;
        }
      }
      runCmd(e.shiftKey ? 'outdent' : 'indent');
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    const lower = e.key.toLowerCase();

    if (mod && !e.shiftKey && lower === 'b') {
      e.preventDefault();
      runCmd('bold');
    } else if (mod && !e.shiftKey && lower === 'i') {
      e.preventDefault();
      runCmd('italic');
    } else if (mod && !e.shiftKey && lower === 'u') {
      e.preventDefault();
      runCmd('underline');
    } else if (mod && e.shiftKey && lower === 'l') {
      e.preventDefault();
      applyAlignment('left');
    } else if (mod && e.shiftKey && lower === 'e') {
      e.preventDefault();
      applyAlignment('center');
    } else if (mod && e.shiftKey && lower === 'r') {
      e.preventDefault();
      applyAlignment('right');
    } else if (mod && e.shiftKey && lower === 'j') {
      e.preventDefault();
      applyAlignment('justify');
    }
  };

  const handleStructureLegalText = () => {
    const plain = htmlToPlainText(valueHtml).trim();
    if (!plain) return;
    const structured = formatCorrectionTextStructured(plain);
    const nextHtml = markdownToInitialHtml(structured);
    if (editorRef.current) {
      hydrateElementFromSafeHtml(editorRef.current, nextHtml);
    }
    setIsEmpty(false);
    onChangeHtml(nextHtml);
    onNotify?.('Documento estruturado com quebras de artigos, incisos e tópicos.');
  };

  const handleImportDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      onNotify?.('Arquivo .docx muito grande (limite de 15 MB).', true);
      return;
    }
    setBusyDocx(true);
    try {
      const imported = await importDocxFileToHtml(file);
      if (editorRef.current) {
        hydrateElementFromSafeHtml(editorRef.current, imported.html);
      }
      setIsEmpty(!htmlToPlainText(imported.html).trim());
      onChangeHtml(imported.html);
      if (!title.trim() && imported.title && onImportTitle) {
        onImportTitle(imported.title);
      }
      onNotify?.(`Arquivo "${file.name}" importado no editor com sucesso.`);
    } catch (err) {
      onNotify?.((err as Error).message || 'Não foi possível importar o arquivo .docx.', true);
    } finally {
      setBusyDocx(false);
    }
  };

  const handleDownloadDraftDocx = async () => {
    if (!htmlToPlainText(valueHtml).trim()) {
      onNotify?.('Escreva algum conteúdo no documento antes de baixar em .docx.', true);
      return;
    }
    setBusyDocx(true);
    try {
      const docTitle = title.trim() || 'Documento_sem_titulo';
      const blob = await buildDocxBlobFromHtml({
        title: docTitle,
        subject: subjectLabel,
        subtopic,
        tags,
        html: valueHtml,
      });
      const slug = cleanSafeName(docTitle, downloadPrefix).replace(/\s+/g, '_');
      triggerBlobDownload(blob, `${downloadPrefix}_${slug}_${localDateIso()}.docx`);
      onNotify?.(`Documento "${docTitle}.docx" baixado com sucesso.`);
    } catch (err) {
      onNotify?.((err as Error).message || 'Erro ao gerar arquivo .docx.', true);
    } finally {
      setBusyDocx(false);
    }
  };

  const tbBtn = (active?: boolean) =>
    `inline-flex items-center justify-center h-[30px] min-w-[30px] px-1.5 rounded-md border text-[11.5px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
      active
        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
        : 'border-transparent bg-transparent text-[var(--text)] hover:bg-[var(--panel-raised)] hover:border-[var(--line)]'
    }`;

  const divider = <span className="h-5 w-px bg-[var(--line)] mx-0.5 shrink-0" aria-hidden="true" />;

  const defaultPlaceholder =
    placeholder ||
    'Comece a digitar seu documento como no Word ou Google Docs... Use Títulos 1/2/3, alinhamento por parágrafo, tamanho real de fonte, marca-texto, tabelas comparativas e caixas de estudo.';

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-50 bg-[var(--bg)] flex flex-col p-3 sm:p-5 overflow-hidden'
          : 'rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] overflow-hidden flex flex-col'
      }
    >
      {/* Hidden .docx import input */}
      <input
        ref={docxInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => void handleImportDocx(e)}
        className="hidden"
      />

      {/* Formatting Ribbon (Word / Google Docs style) */}
      <div
        ref={toolbarRef}
        className="border-b border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 flex flex-col gap-1.5 shrink-0 select-none"
      >
        {/* Row 1: History, Paragraph Style, Font Family, Font Size (- / select / +), Inline, Colors, Clear */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd('undo')}
            className={tbBtn()}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Refazer (Ctrl+Y)"
            aria-label="Refazer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd('redo')}
            className={tbBtn()}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          {divider}

          <select
            aria-label="Estilo do parágrafo"
            title="Estilo do parágrafo (Títulos geram Sumário automático)"
            value={activeFormats.blockTag}
            onMouseDown={saveSelection}
            onChange={(e) => applyBlockStyle(e.target.value)}
            className="h-[30px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="p">Texto normal</option>
            <option value="h1">Título 1</option>
            <option value="h2">Título 2</option>
            <option value="h3">Título 3</option>
            <option value="blockquote">Citação</option>
          </select>

          <select
            aria-label="Família da fonte"
            title="Família da fonte"
            value={activeFormats.fontFamily}
            onMouseDown={saveSelection}
            onChange={(e) => applyInlineStyle('fontFamily', e.target.value)}
            className="h-[30px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer max-w-[138px]"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Controlled Font Size Group: [-] [15 px ▾] [+] */}
          <div className="inline-flex items-center rounded-md border border-[var(--line-strong)] bg-[var(--panel)] overflow-hidden h-[30px]">
            <button
              type="button"
              title="Diminuir tamanho da fonte"
              aria-label="Diminuir tamanho da fonte"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => stepFontSize(-1)}
              className="inline-flex items-center justify-center w-[24px] h-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <select
              aria-label="Tamanho da fonte"
              title="Tamanho real da fonte em pixels"
              value={`${activeFormats.fontSizePx}px`}
              onMouseDown={saveSelection}
              onChange={(e) => applyInlineStyle('fontSize', e.target.value)}
              className="h-full px-1.5 border-x border-[var(--line)] bg-transparent text-[11.5px] font-mono-num tabular-nums font-bold text-[var(--text)] focus:outline-none cursor-pointer"
            >
              {fontSizeOptions.map((px) => (
                <option key={px} value={`${px}px`}>
                  {px} px
                </option>
              ))}
            </select>
            <button
              type="button"
              title="Aumentar tamanho da fonte"
              aria-label="Aumentar tamanho da fonte"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => stepFontSize(1)}
              className="inline-flex items-center justify-center w-[24px] h-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {divider}

          <button
            type="button"
            title="Negrito (Ctrl+B)"
            aria-label="Negrito"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd('bold')}
            className={tbBtn(activeFormats.bold)}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Itálico (Ctrl+I)"
            aria-label="Itálico"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd('italic')}
            className={tbBtn(activeFormats.italic)}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Sublinhado (Ctrl+U)"
            aria-label="Sublinhado"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd('underline')}
            className={tbBtn(activeFormats.underline)}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Tachado"
            aria-label="Tachado"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd('strikeThrough')}
            className={tbBtn(activeFormats.strikeThrough)}
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Subscrito"
            aria-label="Subscrito"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd('subscript')}
            className={tbBtn(activeFormats.subscript)}
          >
            <Subscript className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Sobrescrito"
            aria-label="Sobrescrito"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd('superscript')}
            className={tbBtn(activeFormats.superscript)}
          >
            <Superscript className="w-3.5 h-3.5" />
          </button>

          {divider}

          {/* Text color picker with live color underline */}
          <div className="relative">
            <button
              type="button"
              title="Cor do texto"
              aria-label="Cor do texto"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => setOpenPopover((p) => (p === 'color' ? null : 'color'))}
              className={`${tbBtn(openPopover === 'color')} flex-col gap-0 px-2`}
            >
              <span className="text-[12px] font-extrabold leading-none">A</span>
              <span
                className="w-3.5 h-[3px] rounded-full mt-0.5"
                style={{ backgroundColor: activeFormats.textColor || 'var(--accent)' }}
              />
            </button>
            {openPopover === 'color' && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-[216px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-2.5 shadow-xl">
                <div className="text-[11px] font-bold text-[var(--muted)] mb-2">Cor do texto</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      title={c.label}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        applyInlineStyle('color', c.value);
                        setOpenPopover(null);
                      }}
                      className="h-6 rounded-md border border-[var(--line-strong)] flex items-center justify-center text-[10px] font-bold cursor-pointer hover:scale-105 transition-transform"
                      style={{
                        backgroundColor: c.value || 'var(--panel-soft)',
                        color: c.value ? '#ffffff' : 'var(--text)',
                      }}
                    >
                      {!c.value ? 'Auto' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Highlight / Marca-texto picker with live indicator */}
          <div className="relative">
            <button
              type="button"
              title="Cor do marca-texto"
              aria-label="Cor do marca-texto"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => setOpenPopover((p) => (p === 'highlight' ? null : 'highlight'))}
              className={`${tbBtn(openPopover === 'highlight')} gap-1.5 px-2`}
            >
              <span className="inline-flex flex-col items-center">
                <Highlighter className="w-3.5 h-3.5" />
                <span
                  className="w-3.5 h-[3px] rounded-full mt-0.5"
                  style={{
                    backgroundColor:
                      activeFormats.highlightColor !== 'transparent'
                        ? activeFormats.highlightColor
                        : '#facc15',
                  }}
                />
              </span>
              <span className="hidden sm:inline">Grifar</span>
            </button>
            {openPopover === 'highlight' && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-[216px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-2.5 shadow-xl">
                <div className="text-[11px] font-bold text-[var(--muted)] mb-2">
                  Marca-texto (Destaque)
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      title={c.label}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        applyInlineStyle('backgroundColor', c.value);
                        setOpenPopover(null);
                      }}
                      className="h-7 rounded-md border border-[var(--line-strong)] flex items-center justify-center text-[10px] font-bold cursor-pointer hover:scale-105 transition-transform"
                      style={{
                        backgroundColor:
                          c.value === 'transparent' ? 'var(--panel-soft)' : c.value,
                        color: '#0f172a',
                      }}
                    >
                      {c.value === 'transparent' ? 'Sem' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            title="Limpar formatação da seleção"
            aria-label="Limpar formatação"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClearFormatting}
            className={tbBtn()}
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Row 2: Scoped Alignment, Line Height, Lists, Indent, Table, Callouts, HR, .docx, Layout, Fullscreen */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-[var(--line)]/70">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              title="Alinhar parágrafo à esquerda (Ctrl+Shift+L)"
              aria-label="Alinhar à esquerda"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => applyAlignment('left')}
              className={tbBtn(activeFormats.align === 'left')}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Centralizar parágrafo selecionado (Ctrl+Shift+E)"
              aria-label="Centralizar"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => applyAlignment('center')}
              className={tbBtn(activeFormats.align === 'center')}
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Alinhar parágrafo à direita (Ctrl+Shift+R)"
              aria-label="Alinhar à direita"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => applyAlignment('right')}
              className={tbBtn(activeFormats.align === 'right')}
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Justificar parágrafo selecionado (Ctrl+Shift+J)"
              aria-label="Justificar texto"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => applyAlignment('justify')}
              className={tbBtn(activeFormats.align === 'justify')}
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>

            <select
              aria-label="Espaçamento entre linhas"
              title="Espaçamento entre linhas"
              value={lineHeight}
              onChange={(e) => setLineHeight(e.target.value)}
              className="h-[30px] px-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-mono-num font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              {LINE_HEIGHTS.map((lh) => (
                <option key={lh.value} value={lh.value}>
                  ↕ {lh.label}
                </option>
              ))}
            </select>

            {divider}

            <button
              type="button"
              title="Lista com marcadores"
              aria-label="Lista com marcadores"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('insertUnorderedList')}
              className={tbBtn(activeFormats.unorderedList)}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Lista numerada"
              aria-label="Lista numerada"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('insertOrderedList')}
              className={tbBtn(activeFormats.orderedList)}
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Diminuir recuo (Shift+Tab)"
              aria-label="Diminuir recuo"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('outdent')}
              className={tbBtn()}
            >
              <IndentDecrease className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Aumentar recuo (Tab)"
              aria-label="Aumentar recuo"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('indent')}
              className={tbBtn()}
            >
              <IndentIncrease className="w-3.5 h-3.5" />
            </button>

            {divider}

            {/* Table picker */}
            <div className="relative">
              <button
                type="button"
                title="Inserir tabela comparativa"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
                onClick={() => setOpenPopover((p) => (p === 'table' ? null : 'table'))}
                className={`${tbBtn(openPopover === 'table')} gap-1 px-2`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabela</span>
              </button>
              {openPopover === 'table' && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-[210px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-2.5 shadow-xl">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[var(--muted)] mb-2">
                    <span>Inserir tabela</span>
                    <span className="font-mono-num text-[var(--accent)]">
                      {tableHover.rows} × {tableHover.cols}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: 25 }).map((_, idx) => {
                      const r = Math.floor(idx / 5) + 1;
                      const c = (idx % 5) + 1;
                      const active = r <= tableHover.rows && c <= tableHover.cols;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onMouseEnter={() => setTableHover({ rows: r, cols: c })}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleInsertTable(Math.max(2, r), c)}
                          aria-label={`Tabela ${r} por ${c}`}
                          className={`h-6 rounded border cursor-pointer transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                              : 'border-[var(--line)] bg-[var(--panel-soft)]'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Study Callout boxes */}
            <div className="relative">
              <button
                type="button"
                title="Inserir caixa de estudo (Atenção, Prazo, Exceção, Dica)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
                onClick={() => setOpenPopover((p) => (p === 'callout' ? null : 'callout'))}
                className={`${tbBtn(openPopover === 'callout')} gap-1 px-2`}
              >
                <Quote className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="hidden sm:inline">Caixa de Estudo</span>
              </button>
              {openPopover === 'callout' && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-[235px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-1.5 shadow-xl flex flex-col gap-1">
                  {CALLOUT_PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleInsertCallout(preset)}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] font-bold text-[var(--text)] hover:bg-[var(--panel-soft)] cursor-pointer"
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${preset.accentClass}`} />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              title="Inserir linha divisória"
              aria-label="Inserir linha divisória"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleInsertHr}
              className={tbBtn()}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right tools: Legal Structurer, Import .docx, Download .docx, Fluid/A4, Fullscreen */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={isEmpty}
              onClick={handleStructureLegalText}
              title="Quebrar automaticamente artigos, parágrafos, incisos e alíneas"
              className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              <Wand2 className="w-3 h-3 text-[var(--accent)]" />
              <span>Estruturar</span>
            </button>

            <button
              type="button"
              disabled={busyDocx}
              onClick={() => docxInputRef.current?.click()}
              title="Importar um documento .docx do Word ou Google Docs"
              className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              <FileUp className="w-3 h-3 text-[var(--accent)]" />
              <span>Importar .docx</span>
            </button>

            <button
              type="button"
              disabled={busyDocx || isEmpty}
              onClick={() => void handleDownloadDraftDocx()}
              title="Baixar este documento em formato Word (.docx)"
              className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-3 h-3 text-[var(--accent)]" />
              <span>Baixar .docx</span>
            </button>

            <button
              type="button"
              onClick={() => setPageLayout((prev) => (prev === 'a4' ? 'fluid' : 'a4'))}
              title="Alternar entre largura total e folha A4 centralizada"
              className="inline-flex items-center h-[30px] px-2.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              {pageLayout === 'fluid' ? 'Largura Total' : 'Folha A4'}
            </button>

            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Sair da tela cheia (Esc)' : 'Expandir editor em tela cheia'}
              aria-label={fullscreen ? 'Sair da tela cheia' : 'Expandir editor em tela cheia'}
              className="inline-flex items-center justify-center h-[30px] w-[30px] rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              {fullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Contextual Table Bar: visible only when caret is inside a table */}
        {activeFormats.inTable && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--line)]/70 text-[11px]">
            <span className="font-bold text-[var(--accent)] mr-1">Tabela ativa:</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleTableAction('add-row')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line-strong)] bg-[var(--panel)] font-semibold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              <Rows3 className="w-3 h-3 text-[var(--good)]" />
              <span>+ Linha</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleTableAction('add-col')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line-strong)] bg-[var(--panel)] font-semibold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              <Columns3 className="w-3 h-3 text-[var(--good)]" />
              <span>+ Coluna</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleTableAction('del-row')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line)] bg-[var(--panel)] font-semibold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/50 cursor-pointer"
            >
              <span>− Linha</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleTableAction('del-col')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line)] bg-[var(--panel)] font-semibold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/50 cursor-pointer"
            >
              <span>− Coluna</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleTableAction('del-table')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--bad)]/35 bg-[var(--bad)]/10 font-semibold text-[var(--bad)] hover:bg-[var(--bad)] hover:text-white cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Excluir tabela</span>
            </button>
          </div>
        )}
      </div>

      {/* Full-Frame Spacious Document Workspace */}
      <div
        className={`overflow-y-auto flex flex-col ${
          pageLayout === 'a4'
            ? 'bg-[var(--bg)]/60 px-3 py-4 sm:px-6 sm:py-6'
            : 'bg-[var(--panel)]'
        } ${fullscreen ? 'flex-1 min-h-0' : 'max-h-[760px]'}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            focusEditorAtEnd();
          }
        }}
      >
        <div
          className={`relative flex flex-col flex-1 transition-all ${
            pageLayout === 'a4'
              ? 'mx-auto w-full max-w-[860px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] shadow-sm px-6 py-6 sm:px-10 sm:py-8'
              : 'w-full px-5 py-4 sm:px-7 sm:py-5'
          } ${fullscreen ? 'min-h-[calc(100vh-195px)]' : minEditorHeightClass}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              focusEditorAtEnd();
            }
          }}
        >
          {/* Clean inline document header bar */}
          <div className="mb-3 pb-2 border-b border-[var(--line)] flex flex-wrap items-baseline justify-between gap-2 text-[11.5px] text-[var(--muted)] shrink-0">
            <span className="font-bold text-[var(--accent)] truncate">
              {subjectLabel}
              {subtopic ? ` · ${subtopic}` : ''}
            </span>
            <span className="font-mono-num shrink-0">{documentBadge}</span>
          </div>

          <div className="relative flex-1 flex flex-col">
            {isEmpty && (
              <div className="pointer-events-none select-none absolute inset-x-0 top-1 text-[14.5px] text-[var(--muted)]/65 leading-relaxed">
                {defaultPlaceholder}
              </div>
            )}

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={`Editor de documento: ${subjectLabel}`}
              onFocus={ensureParagraphSeparator}
              onBlur={() => {
                saveSelection();
                onBlurEditor?.();
              }}
              onInput={emitChange}
              onKeyUp={refreshActiveFormats}
              onMouseUp={refreshActiveFormats}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              style={{ lineHeight }}
              className="flex-1 w-full min-h-[300px] text-[15px] text-[var(--text)] focus:outline-none break-words [&_h1]:text-[24px] [&_h1]:leading-snug [&_h1]:font-extrabold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:pb-1 [&_h1]:border-b [&_h1]:border-[var(--line)] [&_h2]:text-[20px] [&_h2]:leading-snug [&_h2]:font-extrabold [&_h2]:text-[var(--accent)] [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h3]:text-[17px] [&_h3]:leading-snug [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_blockquote]:my-3 [&_blockquote]:rounded-lg [&_blockquote]:border [&_blockquote]:border-[var(--line-strong)] [&_blockquote]:bg-[var(--panel-soft)] [&_blockquote]:px-4 [&_blockquote]:py-2.5 [&_blockquote[data-callout='atencao']]:border-[var(--warning)]/50 [&_blockquote[data-callout='atencao']]:bg-[var(--warning)]/10 [&_blockquote[data-callout='prazo']]:border-[var(--accent)]/50 [&_blockquote[data-callout='prazo']]:bg-[var(--accent-soft)]/70 [&_blockquote[data-callout='excecao']]:border-[var(--bad)]/45 [&_blockquote[data-callout='excecao']]:bg-[var(--bad)]/10 [&_blockquote[data-callout='dica']]:border-[var(--good)]/45 [&_blockquote[data-callout='dica']]:bg-[var(--good)]/10 [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_th]:border [&_th]:border-[var(--line-strong)] [&_th]:bg-[var(--panel-soft)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_td]:border [&_td]:border-[var(--line-strong)] [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_hr]:my-4 [&_hr]:border-[var(--line-strong)]"
            />
          </div>
        </div>
      </div>

      {/* Status Footer */}
      <div className="border-t border-[var(--line)] bg-[var(--panel-soft)] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)] shrink-0 tabular-nums">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span>
            <strong className="text-[var(--text)]">{stats.words}</strong> palavra(s)
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="text-[var(--text)]">{stats.chars}</strong> caractere(s)
          </span>
          <span aria-hidden="true">·</span>
          <span>~{stats.minutes} min de leitura</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-num">{activeFormats.fontSizePx} px</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {autoSaveIndicator || (
            <span>{footerNote || `Salvo por matéria (${subjectLabel}) em formato .docx`}</span>
          )}
          {fullscreen && (
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="px-2.5 py-1 rounded bg-[var(--accent)] text-white font-bold cursor-pointer"
            >
              Concluir tela cheia
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
