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

interface PositionedTextSpan {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  order: number;
}

interface VisualLine {
  y: number;
  minX: number;
  maxX: number;
  text: string;
}

function assembleVisualLines(spans: PositionedTextSpan[]): VisualLine[] {
  if (!spans.length) return [];

  const sorted = [...spans].sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 0.5) return dy;
    const dx = a.x - b.x;
    if (Math.abs(dx) > 0.5) return dx;
    return a.order - b.order;
  });

  const bands: Array<{ anchorY: number; tol: number; items: PositionedTextSpan[] }> = [];

  for (const span of sorted) {
    const tol = Math.max(3.5, Math.min(7.5, span.fontSize * 0.48));
    let targetBand: (typeof bands)[number] | null = null;
    for (let i = bands.length - 1; i >= 0 && i >= bands.length - 6; i--) {
      const b = bands[i];
      if (Math.abs(span.y - b.anchorY) <= Math.max(b.tol, tol)) {
        targetBand = b;
        break;
      }
    }
    if (targetBand) {
      targetBand.items.push(span);
    } else {
      bands.push({ anchorY: span.y, tol, items: [span] });
    }
  }

  bands.sort((a, b) => b.anchorY - a.anchorY);

  const result: VisualLine[] = [];
  for (const band of bands) {
    const row = [...band.items].sort((a, b) => {
      const dx = a.x - b.x;
      if (Math.abs(dx) > 0.4) return dx;
      return a.order - b.order;
    });

    let lineText = '';
    let prevEndX: number | null = null;
    let prevFontSize = 10;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = 0;

    for (const item of row) {
      const raw = item.str.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
      if (!raw) continue;

      if (!raw.trim()) {
        if (lineText && !lineText.endsWith(' ')) {
          lineText += ' ';
        }
        prevEndX = Math.max(prevEndX ?? 0, item.x + item.width);
        continue;
      }

      minX = Math.min(minX, item.x);
      maxX = Math.max(maxX, item.x + item.width);

      if (!lineText) {
        lineText = raw.trimStart();
      } else if (lineText.endsWith(' ') || raw.startsWith(' ')) {
        lineText += raw;
      } else {
        const refSize = Math.max(6, Math.min(prevFontSize, item.fontSize));
        const gap = prevEndX !== null ? item.x - prevEndX : refSize;
        if (gap > Math.max(1.6, refSize * 0.16)) {
          lineText += ` ${raw}`;
        } else {
          lineText += raw;
        }
      }

      prevEndX = item.x + item.width;
      prevFontSize = item.fontSize;
    }

    const cleaned = lineText.replace(/[ \t]{2,}/g, ' ').trim();
    if (cleaned) {
      result.push({
        y: band.anchorY,
        minX: Number.isFinite(minX) ? minX : 0,
        maxX,
        text: cleaned,
      });
    }
  }

  return result;
}

