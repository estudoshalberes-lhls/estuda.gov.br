import { jsPDF } from 'jspdf';
import {
  ErrorNotebookEntry,
  HighlightColorKey,
  LawHighlight,
  LawItem,
} from '../types/study';
import { cleanSafeName, formatSequentialDeviceLabel, localDateIso, visibleName } from './parsers';

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
}

export function buildHighlightedSegments(source: string, highlights: LawHighlight[]): TextSegment[] {
  if (!source || !highlights.length) return [{ text: source }];

  const cleanSource = safePdfText(source);
  const ranges: Array<{ start: number; end: number; color: HighlightColorKey }> = [];

  highlights.forEach((h) => {
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
        ranges.push({ start: m.index, end: m.index + m[0].length, color: h.color });
        if (m.index === reg.lastIndex) reg.lastIndex++;
      }
    } catch {
      found = false;
    }

    if (!found) {
      let idx = cleanSource.indexOf(rawNeedle);
      while (idx !== -1) {
        ranges.push({ start: idx, end: idx + rawNeedle.length, color: h.color });
        idx = cleanSource.indexOf(rawNeedle, idx + rawNeedle.length);
      }
    }
  });

  if (!ranges.length) return [{ text: source }];

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number; color: HighlightColorKey }> = [];
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
    result.push({ text: cleanSource.slice(m.start, m.end), color: m.color });
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

export function exportErrorNotebookPdf(
  allRows: ErrorNotebookEntry[],
  subject: string,
  includeQuestion: boolean,
): void {
  const rows =
    subject && subject !== 'Todas as Matérias'
      ? allRows.filter((row) => row.materia === subject)
      : allRows;
  if (!rows.length) {
    throw new Error('Não há registros para exportar nessa matéria.');
  }

  const ctx = createDoc();
  const { doc, margin, maxWidth } = ctx;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text('Caderno de Erros - Central de Estudos', margin, ctx.y);
  ctx.y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(95, 95, 95);
  const subTitle = `${rows.length} registro(s) | ${subject && subject !== 'Todas as Matérias' ? visibleName(subject) : 'Todas as matérias'}`;
  doc.text(safePdfText(subTitle), margin, ctx.y);
  ctx.y += 8;

  rows.forEach((row, index) => {
    ctx.ensureSpace(18);
    doc.setFillColor(235, 238, 242);
    doc.setDrawColor(210, 214, 220);
    doc.rect(margin, ctx.y - 4.5, maxWidth, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(25, 25, 25);
    const title = `${index + 1}. ${visibleName(row.tipo)} - ${visibleName(row.materia)} - ${row.data}`;
    doc.text(safePdfText(doc.splitTextToSize(title, maxWidth - 4)[0]), margin + 2, ctx.y);
    ctx.y += 6.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);

    if (row.correcao_prova && row.arquivo_prova) {
      ctx.writeWrapped(`Prova: ${visibleName(row.arquivo_prova)}`, 5);
    }
    ctx.writeWrapped(`Ponto para revisar: ${row.texto}`, 5.2);

    if (includeQuestion && row.questao) {
      ctx.y += 1.5;
      doc.setFont('helvetica', 'bold');
      ctx.writeWrapped('Questão:', 5);
      doc.setFont('helvetica', 'normal');
      ctx.writeWrapped(row.questao.enunciado, 5);
      if (row.questao.alternativas?.length) {
        row.questao.alternativas.forEach((alt) => {
          ctx.writeWrapped(`[${alt.letra}] ${alt.texto}`, 4.8);
        });
      }
      if (row.questao.resposta) {
        ctx.writeWrapped(`Resposta marcada: ${row.questao.resposta}`, 5);
      }
      if (row.questao.gabarito) {
        ctx.writeWrapped(`Gabarito: ${row.questao.gabarito}`, 5);
      }
      if (row.questao.comentario) {
        ctx.writeWrapped(`Comentário: ${row.questao.comentario}`, 5);
      }
    }
    ctx.y += 4;
  });

  const name =
    !subject || subject === 'Todas as Matérias'
      ? 'caderno_erros_geral.pdf'
      : `caderno_erros_${cleanSafeName(subject).replace(/\s+/g, '_')}.pdf`;
  doc.save(name);
}

