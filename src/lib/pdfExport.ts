import { jsPDF } from 'jspdf';
import {
  CompletedGoal,
  ContestEditalPoint,
  ContestItem,
  ErrorNotebookEntry,
  HighlightColorKey,
  IncompleteGoal,
  LawFolderData,
  LawHighlight,
  LawItem,
} from '../types/study';
import {
  WEEKDAYS,
  cleanSafeName,
  formatIsoDateBr,
  formatScheduleDuration,
  formatSequentialDeviceLabel,
  itemMatchesMultiArticleSpec,
  localDateBrazilian,
  localDateIso,
  localDateTimeBrazilian,
  normalizeSearch,
  parseMultiArticleSpec,
  scheduleDurationSeconds,
  visibleName,
} from './parsers';
import { LegalBlockKind, normalizePdfLegalText, segmentLegalText } from './legalTextFormatter';
import type { CapturedD3Chart } from './d3SvgCapture';
import { htmlToPlainText } from './richDocUtils';

export const HIGHLIGHT_COLOR_RGB: Record<
  HighlightColorKey,
  { label: string; bg: string; fg: string; rgb: [number, number, number] }
> = {
  yellow: { label: 'Amarelo', bg: '#f7d64a', fg: '#221e0d', rgb: [247, 214, 74] },
  green: { label: 'Verde', bg: '#a7e0b5', fg: '#12351d', rgb: [167, 224, 181] },
  blue: { label: 'Azul', bg: '#a8d1ff', fg: '#153252', rgb: [168, 209, 255] },
  pink: { label: 'Rosa', bg: '#f5b5d7', fg: '#4b2038', rgb: [245, 181, 215] },
  orange: { label: 'Laranja', bg: '#ffc18a', fg: '#4b2b13', rgb: [255, 193, 138] },
};

const GRADE_RGB: Record<string, { fill: [number, number, number]; text: [number, number, number] }> = {
  'Muito Alto': { fill: [220, 38, 38], text: [255, 255, 255] },
  Alto: { fill: [250, 204, 21], text: [66, 32, 6] },
  Médio: { fill: [22, 163, 74], text: [255, 255, 255] },
  Baixo: { fill: [255, 255, 255], text: [23, 23, 23] },
  'Não Classificado': { fill: [229, 231, 235], text: [55, 65, 81] },
};

function safePdfText(value: unknown): string {
  return String(value ?? '').replace(/\u2013|\u2014/g, '-').replace(/\u00a0/g, ' ');
}

export interface TextSegment {
  text: string;
  color?: HighlightColorKey;
  highlightId?: string;
}

export function buildHighlightedSegments(
  source: string,
  highlights: LawHighlight[],
  options?: { itemId?: string },
): TextSegment[] {
  if (!source || !highlights.length) return [{ text: source }];

  const cleanSource = safePdfText(source);
  const ranges: Array<{ start: number; end: number; color: HighlightColorKey; highlightId?: string }> = [];

  highlights.forEach((h) => {
    if (h.itemId && options?.itemId && h.itemId !== options.itemId) {
      return;
    }

    if (
      typeof h.startOffset === 'number' &&
      typeof h.endOffset === 'number' &&
      h.endOffset > h.startOffset &&
      h.startOffset >= 0 &&
      h.endOffset <= cleanSource.length &&
      (!h.itemId || !options?.itemId || h.itemId === options.itemId)
    ) {
      const slice = cleanSource.slice(h.startOffset, h.endOffset);
      const rawNeedle = safePdfText(h.text).trim();
      if (!rawNeedle || safePdfText(slice).toLowerCase().includes(rawNeedle.toLowerCase())) {
        ranges.push({
          start: h.startOffset,
          end: h.endOffset,
          color: h.color,
          highlightId: h.id,
        });
        return;
      }
    }

    const rawNeedle = safePdfText(h.text).trim();
    if (!rawNeedle) return;

    let found = false;
    try {
      const escaped = rawNeedle
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+');
      const reg = new RegExp(escaped, 'gi');
      let m: RegExpExecArray | null;
      while ((m = reg.exec(cleanSource)) !== null) {
        found = true;
        ranges.push({
          start: m.index,
          end: m.index + m[0].length,
          color: h.color,
          highlightId: h.id,
        });
        if (m.index === reg.lastIndex) reg.lastIndex++;
      }
    } catch {
      found = false;
    }

    if (!found) {
      let idx = cleanSource.indexOf(rawNeedle);
      while (idx !== -1) {
        ranges.push({
          start: idx,
          end: idx + rawNeedle.length,
          color: h.color,
          highlightId: h.id,
        });
        idx = cleanSource.indexOf(rawNeedle, idx + rawNeedle.length);
      }
    }
  });

  if (!ranges.length) return [{ text: source }];

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number; color: HighlightColorKey; highlightId?: string }> = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue;
    merged.push(r);
    cursor = r.end;
  }

  const result: TextSegment[] = [];
  let pos = 0;
  for (const m of merged) {
    if (m.start > pos) {
      result.push({ text: cleanSource.slice(pos, m.start) });
    }
    result.push({
      text: cleanSource.slice(m.start, m.end),
      color: m.color,
      highlightId: m.highlightId,
    });
    pos = m.end;
  }
  if (pos < cleanSource.length) {
    result.push({ text: cleanSource.slice(pos) });
  }
  return result;
}

function createDoc(): {
  doc: jsPDF;
  margin: number;
  pageWidth: number;
  pageHeight: number;
  maxWidth: number;
  y: number;
  ensureSpace: (height: number) => void;
  writeWrapped: (text: string, lineHeight?: number) => void;
} {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const state = {
    doc,
    margin,
    pageWidth,
    pageHeight,
    maxWidth,
    y: 18,
    ensureSpace(height: number) {
      if (state.y + height > pageHeight - 15) {
        doc.addPage();
        state.y = 18;
      }
    },
    writeWrapped(text: string, lineHeight = 5.5) {
      const lines = doc.splitTextToSize(safePdfText(text), maxWidth) as string[];
      for (const line of lines) {
        state.ensureSpace(lineHeight + 1);
        doc.text(line, margin, state.y);
        state.y += lineHeight;
      }
    },
  };
  return state;
}

function writeHighlightedContinuousText(
  ctx: ReturnType<typeof createDoc>,
  source: string,
  highlights: LawHighlight[],
  fontSize = 9.5,
  lineHeight = 5.6,
): void {
  const { doc, margin, maxWidth } = ctx;
  const segments = buildHighlightedSegments(source, highlights);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  const bgHeight = 4.8;
  const bgOffsetY = 3.6;
  let cursorX = margin;

  for (const seg of segments) {
    const palette = seg.color ? (HIGHLIGHT_COLOR_RGB[seg.color] || HIGHLIGHT_COLOR_RGB.yellow) : null;
    const lines = seg.text.split('\n');

    lines.forEach((lineText, lineIdx) => {
      if (lineIdx > 0) {
        cursorX = margin;
        ctx.y += lineHeight;
        ctx.ensureSpace(lineHeight);
      }

      if (!lineText) {
        if (lineIdx > 0) {
          ctx.y += lineHeight * 0.4;
          ctx.ensureSpace(lineHeight);
        }
        return;
      }

      const tokens = lineText.match(/\S+|\s+/g) || [];
      for (const token of tokens) {
        const isWhitespace = /^\s+$/.test(token);
        const tokenWidth = doc.getTextWidth(token);

        if (isWhitespace) {
          if (cursorX === margin) {
            cursorX += tokenWidth;
          } else if (cursorX + tokenWidth > margin + maxWidth) {
            cursorX = margin;
            ctx.y += lineHeight;
            ctx.ensureSpace(lineHeight);
          } else {
            if (palette) {
              doc.setFillColor(...palette.rgb);
              doc.rect(cursorX, ctx.y - bgOffsetY, tokenWidth + 0.1, bgHeight, 'F');
            }
            cursorX += tokenWidth;
          }
        } else {
          if (cursorX + tokenWidth > margin + maxWidth && cursorX > margin) {
            cursorX = margin;
            ctx.y += lineHeight;
            ctx.ensureSpace(lineHeight);
          }

          if (tokenWidth > maxWidth) {
            const subTokens = doc.splitTextToSize(token, maxWidth) as string[];
            subTokens.forEach((st, sIdx) => {
              if (sIdx > 0) {
                cursorX = margin;
                ctx.y += lineHeight;
                ctx.ensureSpace(lineHeight);
              }
              const sw = doc.getTextWidth(st);
              if (palette) {
                doc.setFillColor(...palette.rgb);
                doc.rect(cursorX, ctx.y - bgOffsetY, sw + 0.1, bgHeight, 'F');
                doc.setTextColor(20, 20, 20);
              } else {
                doc.setTextColor(35, 35, 35);
              }
              doc.text(safePdfText(st), cursorX, ctx.y);
              cursorX += sw;
            });
            continue;
          }

          if (palette) {
            doc.setFillColor(...palette.rgb);
            doc.rect(cursorX, ctx.y - bgOffsetY, tokenWidth + 0.1, bgHeight, 'F');
            doc.setTextColor(20, 20, 20);
          } else {
            doc.setTextColor(35, 35, 35);
          }

          doc.text(safePdfText(token), cursorX, ctx.y);
          cursorX += tokenWidth;
        }
      }
    });
  }
}

export interface ErrorNotebookPdfOptions {
  statusFilter?: 'pending' | 'corrected' | 'all';
  pageBreakBySubject?: boolean;
  scopeLabel?: string;
  holderName?: string;
  fileNameOverride?: string;
}

interface StyledWordToken {
  text: string;
  bold: boolean;
  width: number;
}

