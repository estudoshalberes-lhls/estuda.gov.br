import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Clock,
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
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Scale,
  Strikethrough,
  Subscript,
  Superscript,
  Table as TableIcon,
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

interface RichDocumentEditorProps {
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
}

const FONT_FAMILIES = [
  { label: 'Padrão (Sans)', value: 'inherit' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri / Inter', value: 'Calibri, Inter, sans-serif' },
  { label: 'Georgia (Serif)', value: 'Georgia, Cambria, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Monospace', value: '"JetBrains Mono", Consolas, monospace' },
];

const FONT_SIZES = [
  { label: '11 px', value: '11px' },
  { label: '12 px', value: '12px' },
  { label: '14 px', value: '14px' },
  { label: '15 px', value: '15px' },
  { label: '16 px', value: '16px' },
  { label: '18 px', value: '18px' },
  { label: '20 px', value: '20px' },
  { label: '24 px', value: '24px' },
];

const LINE_HEIGHTS = [
  { label: '1.15 (Compacto)', value: '1.15' },
  { label: '1.50 (Padrão)', value: '1.5' },
  { label: '1.75 (Confortável)', value: '1.75' },
  { label: '2.00 (Duplo)', value: '2' },
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

interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  subscript: boolean;
  superscript: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  blockTag: string;
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
};

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
  const serializer = new XMLSerializer();
  // Use innerHTML on detached clone only after reading, then pass through strict sanitizeDocHtml
  const raw = Array.from(clone.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType === Node.ELEMENT_NODE) {
        return serializer.serializeToString(node).replace(/\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
      }
      return '';
    })
    .join('');
  return sanitizeDocHtml(raw);
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
  const [lineHeight, setLineHeight] = useState<string>('1.65');
  const [pageLayout, setPageLayout] = useState<'a4' | 'fluid'>('a4');
  const [fullscreen, setFullscreen] = useState(false);
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>(DEFAULT_ACTIVE_FORMATS);
  const [busyDocx, setBusyDocx] = useState(false);
  const [isEmpty, setIsEmpty] = useState(() => !htmlToPlainText(valueHtml).trim());

  // Hydrate contentEditable ONLY when resetKey changes (load note for editing, clear after save, import .docx, legal structurer)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
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

    let blockTag = 'p';
    let node: Node | null = sel.anchorNode;
    while (node && node !== el) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as HTMLElement).tagName.toLowerCase();
        if (['h1', 'h2', 'h3', 'h4', 'blockquote', 'p', 'div'].includes(tag)) {
          blockTag = tag === 'div' ? 'p' : tag;
          break;
        }
      }
      node = node.parentNode;
    }

    const align: ActiveFormats['align'] = safeState('justifyCenter')
      ? 'center'
      : safeState('justifyRight')
        ? 'right'
        : safeState('justifyFull')
          ? 'justify'
          : 'left';

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
    });
  }, [saveSelection]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const clean = serializeContainerHtml(el);
    setIsEmpty(!htmlToPlainText(clean).trim());
    onChangeHtml(clean);
    refreshActiveFormats();
  }, [onChangeHtml, refreshActiveFormats]);

  const runCmd = useCallback(
    (command: string, value?: string) => {
      restoreSelection();
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
    [emitChange, restoreSelection],
  );

  const applyBlockStyle = (tag: string) => {
    restoreSelection();
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
    emitChange();
  };

  const applyInlineSpanStyle = (cssProp: 'fontSize' | 'fontFamily' | 'color' | 'backgroundColor', cssVal: string) => {
    restoreSelection();
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    if (range.collapsed) {
      // Apply to nearest block or insert styled zero-width span for upcoming typing
      const span = document.createElement('span');
      if (cssVal && cssVal !== 'inherit' && cssVal !== 'transparent') {
        span.style[cssProp] = cssVal;
      }
      span.appendChild(document.createTextNode('\u200B'));
      range.insertNode(span);
      const nextRange = document.createRange();
      nextRange.setStart(span.firstChild!, 1);
      nextRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nextRange);
      savedRangeRef.current = nextRange.cloneRange();
      emitChange();
      return;
    }

    // Wrap selected content safely via DOM extraction
    const span = document.createElement('span');
    if (cssVal && cssVal !== 'inherit' && cssVal !== 'transparent') {
      span.style[cssProp] = cssVal;
    }
    try {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(nextRange);
      savedRangeRef.current = nextRange.cloneRange();
    } catch {
      // Fallback to execCommand for cross-block selections
      if (cssProp === 'color' && cssVal) {
        document.execCommand('foreColor', false, cssVal);
      } else if (cssProp === 'backgroundColor') {
        document.execCommand('hiliteColor', false, cssVal || 'transparent');
      } else if (cssProp === 'fontFamily' && cssVal) {
        document.execCommand('fontName', false, cssVal);
      }
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
    if (e.key === 'Tab') {
      e.preventDefault();
      runCmd(e.shiftKey ? 'outdent' : 'indent');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      runCmd('bold');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      runCmd('italic');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      runCmd('underline');
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
      const docTitle = title.trim() || 'Resumo_sem_titulo';
      const blob = await buildDocxBlobFromHtml({
        title: docTitle,
        subject: subjectLabel,
        subtopic,
        tags,
        html: valueHtml,
      });
      const slug = cleanSafeName(docTitle, 'resumo').replace(/\s+/g, '_');
      triggerBlobDownload(blob, `resumo_${slug}_${localDateIso()}.docx`);
      onNotify?.(`Documento "${docTitle}.docx" baixado com sucesso.`);
    } catch (err) {
      onNotify?.((err as Error).message || 'Erro ao gerar arquivo .docx.', true);
    } finally {
      setBusyDocx(false);
    }
  };

  const tbBtn = (active?: boolean) =>
    `inline-flex items-center justify-center h-[28px] min-w-[28px] px-1.5 rounded-md border text-[11.5px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
      active
        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
        : 'border-transparent bg-transparent text-[var(--text)] hover:bg-[var(--panel-raised)] hover:border-[var(--line)]'
    }`;

  const divider = <span className="h-5 w-px bg-[var(--line)] mx-0.5 shrink-0" aria-hidden="true" />;

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

      {/* Word / Google Docs style 2-row formatting ribbon */}
      <div
        ref={toolbarRef}
        className="border-b border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-2 flex flex-col gap-1.5 shrink-0 select-none"
      >
        {/* Row 1: History, Paragraph Style, Font, Size, Inline Formatting, Colors */}
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
            title="Estilo do texto (Títulos geram Sumário automático)"
            value={activeFormats.blockTag}
            onMouseDown={saveSelection}
            onChange={(e) => applyBlockStyle(e.target.value)}
            className="h-[28px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="p">Texto normal</option>
            <option value="h1">Título 1</option>
            <option value="h2">Título 2</option>
            <option value="h3">Título 3</option>
            <option value="blockquote">Citação</option>
          </select>

          <select
            aria-label="Família da fonte"
            title="Fonte"
            defaultValue="inherit"
            onMouseDown={saveSelection}
            onChange={(e) => applyInlineSpanStyle('fontFamily', e.target.value)}
            className="h-[28px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer max-w-[135px]"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Tamanho da fonte"
            title="Tamanho da fonte"
            defaultValue="15px"
            onMouseDown={saveSelection}
            onChange={(e) => applyInlineSpanStyle('fontSize', e.target.value)}
            className="h-[28px] px-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            {FONT_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

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

          {/* Text color picker */}
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
              className={tbBtn(openPopover === 'color')}
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            {openPopover === 'color' && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-[210px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-2.5 shadow-xl">
                <div className="text-[11px] font-bold text-[var(--muted)] mb-2">Cor do texto</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      title={c.label}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (!c.value) {
                          runCmd('removeFormat');
                        } else {
                          applyInlineSpanStyle('color', c.value);
                        }
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

          {/* Highlight / Marca-texto picker */}
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
              className={`${tbBtn(openPopover === 'highlight')} gap-1 px-2`}
            >
              <Highlighter className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">Grifar</span>
            </button>
            {openPopover === 'highlight' && (
              <div className="absolute left-0 top-full mt-1.5 z-40 w-[210px] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-2.5 shadow-xl">
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
                        applyInlineSpanStyle('backgroundColor', c.value);
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
        </div>

        {/* Row 2: Alignment, Lists, Indent, Table, Callouts, HR, Clear, .docx Import/Export, Fullscreen */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-[var(--line)]/70">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              title="Alinhar à esquerda"
              aria-label="Alinhar à esquerda"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('justifyLeft')}
              className={tbBtn(activeFormats.align === 'left')}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Centralizar"
              aria-label="Centralizar"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('justifyCenter')}
              className={tbBtn(activeFormats.align === 'center')}
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Alinhar à direita"
              aria-label="Alinhar à direita"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('justifyRight')}
              className={tbBtn(activeFormats.align === 'right')}
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Justificar texto"
              aria-label="Justificar texto"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('justifyFull')}
              className={tbBtn(activeFormats.align === 'justify')}
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>

            <select
              aria-label="Espaçamento entre linhas"
              title="Espaçamento entre linhas"
              value={lineHeight}
              onChange={(e) => setLineHeight(e.target.value)}
              className="h-[28px] px-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-semibold text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              {LINE_HEIGHTS.map((lh) => (
                <option key={lh.value} value={lh.value}>
                  {lh.label}
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
            <button
              type="button"
              title="Limpar formatação da seleção"
              aria-label="Limpar formatação"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCmd('removeFormat')}
              className={tbBtn()}
            >
              <RemoveFormatting className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right tools: Legal Structurer, Import .docx, Download .docx, A4/Fluid, Fullscreen */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={isEmpty}
              onClick={handleStructureLegalText}
              title="Quebrar automaticamente artigos, parágrafos, incisos e alíneas"
              className="inline-flex items-center gap-1 h-[28px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              <Wand2 className="w-3 h-3 text-[var(--accent)]" />
              Estruturar
            </button>

            <button
              type="button"
              disabled={busyDocx}
              onClick={() => docxInputRef.current?.click()}
              title="Importar um documento .docx do Word ou Google Docs"
              className="inline-flex items-center gap-1 h-[28px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              <FileUp className="w-3 h-3 text-[var(--accent)]" />
              Importar .docx
            </button>

            <button
              type="button"
              disabled={busyDocx || isEmpty}
              onClick={() => void handleDownloadDraftDocx()}
              title="Baixar este documento em formato Word (.docx)"
              className="inline-flex items-center gap-1 h-[28px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-3 h-3 text-[var(--accent)]" />
              Baixar .docx
            </button>

            <button
              type="button"
              onClick={() => setPageLayout((prev) => (prev === 'a4' ? 'fluid' : 'a4'))}
              title="Alternar entre folha A4 centralizada e largura total"
              className="inline-flex items-center h-[28px] px-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              {pageLayout === 'a4' ? 'Folha A4' : 'Largura Total'}
            </button>

            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              title={fullscreen ? 'Sair da tela cheia (Esc)' : 'Expandir editor em tela cheia'}
              aria-label={fullscreen ? 'Sair da tela cheia' : 'Expandir editor em tela cheia'}
              className="inline-flex items-center justify-center h-[28px] w-[28px] rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
            >
              {fullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Document Workspace (Page canvas similar to Word / Google Docs) */}
      <div
        className={`bg-[var(--bg)]/60 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 ${
          fullscreen ? 'flex-1 min-h-0' : 'max-h-[560px]'
        }`}
        onClick={(e) => {
          if (e.target === e.currentTarget && editorRef.current) {
            editorRef.current.focus();
          }
        }}
      >
        <div
          className={`relative mx-auto rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] shadow-sm transition-all ${
            pageLayout === 'a4' ? 'max-w-[820px] px-6 py-7 sm:px-11 sm:py-9' : 'w-full px-5 py-6'
          } ${fullscreen ? 'min-h-[calc(100vh-210px)]' : 'min-h-[320px]'}`}
        >
          {/* Subtle document header inside the A4 sheet */}
          <div className="mb-4 pb-2.5 border-b border-[var(--line)] flex flex-wrap items-baseline justify-between gap-2 text-[11.5px] text-[var(--muted)]">
            <span className="font-bold text-[var(--accent)]">
              {subjectLabel}
              {subtopic ? ` · ${subtopic}` : ''}
            </span>
            <span className="font-mono-num">Documento .docx</span>
          </div>

          {isEmpty && (
            <div className="pointer-events-none select-none absolute left-6 sm:left-11 top-[78px] sm:top-[86px] right-6 text-[14px] text-[var(--muted)]/70 leading-relaxed">
              Comece a digitar seu resumo como no Word ou Google Docs... Use Títulos 1/2/3 para
              gerar o Sumário automático no Modo Leitura, aplique marca-texto, tabelas comparativas
              e caixas de estudo, ou importe um arquivo .docx pronto.
            </div>
          )}

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Editor de documento do resumo"
            onInput={emitChange}
            onKeyUp={refreshActiveFormats}
            onMouseUp={refreshActiveFormats}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            style={{ lineHeight }}
            className="min-h-[260px] text-[15px] text-[var(--text)] focus:outline-none break-words [&_h1]:text-[1.45em] [&_h1]:font-extrabold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:pb-1 [&_h1]:border-b [&_h1]:border-[var(--line)] [&_h2]:text-[1.22em] [&_h2]:font-extrabold [&_h2]:text-[var(--accent)] [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h3]:text-[1.08em] [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1 [&_blockquote]:my-3 [&_blockquote]:rounded-lg [&_blockquote]:border [&_blockquote]:border-[var(--line-strong)] [&_blockquote]:bg-[var(--panel-soft)] [&_blockquote]:px-3.5 [&_blockquote]:py-2.5 [&_blockquote[data-callout='atencao']]:border-[var(--warning)]/50 [&_blockquote[data-callout='atencao']]:bg-[var(--warning)]/10 [&_blockquote[data-callout='prazo']]:border-[var(--accent)]/50 [&_blockquote[data-callout='prazo']]:bg-[var(--accent-soft)]/70 [&_blockquote[data-callout='excecao']]:border-[var(--bad)]/45 [&_blockquote[data-callout='excecao']]:bg-[var(--bad)]/10 [&_blockquote[data-callout='dica']]:border-[var(--good)]/45 [&_blockquote[data-callout='dica']]:bg-[var(--good)]/10 [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_th]:border [&_th]:border-[var(--line-strong)] [&_th]:bg-[var(--panel-soft)] [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-bold [&_td]:border [&_td]:border-[var(--line-strong)] [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_hr]:my-4 [&_hr]:border-[var(--line-strong)]"
          />
        </div>
      </div>

      {/* Status Footer */}
      <div className="border-t border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)] shrink-0 tabular-nums">
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
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {autoSaveIndicator || (
            <span>Salvo por matéria ({subjectLabel}) em formato .docx</span>
          )}
          {fullscreen && (
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="px-2 py-0.5 rounded bg-[var(--accent)] text-white font-bold cursor-pointer"
            >
              Concluir tela cheia
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