export function exportLawWithHighlightsPdf(
  lawName: string,
  text: string,
  highlights: LawHighlight[],
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

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text('Relatorio de Desempenho - Central de Estudos', margin, ctx.y);
  ctx.y += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(95, 95, 95);
  doc.text(
    safePdfText(`Gerado em ${new Date().toLocaleString('pt-BR')} · Consolidado de questoes, horas e simulados`),
    margin,
    ctx.y,
  );
  ctx.y += 4.8;

  if (params.filterDescription) {
    doc.setFontSize(8.5);
    doc.setTextColor(115, 115, 125);
    ctx.writeWrapped(`Filtros aplicados: ${params.filterDescription}`, 4.4);
  }
  ctx.y += 3;

  // Summary Box
  doc.setFillColor(242, 244, 248);
  doc.setDrawColor(210, 215, 224);
  doc.rect(margin, ctx.y - 3, maxWidth, 20, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(25, 25, 25);
  doc.text(
    safePdfText(
      `Questoes: ${params.totalAnswered} (${params.totalCorrect} acertos / ${params.totalWrong} erros)   ·   Aproveitamento: ${params.accuracy}%`,
    ),
    margin + 3,
    ctx.y + 3,
  );
  doc.text(
    safePdfText(
      `Simulados concluidos: ${params.completedSimulationsCount}   ·   Tempo total cronometrado: ${params.totalStudyFormatted}`,
    ),
    margin + 3,
    ctx.y + 11,
  );
  ctx.y += 23;

  // Filtered Study Time Section
  if (params.filteredStudySummary) {
    ctx.ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text('Tempo Estudado no Filtro Selecionado', margin, ctx.y);
    ctx.y += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    doc.text(
      safePdfText(
        `Total no filtro: ${params.filteredStudySummary.totalFormatted} · Media/dia ativo: ${params.filteredStudySummary.avgFormatted} · ${params.filteredStudySummary.activeDays} dia(s) · ${params.filteredStudySummary.sessionsCount} sessao(oes)`,
      ),
      margin,
      ctx.y,
    );
    ctx.y += 6;

    if (params.filteredStudyByDate && params.filteredStudyByDate.length > 0) {
      params.filteredStudyByDate.slice(0, 20).forEach((dRow) => {
        const [yy, mm, dd] = /^\d{4}-\d{2}-\d{2}$/.test(dRow.date) ? dRow.date.split('-') : ['', '', ''];
        const brDate = yy ? `${dd}/${mm}/${yy}` : dRow.date;
        const subjectsText = Object.entries(dRow.subjects)
          .map(([subj, sec]) => `${visibleName(subj)} (${params.formatDuration(sec)})`)
          .join(', ');
        ctx.ensureSpace(8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(35, 35, 35);
        ctx.writeWrapped(
          `${brDate} (${dRow.day}) — ${params.formatDuration(dRow.seconds)}${subjectsText ? ` · ${subjectsText}` : ''}`,
          4.6,
        );
      });
      ctx.y += 3;
    }
  }

  // Subject Breakdown
  if (params.subjectRows.length > 0) {
    ctx.ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text('Desempenho por Disciplina', margin, ctx.y);
    ctx.y += 6;

    params.subjectRows.forEach((row) => {
      const pct = row.answered ? Math.round((row.correct / row.answered) * 100) : 0;
      const wrong = Math.max(0, row.answered - row.correct);
      ctx.ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 30, 30);
      doc.text(
        safePdfText(
          `${visibleName(row.subject)} — ${pct}% (${row.correct} acertos / ${wrong} erros / ${row.answered} total) · Tempo: ${params.formatDuration(row.studySeconds)}`,
        ),
        margin,
        ctx.y,
      );
      ctx.y += 5;
    });
    ctx.y += 4;
  }

  // 14-day Evolution
  if (params.dailySeries && params.dailySeries.length > 0) {
    const activeDays = params.dailySeries.filter((d) => d.answered > 0 || d.simulations > 0 || d.studySeconds > 0);
    if (activeDays.length > 0) {
      ctx.ensureSpace(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(20, 20, 20);
      doc.text('Evolucao dos Ultimos 14 Dias', margin, ctx.y);
      ctx.y += 6;

      activeDays.forEach((day) => {
        const pct = day.answered ? Math.round((day.correct / day.answered) * 100) : 0;
        const simLabel = day.simulations > 0 ? ` · ${day.simulations} simulado(s)` : '';
        ctx.ensureSpace(8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.2);
        doc.setTextColor(35, 35, 35);
        doc.text(
          safePdfText(
            `${day.label}: ${day.answered} questoes (${day.correct} acertos / ${day.wrong} erros · ${pct}%)${simLabel} · Tempo: ${params.formatDuration(day.studySeconds)}`,
          ),
          margin,
          ctx.y,
        );
        ctx.y += 4.8;
      });
      ctx.y += 4;
    }
  }

  // Bank Breakdown
  if (params.bankRows.length > 0) {
    ctx.ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text('Aproveitamento por Banca', margin, ctx.y);
    ctx.y += 6;

    params.bankRows.forEach((b) => {
      ctx.ensureSpace(9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(35, 35, 35);
      doc.text(
        safePdfText(`${b.bank}: ${b.accuracy}% (${b.correct}/${b.totalQuestions} questoes em ${b.simulations} simulado(s))`),
        margin,
        ctx.y,
      );
      ctx.y += 5.2;
    });
    ctx.y += 4;
  }

  // Recent Simulations
  if (params.recentSimulations.length > 0) {
    ctx.ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text('Historico Recente de Simulados', margin, ctx.y);
    ctx.y += 6;

    params.recentSimulations.slice(0, 15).forEach((sim, idx) => {
      ctx.ensureSpace(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 30, 30);
      const bankTag = sim.banca ? ` [${sim.banca}]` : '';
      const ptsTag = typeof sim.pontos_liquidos === 'number' ? ` · Liquidos: ${sim.pontos_liquidos}` : '';
      ctx.writeWrapped(
        `${idx + 1}. ${sim.titulo}${bankTag} (${sim.data}) — ${sim.acertos}/${sim.total} (${sim.aproveitamento}%)${ptsTag}`,
        5,
      );
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      safePdfText(`Central de Estudos · Relatorio de Desempenho · Pagina ${p} de ${totalPages}`),
      pageWidth / 2,
      290,
      { align: 'center' },
    );
  }

  doc.save(`relatorio_desempenho_${localDateIso()}.pdf`);
}

export interface StudentCertificateParams {
  holderName: string;
  rankTitle: string;
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
  ctx.writeWrapped(`Patente / Grau Ministerial: ${params.rankTitle}`, 5.5);
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