export function exportErrorNotebookPdf(
  allRows: ErrorNotebookEntry[],
  subjects: string | string[],
  includeQuestion: boolean,
  options?: ErrorNotebookPdfOptions,
): void {
  const statusFilter = options?.statusFilter ?? 'all';
  const pageBreakBySubject = Boolean(options?.pageBreakBySubject);

  const selectedList = Array.isArray(subjects)
    ? subjects.filter((s) => Boolean(s && s !== 'Todas as Matérias'))
    : subjects && subjects !== 'Todas as Matérias'
      ? [subjects]
      : [];

  const isAllSubjects =
    !Array.isArray(subjects)
      ? !subjects || subjects === 'Todas as Matérias'
      : selectedList.length === 0;

  const selectedNorms = new Set(selectedList.map((s) => normalizeSearch(visibleName(s))));

  const rows = allRows.filter((row) => {
    const isCorrected = Boolean(row.corrigido);
    if (statusFilter === 'pending' && isCorrected) return false;
    if (statusFilter === 'corrected' && !isCorrected) return false;
    if (!isAllSubjects) {
      const rowNorm = normalizeSearch(visibleName(row.materia));
      if (!selectedNorms.has(rowNorm)) return false;
    }
    return true;
  });

  if (!rows.length) {
    throw new Error('Não há registros para exportar com os filtros selecionados.');
  }

  // Group rows by subject preserving alphabetical order
  const groupMap = new Map<string, { label: string; items: ErrorNotebookEntry[] }>();
  rows.forEach((row) => {
    const label = visibleName(row.materia || 'Geral') || 'Geral';
    const key = normalizeSearch(label) || 'geral';
    const existing = groupMap.get(key);
    if (existing) {
      existing.items.push(row);
    } else {
      groupMap.set(key, { label, items: [row] });
    }
  });

  const groups = [...groupMap.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR'),
  );

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 17;
  const topContinueY = 19;

  let y = 14;
  let currentRunningSubject = '';
  const pageSubjects = new Map<number, string>();

  const startNewPage = () => {
    doc.addPage();
    y = topContinueY;
    if (currentRunningSubject) {
      pageSubjects.set(doc.getNumberOfPages(), currentRunningSubject);
    }
  };

  const ensureSpace = (heightNeeded: number) => {
    if (y + heightNeeded > bottomLimit) {
      startNewPage();
    }
  };

  /**
   * Renders a single paragraph with optional bold prefix, true justified alignment
   * (protecting against excessive word spacing), hanging indent, and optional
   * continuous left vertical guide rule across page breaks.
   */
  const renderJustifiedRichParagraph = (params: {
    leadBold?: string;
    body: string;
    x: number;
    width: number;
    fontSize: number;
    lineHeight: number;
    hangingIndent?: number;
    textColor?: [number, number, number];
    leadColor?: [number, number, number];
    justify?: boolean;
    leftGuide?: { x: number; color: [number, number, number]; width?: number };
    lineBg?: { x: number; width: number; color: [number, number, number] };
  }) => {
    const {
      leadBold,
      body,
      x,
      width,
      fontSize,
      lineHeight,
      hangingIndent = 0,
      textColor = [30, 41, 59],
      leadColor = [7, 29, 65],
      justify = true,
      leftGuide,
      lineBg,
    } = params;

    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    const normalSpaceW = doc.getTextWidth(' ');

    const tokens: StyledWordToken[] = [];
    const pushSegment = (segment: string, bold: boolean) => {
      const clean = normalizePdfLegalText(segment);
      if (!clean) return;
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const parts = clean.split(/\s+/).filter(Boolean);
      parts.forEach((word) => {
        const w = doc.getTextWidth(word);
        const maxTokenW = Math.max(12, width - hangingIndent);
        if (w > maxTokenW) {
          const splitChunks = doc.splitTextToSize(word, maxTokenW) as string[];
          splitChunks.forEach((chunk) => {
            tokens.push({ text: chunk, bold, width: doc.getTextWidth(chunk) });
          });
        } else {
          tokens.push({ text: word, bold, width: w });
        }
      });
    };

    if (leadBold) pushSegment(leadBold, true);
    if (body) pushSegment(body, false);
    if (!tokens.length) return;

    // Greedy line breaking respecting hangingIndent on lines >= 1
    const lines: StyledWordToken[][] = [];
    let currentLine: StyledWordToken[] = [];
    let currentLineW = 0;

    for (const token of tokens) {
      const isFirstLine = lines.length === 0;
      const availW = isFirstLine ? width : Math.max(15, width - hangingIndent);
      const nextW = currentLine.length === 0 ? token.width : currentLineW + normalSpaceW + token.width;

      if (currentLine.length > 0 && nextW > availW) {
        lines.push(currentLine);
        currentLine = [token];
        currentLineW = token.width;
      } else {
        currentLine.push(token);
        currentLineW = nextW;
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    lines.forEach((lineTokens, lineIdx) => {
      ensureSpace(lineHeight + 0.6);

      if (lineBg) {
        doc.setFillColor(...lineBg.color);
        doc.rect(lineBg.x, y - lineHeight + 1.1, lineBg.width, lineHeight + 0.25, 'F');
      }

      if (leftGuide) {
        doc.setDrawColor(...leftGuide.color);
        doc.setLineWidth(leftGuide.width ?? 0.55);
        doc.line(leftGuide.x, y - lineHeight + 1.0, leftGuide.x, y + 1.4);
      }

      const isFirstLine = lineIdx === 0;
      const isLastLine = lineIdx === lines.length - 1;
      const lineX = isFirstLine ? x : x + hangingIndent;
      const availW = isFirstLine ? width : Math.max(15, width - hangingIndent);
      const wordsWidthSum = lineTokens.reduce((sum, t) => sum + t.width, 0);
      const slack = availW - wordsWidthSum;

      // Justify interior lines when there are multiple words and slack isn't excessively wide
      const canJustify =
        justify &&
        !isLastLine &&
        lineTokens.length > 1 &&
        slack > 0 &&
        slack <= availW * 0.32;

      const gap = canJustify ? slack / (lineTokens.length - 1) : normalSpaceW;
      let cursorX = lineX;

      lineTokens.forEach((tok) => {
        doc.setFont('helvetica', tok.bold ? 'bold' : 'normal');
        doc.setTextColor(...(tok.bold ? leadColor : textColor));
        doc.text(tok.text, cursorX, y);
        cursorX += tok.width + gap;
      });

      y += lineHeight;
    });
  };

  /**
   * Renders multi-paragraph legal/study text with clean separation between
   * Articles (Art.), Paragraphs (§ / Parágrafo único), Incisos (I -), Alíneas (a)),
   * Súmulas, bullets, and standard prose.
   */
  const renderStructuredLegalContent = (params: {
    text: string;
    baseX: number;
    baseWidth: number;
    fontSize?: number;
    lineHeight?: number;
    leftGuide?: { x: number; color: [number, number, number]; width?: number };
    lineBg?: { x: number; width: number; color: [number, number, number] };
  }) => {
    const {
      text,
      baseX,
      baseWidth,
      fontSize = 9.2,
      lineHeight = 4.65,
      leftGuide,
      lineBg,
    } = params;

    const blocks = segmentLegalText(text);
    if (!blocks.length) return;

    const indentByKind: Record<LegalBlockKind, { left: number; hanging: number; gapBefore: number }> = {
      article: { left: 0, hanging: 0, gapBefore: 2.2 },
      sumula: { left: 0, hanging: 0, gapBefore: 2.0 },
      paragraph: { left: 3.5, hanging: 0, gapBefore: 1.4 },
      inciso: { left: 6.5, hanging: 6.5, gapBefore: 1.0 },
      alinea: { left: 10.0, hanging: 5.2, gapBefore: 0.85 },
      bullet: { left: 3.5, hanging: 4.0, gapBefore: 0.9 },
      prose: { left: 0, hanging: 0, gapBefore: 1.35 },
    };

    const leadColorByKind: Record<LegalBlockKind, [number, number, number]> = {
      article: [7, 29, 65],
      sumula: [19, 81, 180],
      paragraph: [15, 48, 102],
      inciso: [30, 58, 108],
      alinea: [51, 78, 118],
      bullet: [19, 81, 180],
      prose: [7, 29, 65],
    };

    blocks.forEach((block, idx) => {
      const cfg = indentByKind[block.kind];
      const pageBefore = doc.getNumberOfPages();

      // Keep legal article/sumula heading attached to at least 2 lines before rendering gap strip
      if (block.kind === 'article' || block.kind === 'sumula') {
        ensureSpace(cfg.gapBefore + lineHeight * 2 + 1.5);
      } else if (idx > 0) {
        ensureSpace(cfg.gapBefore + lineHeight + 0.6);
      }

      const stayedOnSamePage = doc.getNumberOfPages() === pageBefore;
      if (idx > 0 && stayedOnSamePage) {
        const gapTop = y - lineHeight + 1.2;
        if (lineBg) {
          doc.setFillColor(...lineBg.color);
          doc.rect(lineBg.x, gapTop, lineBg.width, cfg.gapBefore + 0.3, 'F');
        }
        if (leftGuide) {
          doc.setDrawColor(...leftGuide.color);
          doc.setLineWidth(leftGuide.width ?? 0.55);
          doc.line(leftGuide.x, gapTop, leftGuide.x, gapTop + cfg.gapBefore + 0.3);
        }
        y += cfg.gapBefore;
      }

      renderJustifiedRichParagraph({
        leadBold: block.leadBold,
        body: block.body,
        x: baseX + cfg.left,
        width: Math.max(30, baseWidth - cfg.left),
        fontSize,
        lineHeight,
        hangingIndent: cfg.hanging,
        leadColor: leadColorByKind[block.kind],
        textColor: [28, 39, 56],
        justify: true,
        leftGuide,
        lineBg,
      });
    });
  };

  // === PAGE 1: OFFICIAL GOV.BR HEADER BANNER ===
  const emissionDateTime = localDateTimeBrazilian();
  const emissionDateOnly = localDateBrazilian();

  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 29, 'F');

  // Official Brasil Tricolore Stripe
  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, 29, third, 1.8, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, 29, third, 1.8, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, 29, pageWidth - third * 2, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(255, 205, 7);
  doc.text('PORTAL ÚNICO DO ESTUDANTE · OUVIDORIA & CORREGEDORIA', margin, 9.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Caderno Oficial de Erros e Revisão', margin, 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(215, 227, 244);
  doc.text(
    'Consolidado estruturado de anotações, fundamentação legal e questões para revisão direcionada',
    margin,
    23.8,
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 205, 7);
  doc.text('EMISSÃO OFICIAL', pageWidth - margin, 10.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(235, 242, 252);
  doc.text(emissionDateTime, pageWidth - margin, 15.8, { align: 'right' });
  if (options?.holderName) {
    doc.setFontSize(7.8);
    const shortHolder = doc.splitTextToSize(normalizePdfLegalText(options.holderName), 58)[0] || '';
    doc.text(shortHolder, pageWidth - margin, 21.2, { align: 'right' });
  }

  y = 35.5;

  // === 4-COLUMN SUMMARY METADATA STRIP ===
  const pendingTotal = rows.filter((r) => !r.corrigido).length;
  const correctedTotal = rows.length - pendingTotal;
  const statusText =
    statusFilter === 'pending'
      ? 'Pendentes de Correção'
      : statusFilter === 'corrected'
        ? 'Já Corrigidos'
        : 'Todos os Registros';
  const scopeText =
    options?.scopeLabel ||
    (isAllSubjects
      ? 'Todas as matérias'
      : selectedList.length === 1
        ? visibleName(selectedList[0])
        : `${selectedList.length} matérias selecionadas`);

  const kpiHeight = 13.5;
  doc.setFillColor(246, 249, 253);
  doc.setDrawColor(194, 209, 228);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, maxWidth, kpiHeight, 'FD');

  const kpiCols = [
    { label: 'ESCOPO', value: normalizePdfLegalText(scopeText) },
    { label: 'FILTRO DE SITUAÇÃO', value: statusText },
    { label: 'REGISTROS / MATÉRIAS', value: `${rows.length} reg. · ${groups.length} matéria(s)` },
    { label: 'BALANÇO', value: `${pendingTotal} pend. · ${correctedTotal} corr.` },
  ];
  const colW = maxWidth / 4;
  kpiCols.forEach((col, idx) => {
    const cx = margin + idx * colW;
    if (idx > 0) {
      doc.setDrawColor(214, 224, 238);
      doc.line(cx, y + 1.5, cx, y + kpiHeight - 1.5);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(78, 96, 122);
    doc.text(col.label, cx + 2.8, y + 4.7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(7, 29, 65);
    const truncated = (doc.splitTextToSize(col.value, colW - 5.5) as string[])[0] || col.value;
    doc.text(truncated, cx + 2.8, y + 10.2);
  });

  y += kpiHeight + 4.5;

  // === SUMÁRIO POR MATÉRIA (WHEN MULTIPLE SUBJECTS) ===
  if (groups.length > 1) {
    const numCols = 2;
    const rowsNeeded = Math.ceil(groups.length / numCols);
    const tocHeight = 7.5 + rowsNeeded * 5.2 + 2.5;
    ensureSpace(tocHeight + 4);

    doc.setFillColor(250, 252, 255);
    doc.setDrawColor(204, 216, 232);
    doc.setLineWidth(0.28);
    doc.rect(margin, y, maxWidth, tocHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(19, 81, 180);
    doc.text('SUMÁRIO POR MATÉRIA', margin + 3.2, y + 4.8);

    const halfW = (maxWidth - 8) / 2;
    groups.forEach((g, idx) => {
      const col = idx % 2;
      const rowIdx = Math.floor(idx / 2);
      const itemX = margin + 3.2 + col * (halfW + 2);
      const itemY = y + 9.8 + rowIdx * 5.2;
      const pend = g.items.filter((i) => !i.corrigido).length;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(7, 29, 65);
      const subjShort =
        (doc.splitTextToSize(normalizePdfLegalText(g.label), halfW - 24) as string[])[0] || g.label;
      doc.text(`${idx + 1}. ${subjShort}`, itemX, itemY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(84, 102, 128);
      const countText = `${g.items.length} reg.${pend > 0 ? ` (${pend} p.)` : ''}`;
      doc.text(countText, itemX + halfW - 1.5, itemY, { align: 'right' });
    });

    y += tocHeight + 5.5;
  }

  // === SUBJECT GROUPS & STRUCTURED CARDS ===
  let globalIndex = 0;

  groups.forEach((group, groupIdx) => {
    currentRunningSubject = normalizePdfLegalText(group.label);

    if (groupIdx > 0 && pageBreakBySubject) {
      startNewPage();
    } else if (groupIdx > 0) {
      y += 2;
    }

    // Never leave a subject banner orphaned without its first entry header
    ensureSpace(30);
    if (!pageSubjects.has(doc.getNumberOfPages())) {
      pageSubjects.set(doc.getNumberOfPages(), currentRunningSubject);
    }

    // Subject Banner
    const bannerH = 9;
    doc.setFillColor(235, 241, 250);
    doc.setDrawColor(186, 204, 228);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, maxWidth, bannerH, 'FD');

    // Crisp Navy Left Indicator
    doc.setFillColor(7, 29, 65);
    doc.rect(margin, y, 2.2, bannerH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(7, 29, 65);
    const subjTitle = (
      doc.splitTextToSize(normalizePdfLegalText(group.label).toUpperCase(), maxWidth - 52) as string[]
    )[0];
    doc.text(subjTitle, margin + 5, y + 6);

    const pendingInGroup = group.items.filter((i) => !i.corrigido).length;
    const rightMeta = `${group.items.length} registro(s)${
      pendingInGroup > 0 ? ` · ${pendingInGroup} pendente(s)` : ' · Em dia'
    }`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(19, 81, 180);
    doc.text(rightMeta, pageWidth - margin - 3, y + 5.8, { align: 'right' });

    y += bannerH + 4;

    group.items.forEach((row) => {
      globalIndex += 1;
      currentRunningSubject = normalizePdfLegalText(group.label);

      // Ensure room for entry header + at least initial lines of content
      ensureSpace(24);

      const isCorrected = Boolean(row.corrigido);
      const headerH = 7.4;

      // Entry Header Bar
      doc.setFillColor(246, 248, 252);
      doc.setDrawColor(203, 214, 229);
      doc.setLineWidth(0.28);
      doc.rect(margin, y, maxWidth, headerH, 'FD');

      // Status Pill Text on Right
      const statusLabel = isCorrected ? 'CORRIGIDO' : 'PENDENTE';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      const badgeW = doc.getTextWidth(statusLabel) + 5;
      const badgeX = pageWidth - margin - badgeW - 2;
      if (isCorrected) {
        doc.setFillColor(232, 246, 236);
        doc.setDrawColor(142, 207, 158);
        doc.setTextColor(22, 118, 33);
      } else {
        doc.setFillColor(254, 243, 224);
        doc.setDrawColor(235, 186, 112);
        doc.setTextColor(168, 76, 8);
      }
      doc.roundedRect(badgeX, y + 1.4, badgeW, 4.6, 1, 1, 'FD');
      doc.text(statusLabel, badgeX + badgeW / 2, y + 4.7, { align: 'center' });

      // Left Title: #01 · Tipo · Data · Origem
      const numStr = `#${String(globalIndex).padStart(2, '0')}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(19, 81, 180);
      doc.text(numStr, margin + 2.8, y + 5);

      const numW = doc.getTextWidth(numStr);
      const headerParts = [visibleName(row.tipo || 'Anotação'), row.data || ''];
      if (row.origem) headerParts.push(visibleName(row.origem));
      const metaHeader = normalizePdfLegalText(headerParts.filter(Boolean).join(' · '));

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(7, 29, 65);
      const availHeaderW = badgeX - (margin + 4.8 + numW) - 3;
      const truncatedMeta =
        (doc.splitTextToSize(metaHeader, Math.max(25, availHeaderW)) as string[])[0] || '';
      doc.text(truncatedMeta, margin + 4.8 + numW, y + 5);

      y += headerH + 2.5;

      // Optional metadata line (prova, banca, ciclo de revisão)
      const subMetaParts: string[] = [];
      if (row.banca) subMetaParts.push(`Banca: ${visibleName(row.banca)}`);
      if (row.correcao_prova && row.arquivo_prova) {
        subMetaParts.push(`Prova: ${visibleName(row.arquivo_prova)}`);
      }
      if (row.nivel_revisao && row.nivel_revisao > 0) {
        subMetaParts.push(`Revisões concluídas: ${row.nivel_revisao}`);
      }
      if (row.proxima_revisao && !isCorrected) {
        subMetaParts.push(`Próxima revisão: ${formatIsoDateBr(row.proxima_revisao)}`);
      }
      if (row.corrigido_em && isCorrected) {
        subMetaParts.push(`Corrigido em: ${row.corrigido_em}`);
      }

      if (subMetaParts.length > 0) {
        ensureSpace(5);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.8);
        doc.setTextColor(86, 104, 130);
        const subLines = doc.splitTextToSize(
          normalizePdfLegalText(subMetaParts.join('  ·  ')),
          maxWidth - 4,
        ) as string[];
        subLines.forEach((sl) => {
          ensureSpace(4.2);
          doc.text(sl, margin + 2, y);
          y += 3.9;
        });
        y += 0.8;
      }

      // === SECTION A: PONTO PARA REVISAR ===
      if (row.texto && row.texto.trim()) {
        ensureSpace(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(19, 81, 180);
        doc.text('PONTO PARA REVISAR', margin + 3.2, y + 1);
        y += 4.6;

        renderStructuredLegalContent({
          text: row.texto,
          baseX: margin + 3.5,
          baseWidth: maxWidth - 5.5,
          fontSize: 9.2,
          lineHeight: 4.65,
          leftGuide: { x: margin + 1.2, color: [19, 81, 180], width: 0.7 },
        });
        y += 2;
      }

      // === SECTION B: QUESTÃO VINCULADA ===
      if (includeQuestion && row.questao) {
        ensureSpace(12);
        // Subtle section divider
        doc.setDrawColor(218, 227, 239);
        doc.setLineWidth(0.25);
        doc.line(margin + 1, y, pageWidth - margin - 1, y);
        y += 4.2;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(7, 29, 65);
        doc.text('QUESTÃO VINCULADA', margin + 2, y);
        y += 4.4;

        // Enunciado (also structured & justified so legal citations inside stems are cleanly separated!)
        if (row.questao.enunciado) {
          renderStructuredLegalContent({
            text: row.questao.enunciado,
            baseX: margin + 2,
            baseWidth: maxWidth - 4,
            fontSize: 9.0,
            lineHeight: 4.55,
          });
          y += 2;
        }

        // Alternativas with clean hanging indent + Gabarito/Marcada visual highlight
        if (row.questao.alternativas?.length) {
          const normGabarito = (row.questao.gabarito || '').trim().toUpperCase();
          const normResposta = (row.questao.resposta || '').trim().toUpperCase();

          row.questao.alternativas.forEach((alt) => {
            const letraNorm = (alt.letra || '').trim().toUpperCase();
            const isCorrectAlt = Boolean(normGabarito && letraNorm === normGabarito);
            const isWrongSelected = Boolean(
              normResposta && letraNorm === normResposta && letraNorm !== normGabarito,
            );

            const bgSpec = isCorrectAlt
              ? { x: margin + 2, width: maxWidth - 4, color: [236, 248, 239] as [number, number, number] }
              : isWrongSelected
                ? { x: margin + 2, width: maxWidth - 4, color: [253, 238, 238] as [number, number, number] }
                : undefined;

            const leadClr: [number, number, number] = isCorrectAlt
              ? [22, 118, 33]
              : isWrongSelected
                ? [185, 28, 28]
                : [7, 29, 65];

            const suffixTag = isCorrectAlt
              ? ' (Gabarito)'
              : isWrongSelected
                ? ' (Sua resposta)'
                : '';

            renderJustifiedRichParagraph({
              leadBold: `${letraNorm})`,
              body: `${normalizePdfLegalText(alt.texto)}${suffixTag}`,
              x: margin + 3.5,
              width: maxWidth - 7,
              fontSize: 8.8,
              lineHeight: 4.4,
              hangingIndent: 5.8,
              leadColor: leadClr,
              textColor: isCorrectAlt ? [16, 74, 28] : isWrongSelected ? [127, 29, 29] : [35, 45, 62],
              justify: true,
              lineBg: bgSpec,
            });
            y += 1.0;
          });
          y += 1.2;
        }

        // Gabarito Summary Strip
        const answerParts: string[] = [];
        if (row.questao.resposta) answerParts.push(`Sua resposta: ${row.questao.resposta}`);
        if (row.questao.gabarito) answerParts.push(`Gabarito oficial: ${row.questao.gabarito}`);
        if (answerParts.length > 0) {
          ensureSpace(8);
          doc.setFillColor(244, 247, 252);
          doc.setDrawColor(198, 211, 228);
          doc.setLineWidth(0.25);
          doc.rect(margin + 2, y - 0.5, maxWidth - 4, 6.2, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.2);
          doc.setTextColor(7, 29, 65);
          doc.text(normalizePdfLegalText(answerParts.join('    |    ')), margin + 4.5, y + 3.7);
          y += 8.2;
        }

        // Comentário & Fundamentação Legal (richly separated articles/paragraphs/incisos!)
        if (row.questao.comentario && row.questao.comentario.trim()) {
          ensureSpace(10);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.4);
          doc.setTextColor(22, 118, 33);
          doc.text('COMENTÁRIO E FUNDAMENTAÇÃO LEGAL', margin + 4.2, y + 0.8);
          y += 4.5;

          renderStructuredLegalContent({
            text: row.questao.comentario,
            baseX: margin + 4.2,
            baseWidth: maxWidth - 6.8,
            fontSize: 8.9,
            lineHeight: 4.55,
            leftGuide: { x: margin + 2.0, color: [22, 136, 33], width: 0.65 },
            lineBg: { x: margin + 2.3, width: maxWidth - 4.3, color: [248, 251, 249] },
          });
          y += 1.8;
        }
      }

      // Entry Bottom Divider & Spacing
      ensureSpace(3);
      doc.setDrawColor(214, 224, 236);
      doc.setLineWidth(0.22);
      doc.line(margin, y + 0.8, pageWidth - margin, y + 0.8);
      y += 5.2;
    });
  });

  // === RUNNING HEADERS (PAGES 2+) & INSTITUTIONAL FOOTERS (ALL PAGES) ===
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);

    // Running Header on continuation pages
    if (p > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(7, 29, 65);
      doc.text('estuda.gov.br · Caderno Oficial de Erros e Revisão', margin, 9.5);

      const pageSubj = pageSubjects.get(p) || normalizePdfLegalText(scopeText);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(82, 98, 124);
      const shortSubj = (doc.splitTextToSize(pageSubj, 78) as string[])[0] || '';
      doc.text(shortSubj, pageWidth - margin, 9.5, { align: 'right' });

      doc.setDrawColor(198, 211, 228);
      doc.setLineWidth(0.25);
      doc.line(margin, 11.5, pageWidth - margin, 11.5);
    }

    // Institutional Footer
    const footerRuleY = pageHeight - 12.2;
    doc.setDrawColor(198, 211, 228);
    doc.setLineWidth(0.25);
    doc.line(margin, footerRuleY, pageWidth - margin, footerRuleY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(96, 110, 132);
    doc.text(
      `estuda.gov.br · Ouvidoria & Corregedoria · Emitido em ${emissionDateOnly}`,
      margin,
      pageHeight - 8,
    );
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(7, 29, 65);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: 'right',
    });
  }

  const statusSuffix =
    statusFilter === 'pending'
      ? '_pendencias'
      : statusFilter === 'corrected'
        ? '_corrigidos'
        : '';
  const name =
    options?.fileNameOverride ||
    (isAllSubjects
      ? statusFilter === 'pending'
        ? `caderno_erros_todas_pendencias_${localDateIso()}.pdf`
        : `caderno_erros_geral_conjunto${statusSuffix}.pdf`
      : selectedList.length === 1
        ? `caderno_erros_${cleanSafeName(selectedList[0]).replace(/\s+/g, '_')}${statusSuffix}.pdf`
        : `caderno_erros_conjunto_${selectedList.length}_materias${statusSuffix}.pdf`);
  doc.save(name);
}

export function exportLawWithHighlightsPdf(
  lawName: string,
  text: string,
  highlights: LawHighlight[],
  lawNote?: string,
): void {
  if (!text.trim()) {
    throw new Error('Não há texto para exportar.');
  }
  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth } = ctx;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text(safePdfText(`Central de Estudos - Lei Seca (${visibleName(lawName)})`), margin, ctx.y);
  ctx.y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  const legendParts = (Object.keys(HIGHLIGHT_COLOR_RGB) as HighlightColorKey[])
    .filter((k) => highlights.some((h) => h.color === k))
    .map((k) => HIGHLIGHT_COLOR_RGB[k].label);
  const legendText = legendParts.length
    ? `Grifos aplicados no texto: ${legendParts.join(', ')} · ${highlights.length} marcação(ões)`
    : 'Texto integral da legislação';
  doc.text(safePdfText(legendText), margin, ctx.y);
  ctx.y += 6;

  doc.setDrawColor(215, 220, 228);
  doc.setLineWidth(0.3);
  doc.line(margin, ctx.y - 2, margin + maxWidth, ctx.y - 2);
  ctx.y += 4;

  // Render continuous law text WITH INLINE COLOR HIGHLIGHTS!
  writeHighlightedContinuousText(ctx, text, highlights, 9.5, 5.6);

  // If there are highlights, include a summary appendix
  if (highlights.length) {
    ctx.ensureSpace(28);
    ctx.y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text('Quadro Resumo de Trechos Grifados', margin, ctx.y);
    ctx.y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    highlights.forEach((h) => {
      const palette = HIGHLIGHT_COLOR_RGB[h.color] || HIGHLIGHT_COLOR_RGB.yellow;
      const lines = doc.splitTextToSize(safePdfText(`${palette.label}: "${h.text}"`), maxWidth - 6) as string[];
      const boxHeight = Math.max(6, lines.length * 4.5 + 2.5);
      ctx.ensureSpace(boxHeight + 2);
      doc.setFillColor(...palette.rgb);
      doc.setDrawColor(210, 210, 210);
      doc.rect(margin, ctx.y - 3.8, maxWidth, boxHeight, 'FD');
      doc.setTextColor(25, 25, 25);
      lines.forEach((line, i) => {
        doc.text(line, margin + 3, ctx.y + i * 4.5);
      });
      ctx.y += boxHeight + 2;
    });
  }

  // Include per-law Quadro de Observações when present
  const rawNote = String(lawNote || '').trim();
  const cleanNote = /<[a-z][\s\S]*>/i.test(rawNote)
    ? htmlToPlainText(rawNote).trim()
    : rawNote;
  if (cleanNote) {
    ctx.ensureSpace(26);
    ctx.y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(19, 81, 180);
    doc.text(safePdfText(`Quadro de Observações · ${visibleName(lawName)}`), margin, ctx.y);
    ctx.y += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const noteLines = doc.splitTextToSize(safePdfText(cleanNote), maxWidth - 8) as string[];
    for (const line of noteLines) {
      ctx.ensureSpace(6);
      doc.setFillColor(244, 247, 252);
      doc.setDrawColor(205, 218, 238);
      doc.rect(margin, ctx.y - 4.1, maxWidth, 5.6, 'F');
      doc.setTextColor(25, 35, 55);
      doc.text(line, margin + 3.5, ctx.y);
      ctx.y += 5.2;
    }
  }

  // Add page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      safePdfText(`Central de Estudos · ${visibleName(lawName)} · Página ${p} de ${totalPages}`),
      pageWidth / 2,
      290,
      { align: 'center' },
    );
  }

  doc.save(`lei_com_grifos_${cleanSafeName(lawName).replace(/\s+/g, '_')}.pdf`);
}

export function exportIncidenceMatrixPdf(lawName: string, items: LawItem[]): void {
  if (!items.length) {
    throw new Error('A legislação selecionada não contém dispositivos para exportar.');
  }
  const ctx = createDoc();
  const { doc, margin, maxWidth } = ctx;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20, 20, 20);
  doc.text(safePdfText(`Matriz de Incidência - ${visibleName(lawName)}`), margin, ctx.y);
  ctx.y += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(95, 95, 95);
  doc.text(`${items.length} dispositivo(s) | Cores por grau de incidência`, margin, ctx.y);
  ctx.y += 8;

  items.forEach((item) => {
    const palette = GRADE_RGB[item.grau] || GRADE_RGB['Não Classificado'];
    ctx.ensureSpace(16);
    doc.setFillColor(...palette.fill);
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, ctx.y - 4.5, maxWidth, 6.8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...palette.text);
    const displayDev = formatSequentialDeviceLabel(item.dispositivo, item.artigo_base);
    const label = `${displayDev} - ${item.grau}`;
    doc.text(safePdfText(doc.splitTextToSize(label, maxWidth - 4)[0]), margin + 2, ctx.y);
    ctx.y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(35, 35, 35);
    ctx.writeWrapped(item.texto, 5.2);

    if (item.dica) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(90, 70, 20);
      ctx.writeWrapped(`Ponto de atenção: ${item.dica}`, 4.8);
    }
    if (item.observacao) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 80);
      ctx.writeWrapped(`Observação: ${item.observacao}`, 4.8);
    }
    ctx.y += 3.5;
  });

  doc.save(`matriz_incidencia_${cleanSafeName(lawName).replace(/\s+/g, '_')}.pdf`);
}

export function buildSamplePdfBlob(title: string, subtitle: string, paragraphs: string[]): Blob {
  const ctx = createDoc();
  const { doc, margin } = ctx;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(25, 25, 25);
  doc.text(safePdfText(title), margin, ctx.y);
  ctx.y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(95, 95, 95);
  doc.text(safePdfText(subtitle), margin, ctx.y);
  ctx.y += 8;
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  paragraphs.forEach((p) => {
    ctx.writeWrapped(p, 5.6);
    ctx.y += 3;
  });
  return doc.output('blob');
}

export interface PerformancePdfSubjectRow {
  subject: string;
  answered: number;
  correct: number;
  studySeconds: number;
}

export interface PerformancePdfBankRow {
  bank: string;
  simulations: number;
  totalQuestions: number;
  correct: number;
  accuracy: number;
}

export interface PerformancePdfSimulationRow {
  titulo: string;
  materia: string;
  banca?: string;
  data: string;
  acertos: number;
  total: number;
  pontos_liquidos?: number;
  aproveitamento: number;
}

export interface PerformancePdfDailyRow {
  iso: string;
  label: string;
  answered: number;
  correct: number;
  wrong: number;
  simulations: number;
  studySeconds: number;
}

export interface PerformancePdfDayStudyRow {
  date: string;
  day: string;
  seconds: number;
  subjects: Record<string, number>;
}

export interface PerformancePdfExamSubjectRow {
  subject: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  accuracyPct: number | null;
  pending?: number;
  corrected?: number;
}

export interface PerformancePdfExamQuestionRow {
  numero?: number;
  subject: string;
  resposta?: string;
  gabarito?: string;
  status: 'Erro' | 'Em branco' | 'Pendente' | 'Corrigido';
  resumo?: string;
}

export interface PerformancePdfExamContext {
  title: string;
  kind: 'simulado' | 'prova_biblioteca';
  banca?: string;
  data?: string;
  tempoFormatted?: string;
  avgTimePerQuestionFormatted?: string;
  pontosLiquidos?: number;
  emBranco?: number;
  pendingCorrections?: number;
  correctedCount?: number;
  subjectDetailRows?: PerformancePdfExamSubjectRow[];
  missedQuestions?: PerformancePdfExamQuestionRow[];
}

export function exportPerformanceReportPdf(params: {
  totalAnswered: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  totalStudyFormatted: string;
  completedSimulationsCount: number;
  subjectRows: PerformancePdfSubjectRow[];
  bankRows: PerformancePdfBankRow[];
  recentSimulations: PerformancePdfSimulationRow[];
  formatDuration: (seconds: number) => string;
  filterDescription?: string;
  holderName?: string;
  charts?: CapturedD3Chart[];
  filteredStudySummary?: {
    totalFormatted: string;
    avgFormatted: string;
    activeDays: number;
    sessionsCount: number;
  };
  filteredStudyByDate?: PerformancePdfDayStudyRow[];
  dailySeries?: PerformancePdfDailyRow[];
  examContext?: PerformancePdfExamContext;
}): string {
  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth, pageHeight } = ctx;
  const exam = params.examContext;
  const isExamScoped = Boolean(exam);
  const protocolNumber = `${isExamScoped ? 'PROVA' : 'TRANSP'}-${String(
    params.totalAnswered * 17 + params.completedSimulationsCount * 29 + 2026,
  ).padStart(6, '0')}`;
  const issuedAt = localDateTimeBrazilian();
  const issuedDateOnly = localDateBrazilian();

  const pdfText = (value: unknown) => normalizePdfLegalText(safePdfText(value));

  // Helper: Draw Gov.br Official Section Heading
  const drawSectionHeading = (num: number, heading: string) => {
    ctx.ensureSpace(16);
    doc.setFillColor(237, 242, 248);
    doc.setDrawColor(182, 198, 220);
    doc.setLineWidth(0.28);
    doc.rect(margin, ctx.y - 4.5, maxWidth, 7.2, 'FD');
    doc.setFillColor(19, 81, 180);
    doc.rect(margin, ctx.y - 4.5, 2.2, 7.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.2);
    doc.setTextColor(7, 29, 65);
    doc.text(pdfText(`${num}. ${heading.toUpperCase()}`), margin + 4.8, ctx.y + 0.3);
    ctx.y += 7;
  };

  // --- Official Federal Header Banner ---
  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 34, 'F');

  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, 34, third, 2, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, 34, third, 2, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, 34, pageWidth - third * 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(255, 205, 7);
  doc.text('PORTAL DA TRANSPARÊNCIA ESTUDANTIL · ESTUDA.GOV.BR', margin, 10.5);

  doc.setFontSize(isExamScoped ? 13.8 : 14.5);
  doc.setTextColor(255, 255, 255);
  doc.text(
    pdfText(
      isExamScoped
        ? 'RELATÓRIO OFICIAL DE DESEMPENHO — PROVA SELECIONADA'
        : 'RELATÓRIO OFICIAL DE DESEMPENHO E EVOLUÇÃO ANALÍTICA',
    ),
    margin,
    19.2,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(215, 225, 240);
  const subBannerText = isExamScoped && exam
    ? `Prova: ${visibleName(exam.title)} · Protocolo ${protocolNumber} · Emitido em ${issuedAt}`
    : `Titular: ${params.holderName || 'Cidadão-Estudante Federal'} · Protocolo ${protocolNumber} · Emitido em ${issuedAt}`;
  const subBannerLine = (doc.splitTextToSize(pdfText(subBannerText), maxWidth) as string[])[0] || '';
  doc.text(subBannerLine, margin, 27.2);

  ctx.y = 43.5;

  // --- Official Exam Technical Sheet (when filtered by a specific exam) ---
  if (exam) {
    const metaRows: Array<{ label: string; value: string }> = [
      { label: 'PROVA / SIMULADO', value: visibleName(exam.title) },
      { label: 'MODALIDADE', value: exam.kind === 'simulado' ? 'Simulado Fechado Oficial' : 'Prova da Biblioteca (Correções)' },
      { label: 'BANCA EXAMINADORA', value: exam.banca || 'Geral / Não informada' },
      { label: 'DATA / REGISTRO', value: exam.data || issuedDateOnly },
    ];
    if (exam.tempoFormatted) {
      metaRows.push({
        label: 'DURAÇÃO DA PROVA',
        value: exam.avgTimePerQuestionFormatted
          ? `${exam.tempoFormatted} (${exam.avgTimePerQuestionFormatted}/questão)`
          : exam.tempoFormatted,
      });
    }
    if (typeof exam.pontosLiquidos === 'number') {
      metaRows.push({ label: 'PONTOS LÍQUIDOS', value: String(exam.pontosLiquidos) });
    }
    metaRows.push({
      label: 'TITULAR',
      value: params.holderName || 'Cidadão-Estudante Federal',
    });

    const cols = 2;
    const rowsCount = Math.ceil(metaRows.length / cols);
    const boxH = 8 + rowsCount * 6.2 + 2;
    ctx.ensureSpace(boxH + 4);

    doc.setFillColor(246, 249, 253);
    doc.setDrawColor(182, 198, 220);
    doc.setLineWidth(0.3);
    doc.rect(margin, ctx.y - 3, maxWidth, boxH, 'FD');

    doc.setFillColor(7, 29, 65);
    doc.rect(margin, ctx.y - 3, 2.2, boxH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(19, 81, 180);
    doc.text('FICHA TÉCNICA DA PROVA SELECIONADA', margin + 4.8, ctx.y + 1.5);

    const colW = (maxWidth - 10) / cols;
    metaRows.forEach((item, idx) => {
      const col = idx % cols;
      const rowIdx = Math.floor(idx / cols);
      const cellX = margin + 4.8 + col * (colW + 2);
      const cellY = ctx.y + 7.2 + rowIdx * 6.2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(86, 104, 130);
      doc.text(pdfText(`${item.label}:`), cellX, cellY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(7, 29, 65);
      const labelW = doc.getTextWidth(pdfText(`${item.label}: `));
      const valStr =
        (doc.splitTextToSize(pdfText(item.value), Math.max(24, colW - labelW - 2)) as string[])[0] || '';
      doc.text(valStr, cellX + labelW + 1, cellY);
    });

    ctx.y += boxH + 3.5;
  }

  // --- Active Filters Notice ---
  if (params.filterDescription) {
    const filterLines = doc.splitTextToSize(
      pdfText(`Parâmetros e filtros vigentes: ${params.filterDescription}`),
      maxWidth - 6,
    ) as string[];
    const filterBoxH = filterLines.length * 4.4 + 4;
    ctx.ensureSpace(filterBoxH + 4);
    doc.setFillColor(247, 249, 252);
    doc.setDrawColor(195, 208, 228);
    doc.setLineWidth(0.25);
    doc.rect(margin, ctx.y - 3, maxWidth, filterBoxH, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(61, 79, 107);
    filterLines.forEach((line, idx) => {
      doc.text(line, margin + 3, ctx.y + 1 + idx * 4.4);
    });
    ctx.y += filterBoxH + 3;
  }

  // --- Section 1: Executive KPIs ---
  let sectionIdx = 1;
  drawSectionHeading(
    sectionIdx++,
    isExamScoped ? 'Indicadores Oficiais da Prova Selecionada' : 'Indicadores Consolidados de Rendimento',
  );

  ctx.ensureSpace(22);
  const kpiGap = 3;
  const kpiW = (maxWidth - kpiGap * 3) / 4;
  const kpis: Array<{ label: string; value: string; note: string; accent: [number, number, number] }> =
    exam?.kind === 'simulado'
      ? [
          {
            label: 'QUESTÕES DA PROVA',
            value: params.totalAnswered.toLocaleString('pt-BR'),
            note: `${params.totalCorrect} acertos · ${params.totalWrong} erros${
              exam.emBranco ? ` · ${exam.emBranco} br.` : ''
            }`,
            accent: [7, 29, 65],
          },
          {
            label: 'APROVEITAMENTO',
            value: `${params.accuracy}%`,
            note: params.accuracy >= 80 ? 'Acima da meta (80%)' : 'Meta institucional: 80%',
            accent: params.accuracy >= 80 ? [22, 136, 33] : params.accuracy >= 60 ? [19, 81, 180] : [201, 42, 42],
          },
          {
            label: typeof exam.pontosLiquidos === 'number' ? 'PONTOS LÍQUIDOS' : 'MATÉRIAS NA PROVA',
            value:
              typeof exam.pontosLiquidos === 'number'
                ? String(exam.pontosLiquidos)
                : String(exam.subjectDetailRows?.length ?? params.subjectRows.length),
            note:
              typeof exam.pontosLiquidos === 'number'
                ? `${exam.subjectDetailRows?.length ?? params.subjectRows.length} matéria(s) avaliada(s)`
                : 'Disciplinas identificadas',
            accent: [19, 81, 180],
          },
          {
            label: 'TEMPO DE PROVA',
            value: exam.tempoFormatted || params.totalStudyFormatted,
            note: exam.avgTimePerQuestionFormatted
              ? `Média: ${exam.avgTimePerQuestionFormatted}/questão`
              : 'Duração registrada',
            accent: [7, 29, 65],
          },
        ]
      : exam?.kind === 'prova_biblioteca'
        ? [
            {
              label: 'REGISTROS NA PROVA',
              value: params.totalAnswered.toLocaleString('pt-BR'),
              note: 'Questões/anotações registradas',
              accent: [7, 29, 65],
            },
            {
              label: 'CORREÇÕES CONCLUÍDAS',
              value: `${params.accuracy}%`,
              note: `${exam.correctedCount ?? params.totalCorrect} corrigida(s)`,
              accent: [22, 136, 33],
            },
            {
              label: 'PENDENTES DE REVISÃO',
              value: String(exam.pendingCorrections ?? params.totalWrong),
              note: 'Aguardando revisão no Caderno',
              accent: (exam.pendingCorrections ?? params.totalWrong) > 0 ? [180, 83, 9] : [22, 136, 33],
            },
            {
              label: 'MATÉRIAS ASSOCIADAS',
              value: String(exam.subjectDetailRows?.length ?? params.subjectRows.length),
              note: exam.banca || 'Banca não informada',
              accent: [19, 81, 180],
            },
          ]
        : [
            {
              label: 'QUESTÕES RESPONDIDAS',
              value: params.totalAnswered.toLocaleString('pt-BR'),
              note: `${params.totalCorrect} acertos / ${params.totalWrong} erros`,
              accent: [7, 29, 65],
            },
            {
              label: 'APROVEITAMENTO GERAL',
              value: `${params.accuracy}%`,
              note: params.accuracy >= 80 ? 'Acima da meta (80%)' : 'Meta institucional: 80%',
              accent: params.accuracy >= 80 ? [22, 136, 33] : [19, 81, 180],
            },
            {
              label: 'SIMULADOS CONCLUÍDOS',
              value: String(params.completedSimulationsCount),
              note: 'Boletim de Ocorrências',
              accent: [19, 81, 180],
            },
            {
              label: 'TEMPO CRONOMETRADO',
              value: params.totalStudyFormatted,
              note: 'Ponto Eletrônico líquido',
              accent: [7, 29, 65],
            },
          ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (kpiW + kpiGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(182, 198, 220);
    doc.setLineWidth(0.28);
    doc.rect(x, ctx.y - 2, kpiW, 18, 'FD');
    doc.setFillColor(...kpi.accent);
    doc.rect(x, ctx.y - 2, kpiW, 1.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(92, 110, 138);
    doc.text(pdfText(kpi.label), x + 2.5, ctx.y + 3);

    doc.setFontSize(12.2);
    doc.setTextColor(...kpi.accent);
    doc.text(pdfText(kpi.value), x + 2.5, ctx.y + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.9);
    doc.setTextColor(61, 79, 107);
    doc.text(pdfText(doc.splitTextToSize(pdfText(kpi.note), kpiW - 5)[0]), x + 2.5, ctx.y + 14.2);
  });
  ctx.y += 22;

  // --- Section 2: Captured D3 Charts ---
  if (params.charts && params.charts.length > 0) {
    drawSectionHeading(
      sectionIdx++,
      isExamScoped ? 'Painéis Gráficos Analíticos Filtrados pela Prova' : 'Painéis Gráficos Analíticos (D3.js)',
    );

    params.charts.forEach((chart, idx) => {
      const boxPadX = 3;
      const headerH = chart.subtitle ? 11.5 : 7.5;
      const availW = maxWidth - boxPadX * 2;
      const aspect = chart.widthPx > 0 ? chart.heightPx / chart.widthPx : 0.45;
      let renderW = availW;
      let renderH = renderW * aspect;
      const maxChartH = isExamScoped ? 94 : 82;
      if (renderH > maxChartH) {
        renderH = maxChartH;
        renderW = renderH / aspect;
      }

      const cardH = headerH + renderH + 5;
      ctx.ensureSpace(cardH + 4);

      const cardTop = ctx.y - 2;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(182, 198, 220);
      doc.setLineWidth(0.28);
      doc.rect(margin, cardTop, maxWidth, cardH, 'FD');

      doc.setFillColor(247, 249, 252);
      doc.setDrawColor(214, 224, 236);
      doc.rect(margin, cardTop, maxWidth, headerH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(7, 29, 65);
      doc.text(
        pdfText(`Gráfico ${idx + 1} · ${chart.title}`),
        margin + 3,
        cardTop + 4.8,
      );

      if (chart.subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(61, 79, 107);
        const subLine = doc.splitTextToSize(pdfText(chart.subtitle), maxWidth - 6)[0];
        doc.text(subLine, margin + 3, cardTop + 9.4);
      }

      const imgX = margin + (maxWidth - renderW) / 2;
      const imgY = cardTop + headerH + 2.2;
      doc.addImage(chart.dataUrl, 'PNG', imgX, imgY, renderW, renderH, undefined, 'FAST');

      ctx.y = cardTop + cardH + 4.5;
    });
  }

  // --- Section 3: Subject Breakdown Table ---
  if (exam?.subjectDetailRows && exam.subjectDetailRows.length > 0) {
    drawSectionHeading(sectionIdx++, 'Desempenho Detalhado por Matéria na Prova');

    const isProofMode = exam.kind === 'prova_biblioteca';

    const drawExamSubjectHeader = () => {
      ctx.ensureSpace(12);
      doc.setFillColor(7, 29, 65);
      doc.rect(margin, ctx.y - 4.2, maxWidth, 6.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(255, 255, 255);
      doc.text('DISCIPLINA / MATÉRIA', margin + 2.5, ctx.y + 0.4);
      if (isProofMode) {
        doc.text('REGISTROS', margin + maxWidth * 0.58, ctx.y + 0.4, { align: 'right' });
        doc.text('CORRIGIDOS', margin + maxWidth * 0.72, ctx.y + 0.4, { align: 'right' });
        doc.text('PENDENTES', margin + maxWidth * 0.85, ctx.y + 0.4, { align: 'right' });
        doc.text('PROGR.', margin + maxWidth - 2.5, ctx.y + 0.4, { align: 'right' });
      } else {
        doc.text('QUESTÕES', margin + maxWidth * 0.54, ctx.y + 0.4, { align: 'right' });
        doc.text('ACERTOS', margin + maxWidth * 0.65, ctx.y + 0.4, { align: 'right' });
        doc.text('ERROS', margin + maxWidth * 0.75, ctx.y + 0.4, { align: 'right' });
        doc.text('BRANCO', margin + maxWidth * 0.86, ctx.y + 0.4, { align: 'right' });
        doc.text('TAXA', margin + maxWidth - 2.5, ctx.y + 0.4, { align: 'right' });
      }
      ctx.y += 5.5;
    };

    drawExamSubjectHeader();

    exam.subjectDetailRows.forEach((row, idx) => {
      if (ctx.y + 7 > pageHeight - 16) {
        ctx.doc.addPage();
        ctx.y = 18;
        drawExamSubjectHeader();
      }
      if (idx % 2 === 1) {
        doc.setFillColor(247, 249, 252);
        doc.rect(margin, ctx.y - 3.8, maxWidth, 6, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, ctx.y + 2.2, margin + maxWidth, ctx.y + 2.2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.3);
      doc.setTextColor(7, 29, 65);
      const subjLabel = doc.splitTextToSize(pdfText(visibleName(row.subject)), maxWidth * 0.44)[0];
      doc.text(subjLabel, margin + 2.5, ctx.y);

      if (isProofMode) {
        const corr = row.corrected ?? 0;
        const pend = row.pending ?? Math.max(0, row.total - corr);
        const pct = row.total > 0 ? Math.round((corr / row.total) * 100) : 0;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(61, 79, 107);
        doc.text(String(row.total), margin + maxWidth * 0.58, ctx.y, { align: 'right' });
        doc.setTextColor(22, 136, 33);
        doc.text(String(corr), margin + maxWidth * 0.72, ctx.y, { align: 'right' });
        doc.setTextColor(pend > 0 ? 180 : 61, pend > 0 ? 83 : 79, pend > 0 ? 9 : 107);
        doc.text(String(pend), margin + maxWidth * 0.85, ctx.y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(pct >= 80 ? 22 : 19, pct >= 80 ? 136 : 81, pct >= 80 ? 33 : 180);
        doc.text(`${pct}%`, margin + maxWidth - 2.5, ctx.y, { align: 'right' });
      } else {
        const pct = row.accuracyPct ?? (row.total ? Math.round((row.correct / row.total) * 100) : 0);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(61, 79, 107);
        doc.text(String(row.total), margin + maxWidth * 0.54, ctx.y, { align: 'right' });
        doc.text(String(row.correct), margin + maxWidth * 0.65, ctx.y, { align: 'right' });
        doc.text(String(row.wrong), margin + maxWidth * 0.75, ctx.y, { align: 'right' });
        doc.text(String(row.blank), margin + maxWidth * 0.86, ctx.y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        if (pct >= 80) doc.setTextColor(22, 136, 33);
        else if (pct >= 60) doc.setTextColor(19, 81, 180);
        else doc.setTextColor(201, 42, 42);
        doc.text(`${pct}%`, margin + maxWidth - 2.5, ctx.y, { align: 'right' });
      }
      ctx.y += 6;
    });
    ctx.y += 4;
  } else if (params.subjectRows.length > 0) {
    drawSectionHeading(sectionIdx++, 'Desempenho Detalhado por Disciplina');

    const drawSubjectTableHeader = () => {
      ctx.ensureSpace(12);
      doc.setFillColor(7, 29, 65);
      doc.rect(margin, ctx.y - 4.2, maxWidth, 6.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(255, 255, 255);
      doc.text('DISCIPLINA / MATÉRIA', margin + 2.5, ctx.y + 0.4);
      doc.text('QUESTÕES', margin + maxWidth * 0.54, ctx.y + 0.4, { align: 'right' });
      doc.text('ACERTOS', margin + maxWidth * 0.66, ctx.y + 0.4, { align: 'right' });
      doc.text('ERROS', margin + maxWidth * 0.76, ctx.y + 0.4, { align: 'right' });
      doc.text('TAXA', margin + maxWidth * 0.87, ctx.y + 0.4, { align: 'right' });
      doc.text('TEMPO', margin + maxWidth - 2.5, ctx.y + 0.4, { align: 'right' });
      ctx.y += 5.5;
    };

    drawSubjectTableHeader();

    params.subjectRows.forEach((row, idx) => {
      if (ctx.y + 7 > pageHeight - 16) {
        ctx.doc.addPage();
        ctx.y = 18;
        drawSubjectTableHeader();
      }
      const pct = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
      const wrong = Math.max(0, row.answered - row.correct);

      if (idx % 2 === 1) {
        doc.setFillColor(247, 249, 252);
        doc.rect(margin, ctx.y - 3.8, maxWidth, 6, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, ctx.y + 2.2, margin + maxWidth, ctx.y + 2.2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.3);
      doc.setTextColor(7, 29, 65);
      const subjLabel = doc.splitTextToSize(pdfText(visibleName(row.subject)), maxWidth * 0.44)[0];
      doc.text(subjLabel, margin + 2.5, ctx.y);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(61, 79, 107);
      doc.text(String(row.answered), margin + maxWidth * 0.54, ctx.y, { align: 'right' });
      doc.text(String(row.correct), margin + maxWidth * 0.66, ctx.y, { align: 'right' });
      doc.text(String(wrong), margin + maxWidth * 0.76, ctx.y, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      if (pct >= 80) doc.setTextColor(22, 136, 33);
      else if (pct >= 60) doc.setTextColor(19, 81, 180);
      else doc.setTextColor(201, 42, 42);
      doc.text(`${pct}%`, margin + maxWidth * 0.87, ctx.y, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(7, 29, 65);
      doc.text(pdfText(params.formatDuration(row.studySeconds)), margin + maxWidth - 2.5, ctx.y, {
        align: 'right',
      });
      ctx.y += 6;
    });
    ctx.y += 4;
  }

  // --- Section 4 (Exam Mode): Critical / Missed Questions Audit Table ---
  if (exam?.missedQuestions && exam.missedQuestions.length > 0) {
    drawSectionHeading(
      sectionIdx++,
      exam.kind === 'simulado'
        ? `Quadro de Questões Críticas da Prova (${exam.missedQuestions.length})`
        : `Registros e Pontos de Revisão da Prova (${exam.missedQuestions.length})`,
    );

    exam.missedQuestions.slice(0, 60).forEach((item, idx) => {
      const qPrefix = item.numero ? `Q${String(item.numero).padStart(2, '0')}` : `#${String(idx + 1).padStart(2, '0')}`;
      const answerMeta =
        item.resposta || item.gabarito
          ? ` · Marcada: ${item.resposta || 'Em branco'} | Gabarito: ${item.gabarito || '-'}`
          : '';
      const headerLine = `${qPrefix} · ${visibleName(item.subject)} [${item.status}]${answerMeta}`;
      const snippet = item.resumo?.trim() ? item.resumo.trim().replace(/\s+/g, ' ').slice(0, 210) : '';

      ctx.ensureSpace(snippet ? 11.5 : 6.5);
      if (idx % 2 === 1) {
        doc.setFillColor(247, 249, 252);
        doc.rect(margin, ctx.y - 3.6, maxWidth, snippet ? 9.8 : 5.4, 'F');
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.1);
      doc.setTextColor(
        item.status === 'Corrigido' ? 22 : item.status === 'Erro' ? 185 : 7,
        item.status === 'Corrigido' ? 118 : item.status === 'Erro' ? 28 : 29,
        item.status === 'Corrigido' ? 33 : item.status === 'Erro' ? 28 : 65,
      );
      const hLine = (doc.splitTextToSize(pdfText(headerLine), maxWidth - 4) as string[])[0] || '';
      doc.text(hLine, margin + 2, ctx.y);
      ctx.y += 4.3;

      if (snippet) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        doc.setTextColor(61, 79, 107);
        const sLines = (doc.splitTextToSize(pdfText(snippet), maxWidth - 6) as string[]).slice(0, 2);
        sLines.forEach((sl) => {
          ctx.ensureSpace(4.2);
          doc.text(sl, margin + 3.5, ctx.y);
          ctx.y += 3.8;
        });
      }
      ctx.y += 1.2;
    });
    ctx.y += 2;
  }

  // --- General Mode Sections (Study Time, 14-Day Evolution, Banks, Recent Simulations) ---
  if (!isExamScoped) {
    if (params.filteredStudySummary) {
      drawSectionHeading(sectionIdx++, 'Apuração de Carga Horária no Período Filtrado');

      ctx.ensureSpace(14);
      doc.setFillColor(247, 249, 252);
      doc.setDrawColor(182, 198, 220);
      doc.rect(margin, ctx.y - 3, maxWidth, 9.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.6);
      doc.setTextColor(7, 29, 65);
      doc.text(
        pdfText(
          `Total acumulado: ${params.filteredStudySummary.totalFormatted}   ·   Média/dia ativo: ${params.filteredStudySummary.avgFormatted}   ·   ${params.filteredStudySummary.activeDays} dia(s) ativo(s)   ·   ${params.filteredStudySummary.sessionsCount} sessão(ões)`,
        ),
        margin + 3,
        ctx.y + 2.5,
      );
      ctx.y += 11;

      if (params.filteredStudyByDate && params.filteredStudyByDate.length > 0) {
        params.filteredStudyByDate.slice(0, 20).forEach((dRow, idx) => {
          const [yy, mm, dd] = /^\d{4}-\d{2}-\d{2}$/.test(dRow.date) ? dRow.date.split('-') : ['', '', ''];
          const brDate = yy ? `${dd}/${mm}/${yy}` : dRow.date;
          const subjectsText = Object.entries(dRow.subjects)
            .map(([subj, sec]) => `${visibleName(subj)} (${params.formatDuration(sec)})`)
            .join(', ');
          ctx.ensureSpace(7);
          if (idx % 2 === 1) {
            doc.setFillColor(247, 249, 252);
            doc.rect(margin, ctx.y - 3.6, maxWidth, 5.4, 'F');
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.2);
          doc.setTextColor(7, 29, 65);
          ctx.writeWrapped(
            pdfText(
              `${brDate} (${dRow.day}) - ${params.formatDuration(dRow.seconds)}${subjectsText ? ` · ${subjectsText}` : ''}`,
            ),
            4.6,
          );
        });
        ctx.y += 3;
      }
    }

    if (params.dailySeries && params.dailySeries.length > 0) {
      const activeDays = params.dailySeries.filter((d) => d.answered > 0 || d.simulations > 0 || d.studySeconds > 0);
      if (activeDays.length > 0) {
        drawSectionHeading(sectionIdx++, 'Registro Diário dos Últimos 14 Dias');

        activeDays.forEach((day, idx) => {
          const pct = day.answered ? Math.round((day.correct / day.answered) * 100) : 0;
          const simLabel = day.simulations > 0 ? ` · ${day.simulations} simulado(s)` : '';
          ctx.ensureSpace(7);
          if (idx % 2 === 1) {
            doc.setFillColor(247, 249, 252);
            doc.rect(margin, ctx.y - 3.6, maxWidth, 5, 'F');
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(35, 45, 65);
          doc.text(
            pdfText(
              `${day.label}: ${day.answered} questões (${day.correct} acertos / ${day.wrong} erros · ${pct}%)${simLabel} · Tempo: ${params.formatDuration(day.studySeconds)}`,
            ),
            margin + 2,
            ctx.y,
          );
          ctx.y += 5;
        });
        ctx.y += 3;
      }
    }

    if (params.bankRows.length > 0) {
      drawSectionHeading(sectionIdx++, 'Aproveitamento Consolidado por Banca');

      params.bankRows.forEach((b, idx) => {
        ctx.ensureSpace(7);
        if (idx % 2 === 1) {
          doc.setFillColor(247, 249, 252);
          doc.rect(margin, ctx.y - 3.6, maxWidth, 5.4, 'F');
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(7, 29, 65);
        doc.text(pdfText(b.bank), margin + 2, ctx.y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(61, 79, 107);
        doc.text(
          pdfText(`${b.accuracy}% (${b.correct}/${b.totalQuestions} questões em ${b.simulations} simulado(s))`),
          margin + maxWidth - 2,
          ctx.y,
          { align: 'right' },
        );
        ctx.y += 5.4;
      });
      ctx.y += 3;
    }

    if (params.recentSimulations.length > 0) {
      drawSectionHeading(sectionIdx++, 'Boletim de Ocorrências (Simulados Recentes)');

      params.recentSimulations.slice(0, 15).forEach((sim, idx) => {
        ctx.ensureSpace(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.6);
        doc.setTextColor(7, 29, 65);
        const bankTag = sim.banca ? ` [${sim.banca}]` : '';
        const ptsTag = typeof sim.pontos_liquidos === 'number' ? ` · Líquidos: ${sim.pontos_liquidos}` : '';
        ctx.writeWrapped(
          pdfText(
            `${idx + 1}. ${sim.titulo}${bankTag} (${sim.data}) - ${sim.acertos}/${sim.total} (${sim.aproveitamento}%)${ptsTag}`,
          ),
          4.8,
        );
      });
    }
  }

  // --- Running Headers (Pages 2+) & Institutional Footers (All Pages) ---
  const totalPages = doc.getNumberOfPages();
  const runningRightLabel = isExamScoped && exam ? visibleName(exam.title) : 'Monitor de Desempenho · Visão Geral';

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    if (p > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(7, 29, 65);
      doc.text('estuda.gov.br · Relatório Oficial de Desempenho', margin, 9.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(82, 98, 124);
      const shortRight = (doc.splitTextToSize(pdfText(runningRightLabel), 82) as string[])[0] || '';
      doc.text(shortRight, pageWidth - margin, 9.5, { align: 'right' });

      doc.setDrawColor(198, 211, 228);
      doc.setLineWidth(0.25);
      doc.line(margin, 11.5, pageWidth - margin, 11.5);
    }

    doc.setDrawColor(214, 224, 236);
    doc.setLineWidth(0.3);
    doc.line(margin, 285, margin + maxWidth, 285);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(92, 110, 138);
    doc.text(
      pdfText(`estuda.gov.br · Portal da Transparência Estudantil · Protocolo ${protocolNumber} · ${issuedDateOnly}`),
      margin,
      289.5,
    );
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(7, 29, 65);
    doc.text(
      pdfText(`Página ${p} de ${totalPages}`),
      margin + maxWidth,
      289.5,
      { align: 'right' },
    );
  }

  const fileName =
    isExamScoped && exam
      ? `relatorio_oficial_prova_${cleanSafeName(visibleName(exam.title)).replace(/\s+/g, '_')}_${localDateIso()}.pdf`
      : `relatorio_oficial_desempenho_${localDateIso()}.pdf`;

  doc.save(fileName);
  return fileName;
}

export interface StudentCertificateParams {
  holderName: string;
  rankTitle: string;
  rankLevel?: number;
  maxRankLevel?: number;
  totalXp?: number;
  unlockedMedalsCount?: number;
  totalMedalsCount?: number;
  pinnedMedals?: Array<{ title: string; tierLabel: string; awardDate?: string }>;
  protocolNumber: string;
  isRegular: boolean;
  totalQuestionsBank: number;
  answeredQuestions: number;
  correctQuestions: number;
  accuracyPercent: number;
  completedSimulations: number;
  totalStudyFormatted: string;
  completedGoalsCount: number;
  pendingReviewsCount: number;
  pendingPaymentsCount: number;
  lawsCount: number;
  contestsCount: number;
}

export function exportStudentClearanceCertificatePdf(params: StudentCertificateParams): void {
  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth } = ctx;

  // Federal Navy Header Banner
  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Tricolore Flag Stripe
  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, 34, third, 2, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, 34, third, 2, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, 34, pageWidth - third * 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 205, 7);
  doc.text('REPUBLICA FEDERATIVA DO CAFE FORTE · ESTUDA.GOV.BR', margin, 12);

  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text('CERTIDAO DE REGULARIDADE E APROVEITAMENTO ESTUDANTIL', margin, 21);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(215, 225, 240);
  doc.text(
    safePdfText('Ministerio da Aprovacao, Cafe Forte e Madrugadas (Documento Parodia para Controle Pessoal)'),
    margin,
    28,
  );

  ctx.y = 46;

  // Protocol & Status Box
  doc.setFillColor(244, 247, 252);
  doc.setDrawColor(195, 208, 228);
  doc.rect(margin, ctx.y, maxWidth, 24, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(67, 83, 107);
  doc.text('PROTOCOLO DE EMISSAO', margin + 4, ctx.y + 7);
  doc.text('SITUACAO CADASTRAL NO EDITAL', margin + maxWidth * 0.52, ctx.y + 7);

  doc.setFontSize(12);
  doc.setTextColor(7, 29, 65);
  doc.text(safePdfText(params.protocolNumber), margin + 4, ctx.y + 15);

  if (params.isRegular) {
    doc.setTextColor(22, 136, 33);
    doc.text('REGULAR · APTO PARA A PROVA', margin + maxWidth * 0.52, ctx.y + 15);
  } else {
    doc.setTextColor(180, 83, 9);
    doc.text('COM PENDENCIAS NA OUVIDORIA', margin + maxWidth * 0.52, ctx.y + 15);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(95, 110, 132);
  doc.text(
    safePdfText(`Emitido eletronicamente em ${new Date().toLocaleString('pt-BR')}`),
    margin + 4,
    ctx.y + 21,
  );

  ctx.y += 33;

  // Holder Identification
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(19, 81, 180);
  doc.text('1. IDENTIFICACAO DO CIDADO-ESTUDANTE', margin, ctx.y);
  ctx.y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(25, 35, 50);
  ctx.writeWrapped(`Titular do Dossie: ${params.holderName}`, 5.5);
  const rankLine =
    params.rankLevel && params.maxRankLevel
      ? `Cargo na Carreira: Nivel ${params.rankLevel}/${params.maxRankLevel} - ${params.rankTitle}${
          typeof params.totalXp === 'number'
            ? ` (${params.totalXp.toLocaleString('pt-BR')} XP)`
            : ''
        }`
      : `Patente / Grau Ministerial: ${params.rankTitle}`;
  ctx.writeWrapped(rankLine, 5.5);
  if (params.pinnedMedals && params.pinnedMedals.length > 0) {
    const medalsSummary = params.pinnedMedals
      .map(
        (m) =>
          `${m.title} (${m.tierLabel}${m.awardDate ? ` - ${m.awardDate}` : ''})`,
      )
      .join(' | ');
    ctx.writeWrapped(`Vitrine de Honra: ${medalsSummary}`, 5.2);
  }
  ctx.y += 4;

  // Official Attestation Paragraph
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(19, 81, 180);
  doc.text('2. ATESTADO DE FREQUENCIA E RENDIMENTO', margin, ctx.y);
  ctx.y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 40, 55);
  ctx.writeWrapped(
    `Certifica-se, para os devidos fins de motivacao pessoal e prestacao de contas perante o proprio cronograma, que o(a) estudante acima identificado(a) contabilizou ${params.answeredQuestions.toLocaleString('pt-BR')} questao(oes) resolvida(s) com ${params.correctQuestions.toLocaleString('pt-BR')} acerto(s) homologado(s) (${params.accuracyPercent}% de aproveitamento) e ${params.totalStudyFormatted} registrados no Ponto Eletronico de Estudos.`,
    5.4,
  );
  ctx.y += 5;

  // Structured Metrics Table
  const rows: Array<[string, string]> = [
    ...(typeof params.unlockedMedalsCount === 'number' &&
    typeof params.totalMedalsCount === 'number'
      ? ([
          [
            'Medalhas de Merito conquistadas',
            `${params.unlockedMedalsCount} / ${params.totalMedalsCount}`,
          ],
        ] as Array<[string, string]>)
      : []),
    ['Questoes disponiveis no acervo', params.totalQuestionsBank.toLocaleString('pt-BR')],
    ['Simulados fechados concluidos', params.completedSimulations.toLocaleString('pt-BR')],
    ['Metas de cronograma concluidas', params.completedGoalsCount.toLocaleString('pt-BR')],
    ['Legislacoes vigentes cadastradas', params.lawsCount.toLocaleString('pt-BR')],
    ['Concursos / editais em acompanhamento', params.contestsCount.toLocaleString('pt-BR')],
    ['Revisoes pendentes na Ouvidoria de Erros', params.pendingReviewsCount.toLocaleString('pt-BR')],
    ['Guias/boletos de inscricao em aberto', params.pendingPaymentsCount.toLocaleString('pt-BR')],
  ];

  rows.forEach(([label, val], idx) => {
    ctx.ensureSpace(9);
    if (idx % 2 === 0) {
      doc.setFillColor(247, 249, 252);
      doc.rect(margin, ctx.y - 4.5, maxWidth, 7, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(50, 62, 80);
    doc.text(safePdfText(label), margin + 3, ctx.y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(7, 29, 65);
    doc.text(safePdfText(val), margin + maxWidth - 3, ctx.y, { align: 'right' });
    ctx.y += 7;
  });

  ctx.y += 8;

  // Stamp Box
  ctx.ensureSpace(28);
  doc.setDrawColor(19, 81, 180);
  doc.setLineWidth(0.5);
  doc.rect(margin, ctx.y, maxWidth, 22, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(19, 81, 180);
  doc.text('AUTENTICACAO DIGITAL INTERNA · ESTUDA.GOV.BR', margin + 4, ctx.y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  doc.text(
    safePdfText('Valido em todo o territorio do seu escritorio, biblioteca publica ou mesa da cozinha.'),
    margin + 4,
    ctx.y + 13,
  );
  doc.text(
    safePdfText(`Assinado eletronicamente por: Sistema Central do Estudante · Protocolo ${params.protocolNumber}`),
    margin + 4,
    ctx.y + 18.5,
  );

  doc.save(`certidao_estudantil_${localDateIso()}.pdf`);
}

export interface SimulationPreliminaryPdfParams {
  titulo: string;
  data: string;
  materia: string;
  banca?: string;
  acertos: number;
  erros: number;
  emBranco: number;
  total: number;
  aproveitamento: number;
  pontosLiquidos?: number;
  tempoFormatted: string;
  cutoffPercent: number;
  wrongQuestionNumbers: number[];
  candidateName?: string;
}

export function exportSimulationPreliminaryResultPdf(params: SimulationPreliminaryPdfParams): void {
  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth } = ctx;
  const approved = params.aproveitamento >= params.cutoffPercent;
  const editalCode = `DOU-${String(params.total * 19 + params.acertos * 13 + 2026).padStart(5, '0')}/2026`;

  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 32, 'F');

  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, 32, third, 2, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, 32, third, 2, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, 32, pageWidth - third * 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 205, 7);
  doc.text('DIARIO OFICIAL DOS ESTUDOS · SECAO DE EXAMES E BANCAS', margin, 11);

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('EDITAL DE RESULTADO PRELIMINAR DA PROVA LACRADA', margin, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(215, 225, 240);
  doc.text(
    safePdfText(`Edital ${editalCode} · ${params.banca ? `Banca: ${params.banca}` : 'Banca Examinadora Interna'}`),
    margin,
    27,
  );

  ctx.y = 44;

  // Status banner
  doc.setFillColor(approved ? 236 : 254, approved ? 250 : 242, approved ? 240 : 242);
  doc.setDrawColor(approved ? 22 : 200, approved ? 136 : 70, approved ? 33 : 70);
  doc.rect(margin, ctx.y, maxWidth, 22, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 90, 105);
  doc.text('PARECER PRELIMINAR DA BANCA', margin + 4, ctx.y + 7);
  doc.text(`NOTA DE CORTE ADOTADA: ${params.cutoffPercent}%`, margin + maxWidth - 4, ctx.y + 7, { align: 'right' });

  doc.setFontSize(12);
  if (approved) {
    doc.setTextColor(22, 136, 33);
    doc.text('HABILITADO NA ETAPA · DESEMPENHO HOMOLOGADO', margin + 4, ctx.y + 16);
  } else {
    doc.setTextColor(180, 35, 24);
    doc.text('ENCAMINHADO A OUVIDORIA DE ERROS (ABAIXO DO CORTE)', margin + 4, ctx.y + 16);
  }

  ctx.y += 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(19, 81, 180);
  doc.text('1. IDENTIFICACAO DA AVALIACAO E CANDIDATO', margin, ctx.y);
  ctx.y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(25, 35, 50);
  ctx.writeWrapped(`Simulado / Exame: ${params.titulo}`, 5.5);
  ctx.writeWrapped(`Candidato(a): ${params.candidateName || 'Cidadao-Estudante Federal'}`, 5.5);
  ctx.writeWrapped(`Disciplina / Abrangencia: ${visibleName(params.materia)}`, 5.5);
  ctx.writeWrapped(`Data de aplicacao: ${params.data} · Tempo total em sala: ${params.tempoFormatted}`, 5.5);
  ctx.y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(19, 81, 180);
  doc.text('2. APURACAO OBJETIVA DE RESULTADOS', margin, ctx.y);
  ctx.y += 6;

  const summaryRows: Array<[string, string]> = [
    ['Total de questoes da prova', String(params.total)],
    ['Respostas corretas (Acertos)', String(params.acertos)],
    ['Respostas incorretas (Erros)', String(params.erros)],
    ['Questoes deixadas em branco', String(params.emBranco)],
    ['Percentual de aproveitamento', `${params.aproveitamento}%`],
    ...(typeof params.pontosLiquidos === 'number'
      ? [['Pontuacao liquida (Regra CESPE)', `${params.pontosLiquidos > 0 ? `+${params.pontosLiquidos}` : params.pontosLiquidos} pts`] as [string, string]]
      : []),
  ];

  summaryRows.forEach(([label, val], idx) => {
    ctx.ensureSpace(9);
    if (idx % 2 === 0) {
      doc.setFillColor(246, 248, 252);
      doc.rect(margin, ctx.y - 4.5, maxWidth, 7, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(45, 55, 72);
    doc.text(safePdfText(label), margin + 3, ctx.y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(7, 29, 65);
    doc.text(safePdfText(val), margin + maxWidth - 3, ctx.y, { align: 'right' });
    ctx.y += 7;
  });

  ctx.y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(19, 81, 180);
  doc.text('3. DESPACHO DA OUVIDORIA E RECURSOS', margin, ctx.y);
  ctx.y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(40, 45, 55);
  if (params.wrongQuestionNumbers.length > 0) {
    ctx.writeWrapped(
      `Questoes protocoladas para revisao na Ouvidoria (Erros): Q${params.wrongQuestionNumbers.join(', Q')}. Recomenda-se revisao imediata antes da proxima bateria.`,
      5.4,
    );
  } else {
    ctx.writeWrapped(
      'Nenhuma divergencia de gabarito registrada nesta aplicacao. Desempenho integral homologado sem ressalvas.',
      5.4,
    );
  }

  ctx.y += 8;
  ctx.ensureSpace(20);
  doc.setDrawColor(19, 81, 180);
  doc.rect(margin, ctx.y, maxWidth, 16, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(19, 81, 180);
  doc.text('PUBLICACAO ELETRONICA OFICIAL · ESTUDA.GOV.BR', margin + 4, ctx.y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 100, 115);
  doc.text(
    safePdfText(`Edital ${editalCode} · Documento gerado em ${new Date().toLocaleString('pt-BR')}`),
    margin + 4,
    ctx.y + 12,
  );

  doc.save(`edital_resultado_${cleanSafeName(params.titulo).replace(/\s+/g, '_')}.pdf`);
}

export interface IncompleteGoalsWeekGroupPdf {
  weekKey: string;
  label: string;
  items: IncompleteGoal[];
}

export function exportIncompleteGoalsWeekPdf(params: {
  groups: IncompleteGoalsWeekGroupPdf[];
  studentName?: string;
}): void {
  const validGroups = params.groups.filter((g) => g.items.length > 0);
  if (validGroups.length === 0) return;

  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth, pageHeight } = ctx;
  const isSingleWeek = validGroups.length === 1;
  const allItems = validGroups.flatMap((g) => g.items);
  const totalSeconds = allItems.reduce((sum, item) => sum + scheduleDurationSeconds(item.tempo || ''), 0);
  const distinctSubjects = new Set(
    allItems.map((g) => visibleName(g.disciplina_fixa || g.materia || '').trim()).filter(Boolean),
  ).size;

  // Header
  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 30, 'F');
  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, 30, third, 1.8, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, 30, third, 1.8, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, 30, pageWidth - third * 2, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(255, 205, 7);
  doc.text('ESTUDA.GOV.BR · DIVIDA ATIVA DE ESTUDOS · CRONOGRAMA SEMANAL', margin, 9.5);

  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(
    normalizePdfLegalText(
      isSingleWeek
        ? `PENDENCIAS ARQUIVADAS — ${validGroups[0].label.toUpperCase()}`
        : 'PENDENCIAS ARQUIVADAS DO CRONOGRAMA (TODAS AS SEMANAS)',
    ).slice(0, 88),
    margin,
    18,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(215, 226, 244);
  doc.text(
    normalizePdfLegalText(
      `Estudante: ${params.studentName || 'Estudante'} · Emitido em ${localDateTimeBrazilian()}`,
    ),
    margin,
    25.5,
  );

  ctx.y = 38;

  // KPI summary bar
  doc.setFillColor(246, 248, 252);
  doc.setDrawColor(186, 202, 224);
  doc.rect(margin, ctx.y, maxWidth, 14, 'FD');

  const kpis: Array<[string, string]> = [
    ['SEMANAS', String(validGroups.length)],
    ['PENDENCIAS', String(allItems.length)],
    ['CARGA PENDENTE', totalSeconds > 0 ? formatScheduleDuration(totalSeconds) : '—'],
    ['MATERIAS', String(distinctSubjects)],
  ];
  const colW = maxWidth / kpis.length;
  kpis.forEach(([label, val], idx) => {
    const x = margin + idx * colW;
    if (idx > 0) {
      doc.setDrawColor(210, 220, 235);
      doc.line(x, ctx.y + 2, x, ctx.y + 12);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(80, 95, 118);
    doc.text(label, x + 3, ctx.y + 5.2);
    doc.setFontSize(10.5);
    doc.setTextColor(7, 29, 65);
    doc.text(normalizePdfLegalText(val), x + 3, ctx.y + 11.2);
  });

  ctx.y += 20;

  validGroups.forEach((group, groupIdx) => {
    if (groupIdx > 0) {
      ctx.y += 4;
    }
    const groupSeconds = group.items.reduce(
      (sum, item) => sum + scheduleDurationSeconds(item.tempo || ''),
      0,
    );

    ctx.ensureSpace(16);
    doc.setFillColor(232, 239, 249);
    doc.setDrawColor(7, 29, 65);
    doc.rect(margin, ctx.y, maxWidth, 8.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(7, 29, 65);
    doc.text(normalizePdfLegalText(group.label), margin + 3, ctx.y + 5.7);

    const groupStats = `${group.items.length} pendencia(s)${
      groupSeconds > 0 ? ` · ${formatScheduleDuration(groupSeconds)}` : ''
    }`;
    doc.setFontSize(8.2);
    doc.setTextColor(19, 81, 180);
    doc.text(normalizePdfLegalText(groupStats), margin + maxWidth - 3, ctx.y + 5.7, {
      align: 'right',
    });

    ctx.y += 12;

    // Group items inside the week by weekday order (Segunda-feira -> Domingo -> Outros)
    const dayBuckets = new Map<string, IncompleteGoal[]>();
    WEEKDAYS.forEach((d) => dayBuckets.set(d, []));
    const otherDayItems: IncompleteGoal[] = [];

    group.items.forEach((goal) => {
      const dayKey = goal.dia_semana?.trim();
      if (dayKey && dayBuckets.has(dayKey)) {
        dayBuckets.get(dayKey)!.push(goal);
      } else {
        otherDayItems.push(goal);
      }
    });

    const orderedDays: Array<[string, IncompleteGoal[]]> = [
      ...WEEKDAYS.map((d) => [d, dayBuckets.get(d) || []] as [string, IncompleteGoal[]]),
      ...(otherDayItems.length > 0
        ? [['Outros / Sem dia definido', otherDayItems] as [string, IncompleteGoal[]]]
        : []),
    ].filter(([, list]) => list.length > 0);

    orderedDays.forEach(([dayName, dayItems]) => {
      const sampleDate = dayItems.find((i) => i.data?.trim())?.data?.trim() || '';
      const dayTitle = sampleDate ? `${dayName} (${sampleDate})` : dayName;

      ctx.ensureSpace(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(19, 81, 180);
      doc.text(normalizePdfLegalText(dayTitle.toUpperCase()), margin, ctx.y);
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, ctx.y + 1.4, margin + maxWidth, ctx.y + 1.4);
      ctx.y += 5.5;

      dayItems.forEach((goal) => {
        const subjectLine = `[ ] ${visibleName(goal.materia || 'Sem titulo')}`;
        const metaParts: string[] = [];
        if (goal.disciplina_fixa) metaParts.push(`Disciplina: ${visibleName(goal.disciplina_fixa)}`);
        if (goal.concurso_alvo) metaParts.push(`Concurso: ${visibleName(goal.concurso_alvo)}`);
        if (goal.tempo) metaParts.push(`Tempo: ${goal.tempo}`);
        if (goal.arquivado_em) metaParts.push(`Arquivado: ${goal.arquivado_em}`);

        const titleLines = doc.splitTextToSize(
          normalizePdfLegalText(subjectLine),
          maxWidth - 4,
        ) as string[];
        const metaLines = metaParts.length
          ? (doc.splitTextToSize(normalizePdfLegalText(metaParts.join(' · ')), maxWidth - 8) as string[])
          : [];
        const obsLines = goal.observacoes?.trim()
          ? (doc.splitTextToSize(
              normalizePdfLegalText(`Obs.: ${goal.observacoes.trim()}`),
              maxWidth - 8,
            ) as string[])
          : [];

        const neededHeight =
          titleLines.length * 4.5 +
          metaLines.length * 3.8 +
          obsLines.length * 4.1 +
          4.5;
        ctx.ensureSpace(neededHeight);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.4);
        doc.setTextColor(15, 23, 42);
        titleLines.forEach((line) => {
          doc.text(line, margin + 2, ctx.y);
          ctx.y += 4.5;
        });

        if (metaLines.length > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          metaLines.forEach((line) => {
            doc.text(line, margin + 6, ctx.y);
            ctx.y += 3.8;
          });
        }

        if (obsLines.length > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.4);
          doc.setTextColor(30, 41, 59);
          obsLines.forEach((line) => {
            doc.text(line, margin + 6, ctx.y);
            ctx.y += 4.1;
          });
        }

        ctx.y += 2.6;
      });

      ctx.y += 1.5;
    });
  });

  // Page numbers footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      normalizePdfLegalText(
        isSingleWeek
          ? `estuda.gov.br · Pendencias do Cronograma · ${validGroups[0].label}`
          : 'estuda.gov.br · Pendencias Arquivadas do Cronograma',
      ),
      margin,
      pageHeight - 6.5,
    );
    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6.5, {
      align: 'right',
    });
  }

  const fileName = isSingleWeek
    ? `pendencias_cronograma_${cleanSafeName(validGroups[0].weekKey || validGroups[0].label, 'semana').replace(/\s+/g, '_')}.pdf`
    : `pendencias_cronograma_todas_semanas_${localDateIso()}.pdf`;
  doc.save(fileName);
}

export interface WeeklyCompletedReportPdfParams {
  weekKey: string;
  weekLabel: string;
  periodLabel: string;
  weeklyNote: string;
  completedItems: CompletedGoal[];
  studentName?: string;
}

export function exportWeeklyCompletedReportPdf(params: WeeklyCompletedReportPdfParams): void {
  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth, pageHeight } = ctx;
  const items = params.completedItems || [];
  const totalSeconds = items.reduce(
    (sum, item) => sum + Math.max(scheduleDurationSeconds(item.tempo || ''), item.estudado_segundos || 0),
    0,
  );
  const distinctSubjects = new Set(
    items.map((g) => visibleName(g.disciplina_fixa || g.materia || '').trim()).filter(Boolean),
  ).size;
  const activeDays = new Set(
    items.map((g) => (g.data || g.dia_semana || '').trim()).filter(Boolean),
  ).size;

  // Header
  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 30, 'F');
  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, 30, third, 1.8, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, 30, third, 1.8, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, 30, pageWidth - third * 2, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(255, 205, 7);
  doc.text('ESTUDA.GOV.BR · ATESTADO DE CUMPRIMENTO · BALANCO SEMANAL', margin, 9.5);

  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(
    normalizePdfLegalText(`NOTAS E CUMPRIMENTO — ${params.weekLabel.toUpperCase()}`).slice(0, 88),
    margin,
    18,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(215, 226, 244);
  doc.text(
    normalizePdfLegalText(
      `Estudante: ${params.studentName || 'Estudante'} · Periodo: ${params.periodLabel} · Emitido em ${localDateTimeBrazilian()}`,
    ),
    margin,
    25.5,
  );

  ctx.y = 38;

  // KPI summary bar
  doc.setFillColor(246, 248, 252);
  doc.setDrawColor(186, 202, 224);
  doc.rect(margin, ctx.y, maxWidth, 14, 'FD');

  const kpis: Array<[string, string]> = [
    ['METAS CONCLUIDAS', String(items.length)],
    ['TEMPO CUMPRIDO', totalSeconds > 0 ? formatScheduleDuration(totalSeconds) : '—'],
    ['DIAS ATIVOS', String(activeDays)],
    ['MATERIAS', String(distinctSubjects)],
  ];
  const colW = maxWidth / kpis.length;
  kpis.forEach(([label, val], idx) => {
    const x = margin + idx * colW;
    if (idx > 0) {
      doc.setDrawColor(210, 220, 235);
      doc.line(x, ctx.y + 2, x, ctx.y + 12);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(80, 95, 118);
    doc.text(label, x + 3, ctx.y + 5.2);
    doc.setFontSize(10.5);
    doc.setTextColor(7, 29, 65);
    doc.text(normalizePdfLegalText(val), x + 3, ctx.y + 11.2);
  });

  ctx.y += 20;

  // Section 1: Weekly Notes / Balanço da Semana
  ctx.ensureSpace(22);
  doc.setFillColor(232, 239, 249);
  doc.setDrawColor(7, 29, 65);
  doc.rect(margin, ctx.y, maxWidth, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(7, 29, 65);
  doc.text('1. NOTAS E OBSERVACOES DA SEMANA', margin + 3, ctx.y + 5.4);
  ctx.y += 11.5;

  const cleanNote = params.weeklyNote.trim();
  if (cleanNote) {
    const blocks = segmentLegalText(cleanNote);
    blocks.forEach((block) => {
      const combined = block.leadBold ? `${block.leadBold} ${block.body}`.trim() : block.body;
      const lines = doc.splitTextToSize(normalizePdfLegalText(combined), maxWidth - 6) as string[];
      ctx.ensureSpace(lines.length * 4.6 + 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.3);
      doc.setTextColor(22, 33, 52);
      lines.forEach((line) => {
        doc.text(line, margin + 3, ctx.y);
        ctx.y += 4.6;
      });
      ctx.y += 1.5;
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Nenhuma observacao geral registrada para esta semana.', margin + 3, ctx.y);
    ctx.y += 6;
  }

  ctx.y += 4;

  // Section 2: Completed Goals in the Week (grouped by day)
  ctx.ensureSpace(16);
  doc.setFillColor(232, 239, 249);
  doc.setDrawColor(7, 29, 65);
  doc.rect(margin, ctx.y, maxWidth, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(7, 29, 65);
  doc.text('2. O QUE FOI FEITO NA SEMANA E OBSERVACOES', margin + 3, ctx.y + 5.4);
  ctx.y += 12;

  if (items.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Nenhuma meta concluida registrada nesta semana.', margin + 3, ctx.y);
    ctx.y += 6;
  } else {
    const dayBuckets = new Map<string, CompletedGoal[]>();
    WEEKDAYS.forEach((d) => dayBuckets.set(d, []));
    const otherItems: CompletedGoal[] = [];

    items.forEach((goal) => {
      const dayKey = goal.dia_semana?.trim();
      if (dayKey && dayBuckets.has(dayKey)) {
        dayBuckets.get(dayKey)!.push(goal);
      } else {
        otherItems.push(goal);
      }
    });

    const orderedDays: Array<[string, CompletedGoal[]]> = [
      ...WEEKDAYS.map((d) => [d, dayBuckets.get(d) || []] as [string, CompletedGoal[]]),
      ...(otherItems.length > 0
        ? [['Outros registros da semana', otherItems] as [string, CompletedGoal[]]]
        : []),
    ].filter(([, list]) => list.length > 0);

    orderedDays.forEach(([dayName, dayItems]) => {
      const sampleDate = dayItems.find((i) => i.data?.trim())?.data?.trim() || '';
      const dayTitle = sampleDate ? `${dayName} (${sampleDate})` : dayName;
      const daySec = dayItems.reduce(
        (s, i) => s + Math.max(scheduleDurationSeconds(i.tempo || ''), i.estudado_segundos || 0),
        0,
      );

      ctx.ensureSpace(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(19, 81, 180);
      doc.text(normalizePdfLegalText(dayTitle.toUpperCase()), margin, ctx.y);
      if (daySec > 0) {
        doc.setFontSize(8);
        doc.setTextColor(22, 136, 33);
        doc.text(
          normalizePdfLegalText(`Total: ${formatScheduleDuration(daySec)}`),
          margin + maxWidth,
          ctx.y,
          { align: 'right' },
        );
      }
      doc.setDrawColor(203, 213, 225);
      doc.line(margin, ctx.y + 1.4, margin + maxWidth, ctx.y + 1.4);
      ctx.y += 5.5;

      dayItems.forEach((goal) => {
        const titleLine = `[CONCLUIDA] ${visibleName(goal.materia || 'Meta concluida')}`;
        const metaParts: string[] = [];
        if (goal.disciplina_fixa && visibleName(goal.disciplina_fixa) !== visibleName(goal.materia)) {
          metaParts.push(`Disciplina: ${visibleName(goal.disciplina_fixa)}`);
        }
        if (goal.concurso_alvo) metaParts.push(`Concurso: ${visibleName(goal.concurso_alvo)}`);
        if (goal.tempo) metaParts.push(`Tempo: ${goal.tempo}`);
        else if (goal.estudado_segundos) metaParts.push(`Tempo: ${formatScheduleDuration(goal.estudado_segundos)}`);
        if (goal.data) metaParts.push(`Data: ${goal.data}`);

        const titleLines = doc.splitTextToSize(
          normalizePdfLegalText(titleLine),
          maxWidth - 4,
        ) as string[];
        const metaLines = metaParts.length
          ? (doc.splitTextToSize(normalizePdfLegalText(metaParts.join(' · ')), maxWidth - 8) as string[])
          : [];
        const obsLines = goal.observacoes?.trim()
          ? (doc.splitTextToSize(
              normalizePdfLegalText(`Observacoes: ${goal.observacoes.trim()}`),
              maxWidth - 8,
            ) as string[])
          : [];

        const needed =
          titleLines.length * 4.5 + metaLines.length * 3.8 + obsLines.length * 4.2 + 4.5;
        ctx.ensureSpace(needed);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.4);
        doc.setTextColor(15, 23, 42);
        titleLines.forEach((line) => {
          doc.text(line, margin + 2, ctx.y);
          ctx.y += 4.5;
        });

        if (metaLines.length > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          metaLines.forEach((line) => {
            doc.text(line, margin + 6, ctx.y);
            ctx.y += 3.8;
          });
        }

        if (obsLines.length > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
          obsLines.forEach((line) => {
            doc.text(line, margin + 6, ctx.y);
            ctx.y += 4.2;
          });
        }

        ctx.y += 2.6;
      });

      ctx.y += 1.5;
    });
  }

  // Page numbers footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      normalizePdfLegalText(`estuda.gov.br · Atestado de Cumprimento · ${params.weekLabel}`),
      margin,
      pageHeight - 6.5,
    );
    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6.5, {
      align: 'right',
    });
  }

  const slug = cleanSafeName(params.weekKey || params.weekLabel, 'semana').replace(/\s+/g, '_');
  doc.save(`atestado_semanal_${slug}.pdf`);
}

export interface ExamSubjectErrorStatPdfRow {
  subject: string;
  notebookTotal: number;
  notebookSharePct: number;
  wrongQuestions: number;
  answeredQuestions: number;
  errorRatePct: number | null;
  pendingCount: number;
  correctedCount: number;
}

export interface ExamErrorStatsPdfSection {
  examLabel: string;
  kindLabel: string;
  banca?: string;
  data?: string;
  hasSimulationMetrics?: boolean;
  totalQuestions?: number;
  correct?: number;
  wrong?: number;
  blank?: number;
  accuracyPct?: number;
  errorPct?: number;
  notebookTotal: number;
  pending: number;
  corrected: number;
  rows: ExamSubjectErrorStatPdfRow[];
}

export function exportExamSubjectErrorStatsPdf(params: {
  scopeTitle: string;
  subtitle?: string;
  holderName?: string;
  sections: ExamErrorStatsPdfSection[];
  fileNameSlug?: string;
}): string {
  const validSections = params.sections.filter((s) => s.rows.length > 0);
  if (!validSections.length) {
    throw new Error('Não há estatísticas de erro por matéria para exportar.');
  }

  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth, pageHeight } = ctx;
  const pdfText = (value: unknown) => normalizePdfLegalText(safePdfText(value));
  const issuedAt = localDateTimeBrazilian();
  const issuedDate = localDateBrazilian();

  const totalErrors = validSections.reduce((acc, s) => acc + s.notebookTotal, 0);
  const totalPending = validSections.reduce((acc, s) => acc + s.pending, 0);
  const totalCorrected = validSections.reduce((acc, s) => acc + s.corrected, 0);
  const distinctSubjects = new Set(
    validSections.flatMap((s) => s.rows.map((r) => normalizeSearch(visibleName(r.subject)))),
  ).size;

  // --- Official Federal Header Banner ---
  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 33, 'F');

  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, 33, third, 1.9, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, 33, third, 1.9, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, 33, pageWidth - third * 2, 1.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 205, 7);
  doc.text('ESTUDA.GOV.BR · OUVIDORIA & CADERNO DE ERROS', margin, 10);

  doc.setFontSize(13.8);
  doc.setTextColor(255, 255, 255);
  doc.text('ESTATÍSTICA DE ERRO DAS MATÉRIAS POR PROVA', margin, 18.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.1);
  doc.setTextColor(215, 227, 244);
  const bannerMeta = `${params.scopeTitle}${params.holderName ? ` · ${params.holderName}` : ''} · Emitido em ${issuedAt}`;
  doc.text((doc.splitTextToSize(pdfText(bannerMeta), maxWidth) as string[])[0] || '', margin, 26.2);

  ctx.y = 42;

  if (params.subtitle) {
    const subLines = doc.splitTextToSize(pdfText(params.subtitle), maxWidth - 6) as string[];
    const subH = subLines.length * 4.3 + 4;
    ctx.ensureSpace(subH + 3);
    doc.setFillColor(246, 249, 253);
    doc.setDrawColor(194, 209, 228);
    doc.setLineWidth(0.25);
    doc.rect(margin, ctx.y - 3, maxWidth, subH, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.1);
    doc.setTextColor(61, 79, 107);
    subLines.forEach((line, i) => {
      doc.text(line, margin + 3, ctx.y + 0.9 + i * 4.3);
    });
    ctx.y += subH + 3;
  }

  // --- Executive 4-column Summary Strip ---
  const summaryH = 15;
  ctx.ensureSpace(summaryH + 6);
  doc.setFillColor(250, 252, 255);
  doc.setDrawColor(186, 204, 228);
  doc.setLineWidth(0.3);
  doc.rect(margin, ctx.y - 2, maxWidth, summaryH, 'FD');

  const kpiItems: Array<[string, string, [number, number, number]]> = [
    [
      validSections.length === 1 ? 'PROVA ANALISADA' : 'PROVAS ANALISADAS',
      validSections.length === 1 ? visibleName(validSections[0].examLabel) : `${validSections.length} prova(s)`,
      [7, 29, 65],
    ],
    ['ERROS REGISTRADOS', `${totalErrors} registro(s)`, [185, 28, 28]],
    ['BALANÇO DE CORREÇÃO', `${totalCorrected} corrig. · ${totalPending} pend.`, [22, 136, 33]],
    ['MATÉRIAS MAPEADAS', `${distinctSubjects} disciplina(s)`, [19, 81, 180]],
  ];

  const kpiColW = maxWidth / 4;
  kpiItems.forEach(([lbl, val, color], idx) => {
    const cx = margin + idx * kpiColW;
    if (idx > 0) {
      doc.setDrawColor(214, 224, 238);
      doc.line(cx, ctx.y, cx, ctx.y + summaryH - 4);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(86, 104, 130);
    doc.text(pdfText(lbl), cx + 2.8, ctx.y + 3);

    doc.setFontSize(8.8);
    doc.setTextColor(...color);
    const valLine = (doc.splitTextToSize(pdfText(val), kpiColW - 5.5) as string[])[0] || '';
    doc.text(valLine, cx + 2.8, ctx.y + 9.4);
  });
  ctx.y += summaryH + 5;

  // --- Per-Exam Sections ---
  validSections.forEach((section, secIdx) => {
    ctx.ensureSpace(34);

    // Exam Banner
    const bannerH = 9.5;
    doc.setFillColor(235, 241, 250);
    doc.setDrawColor(182, 198, 220);
    doc.setLineWidth(0.3);
    doc.rect(margin, ctx.y - 4.2, maxWidth, bannerH, 'FD');
    doc.setFillColor(7, 29, 65);
    doc.rect(margin, ctx.y - 4.2, 2.3, bannerH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(7, 29, 65);
    const titlePrefix = validSections.length > 1 ? `${secIdx + 1}. ` : '';
    const titleLine =
      (doc.splitTextToSize(pdfText(`${titlePrefix}${visibleName(section.examLabel)}`), maxWidth - 58) as string[])[0] ||
      '';
    doc.text(titleLine, margin + 5, ctx.y + 1.8);

    const metaParts = [section.kindLabel];
    if (section.banca) metaParts.push(section.banca);
    if (section.data) metaParts.push(section.data);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(19, 81, 180);
    const rightMeta = (doc.splitTextToSize(pdfText(metaParts.join(' · ')), 54) as string[])[0] || '';
    doc.text(rightMeta, margin + maxWidth - 2.5, ctx.y + 1.6, { align: 'right' });

    ctx.y += bannerH - 1.2;

    // Optional Exam Metrics Strip
    const corrPct =
      section.notebookTotal > 0 ? Math.round((section.corrected / section.notebookTotal) * 100) : 0;
    const stripParts: string[] = [];
    if (section.hasSimulationMetrics) {
      stripParts.push(`Aproveitamento: ${section.accuracyPct ?? 0}%`);
      stripParts.push(`Taxa de erro: ${section.errorPct ?? 0}%`);
      stripParts.push(
        `Questões: ${section.correct ?? 0} acertos / ${section.wrong ?? 0} erros${
          section.blank ? ` / ${section.blank} branco` : ''
        } (${section.totalQuestions ?? 0} total)`,
      );
    } else {
      stripParts.push(`Erros vinculados: ${section.notebookTotal}`);
    }
    stripParts.push(`Correção: ${corrPct}% (${section.corrected} corrig. / ${section.pending} pend.)`);

    ctx.ensureSpace(8);
    doc.setFillColor(248, 250, 253);
    doc.setDrawColor(214, 224, 238);
    doc.setLineWidth(0.22);
    doc.rect(margin, ctx.y - 1.8, maxWidth, 6.4, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(52, 70, 96);
    const stripLine = (doc.splitTextToSize(pdfText(stripParts.join('   ·   ')), maxWidth - 5) as string[])[0] || '';
    doc.text(stripLine, margin + 2.5, ctx.y + 2.3);
    ctx.y += 7.5;

    // Subject Table Header
    const drawTableHeader = () => {
      ctx.ensureSpace(12);
      doc.setFillColor(7, 29, 65);
      doc.rect(margin, ctx.y - 3.8, maxWidth, 6.4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(255, 255, 255);
      doc.text('#', margin + 2.2, ctx.y + 0.5);
      doc.text('MATÉRIA', margin + 9.5, ctx.y + 0.5);
      doc.text('ERROS', margin + maxWidth * 0.54, ctx.y + 0.5, { align: 'right' });
      doc.text('% PROVA', margin + maxWidth * 0.65, ctx.y + 0.5, { align: 'right' });
      doc.text('TAXA ERRO', margin + maxWidth * 0.78, ctx.y + 0.5, { align: 'right' });
      doc.text('PEND.', margin + maxWidth * 0.88, ctx.y + 0.5, { align: 'right' });
      doc.text('CORRIG.', margin + maxWidth - 2.2, ctx.y + 0.5, { align: 'right' });
      ctx.y += 5.4;
    };

    drawTableHeader();

    section.rows.forEach((row, rIdx) => {
      if (ctx.y + 9 > pageHeight - 16) {
        doc.addPage();
        ctx.y = 18;
        drawTableHeader();
      }

      const barPct = Math.max(0, Math.min(100, row.errorRatePct !== null ? row.errorRatePct : row.notebookSharePct));
      const barColor: [number, number, number] =
        barPct >= 50 ? [201, 42, 42] : barPct >= 25 ? [180, 83, 9] : [19, 81, 180];

      if (rIdx % 2 === 1) {
        doc.setFillColor(247, 249, 252);
        doc.rect(margin, ctx.y - 3.6, maxWidth, 7.6, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, ctx.y + 4, margin + maxWidth, ctx.y + 4);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(92, 110, 138);
      doc.text(`${rIdx + 1}º`, margin + 2.2, ctx.y + 0.1);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(7, 29, 65);
      const subjShort =
        (doc.splitTextToSize(pdfText(visibleName(row.subject)), maxWidth * 0.41) as string[])[0] || '';
      doc.text(subjShort, margin + 9.5, ctx.y + 0.1);

      // Visual mini progress bar under subject name
      const barX = margin + 9.5;
      const barY = ctx.y + 1.5;
      const barTotalW = maxWidth * 0.36;
      doc.setFillColor(229, 235, 243);
      doc.rect(barX, barY, barTotalW, 1.35, 'F');
      doc.setFillColor(...barColor);
      doc.rect(barX, barY, Math.max(1.2, (barTotalW * barPct) / 100), 1.35, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(7, 29, 65);
      doc.text(String(row.notebookTotal), margin + maxWidth * 0.54, ctx.y + 0.4, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(61, 79, 107);
      doc.text(`${row.notebookSharePct}%`, margin + maxWidth * 0.65, ctx.y + 0.4, { align: 'right' });

      if (row.errorRatePct !== null) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...barColor);
        doc.text(
          `${row.errorRatePct}% (${row.wrongQuestions}/${row.answeredQuestions})`,
          margin + maxWidth * 0.78,
          ctx.y + 0.4,
          { align: 'right' },
        );
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 134, 156);
        doc.text('—', margin + maxWidth * 0.78, ctx.y + 0.4, { align: 'right' });
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(row.pendingCount > 0 ? 180 : 92, row.pendingCount > 0 ? 83 : 110, row.pendingCount > 0 ? 9 : 138);
      doc.text(String(row.pendingCount), margin + maxWidth * 0.88, ctx.y + 0.4, { align: 'right' });

      doc.setTextColor(22, 136, 33);
      doc.text(String(row.correctedCount), margin + maxWidth - 2.2, ctx.y + 0.4, { align: 'right' });

      ctx.y += 7.6;
    });

    ctx.y += 5;
  });

  // --- Running Headers & Institutional Footers ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(7, 29, 65);
      doc.text('estuda.gov.br · Estatística de Erro das Matérias por Prova', margin, 9.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(82, 98, 124);
      const shortScope = (doc.splitTextToSize(pdfText(params.scopeTitle), 80) as string[])[0] || '';
      doc.text(shortScope, pageWidth - margin, 9.5, { align: 'right' });

      doc.setDrawColor(198, 211, 228);
      doc.setLineWidth(0.25);
      doc.line(margin, 11.5, pageWidth - margin, 11.5);
    }

    doc.setDrawColor(214, 224, 236);
    doc.setLineWidth(0.28);
    doc.line(margin, pageHeight - 12, margin + maxWidth, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(92, 110, 138);
    doc.text(
      pdfText(`estuda.gov.br · Caderno de Erros · Emitido em ${issuedDate}`),
      margin,
      pageHeight - 7.5,
    );
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(7, 29, 65);
    doc.text(pdfText(`Página ${p} de ${totalPages}`), margin + maxWidth, pageHeight - 7.5, {
      align: 'right',
    });
  }

  const slug = cleanSafeName(params.fileNameSlug || 'por_prova', 'por_prova').replace(/\s+/g, '_');
  const fileName = `estatistica_erros_materias_${slug}_${localDateIso()}.pdf`;
  doc.save(fileName);
  return fileName;
}

export interface ContestEditalPdfResult {
  fileName: string;
  totalPoints: number;
  studiedCount: number;
  subjectsCount: number;
}

export function exportContestEditalPdf(params: {
  contest: ContestItem;
  points?: ContestEditalPoint[];
  filterSummary?: string;
  studentName?: string;
  lawsMap?: Record<string, LawFolderData>;
  readLawItems?: Record<string, string[]>;
}): ContestEditalPdfResult {
  const { contest } = params;
  const allPoints = contest.edital_pontos || [];
  const points = params.points ?? allPoints;
  const isFiltered = Boolean(params.filterSummary) || points.length !== allPoints.length;

  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth, pageHeight } = ctx;
  const pdfText = (value: unknown) => normalizePdfLegalText(safePdfText(value));
  const issuedAt = localDateTimeBrazilian();
  const issuedDate = localDateBrazilian();

  const contestTitle = visibleName(contest.concurso || 'Edital do Concurso').trim() || 'Edital do Concurso';
  const studiedCount = points.filter((p) => p.estudado).length;
  const pendingCount = points.length - studiedCount;
  const pct = points.length > 0 ? Math.round((studiedCount / points.length) * 100) : 0;

  // Group points by subject preserving insertion order (matches EditalPage)
  const groupedMap = new Map<string, ContestEditalPoint[]>();
  points.forEach((pt) => {
    const label = visibleName(pt.materia || 'Geral').trim() || 'Geral';
    const list = groupedMap.get(label);
    if (list) {
      list.push(pt);
    } else {
      groupedMap.set(label, [pt]);
    }
  });
  const groupedSubjects = Array.from(groupedMap.entries());

  // --- Official Federal Header Banner ---
  const titleLinesBanner = doc.splitTextToSize(pdfText(contestTitle.toUpperCase()), maxWidth) as string[];
  const shownTitleLines = titleLinesBanner.slice(0, 2);
  const bannerHeight = shownTitleLines.length > 1 ? 37 : 32;

  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, bannerHeight, third, 1.9, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, bannerHeight, third, 1.9, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, bannerHeight, pageWidth - third * 2, 1.9, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 205, 7);
  doc.text(pdfText('ESTUDA.GOV.BR · DIÁRIO DE EDITAIS · EDITAL VERTICALIZADO'), margin, 9.5);

  doc.setFontSize(shownTitleLines.length > 1 ? 12.2 : 13.6);
  doc.setTextColor(255, 255, 255);
  shownTitleLines.forEach((line, idx) => {
    doc.text(line, margin, 17.5 + idx * 5.6);
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.1);
  doc.setTextColor(215, 227, 244);
  const holderLine = `Estudante: ${params.studentName || 'Estudante'} · Emitido em ${issuedAt}`;
  doc.text(
    (doc.splitTextToSize(pdfText(holderLine), maxWidth) as string[])[0] || '',
    margin,
    bannerHeight - 5.2,
  );

  ctx.y = bannerHeight + 9;

  // --- Protocol / Contest Metadata Card ---
  const metaEntries: string[] = [];
  if (contest.data_abertura?.trim()) {
    metaEntries.push(`Prova / Abertura: ${contest.data_abertura.trim()}`);
  }
  if (contest.data_pagamento?.trim()) {
    metaEntries.push(`Vencimento Boleto/GRU: ${contest.data_pagamento.trim()}`);
  }
  if (contest.status_pagamento?.trim()) {
    metaEntries.push(`Status Pagamento: ${contest.status_pagamento.trim()}`);
  }
  if (contest.local_prova?.trim()) {
    metaEntries.push(`Local de Prova: ${contest.local_prova.trim()}`);
  }
  if (contest.edital_arquivo?.trim()) {
    metaEntries.push(`Arquivo vinculado: ${contest.edital_arquivo.trim()}`);
  }

  const obsClean = contest.observacoes?.trim() || '';
  const metaJoined = metaEntries.join('   ·   ');
  const metaLines = metaJoined
    ? (doc.splitTextToSize(pdfText(metaJoined), maxWidth - 6) as string[])
    : [];
  const contestObsLines = obsClean
    ? (doc.splitTextToSize(pdfText(`Observações gerais: ${obsClean}`), maxWidth - 6) as string[])
    : [];
  const filterLines = params.filterSummary
    ? (doc.splitTextToSize(pdfText(`Escopo aplicado: ${params.filterSummary}`), maxWidth - 6) as string[])
    : [];

  if (metaLines.length > 0 || contestObsLines.length > 0 || filterLines.length > 0) {
    const totalBoxLines = metaLines.length + contestObsLines.length + filterLines.length;
    const boxH = totalBoxLines * 4.2 + 5;
    ctx.ensureSpace(boxH + 4);
    doc.setFillColor(246, 249, 253);
    doc.setDrawColor(194, 209, 228);
    doc.setLineWidth(0.25);
    doc.rect(margin, ctx.y - 3, maxWidth, boxH, 'FD');

    let lineY = ctx.y + 1;
    if (metaLines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(7, 29, 65);
      metaLines.forEach((line) => {
        doc.text(line, margin + 3, lineY);
        lineY += 4.2;
      });
    }
    if (contestObsLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(61, 79, 107);
      contestObsLines.forEach((line) => {
        doc.text(line, margin + 3, lineY);
        lineY += 4.2;
      });
    }
    if (filterLines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.9);
      doc.setTextColor(19, 81, 180);
      filterLines.forEach((line) => {
        doc.text(line, margin + 3, lineY);
        lineY += 4.2;
      });
    }
    ctx.y += boxH + 3;
  }

  // --- Executive 4-column KPI Summary Strip ---
  const summaryH = 15;
  ctx.ensureSpace(summaryH + 8);
  doc.setFillColor(250, 252, 255);
  doc.setDrawColor(186, 204, 228);
  doc.setLineWidth(0.3);
  doc.rect(margin, ctx.y - 2, maxWidth, summaryH, 'FD');

  const kpiItems: Array<[string, string, [number, number, number]]> = [
    [
      isFiltered ? 'PONTOS NO RECORTE' : 'PONTOS NO EDITAL',
      isFiltered ? `${points.length} de ${allPoints.length}` : `${points.length} ponto(s)`,
      [7, 29, 65],
    ],
    ['ESTUDADOS', `${studiedCount} concluído(s)`, [22, 136, 33]],
    ['PENDENTES', `${pendingCount} pendente(s)`, pendingCount > 0 ? [180, 83, 9] : [86, 104, 130]],
    ['CUMPRIMENTO', `${pct}% · ${groupedSubjects.length} matéria(s)`, [19, 81, 180]],
  ];

  const kpiColW = maxWidth / 4;
  kpiItems.forEach(([lbl, val, color], idx) => {
    const cx = margin + idx * kpiColW;
    if (idx > 0) {
      doc.setDrawColor(214, 224, 238);
      doc.line(cx, ctx.y, cx, ctx.y + summaryH - 4);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(86, 104, 130);
    doc.text(pdfText(lbl), cx + 2.8, ctx.y + 3);

    doc.setFontSize(9.4);
    doc.setTextColor(...color);
    const valLine = (doc.splitTextToSize(pdfText(val), kpiColW - 5.5) as string[])[0] || '';
    doc.text(valLine, cx + 2.8, ctx.y + 9.6);
  });

  // Overall progress bar directly underneath KPI strip
  ctx.y += summaryH - 0.5;
  doc.setFillColor(229, 235, 243);
  doc.rect(margin, ctx.y, maxWidth, 2, 'F');
  if (pct > 0) {
    doc.setFillColor(pct === 100 ? 22 : 19, pct === 100 ? 136 : 81, pct === 100 ? 33 : 180);
    doc.rect(margin, ctx.y, Math.max(1.5, (maxWidth * pct) / 100), 2, 'F');
  }
  ctx.y += 7.5;

  // --- Section Header ---
  ctx.ensureSpace(14);
  doc.setFillColor(232, 239, 249);
  doc.setDrawColor(7, 29, 65);
  doc.setLineWidth(0.3);
  doc.rect(margin, ctx.y, maxWidth, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(7, 29, 65);
  doc.text(pdfText('1. CONTEÚDO PROGRAMÁTICO POR MATÉRIA'), margin + 3, ctx.y + 5.4);
  ctx.y += 12;

  if (groupedSubjects.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      pdfText('Nenhum ponto programático cadastrado para este edital até o momento.'),
      margin + 3,
      ctx.y,
    );
    ctx.y += 8;
  } else {
    const resolveLawLinkLabel = (link: NonNullable<ContestEditalPoint['artigos_vinculados']>[number]) => {
      const artDisplay =
        link.label ||
        (/^(?:\d|art\b)/i.test(link.filtroArtigos) && !/^art/i.test(link.filtroArtigos)
          ? `Art(s). ${link.filtroArtigos}`
          : link.filtroArtigos);
      const base = `${visibleName(link.pastaLei)} - ${artDisplay}`;
      const folder = params.lawsMap?.[link.pastaLei];
      if (!folder) return base;
      const readSet = new Set(params.readLawItems?.[link.pastaLei] || []);
      const spec = parseMultiArticleSpec(link.filtroArtigos);
      const matchedItems =
        spec.exactKeys.size > 0
          ? folder.items.filter((it) => itemMatchesMultiArticleSpec(it, spec))
          : folder.items.filter((it) =>
              normalizeSearch(`${it.artigo_base || ''} ${it.dispositivo} ${it.texto}`).includes(
                normalizeSearch(link.filtroArtigos),
              ),
            );
      if (!matchedItems.length) return base;
      const readCount = matchedItems.filter((it) => readSet.has(it.id)).length;
      return `${base} (${readCount}/${matchedItems.length} lidos)`;
    };

    groupedSubjects.forEach(([subjectName, groupPoints], secIdx) => {
      const subTotal = groupPoints.length;
      const subStudied = groupPoints.filter((p) => p.estudado).length;
      const subPct = subTotal > 0 ? Math.round((subStudied / subTotal) * 100) : 0;

      ctx.ensureSpace(22);

      // Subject Banner (matches exportExamSubjectErrorStatsPdf)
      const secBannerH = 8.8;
      doc.setFillColor(235, 241, 250);
      doc.setDrawColor(182, 198, 220);
      doc.setLineWidth(0.3);
      doc.rect(margin, ctx.y - 3.8, maxWidth, secBannerH, 'FD');
      doc.setFillColor(7, 29, 65);
      doc.rect(margin, ctx.y - 3.8, 2.3, secBannerH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.4);
      doc.setTextColor(7, 29, 65);
      const subjTitle =
        (doc.splitTextToSize(pdfText(`${secIdx + 1}. ${subjectName.toUpperCase()}`), maxWidth - 44) as string[])[0] ||
        '';
      doc.text(subjTitle, margin + 5, ctx.y + 1.9);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(subPct === 100 ? 22 : 19, subPct === 100 ? 136 : 81, subPct === 100 ? 33 : 180);
      doc.text(
        pdfText(`${subStudied}/${subTotal} (${subPct}%)`),
        margin + maxWidth - 2.5,
        ctx.y + 1.8,
        { align: 'right' },
      );

      // Thin progress strip right under subject banner
      const progY = ctx.y + secBannerH - 3.8;
      doc.setFillColor(225, 232, 242);
      doc.rect(margin, progY, maxWidth, 1.1, 'F');
      if (subPct > 0) {
        doc.setFillColor(subPct === 100 ? 22 : 19, subPct === 100 ? 136 : 81, subPct === 100 ? 33 : 180);
        doc.rect(margin, progY, Math.max(1.2, (maxWidth * subPct) / 100), 1.1, 'F');
      }

      ctx.y += secBannerH + 2.2;

      groupPoints.forEach((pt, ptIdx) => {
        const statusText = pt.estudado
          ? pt.estudado_em
            ? `ESTUDADO · ${pt.estudado_em}`
            : 'ESTUDADO'
          : 'PENDENTE';
        const titleStr = `${secIdx + 1}.${ptIdx + 1}  ${pt.titulo || 'Ponto do edital'}`;
        const titleLines = doc.splitTextToSize(pdfText(titleStr), maxWidth - 38) as string[];
        const obsLines = pt.observacao?.trim()
          ? (doc.splitTextToSize(pdfText(`Obs.: ${pt.observacao.trim()}`), maxWidth - 10) as string[])
          : [];
        const lawLinks = pt.artigos_vinculados || [];
        const lawLines = lawLinks.length
          ? (doc.splitTextToSize(
              pdfText(`Lei Seca: ${lawLinks.map(resolveLawLinkLabel).join(' | ')}`),
              maxWidth - 10,
            ) as string[])
          : [];

        const needed =
          titleLines.length * 4.4 +
          obsLines.length * 4 +
          lawLines.length * 3.9 +
          5;
        ctx.ensureSpace(needed);

        // Vector checkbox
        const boxSize = 3.2;
        const boxX = margin + 1.6;
        const boxY = ctx.y - 2.6;
        if (pt.estudado) {
          doc.setFillColor(22, 136, 33);
          doc.setDrawColor(22, 136, 33);
          doc.setLineWidth(0.25);
          doc.roundedRect(boxX, boxY, boxSize, boxSize, 0.5, 0.5, 'FD');
          // Vector checkmark
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(0.45);
          doc.line(boxX + 0.7, boxY + 1.65, boxX + 1.35, boxY + 2.35);
          doc.line(boxX + 1.35, boxY + 2.35, boxX + 2.55, boxY + 0.85);
        } else {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.3);
          doc.roundedRect(boxX, boxY, boxSize, boxSize, 0.5, 0.5, 'FD');
        }

        // Right-aligned status label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.1);
        if (pt.estudado) {
          doc.setTextColor(22, 136, 33);
        } else {
          doc.setTextColor(120, 134, 156);
        }
        doc.text(pdfText(statusText), margin + maxWidth - 1.5, ctx.y, { align: 'right' });

        // Topic Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.1);
        doc.setTextColor(pt.estudado ? 30 : 15, pt.estudado ? 58 : 23, pt.estudado ? 42 : 42);
        titleLines.forEach((line) => {
          doc.text(line, margin + 7, ctx.y);
          ctx.y += 4.4;
        });

        if (obsLines.length > 0) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.2);
          doc.setTextColor(61, 79, 107);
          obsLines.forEach((line) => {
            doc.text(line, margin + 7, ctx.y);
            ctx.y += 4;
          });
        }

        if (lawLines.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          doc.setTextColor(19, 81, 180);
          lawLines.forEach((line) => {
            doc.text(line, margin + 7, ctx.y);
            ctx.y += 3.9;
          });
        }

        // Row bottom divider
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(margin, ctx.y + 0.6, margin + maxWidth, ctx.y + 0.6);
        ctx.y += 3.8;
      });

      ctx.y += 3.5;
    });
  }

  // --- Running Headers & Institutional Footers ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(7, 29, 65);
      doc.text(pdfText('estuda.gov.br · Edital Verticalizado'), margin, 9.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(82, 98, 124);
      const shortContest = (doc.splitTextToSize(pdfText(contestTitle), 95) as string[])[0] || '';
      doc.text(shortContest, pageWidth - margin, 9.5, { align: 'right' });

      doc.setDrawColor(198, 211, 228);
      doc.setLineWidth(0.25);
      doc.line(margin, 11.5, pageWidth - margin, 11.5);
    }

    doc.setDrawColor(214, 224, 236);
    doc.setLineWidth(0.28);
    doc.line(margin, pageHeight - 12, margin + maxWidth, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(92, 110, 138);
    doc.text(
      pdfText(`estuda.gov.br · Diário de Editais · Emitido em ${issuedDate}`),
      margin,
      pageHeight - 7.5,
    );
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(7, 29, 65);
    doc.text(pdfText(`Página ${p} de ${totalPages}`), margin + maxWidth, pageHeight - 7.5, {
      align: 'right',
    });
  }

  const slug = cleanSafeName(contest.concurso || contest.id, 'edital').replace(/\s+/g, '_');
  const fileName = `edital_${slug}_${localDateIso()}.pdf`;
  doc.save(fileName);

  return {
    fileName,
    totalPoints: points.length,
    studiedCount,
    subjectsCount: groupedSubjects.length,
  };
}




