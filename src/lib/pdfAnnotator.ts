import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  PdfAnnotationColor,
  PdfFileAnnotations,
  PdfInkStroke,
  PdfTextNote,
} from '../types/study';

export const PDF_ANNOTATION_PALETTE: Record<
  PdfAnnotationColor,
  {
    label: string;
    hex: string;
    rgbTuple: [number, number, number];
    noteBgRgb: [number, number, number];
  }
> = {
  yellow: {
    label: 'Amarelo',
    hex: '#facc15',
    rgbTuple: [0.98, 0.8, 0.08],
    noteBgRgb: [1, 0.96, 0.72],
  },
  green: {
    label: 'Verde',
    hex: '#22c55e',
    rgbTuple: [0.13, 0.77, 0.37],
    noteBgRgb: [0.85, 0.98, 0.88],
  },
  blue: {
    label: 'Azul',
    hex: '#3b82f6',
    rgbTuple: [0.23, 0.51, 0.96],
    noteBgRgb: [0.86, 0.93, 1],
  },
  pink: {
    label: 'Rosa',
    hex: '#ec4899',
    rgbTuple: [0.93, 0.28, 0.6],
    noteBgRgb: [0.99, 0.87, 0.94],
  },
  red: {
    label: 'Vermelho',
    hex: '#ef4444',
    rgbTuple: [0.94, 0.27, 0.27],
    noteBgRgb: [0.99, 0.88, 0.88],
  },
};

const BAKED_MARKER_KEYWORD = 'estuda-baked-annotations';
const BAKED_AT_PREFIX = 'estuda-baked-at:';

export function simplifyStrokePoints(raw: number[], minDist = 0.0022): number[] {
  if (raw.length <= 4) {
    return raw.map((n) => Math.round(Math.max(0, Math.min(1, n)) * 10000) / 10000);
  }
  const out: number[] = [];
  let lastX = -10;
  let lastY = -10;
  for (let i = 0; i < raw.length - 1; i += 2) {
    const x = Math.round(Math.max(0, Math.min(1, raw[i])) * 10000) / 10000;
    const y = Math.round(Math.max(0, Math.min(1, raw[i + 1])) * 10000) / 10000;
    const isLast = i + 2 >= raw.length - 1;
    if (lastX < 0 || isLast || Math.hypot(x - lastX, y - lastY) >= minDist) {
      out.push(x, y);
      lastX = x;
      lastY = y;
    }
  }
  return out;
}

function safeWinAnsiText(input: string): string {
  return String(input || '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ')
    .trim();
}

function toPdfCoords(
  vx: number,
  vy: number,
  box: { x: number; y: number; width: number; height: number },
  rot: number,
): { x: number; y: number } {
  const cx = Math.max(0, Math.min(1, vx));
  const cy = Math.max(0, Math.min(1, vy));
  if (rot === 90) {
    return { x: box.x + cy * box.width, y: box.y + cx * box.height };
  }
  if (rot === 180) {
    return { x: box.x + (1 - cx) * box.width, y: box.y + cy * box.height };
  }
  if (rot === 270) {
    return { x: box.x + (1 - cy) * box.width, y: box.y + (1 - cx) * box.height };
  }
  return { x: box.x + cx * box.width, y: box.y + (1 - cy) * box.height };
}

