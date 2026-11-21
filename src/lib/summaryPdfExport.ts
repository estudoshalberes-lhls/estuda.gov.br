import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { MindMapNode, SummaryFile, SummaryItemKind } from '../types/study';
import { getFileBlob, triggerBlobDownload } from './fileStorage';
import { normalizePdfLegalText, segmentLegalText } from './legalTextFormatter';
import { cleanSafeName, localDateIso, localDateTimeBrazilian, visibleName } from './parsers';

export function getSummaryItemKind(item: SummaryFile): SummaryItemKind {
  if (item.kind) return item.kind;
  if (item.mindMap) return 'mindmap';
  if (typeof item.content === 'string' && item.content.trim()) return 'note';
  const lower = (item.name || '').toLowerCase();
  if (lower.endsWith('.pdf') || item.mimeType === 'application/pdf') return 'pdf';
  if (lower.endsWith('.txt') || item.mimeType?.startsWith('text/plain')) return 'note';
  return 'image';
}

export function getSummaryDisplayTitle(item: SummaryFile): string {
  if (item.title?.trim()) return item.title.trim();
  const base = visibleName(item.name || 'Sem título');
  return base.replace(/\.(pdf|txt|png|jpe?g|webp|mindmap\.json)$/i, '') || base;
}

export function flattenMindMapToOutline(node: MindMapNode, depth = 0): string[] {
  const indent = '  '.repeat(depth);
  const bullet = depth === 0 ? 'TEMA CENTRAL: ' : depth === 1 ? '• ' : '- ';
  const noteSuffix = node.note?.trim() ? ` (${node.note.trim()})` : '';
  const lines = [`${indent}${bullet}${node.label.trim()}${noteSuffix}`];
  for (const child of node.children || []) {
    lines.push(...flattenMindMapToOutline(child, depth + 1));
  }
  return lines;
}

function drawGovHeader(doc: jsPDF, title: string, subtitle: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  doc.setFillColor(7, 29, 65);
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setFillColor(255, 205, 7);
  doc.rect(0, 24, pageWidth, 1.4, 'F');

  doc.setTextColor(255, 205, 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ESTUDA.GOV.BR · DOSSIÊ DE RESUMOS E ANOTAÇÕES', margin, 8.5);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12.5);
  const titleLines = doc.splitTextToSize(normalizePdfLegalText(title), pageWidth - margin * 2);
  doc.text(titleLines[0] || title, margin, 15.5);

  doc.setTextColor(215, 227, 245);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(normalizePdfLegalText(subtitle), margin, 21);

  doc.setTextColor(15, 23, 42);
  return 31;
}

function addFooters(doc: jsPDF, footerLabel: string): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(normalizePdfLegalText(footerLabel), margin, pageHeight - 6.5);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 6.5, {
      align: 'right',
    });
  }
}

function renderStructuredBodyToPdf(
  doc: jsPDF,
  text: string,
  startY: number,
  margin: number,
  maxWidth: number,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomLimit = pageHeight - 17;
  let y = startY;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 18;
    }
  };

  const blocks = segmentLegalText(text);
  for (const block of blocks) {
    const isIndent = block.kind === 'inciso' || block.kind === 'alinea' || block.kind === 'bullet';
    const xOffset = isIndent ? 4 : 0;
    const availW = maxWidth - xOffset;
    const combined = block.leadBold ? `${block.leadBold} ${block.body}`.trim() : block.body;
    const safeCombined = normalizePdfLegalText(combined);
    if (!safeCombined) continue;

    const isHeadingLike = block.kind === 'article' || block.kind === 'sumula';
    doc.setFont('helvetica', isHeadingLike ? 'bold' : 'normal');
    doc.setFontSize(isHeadingLike ? 9.8 : 9.4);
    doc.setTextColor(15, 23, 42);

    const wrapped = doc.splitTextToSize(safeCombined, availW) as string[];
    const lineHeight = 4.6;
    ensureSpace(wrapped.length * lineHeight + 2.5);

    for (const line of wrapped) {
      ensureSpace(lineHeight + 1);
      doc.text(line, margin + xOffset, y);
      y += lineHeight;
    }
    y += 1.6;
  }

  return y;
}

