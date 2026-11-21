import { jsPDF } from 'jspdf';
import {
  ErrorNotebookEntry,
  HighlightColorKey,
  LawHighlight,
  LawItem,
} from '../types/study';
import { cleanSafeName, formatIsoDateBr, formatSequentialDeviceLabel, localDateBrazilian, localDateIso, localDateTimeBrazilian, normalizeSearch, visibleName } from './parsers';
import { LegalBlockKind, normalizePdfLegalText, segmentLegalText } from './legalTextFormatter';
import type { CapturedD3Chart } from './d3SvgCapture';

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
  const cleanNote = String(lawNote || '').trim();
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
}): void {
  const ctx = createDoc();
  const { doc, margin, maxWidth, pageWidth } = ctx;
  const protocolNumber = `TRANSP-${String(
    params.totalAnswered * 17 + params.completedSimulationsCount * 29 + 2026,
  ).padStart(6, '0')}`;
  const issuedAt = new Date().toLocaleString('pt-BR');

  // Helper: Draw Gov.br Official Section Heading
  const drawSectionHeading = (num: number, heading: string) => {
    ctx.ensureSpace(16);
    doc.setFillColor(237, 242, 248);
    doc.setDrawColor(182, 198, 220);
    doc.rect(margin, ctx.y - 4.5, maxWidth, 7.2, 'FD');
    doc.setFillColor(19, 81, 180);
    doc.rect(margin, ctx.y - 4.5, 2.2, 7.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(7, 29, 65);
    doc.text(safePdfText(`${num}. ${heading.toUpperCase()}`), margin + 4.8, ctx.y + 0.3);
    ctx.y += 7;
  };

  // --- Official Federal Header Banner ---
  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 33, 'F');

  const third = pageWidth / 3;
  doc.setFillColor(22, 136, 33);
  doc.rect(0, 33, third, 2, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(third, 33, third, 2, 'F');
  doc.setFillColor(19, 81, 180);
  doc.rect(third * 2, 33, pageWidth - third * 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 205, 7);
  doc.text('PORTAL DA TRANSPARENCIA ESTUDANTIL · ESTUDA.GOV.BR', margin, 11);

  doc.setFontSize(14.5);
  doc.setTextColor(255, 255, 255);
  doc.text('RELATORIO OFICIAL DE DESEMPENHO E EVOLUCAO ANALITICA', margin, 19.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(215, 225, 240);
  doc.text(
    safePdfText(
      `Titular: ${params.holderName || 'Cidadao-Estudante Federal'} · Protocolo ${protocolNumber} · Emitido em ${issuedAt}`,
    ),
    margin,
    27,
  );

  ctx.y = 43;

  // --- Active Filters Notice ---
  if (params.filterDescription) {
    const filterLines = doc.splitTextToSize(
      safePdfText(`Parametros e filtros vigentes: ${params.filterDescription}`),
      maxWidth - 6,
    ) as string[];
    const filterBoxH = filterLines.length * 4.4 + 4;
    ctx.ensureSpace(filterBoxH + 4);
    doc.setFillColor(247, 249, 252);
    doc.setDrawColor(195, 208, 228);
    doc.rect(margin, ctx.y - 3, maxWidth, filterBoxH, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.3);
    doc.setTextColor(61, 79, 107);
    filterLines.forEach((line, idx) => {
      doc.text(line, margin + 3, ctx.y + 1 + idx * 4.4);
    });
    ctx.y += filterBoxH + 3;
  }

  // --- Section 1: Executive KPIs ---
  let sectionIdx = 1;
  drawSectionHeading(sectionIdx++, 'Indicadores Consolidados de Rendimento');

  ctx.ensureSpace(22);
  const kpiGap = 3;
  const kpiW = (maxWidth - kpiGap * 3) / 4;
  const kpis: Array<{ label: string; value: string; note: string; accent: [number, number, number] }> = [
    {
      label: 'QUESTOES RESPONDIDAS',
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
      label: 'SIMULADOS CONCLUIDOS',
      value: String(params.completedSimulationsCount),
      note: 'Boletim de Ocorrencias',
      accent: [19, 81, 180],
    },
    {
      label: 'TEMPO CRONOMETRADO',
      value: params.totalStudyFormatted,
      note: 'Ponto Eletronico liquido',
      accent: [7, 29, 65],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (kpiW + kpiGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(182, 198, 220);
    doc.rect(x, ctx.y - 2, kpiW, 18, 'FD');
    doc.setFillColor(...kpi.accent);
    doc.rect(x, ctx.y - 2, kpiW, 1.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(92, 110, 138);
    doc.text(kpi.label, x + 2.5, ctx.y + 3);

    doc.setFontSize(12.5);
    doc.setTextColor(...kpi.accent);
    doc.text(safePdfText(kpi.value), x + 2.5, ctx.y + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(61, 79, 107);
    doc.text(safePdfText(doc.splitTextToSize(kpi.note, kpiW - 5)[0]), x + 2.5, ctx.y + 14.2);
  });
  ctx.y += 22;

  // --- Section 2: Captured D3 Charts ---
  if (params.charts && params.charts.length > 0) {
    drawSectionHeading(sectionIdx++, 'Paineis Graficos Analiticos (D3.js)');

    params.charts.forEach((chart, idx) => {
      const boxPadX = 3;
      const headerH = chart.subtitle ? 11.5 : 7.5;
      const availW = maxWidth - boxPadX * 2;
      const aspect = chart.widthPx > 0 ? chart.heightPx / chart.widthPx : 0.45;
      let renderW = availW;
      let renderH = renderW * aspect;
      const maxChartH = 82;
      if (renderH > maxChartH) {
        renderH = maxChartH;
        renderW = renderH / aspect;
      }

      const cardH = headerH + renderH + 5;
      ctx.ensureSpace(cardH + 4);

      const cardTop = ctx.y - 2;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(182, 198, 220);
      doc.rect(margin, cardTop, maxWidth, cardH, 'FD');

      doc.setFillColor(247, 249, 252);
      doc.setDrawColor(214, 224, 236);
      doc.rect(margin, cardTop, maxWidth, headerH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(7, 29, 65);
      doc.text(
        safePdfText(`Grafico ${idx + 1} · ${chart.title}`),
        margin + 3,
        cardTop + 4.8,
      );

      if (chart.subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(61, 79, 107);
        const subLine = doc.splitTextToSize(safePdfText(chart.subtitle), maxWidth - 6)[0];
        doc.text(subLine, margin + 3, cardTop + 9.4);
      }

      const imgX = margin + (maxWidth - renderW) / 2;
      const imgY = cardTop + headerH + 2.2;
      doc.addImage(chart.dataUrl, 'PNG', imgX, imgY, renderW, renderH, undefined, 'FAST');

      ctx.y = cardTop + cardH + 4.5;
    });
  }

  // --- Section 3: Subject Breakdown Table ---
  if (params.subjectRows.length > 0) {
    drawSectionHeading(sectionIdx++, 'Desempenho Detalhado por Disciplina');

    const drawSubjectTableHeader = () => {
      ctx.ensureSpace(12);
      doc.setFillColor(7, 29, 65);
      doc.rect(margin, ctx.y - 4.2, maxWidth, 6.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(255, 255, 255);
      doc.text('DISCIPLINA / MATERIA', margin + 2.5, ctx.y + 0.4);
      doc.text('QUESTOES', margin + maxWidth * 0.54, ctx.y + 0.4, { align: 'right' });
      doc.text('ACERTOS', margin + maxWidth * 0.66, ctx.y + 0.4, { align: 'right' });
      doc.text('ERROS', margin + maxWidth * 0.76, ctx.y + 0.4, { align: 'right' });
      doc.text('TAXA', margin + maxWidth * 0.87, ctx.y + 0.4, { align: 'right' });
      doc.text('TEMPO', margin + maxWidth - 2.5, ctx.y + 0.4, { align: 'right' });
      ctx.y += 5.5;
    };

    drawSubjectTableHeader();

    params.subjectRows.forEach((row, idx) => {
      if (ctx.y + 7 > ctx.pageHeight - 16) {
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
      const subjLabel = doc.splitTextToSize(safePdfText(visibleName(row.subject)), maxWidth * 0.44)[0];
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
      doc.text(safePdfText(params.formatDuration(row.studySeconds)), margin + maxWidth - 2.5, ctx.y, {
        align: 'right',
      });
      ctx.y += 6;
    });
    ctx.y += 4;
  }

  // --- Section 4: Filtered Study Time Breakdown ---
  if (params.filteredStudySummary) {
    drawSectionHeading(sectionIdx++, 'Apuracao de Carga Horaria no Periodo Filtrado');

    ctx.ensureSpace(14);
    doc.setFillColor(247, 249, 252);
    doc.setDrawColor(182, 198, 220);
    doc.rect(margin, ctx.y - 3, maxWidth, 9.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(7, 29, 65);
    doc.text(
      safePdfText(
        `Total acumulado: ${params.filteredStudySummary.totalFormatted}   ·   Media/dia ativo: ${params.filteredStudySummary.avgFormatted}   ·   ${params.filteredStudySummary.activeDays} dia(s) ativo(s)   ·   ${params.filteredStudySummary.sessionsCount} sessao(oes)`,
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
          `${brDate} (${dRow.day}) - ${params.formatDuration(dRow.seconds)}${subjectsText ? ` · ${subjectsText}` : ''}`,
          4.6,
        );
      });
      ctx.y += 3;
    }
  }

  // --- Section 5: 14-day Evolution ---
  if (params.dailySeries && params.dailySeries.length > 0) {
    const activeDays = params.dailySeries.filter((d) => d.answered > 0 || d.simulations > 0 || d.studySeconds > 0);
    if (activeDays.length > 0) {
      drawSectionHeading(sectionIdx++, 'Registro Diario dos Ultimos 14 Dias');

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
          safePdfText(
            `${day.label}: ${day.answered} questoes (${day.correct} acertos / ${day.wrong} erros · ${pct}%)${simLabel} · Tempo: ${params.formatDuration(day.studySeconds)}`,
          ),
          margin + 2,
          ctx.y,
        );
        ctx.y += 5;
      });
      ctx.y += 3;
    }
  }

  // --- Section 6: Bank Breakdown & Recent Simulations ---
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
      doc.text(safePdfText(b.bank), margin + 2, ctx.y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(61, 79, 107);
      doc.text(
        safePdfText(`${b.accuracy}% (${b.correct}/${b.totalQuestions} questoes em ${b.simulations} simulado(s))`),
        margin + maxWidth - 2,
        ctx.y,
        { align: 'right' },
      );
      ctx.y += 5.4;
    });
    ctx.y += 3;
  }

  if (params.recentSimulations.length > 0) {
    drawSectionHeading(sectionIdx++, 'Boletim de Ocorrencias (Simulados Recentes)');

    params.recentSimulations.slice(0, 15).forEach((sim, idx) => {
      ctx.ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.6);
      doc.setTextColor(7, 29, 65);
      const bankTag = sim.banca ? ` [${sim.banca}]` : '';
      const ptsTag = typeof sim.pontos_liquidos === 'number' ? ` · Liquidos: ${sim.pontos_liquidos}` : '';
      ctx.writeWrapped(
        `${idx + 1}. ${sim.titulo}${bankTag} (${sim.data}) - ${sim.acertos}/${sim.total} (${sim.aproveitamento}%)${ptsTag}`,
        4.8,
      );
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(214, 224, 236);
    doc.setLineWidth(0.3);
    doc.line(margin, 285, margin + maxWidth, 285);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(92, 110, 138);
    doc.text(
      safePdfText(`estuda.gov.br · Portal da Transparencia Estudantil · Protocolo ${protocolNumber}`),
      margin,
      289.5,
    );
    doc.text(
      safePdfText(`Pagina ${p} de ${totalPages}`),
      margin + maxWidth,
      289.5,
      { align: 'right' },
    );
  }

  doc.save(`relatorio_oficial_desempenho_${localDateIso()}.pdf`);
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