export async function readPdfBakedTimestamp(blob: Blob): Promise<string | null> {
  try {
    const buf = await blob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(buf, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const kwStr = pdfDoc.getKeywords() || '';
    const tokens = kwStr.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
    const tsToken = tokens.find((t) => t.startsWith(BAKED_AT_PREFIX));
    if (tsToken) {
      return tsToken.slice(BAKED_AT_PREFIX.length) || null;
    }
    if (tokens.includes(BAKED_MARKER_KEYWORD)) {
      return '1970-01-01T00:00:00.000Z';
    }
    return null;
  } catch {
    return null;
  }
}

export async function bakeAnnotationsIntoPdf(
  baseBlob: Blob,
  annotations: PdfFileAnnotations,
  options?: {
    onlyAfterIso?: string;
    bakedAtIso?: string;
  },
): Promise<Blob> {
  const bytes = await baseBlob.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const afterIso = options?.onlyAfterIso;
  const strokes = (annotations.strokes || []).filter(
    (s) => !afterIso || (s.createdAt && s.createdAt > afterIso),
  );
  const notes = (annotations.notes || []).filter(
    (n) => !afterIso || (n.createdAt && n.createdAt > afterIso),
  );

  const pages = pdfDoc.getPages();

  const strokesByPage = new Map<number, PdfInkStroke[]>();
  for (const s of strokes) {
    const list = strokesByPage.get(s.page) || [];
    list.push(s);
    strokesByPage.set(s.page, list);
  }

  const notesByPage = new Map<number, PdfTextNote[]>();
  for (const n of notes) {
    const list = notesByPage.get(n.page) || [];
    list.push(n);
    notesByPage.set(n.page, list);
  }

  for (let idx = 0; idx < pages.length; idx++) {
    const pageNum = idx + 1;
    const page = pages[idx];
    const pageStrokes = strokesByPage.get(pageNum) || [];
    const pageNotes = notesByPage.get(pageNum) || [];
    if (!pageStrokes.length && !pageNotes.length) continue;

    const cropBox = page.getCropBox() || page.getMediaBox();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const displayWidth = rot === 90 || rot === 270 ? cropBox.height : cropBox.width;

    for (const stroke of pageStrokes) {
      const palette = PDF_ANNOTATION_PALETTE[stroke.color] || PDF_ANNOTATION_PALETTE.yellow;
      const strokeColor = rgb(...palette.rgbTuple);
      const isHighlighter = stroke.tool === 'highlighter';
      const opacity = isHighlighter ? 0.34 : 0.94;
      const thickness = Math.max(1, stroke.width * displayWidth);
      const pts = stroke.points;

      if (pts.length === 2) {
        const p = toPdfCoords(pts[0], pts[1], cropBox, rot);
        page.drawCircle({
          x: p.x,
          y: p.y,
          size: thickness / 2,
          color: strokeColor,
          opacity,
        });
      } else {
        for (let i = 0; i < pts.length - 3; i += 2) {
          const p1 = toPdfCoords(pts[i], pts[i + 1], cropBox, rot);
          const p2 = toPdfCoords(pts[i + 2], pts[i + 3], cropBox, rot);
          page.drawLine({
            start: p1,
            end: p2,
            thickness,
            color: strokeColor,
            opacity,
            lineCap: LineCapStyle.Round,
          });
        }
      }
    }

    for (const note of pageNotes) {
      const cleanText = safeWinAnsiText(note.text);
      if (!cleanText) continue;
      const palette = PDF_ANNOTATION_PALETTE[note.color] || PDF_ANNOTATION_PALETTE.yellow;
      const fontSize = Math.max(8, Math.min(11, displayWidth * 0.017));
      const maxCharsPerLine = 32;
      const words = cleanText.split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        if (!cur) {
          cur = w;
        } else if (cur.length + 1 + w.length <= maxCharsPerLine) {
          cur = `${cur} ${w}`;
        } else {
          lines.push(cur);
          cur = w;
        }
      }
      if (cur) lines.push(cur);
      const trimmedLines = lines.slice(0, 6);
      const lineHeight = fontSize * 1.28;
      const pad = 5;
      const boxW = Math.min(
        displayWidth * 0.42,
        Math.max(70, Math.max(...trimmedLines.map((l) => font.widthOfTextAtSize(l, fontSize))) + pad * 2),
      );
      const boxH = trimmedLines.length * lineHeight + pad * 2;

      const anchor = toPdfCoords(note.x, note.y, cropBox, rot);
      if (rot === 0) {
        const rectX = Math.max(cropBox.x + 4, Math.min(cropBox.x + cropBox.width - boxW - 4, anchor.x));
        const rectY = Math.max(cropBox.y + 4, Math.min(cropBox.y + cropBox.height - boxH - 4, anchor.y - boxH));
        page.drawRectangle({
          x: rectX,
          y: rectY,
          width: boxW,
          height: boxH,
          color: rgb(...palette.noteBgRgb),
          borderColor: rgb(...palette.rgbTuple),
          borderWidth: 1,
          opacity: 0.92,
        });
        trimmedLines.forEach((line, lIdx) => {
          page.drawText(line, {
            x: rectX + pad,
            y: rectY + boxH - pad - fontSize - lIdx * lineHeight,
            size: fontSize,
            font,
            color: rgb(0.12, 0.12, 0.14),
          });
        });
      } else {
        // Fallback rotated text note placement
        trimmedLines.forEach((line, lIdx) => {
          page.drawText(line, {
            x: anchor.x,
            y: anchor.y - lIdx * lineHeight,
            size: fontSize,
            font,
            color: rgb(0.12, 0.12, 0.14),
            rotate: degrees(rot),
          });
        });
      }
    }
  }

  const existingKeywords = (pdfDoc.getKeywords() || '')
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t && t !== BAKED_MARKER_KEYWORD && !t.startsWith(BAKED_AT_PREFIX));

  const bakedAtIso = options?.bakedAtIso || new Date().toISOString();
  const hasAnyContent = (annotations.strokes?.length || 0) > 0 || (annotations.notes?.length || 0) > 0;
  if (hasAnyContent) {
    pdfDoc.setKeywords([...existingKeywords, BAKED_MARKER_KEYWORD, `${BAKED_AT_PREFIX}${bakedAtIso}`]);
  } else {
    pdfDoc.setKeywords(existingKeywords);
  }

  const outBytes = await pdfDoc.save();
  const copiedBytes = new Uint8Array(outBytes.byteLength);
  copiedBytes.set(outBytes);
  return new Blob([copiedBytes], { type: 'application/pdf' });
}