function buildNotesPdfBytes(
  subjectTitle: string,
  items: SummaryFile[],
  options?: { isAllSubjectsNotice?: string },
): Uint8Array | null {
  const textItems = items.filter((it) => {
    const kind = getSummaryItemKind(it);
    return kind === 'note' || kind === 'mindmap';
  });
  const pdfItems = items.filter((it) => getSummaryItemKind(it) === 'pdf');
  const imgItems = items.filter((it) => getSummaryItemKind(it) === 'image');

  if (textItems.length === 0 && !options?.isAllSubjectsNotice) {
    return null;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 17;

  const subtitle = `${textItems.length} anotação(ões)/mapa(s) · ${pdfItems.length} PDF(s) anexado(s)${imgItems.length ? ` · ${imgItems.length} imagem(ns)` : ''} · Emitido em ${localDateTimeBrazilian()}`;
  let y = drawGovHeader(doc, subjectTitle, subtitle);

  if (options?.isAllSubjectsNotice) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const wrapped = doc.splitTextToSize(normalizePdfLegalText(options.isAllSubjectsNotice), maxWidth) as string[];
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.5 + 4;
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 18;
    }
  };

  textItems.forEach((item, index) => {
    const kind = getSummaryItemKind(item);
    const displayTitle = getSummaryDisplayTitle(item);
    ensureSpace(18);

    // Item title bar
    doc.setFillColor(237, 242, 248);
    doc.setDrawColor(180, 198, 220);
    doc.rect(margin, y, maxWidth, 8.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(7, 29, 65);
    const prefix = kind === 'mindmap' ? '[MAPA MENTAL] ' : '';
    const headerText = normalizePdfLegalText(`#${index + 1} · ${prefix}${displayTitle}`);
    doc.text(headerText.slice(0, 92), margin + 2.5, y + 5.7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(item.createdAt || '', pageWidth - margin - 2.5, y + 5.7, { align: 'right' });

    y += 12;

    if (item.tags && item.tags.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(19, 81, 180);
      doc.text(
        normalizePdfLegalText(`Tópicos: ${item.tags.join(' · ')}`),
        margin,
        y,
      );
      y += 5;
    }

    if (kind === 'mindmap' && item.mindMap) {
      const outline = flattenMindMapToOutline(item.mindMap).join('\n');
      y = renderStructuredBodyToPdf(doc, outline, y, margin, maxWidth);
    } else if (item.content?.trim()) {
      y = renderStructuredBodyToPdf(doc, item.content, y, margin, maxWidth);
    }

    y += 4;
  });

  addFooters(doc, `estuda.gov.br · Dossiê de Resumos · ${subjectTitle}`);
  return new Uint8Array(doc.output('arraybuffer'));
}

async function appendBinarySummaryItemToMergedPdf(
  mergedPdf: PDFDocument,
  subjectLabel: string,
  item: SummaryFile,
): Promise<{ appendedPages: number; warning?: string }> {
  const blob = await getFileBlob(item.blobKey);
  if (!blob) {
    return { appendedPages: 0, warning: `Arquivo ausente localmente: ${item.name}` };
  }

  const kind = getSummaryItemKind(item);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  if (kind === 'pdf') {
    try {
      const sourceDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const indices = sourceDoc.getPageIndices();
      const copiedPages = await mergedPdf.copyPages(sourceDoc, indices);
      copiedPages.forEach((p) => mergedPdf.addPage(p));
      return { appendedPages: copiedPages.length };
    } catch {
      // Fallback separator page when a PDF is strictly encrypted/corrupted
      const fallbackDoc = new jsPDF({ unit: 'mm', format: 'a4' });
      const y = drawGovHeader(
        fallbackDoc,
        `${subjectLabel} — PDF Anexo`,
        `Arquivo: ${item.name}`,
      );
      fallbackDoc.setFont('helvetica', 'normal');
      fallbackDoc.setFontSize(10);
      fallbackDoc.text(
        normalizePdfLegalText(
          `O PDF "${item.name}" possui proteção de criptografia que impede a mesclagem automática. Baixe este arquivo individualmente na lista da matéria.`,
        ),
        15,
        y + 4,
        { maxWidth: 180 },
      );
      const fbPdf = await PDFDocument.load(fallbackDoc.output('arraybuffer'));
      const [fbPage] = await mergedPdf.copyPages(fbPdf, [0]);
      mergedPdf.addPage(fbPage);
      return { appendedPages: 1, warning: `PDF protegido: ${item.name}` };
    }
  }

  if (kind === 'image') {
    try {
      const lower = (item.name || '').toLowerCase();
      const isPng = lower.endsWith('.png') || item.mimeType === 'image/png';
      const isJpg =
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        item.mimeType === 'image/jpeg';

      if (isPng || isJpg) {
        const embedded = isPng
          ? await mergedPdf.embedPng(bytes)
          : await mergedPdf.embedJpg(bytes);
        const page = mergedPdf.addPage([595.28, 841.89]); // A4 in pt
        const maxW = 595.28 - 56;
        const maxH = 841.89 - 72;
        const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        page.drawImage(embedded, {
          x: (595.28 - w) / 2,
          y: (841.89 - h) / 2,
          width: w,
          height: h,
        });
        return { appendedPages: 1 };
      }
    } catch {
      return { appendedPages: 0, warning: `Não foi possível embutir imagem: ${item.name}` };
    }
  }

  return { appendedPages: 0 };
}

export async function exportSingleNotePdf(subjectKey: string, item: SummaryFile): Promise<void> {
  const subjectLabel = visibleName(subjectKey);
  const bytes = buildNotesPdfBytes(`${subjectLabel} — ${getSummaryDisplayTitle(item)}`, [item]);
  if (!bytes) {
    throw new Error('Este item não possui conteúdo textual para exportação.');
  }
  const slug = cleanSafeName(getSummaryDisplayTitle(item), 'anotacao').replace(/\s+/g, '_');
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  triggerBlobDownload(blob, `resumo_${slug}_${localDateIso()}.pdf`);
}

export async function exportSubjectSummariesPdf(
  subjectKey: string,
  items: SummaryFile[],
  options?: { includeAttachedPdfs?: boolean },
): Promise<{ totalPages: number; warnings: string[] }> {
  if (!items || items.length === 0) {
    throw new Error('Esta matéria ainda não possui anotações ou PDFs para exportar.');
  }

  const includeAttached = options?.includeAttachedPdfs !== false;
  const subjectLabel = visibleName(subjectKey);
  const mergedPdf = await PDFDocument.create();
  const warnings: string[] = [];

  // 1. Add formatted notes + mind map outlines
  const notesBytes = buildNotesPdfBytes(subjectLabel, items);
  if (notesBytes) {
    const notesDoc = await PDFDocument.load(notesBytes);
    const copied = await mergedPdf.copyPages(notesDoc, notesDoc.getPageIndices());
    copied.forEach((p) => mergedPdf.addPage(p));
  }

  // 2. Append attached PDFs & images
  if (includeAttached) {
    const binaries = items.filter((it) => {
      const k = getSummaryItemKind(it);
      return k === 'pdf' || k === 'image';
    });
    for (const bin of binaries) {
      const res = await appendBinarySummaryItemToMergedPdf(mergedPdf, subjectLabel, bin);
      if (res.warning) warnings.push(res.warning);
    }
  }

  const totalPages = mergedPdf.getPageCount();
  if (totalPages === 0) {
    throw new Error('Nenhum conteúdo exportável encontrado nesta matéria.');
  }

  const finalBytes = await mergedPdf.save();
  const slug = cleanSafeName(subjectLabel, 'materia').replace(/\s+/g, '_');
  const suffix = includeAttached ? 'completo' : 'anotacoes';
  const blob = new Blob([finalBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  triggerBlobDownload(blob, `resumos_${slug}_${suffix}_${localDateIso()}.pdf`);

  return { totalPages, warnings };
}

export async function exportAllSubjectsSummariesPdf(
  summaryFolders: Record<string, SummaryFile[]>,
  options?: { includeAttachedPdfs?: boolean },
): Promise<{ totalPages: number; subjectCount: number; warnings: string[] }> {
  const entries = Object.entries(summaryFolders)
    .filter(([, items]) => Array.isArray(items) && items.length > 0)
    .sort((a, b) => visibleName(a[0]).localeCompare(visibleName(b[0]), 'pt-BR'));

  if (entries.length === 0) {
    throw new Error('Nenhuma matéria possui anotações ou PDFs para exportar.');
  }

  const includeAttached = options?.includeAttachedPdfs !== false;
  const mergedPdf = await PDFDocument.create();
  const warnings: string[] = [];

  // Build cover + Table of Contents page
  const tocDoc = new jsPDF({ unit: 'mm', format: 'a4' });
  const totalItems = entries.reduce((sum, [, list]) => sum + list.length, 0);
  const totalNotes = entries.reduce(
    (sum, [, list]) =>
      sum +
      list.filter((it) => {
        const k = getSummaryItemKind(it);
        return k === 'note' || k === 'mindmap';
      }).length,
    0,
  );
  const totalPdfs = entries.reduce(
    (sum, [, list]) => sum + list.filter((it) => getSummaryItemKind(it) === 'pdf').length,
    0,
  );

  let y = drawGovHeader(
    tocDoc,
    'DOSSIÊ COMPLETO DE RESUMOS · TODAS AS MATÉRIAS',
    `${entries.length} matéria(s) · ${totalNotes} anotação(ões)/mapa(s) · ${totalPdfs} PDF(s) anexado(s) · ${localDateTimeBrazilian()}`,
  );

  tocDoc.setFont('helvetica', 'bold');
  tocDoc.setFontSize(10.5);
  tocDoc.setTextColor(7, 29, 65);
  tocDoc.text('SUMÁRIO CONSOLIDADO POR MATÉRIA', 15, y);
  y += 6.5;

  const pageWidth = tocDoc.internal.pageSize.getWidth();
  const pageHeight = tocDoc.internal.pageSize.getHeight();

  entries.forEach(([folderKey, list], idx) => {
    if (y > pageHeight - 20) {
      tocDoc.addPage();
      y = 18;
    }
    const notesCount = list.filter((i) => getSummaryItemKind(i) === 'note').length;
    const mapsCount = list.filter((i) => getSummaryItemKind(i) === 'mindmap').length;
    const pdfCount = list.filter((i) => getSummaryItemKind(i) === 'pdf').length;
    const detail = [
      notesCount ? `${notesCount} anotação(ões)` : '',
      mapsCount ? `${mapsCount} mapa(s)` : '',
      pdfCount ? `${pdfCount} PDF(s)` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    tocDoc.setFont('helvetica', 'bold');
    tocDoc.setFontSize(9.5);
    tocDoc.setTextColor(15, 23, 42);
    tocDoc.text(
      normalizePdfLegalText(`${String(idx + 1).padStart(2, '0')}. ${visibleName(folderKey)}`),
      15,
      y,
    );

    tocDoc.setFont('helvetica', 'normal');
    tocDoc.setFontSize(8.5);
    tocDoc.setTextColor(71, 85, 105);
    tocDoc.text(normalizePdfLegalText(detail || `${list.length} item(ns)`), pageWidth - 15, y, {
      align: 'right',
    });

    tocDoc.setDrawColor(226, 232, 240);
    tocDoc.line(15, y + 2, pageWidth - 15, y + 2);
    y += 7;
  });

  if (totalItems > 0) {
    addFooters(tocDoc, 'estuda.gov.br · Dossiê Completo de Resumos');
    const tocPdf = await PDFDocument.load(tocDoc.output('arraybuffer'));
    const copiedToc = await mergedPdf.copyPages(tocPdf, tocPdf.getPageIndices());
    copiedToc.forEach((p) => mergedPdf.addPage(p));
  }

  // Append each subject sequentially
  for (const [folderKey, list] of entries) {
    const subjectLabel = visibleName(folderKey);
    const hasText = list.some((it) => {
      const k = getSummaryItemKind(it);
      return k === 'note' || k === 'mindmap';
    });
    const hasBinary =
      includeAttached &&
      list.some((it) => {
        const k = getSummaryItemKind(it);
        return k === 'pdf' || k === 'image';
      });

    if (hasText) {
      const subjectBytes = buildNotesPdfBytes(subjectLabel, list);
      if (subjectBytes) {
        const subDoc = await PDFDocument.load(subjectBytes);
        const copied = await mergedPdf.copyPages(subDoc, subDoc.getPageIndices());
        copied.forEach((p) => mergedPdf.addPage(p));
      }
    } else if (hasBinary) {
      // Insert a clean subject divider header page before merging only-PDF subjects
      const divBytes = buildNotesPdfBytes(subjectLabel, list, {
        isAllSubjectsNotice:
          'Esta matéria contém apenas arquivos PDF/imagens anexados, incluídos nas páginas seguintes.',
      });
      if (divBytes) {
        const divDoc = await PDFDocument.load(divBytes);
        const copied = await mergedPdf.copyPages(divDoc, divDoc.getPageIndices());
        copied.forEach((p) => mergedPdf.addPage(p));
      }
    }

    if (includeAttached) {
      const binaries = list.filter((it) => {
        const k = getSummaryItemKind(it);
        return k === 'pdf' || k === 'image';
      });
      for (const bin of binaries) {
        const res = await appendBinarySummaryItemToMergedPdf(mergedPdf, subjectLabel, bin);
        if (res.warning) warnings.push(res.warning);
      }
    }
  }

  const totalPages = mergedPdf.getPageCount();
  if (totalPages === 0) {
    throw new Error('Nenhum conteúdo exportável encontrado nas matérias.');
  }

  const finalBytes = await mergedPdf.save();
  const suffix = includeAttached ? 'completo' : 'anotacoes';
  const blob = new Blob([finalBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  triggerBlobDownload(blob, `dossie_resumos_todas_materias_${suffix}_${localDateIso()}.pdf`);

  return { totalPages, subjectCount: entries.length, warnings };
}