function medianNumber(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function extractOrderedPageLines(spans: PositionedTextSpan[]): string[] {
  if (!spans.length) return [];

  const nonSpace = spans.filter((s) => s.str.trim().length > 0);
  if (nonSpace.length < 24) {
    return assembleVisualLines(spans).map((l) => l.text);
  }

  let pageMinX = Number.POSITIVE_INFINITY;
  let pageMaxX = Number.NEGATIVE_INFINITY;
  let pageMinY = Number.POSITIVE_INFINITY;
  let pageMaxY = Number.NEGATIVE_INFINITY;
  for (const s of nonSpace) {
    pageMinX = Math.min(pageMinX, s.x);
    pageMaxX = Math.max(pageMaxX, s.x + s.width);
    pageMinY = Math.min(pageMinY, s.y);
    pageMaxY = Math.max(pageMaxY, s.y);
  }

  const pageWidth = pageMaxX - pageMinX;
  const pageHeight = pageMaxY - pageMinY;
  if (pageWidth < 180 || pageHeight < 100) {
    return assembleVisualLines(spans).map((l) => l.text);
  }

  // Ignore top/bottom ~6% bands when detecting a central vertical gutter (running page headers/footers may span width)
  const topBannerThresholdY = pageMaxY - pageHeight * 0.07;
  const bottomFooterThresholdY = pageMinY + pageHeight * 0.07;
  const bodySpans = nonSpace.filter(
    (s) => s.y < topBannerThresholdY && s.y > bottomFooterThresholdY,
  );

  if (bodySpans.length >= 20) {
    let bestSplitX: number | null = null;
    let bestCrossing = Number.POSITIVE_INFINITY;

    for (let frac = 0.42; frac <= 0.58; frac += 0.02) {
      const candX = pageMinX + pageWidth * frac;
      let crossing = 0;
      let leftCount = 0;
      let rightCount = 0;
      for (const s of bodySpans) {
        const sEnd = s.x + s.width;
        if (s.x < candX - 4 && sEnd > candX + 4) {
          crossing++;
        } else if (sEnd <= candX + 4) {
          leftCount++;
        } else {
          rightCount++;
        }
      }
      if (leftCount >= 10 && rightCount >= 10 && crossing < bestCrossing) {
        bestCrossing = crossing;
        bestSplitX = candX;
      }
    }

    if (bestSplitX !== null && bestCrossing <= Math.max(1, Math.floor(bodySpans.length * 0.015))) {
      const leftBodySpans = spans.filter(
        (s) => s.y < topBannerThresholdY && s.y > bottomFooterThresholdY && s.x + s.width <= bestSplitX! + 4,
      );
      const rightBodySpans = spans.filter(
        (s) => s.y < topBannerThresholdY && s.y > bottomFooterThresholdY && s.x >= bestSplitX! - 4,
      );

      const leftLines = assembleVisualLines(leftBodySpans);
      const rightLines = assembleVisualLines(rightBodySpans);

      const leftMedianLen = medianNumber(leftLines.map((l) => l.text.length));
      const rightMedianLen = medianNumber(rightLines.map((l) => l.text.length));
      const leftSubstantial = leftLines.filter((l) => l.text.length >= 24).length;
      const rightSubstantial = rightLines.filter((l) => l.text.length >= 24).length;
      const leftWidthRatio = (bestSplitX - pageMinX) / pageWidth;

      if (
        leftLines.length >= 6 &&
        rightLines.length >= 6 &&
        leftSubstantial >= 4 &&
        rightSubstantial >= 4 &&
        leftMedianLen >= 22 &&
        rightMedianLen >= 22 &&
        leftWidthRatio >= 0.3
      ) {
        const topSpans = spans.filter((s) => s.y >= topBannerThresholdY);
        const bottomSpans = spans.filter((s) => s.y <= bottomFooterThresholdY);
        const centerSpans = spans.filter(
          (s) =>
            s.y < topBannerThresholdY &&
            s.y > bottomFooterThresholdY &&
            s.x < bestSplitX! - 4 &&
            s.x + s.width > bestSplitX! + 4,
        );
        const topAndWideLines = assembleVisualLines([...topSpans, ...centerSpans]).map((l) => l.text);
        const bottomLines = assembleVisualLines(bottomSpans).map((l) => l.text);
        return [
          ...topAndWideLines,
          ...leftLines.map((l) => l.text),
          ...rightLines.map((l) => l.text),
          ...bottomLines,
        ];
      }
    }
  }

  return assembleVisualLines(spans).map((l) => l.text);
}

export async function extractTextFromPdfFile(file: File | Blob, kind = 'documento'): Promise<string> {
  const pdfjsLib = await getPdfJs();
  const buffer = await file.arrayBuffer();
  let pdf: import('pdfjs-dist').PDFDocumentProxy;
  try {
    pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Não foi possível ler o PDF de ${kind}: ${message}`);
  }

  const pageTexts: string[] = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const spans: PositionedTextSpan[] = [];
    let fallbackLines: string[] = [];
    let hasAllCoords = true;

    for (let idx = 0; idx < content.items.length; idx++) {
      const item = content.items[idx];
      if (!('str' in item)) continue;
      const textItem = item as { str: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean };
      if (!textItem.str) continue;
      if (Array.isArray(textItem.transform) && textItem.transform.length >= 6) {
        const a = textItem.transform[0] || 0;
        const b = textItem.transform[1] || 0;
        const d = textItem.transform[3] || 0;
        const x = textItem.transform[4];
        const y = textItem.transform[5];
        const fontSize = Math.max(6, Math.hypot(a, b) || Math.abs(d) || textItem.height || 10);
        const width =
          typeof textItem.width === 'number' && Number.isFinite(textItem.width)
            ? Math.max(0, textItem.width)
            : textItem.str.length * fontSize * 0.45;
        spans.push({ str: textItem.str, x, y, width, fontSize, order: idx });
      } else {
        hasAllCoords = false;
        fallbackLines.push(textItem.str);
      }
    }

    const lines = hasAllCoords && spans.length > 0
      ? extractOrderedPageLines(spans)
      : fallbackLines.map((l) => l.trim()).filter(Boolean);
    pageTexts.push(lines.join('\n'));
  }

  const joined = pageTexts.join('\n\f\n');
  if (!joined.trim()) {
    throw new Error(
      `O PDF de ${kind} não contém texto selecionável; OCR não está disponível nesta versão. Envie um arquivo com texto selecionável ou digite/cole as respostas.`,
    );
  }
  return joined;
}

function decodeTextBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
  }
  const offset =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(offset));
  if (utf8Text.includes('\uFFFD')) {
    try {
      const winText = new TextDecoder('windows-1252').decode(bytes.subarray(offset));
      const badUtf8 = (utf8Text.match(/\uFFFD/g) || []).length;
      const badWin = (winText.match(/\uFFFD/g) || []).length;
      if (badWin < badUtf8) return winText;
    } catch {
      // ignore unsupported encoding fallback
    }
  }
  return utf8Text;
}

export async function readAnswerKeyInput(
  answerFile: File | null | undefined,
  answerText: string,
): Promise<string> {
  if (answerFile && answerFile.size > 0) {
    if (answerText.trim()) {
      throw new Error('Envie o gabarito em arquivo ou digitado, não nos dois formatos.');
    }
    const lower = answerFile.name.toLowerCase();
    if (!lower.endsWith('.txt') && !lower.endsWith('.pdf')) {
      throw new Error('O gabarito deve ser um arquivo .txt ou .pdf.');
    }
    if (lower.endsWith('.pdf')) {
      return extractTextFromPdfFile(answerFile, 'gabarito');
    }
    return decodeTextBuffer(await answerFile.arrayBuffer());
  }
  return answerText;
}

export async function readStudyTextFile(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) {
    return extractTextFromPdfFile(file, 'legislação');
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return decodeTextBuffer(await file.arrayBuffer());
  }
  throw new Error('Para extração automática de texto neste navegador, utilize arquivos .txt, .md ou .pdf.');
}

export async function readStudyBlobText(
  blob: Blob,
  filename: string,
  mimeType?: string,
): Promise<string> {
  const lower = String(filename || '').toLowerCase();
  const effectiveMime = String(mimeType || blob.type || '').toLowerCase();
  if (lower.endsWith('.pdf') || effectiveMime === 'application/pdf') {
    return extractTextFromPdfFile(blob, 'legislação');
  }
  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    effectiveMime.startsWith('text/')
  ) {
    return decodeTextBuffer(await blob.arrayBuffer());
  }
  throw new Error('Formato não suportado para extração automática de legislação.');
}
