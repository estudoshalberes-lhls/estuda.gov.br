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
    let line = '';
    let lastY: number | null = null;
    const lines: string[] = [];

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const textItem = item as { str: string; transform?: number[]; hasEOL?: boolean };
      const currentY = Array.isArray(textItem.transform) ? Math.round(textItem.transform[5]) : null;
      if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 4) {
        if (line.trim()) lines.push(line.trim());
        line = textItem.str;
      } else {
        line = line ? `${line}${line.endsWith(' ') || textItem.str.startsWith(' ') ? '' : ' '}${textItem.str}` : textItem.str;
      }
      if (textItem.hasEOL) {
        if (line.trim()) lines.push(line.trim());
        line = '';
        lastY = null;
      } else {
        lastY = currentY;
      }
    }
    if (line.trim()) lines.push(line.trim());
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
