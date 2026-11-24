import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  FileDown,
  Lightbulb,
  ListOrdered,
  ListPlus,
  Pin,
  PinOff,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import { ContentStudyStatus, ReadingQueueItem, SummaryFile } from '../../types/study';
import { visibleName } from '../../lib/parsers';
import {
  exportSummaryNoteDocx,
  extractHtmlHeadings,
  htmlToPlainText,
  sanitizeDocHtml,
  slugifyDocHeading,
} from '../../lib/richDocUtils';
import {
  FONT_FAMILY_CSS,
  FONT_SIZE_PX,
  LINE_HEIGHT_VAL,
  LawClozeText,
  LawReadingToolbar,
  renderLawTextWithExamHighlights,
  useLawReadingPrefs,
} from './LawReadingTools';

export const STUDY_STATUS_LIST: ContentStudyStatus[] = [
  'a_ler',
  'em_leitura',
  'revisar',
  'dominado',
];

export const STUDY_STATUS_META: Record<
  ContentStudyStatus,
  { label: string; short: string; textClass: string; order: number }
> = {
  a_ler: {
    label: 'A ler',
    short: 'A ler',
    textClass: 'text-[var(--muted)]',
    order: 0,
  },
  em_leitura: {
    label: 'Em leitura',
    short: 'Lendo',
    textClass: 'text-[var(--accent)]',
    order: 1,
  },
  revisar: {
    label: 'Revisar',
    short: 'Revisar',
    textClass: 'text-[var(--warning)]',
    order: 2,
  },
  dominado: {
    label: 'Dominado',
    short: 'Dominado',
    textClass: 'text-[var(--good)]',
    order: 3,
  },
};

export function getStudyStatusLabel(status?: ContentStudyStatus): string {
  return status ? STUDY_STATUS_META[status].label : 'A ler';
}

export const StudyStatusSelect: React.FC<{
  value?: ContentStudyStatus;
  onChange: (next: ContentStudyStatus) => void;
  compact?: boolean;
}> = ({ value, onChange, compact }) => {
  const current: ContentStudyStatus = value || 'a_ler';
  const meta = STUDY_STATUS_META[current];
  return (
    <select
      aria-label="Status de estudo"
      value={current}
      onChange={(e) => onChange(e.target.value as ContentStudyStatus)}
      className={`rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] font-bold cursor-pointer focus:outline-none focus:border-[var(--accent)] ${meta.textClass} ${
        compact ? 'h-[28px] px-2 text-[11px]' : 'h-[30px] px-2 text-[11.5px]'
      }`}
    >
      {STUDY_STATUS_LIST.map((st) => (
        <option key={st} value={st} className="text-[var(--text)] bg-[var(--panel)]">
          {STUDY_STATUS_META[st].label}
        </option>
      ))}
    </select>
  );
};

export const PinToggleButton: React.FC<{
  pinned?: boolean;
  onToggle: () => void;
  title?: string;
}> = ({ pinned, onToggle, title }) => (
  <button
    type="button"
    onClick={onToggle}
    title={title || (pinned ? 'Desafixar do topo' : 'Fixar no topo')}
    aria-label={pinned ? 'Desafixar do topo' : 'Fixar no topo'}
    className={`inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg border transition-colors cursor-pointer shrink-0 ${
      pinned
        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
        : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]'
    }`}
  >
    {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
  </button>
);

export interface NoteHeadingEntry {
  id: string;
  level: 1 | 2 | 3;
  text: string;
}

function slugifyHeading(text: string, idx: number): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `note-h-${base || 'sec'}-${idx}`;
}

export function extractNoteHeadings(content: string): NoteHeadingEntry[] {
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const result: NoteHeadingEntry[] = [];
  let idx = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const mdMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (mdMatch) {
      const level = Math.min(3, mdMatch[1].length) as 1 | 2 | 3;
      const text = mdMatch[2].replace(/\*+|==/g, '').trim();
      if (text) {
        result.push({ id: slugifyHeading(text, idx++), level, text });
      }
      continue;
    }
    const sectionMatch = line.match(
      /^(?:T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|\d+\.\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,})/,
    );
    if (sectionMatch && line.length <= 110) {
      result.push({ id: slugifyHeading(line, idx++), level: 2, text: line });
    }
  }
  return result;
}

interface RichInlineProps {
  text: string;
  scopeKey: string;
  highlightExamWords?: boolean;
  clozeMode?: boolean;
  clozeRevealSignal?: number;
  clozeHideSignal?: number;
}

const RichInline: React.FC<RichInlineProps> = ({
  text,
  scopeKey,
  highlightExamWords = false,
  clozeMode = false,
  clozeRevealSignal = 0,
  clozeHideSignal = 0,
}) => {
  if (!text) return null;

  const renderPlain = (plain: string, key: string) => {
    if (clozeMode) {
      return (
        <LawClozeText
          key={key}
          text={plain}
          scopeKey={key}
          revealAllSignal={clozeRevealSignal}
          hideAllSignal={clozeHideSignal}
        />
      );
    }
    if (highlightExamWords) {
      return (
        <React.Fragment key={key}>
          {renderLawTextWithExamHighlights(plain, true)}
        </React.Fragment>
      );
    }
    return <React.Fragment key={key}>{plain}</React.Fragment>;
  };

  // Tokenize ==highlight==, **bold**, *italic*, `code`
  const tokenRegex = /(==[^=]+==|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  const parts = text.split(tokenRegex);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        const k = `${scopeKey}-i-${idx}`;
        if (part.startsWith('==') && part.endsWith('==') && part.length > 4) {
          const inner = part.slice(2, -2);
          return (
            <mark
              key={k}
              className="px-1 py-0.5 rounded bg-amber-300/45 text-[var(--text)] font-semibold"
            >
              {renderPlain(inner, `${k}-m`)}
            </mark>
          );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          const inner = part.slice(2, -2);
          return (
            <strong key={k} className="font-extrabold text-[var(--text)]">
              {renderPlain(inner, `${k}-b`)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          const inner = part.slice(1, -1);
          return (
            <em key={k} className="italic">
              {renderPlain(inner, `${k}-e`)}
            </em>
          );
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={k}
              className="px-1.5 py-0.5 rounded bg-[var(--panel-soft)] border border-[var(--line)] font-mono text-[0.9em] text-[var(--accent)]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return renderPlain(part, k);
      })}
    </>
  );
};

interface RichNoteRendererProps {
  content: string;
  scopeKey: string;
  highlightExamWords?: boolean;
  clozeMode?: boolean;
  clozeRevealSignal?: number;
  clozeHideSignal?: number;
  className?: string;
  style?: React.CSSProperties;
}

type CalloutKind = 'atencao' | 'prazo' | 'excecao' | 'dica' | 'quote';

function detectCalloutKind(firstLine: string): { kind: CalloutKind; rest: string } {
  const m = firstLine.match(/^\[!(ATEN[ÇC][ÃA]O|PEGADINHA|PRAZO|EXCE[ÇC][ÃA]O|DICA)\]\s*(.*)$/i);
  if (!m) return { kind: 'quote', rest: firstLine };
  const tag = m[1].toUpperCase();
  const rest = m[2].trim();
  if (tag.startsWith('PRAZO')) return { kind: 'prazo', rest };
  if (tag.startsWith('EXCE')) return { kind: 'excecao', rest };
  if (tag.startsWith('DICA')) return { kind: 'dica', rest };
  return { kind: 'atencao', rest };
}

export const RichNoteRenderer: React.FC<RichNoteRendererProps> = ({
  content,
  scopeKey,
  highlightExamWords = false,
  clozeMode = false,
  clozeRevealSignal = 0,
  clozeHideSignal = 0,
  className = '',
  style,
}) => {
  const blocks = useMemo(() => {
    const lines = content.split(/\r?\n/);
    const out: React.ReactNode[] = [];
    let i = 0;
    let headingIdx = 0;

    while (i < lines.length) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      // Markdown headings
      const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (hMatch) {
        const level = Math.min(3, hMatch[1].length) as 1 | 2 | 3;
        const cleanText = hMatch[2].replace(/\*+|==/g, '').trim();
        const hid = slugifyHeading(cleanText, headingIdx++);
        const headingClass =
          level === 1
            ? 'text-[1.28em] font-extrabold text-[var(--text)] mt-5 mb-2 pb-1.5 border-b border-[var(--line)]'
            : level === 2
              ? 'text-[1.12em] font-extrabold text-[var(--accent)] mt-4 mb-1.5'
              : 'text-[1.02em] font-bold text-[var(--text)] mt-3 mb-1';
        out.push(
          <div key={`${scopeKey}-h-${i}`} id={hid} className={headingClass}>
            <RichInline
              text={hMatch[2].trim()}
              scopeKey={`${scopeKey}-hi-${i}`}
              highlightExamWords={highlightExamWords}
              clozeMode={clozeMode}
              clozeRevealSignal={clozeRevealSignal}
              clozeHideSignal={clozeHideSignal}
            />
          </div>,
        );
        i += 1;
        continue;
      }

      // Legal structural heading line (for anchor matching)
      const secMatch = trimmed.match(
        /^(?:T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|\d+\.\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,})/,
      );
      if (secMatch && trimmed.length <= 110) {
        const hid = slugifyHeading(trimmed, headingIdx++);
        out.push(
          <div
            key={`${scopeKey}-sh-${i}`}
            id={hid}
            className="text-[1.06em] font-extrabold text-[var(--accent)] mt-4 mb-1.5"
          >
            <RichInline
              text={trimmed}
              scopeKey={`${scopeKey}-shi-${i}`}
              highlightExamWords={highlightExamWords}
              clozeMode={clozeMode}
              clozeRevealSignal={clozeRevealSignal}
              clozeHideSignal={clozeHideSignal}
            />
          </div>,
        );
        i += 1;
        continue;
      }

      // Markdown table: | col | col |
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3) {
        const tableLines: string[] = [];
        while (
          i < lines.length &&
          lines[i].trim().startsWith('|') &&
          lines[i].trim().endsWith('|')
        ) {
          tableLines.push(lines[i].trim());
          i += 1;
        }
        const rows = tableLines
          .filter((l) => !/^\|[\s:|-]+\|$/.test(l))
          .map((l) =>
            l
              .slice(1, -1)
              .split('|')
              .map((cell) => cell.trim()),
          );
        if (rows.length > 0) {
          const [header, ...body] = rows;
          out.push(
            <div
              key={`${scopeKey}-tbl-${i}`}
              className="my-3 overflow-x-auto rounded-lg border border-[var(--line-strong)]"
            >
              <table className="w-full border-collapse text-left text-[0.92em]">
                <thead>
                  <tr className="bg-[var(--panel-soft)] border-b border-[var(--line-strong)]">
                    {header.map((cell, ci) => (
                      <th
                        key={ci}
                        className="px-3 py-2 font-bold text-[var(--text)] whitespace-nowrap"
                      >
                        <RichInline
                          text={cell}
                          scopeKey={`${scopeKey}-th-${i}-${ci}`}
                          highlightExamWords={highlightExamWords}
                          clozeMode={clozeMode}
                          clozeRevealSignal={clozeRevealSignal}
                          clozeHideSignal={clozeHideSignal}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {body.map((row, ri) => (
                    <tr key={ri} className="hover:bg-[var(--panel-soft)]/50">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 align-top text-[var(--text)]">
                          <RichInline
                            text={cell}
                            scopeKey={`${scopeKey}-td-${i}-${ri}-${ci}`}
                            highlightExamWords={highlightExamWords}
                            clozeMode={clozeMode}
                            clozeRevealSignal={clozeRevealSignal}
                            clozeHideSignal={clozeHideSignal}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
          );
        }
        continue;
      }

      // Callout / blockquote lines (> ...)
      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i += 1;
        }
        const first = detectCalloutKind(quoteLines[0] || '');
        const bodyLines = [first.rest, ...quoteLines.slice(1)].filter(Boolean);

        const calloutStyles: Record<
          CalloutKind,
          { box: string; label: string; icon: React.ReactNode }
        > = {
          atencao: {
            box: 'border-[var(--warning)]/45 bg-[var(--warning)]/8',
            label: 'Atenção / Pegadinha',
            icon: <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />,
          },
          prazo: {
            box: 'border-[var(--accent)]/45 bg-[var(--accent-soft)]/60',
            label: 'Prazo / Regra Temporal',
            icon: <Clock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />,
          },
          excecao: {
            box: 'border-[var(--bad)]/40 bg-[var(--bad)]/8',
            label: 'Exceção Importante',
            icon: <Scale className="w-3.5 h-3.5 text-[var(--bad)] shrink-0" />,
          },
          dica: {
            box: 'border-[var(--good)]/40 bg-[var(--good)]/8',
            label: 'Dica de Prova',
            icon: <Lightbulb className="w-3.5 h-3.5 text-[var(--good)] shrink-0" />,
          },
          quote: {
            box: 'border-[var(--line-strong)] bg-[var(--panel-soft)]',
            label: 'Nota em Destaque',
            icon: <BookOpen className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />,
          },
        };
        const cfg = calloutStyles[first.kind];

        out.push(
          <div
            key={`${scopeKey}-q-${i}`}
            className={`my-2.5 rounded-xl border p-3 ${cfg.box}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[var(--text)] mb-1">
              {cfg.icon}
              <span>{cfg.label}</span>
            </div>
            <div className="space-y-1 text-[var(--text)]">
              {bodyLines.map((bl, bi) => (
                <p key={bi} className="m-0">
                  <RichInline
                    text={bl}
                    scopeKey={`${scopeKey}-qb-${i}-${bi}`}
                    highlightExamWords={highlightExamWords}
                    clozeMode={clozeMode}
                    clozeRevealSignal={clozeRevealSignal}
                    clozeHideSignal={clozeHideSignal}
                  />
                </p>
              ))}
            </div>
          </div>,
        );
        continue;
      }

      // Unordered list (- , * , • )
      if (/^[-*•]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
          i += 1;
        }
        out.push(
          <ul key={`${scopeKey}-ul-${i}`} className="my-2 pl-5 list-disc space-y-1.5">
            {items.map((it, li) => (
              <li key={li} className="text-[var(--text)]">
                <RichInline
                  text={it}
                  scopeKey={`${scopeKey}-li-${i}-${li}`}
                  highlightExamWords={highlightExamWords}
                  clozeMode={clozeMode}
                  clozeRevealSignal={clozeRevealSignal}
                  clozeHideSignal={clozeHideSignal}
                />
              </li>
            ))}
          </ul>,
        );
        continue;
      }

      // Ordered list (1. , 2) )
      if (/^\d+[.)]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
          i += 1;
        }
        out.push(
          <ol key={`${scopeKey}-ol-${i}`} className="my-2 pl-5 list-decimal space-y-1.5">
            {items.map((it, li) => (
              <li key={li} className="text-[var(--text)]">
                <RichInline
                  text={it}
                  scopeKey={`${scopeKey}-oli-${i}-${li}`}
                  highlightExamWords={highlightExamWords}
                  clozeMode={clozeMode}
                  clozeRevealSignal={clozeRevealSignal}
                  clozeHideSignal={clozeHideSignal}
                />
              </li>
            ))}
          </ol>,
        );
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
        out.push(<hr key={`${scopeKey}-hr-${i}`} className="my-4 border-[var(--line)]" />);
        i += 1;
        continue;
      }

      // Normal paragraph
      out.push(
        <p key={`${scopeKey}-p-${i}`} className="my-2 text-[var(--text)]">
          <RichInline
            text={trimmed}
            scopeKey={`${scopeKey}-pi-${i}`}
            highlightExamWords={highlightExamWords}
            clozeMode={clozeMode}
            clozeRevealSignal={clozeRevealSignal}
            clozeHideSignal={clozeHideSignal}
          />
        </p>,
      );
      i += 1;
    }

    return out;
  }, [
    clozeHideSignal,
    clozeMode,
    clozeRevealSignal,
    content,
    highlightExamWords,
    scopeKey,
  ]);

  return (
    <div className={`break-words ${className}`} style={style}>
      {blocks}
    </div>
  );
};

interface RichHtmlReactRendererProps {
  html: string;
  scopeKey: string;
  highlightExamWords?: boolean;
  clozeMode?: boolean;
  clozeRevealSignal?: number;
  clozeHideSignal?: number;
  className?: string;
  style?: React.CSSProperties;
}

function extractSafeReactStyle(el: HTMLElement): React.CSSProperties | undefined {
  const st = el.style;
  if (!st || st.length === 0) return undefined;
  const out: React.CSSProperties = {};
  if (st.color) out.color = st.color;
  if (st.backgroundColor) out.backgroundColor = st.backgroundColor;
  if (st.fontFamily) out.fontFamily = st.fontFamily;
  if (st.fontSize) out.fontSize = st.fontSize;
  if (st.fontWeight) out.fontWeight = st.fontWeight as React.CSSProperties['fontWeight'];
  if (st.fontStyle) out.fontStyle = st.fontStyle;
  if (st.textDecoration) out.textDecoration = st.textDecoration;
  if (st.textAlign) out.textAlign = st.textAlign as React.CSSProperties['textAlign'];
  if (st.lineHeight) out.lineHeight = st.lineHeight;
  if (st.marginLeft) out.marginLeft = st.marginLeft;
  if (st.paddingLeft) out.paddingLeft = st.paddingLeft;
  return Object.keys(out).length > 0 ? out : undefined;
}

export const RichHtmlReactRenderer: React.FC<RichHtmlReactRendererProps> = ({
  html,
  scopeKey,
  highlightExamWords = false,
  clozeMode = false,
  clozeRevealSignal = 0,
  clozeHideSignal = 0,
  className = '',
  style,
}) => {
  const renderedNodes = useMemo(() => {
    const safeHtml = sanitizeDocHtml(html);
    if (!safeHtml.trim() || typeof DOMParser === 'undefined') return null;

    const parsed = new DOMParser().parseFromString(safeHtml, 'text/html');
    let headingCounter = 0;

    const convertNode = (node: Node, path: string): React.ReactNode => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (!text) return null;
        if (clozeMode) {
          return (
            <LawClozeText
              key={path}
              text={text}
              scopeKey={`${scopeKey}-${path}`}
              revealAllSignal={clozeRevealSignal}
              hideAllSignal={clozeHideSignal}
            />
          );
        }
        if (highlightExamWords) {
          return (
            <React.Fragment key={path}>
              {renderLawTextWithExamHighlights(text, true)}
            </React.Fragment>
          );
        }
        return text;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const inlineStyle = extractSafeReactStyle(el);

      if (tag === 'br') return <br key={path} />;
      if (tag === 'hr') return <hr key={path} className="my-4 border-[var(--line-strong)]" />;

      const children = Array.from(el.childNodes).map((child, idx) =>
        convertNode(child, `${path}-${idx}`),
      );

      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
        const cleanText = (el.textContent || '').trim();
        const hid = cleanText ? slugifyDocHeading(cleanText, headingCounter++) : undefined;
        const hClass =
          tag === 'h1'
            ? 'text-[1.35em] font-extrabold text-[var(--text)] mt-5 mb-2 pb-1.5 border-b border-[var(--line)]'
            : tag === 'h2'
              ? 'text-[1.16em] font-extrabold text-[var(--accent)] mt-4 mb-1.5'
              : 'text-[1.04em] font-bold text-[var(--text)] mt-3 mb-1';
        return React.createElement(
          tag,
          { key: path, id: hid, className: hClass, style: inlineStyle },
          children,
        );
      }

      if (tag === 'p' || tag === 'div') {
        return (
          <p key={path} className="my-2 text-[var(--text)]" style={inlineStyle}>
            {children}
          </p>
        );
      }

      if (tag === 'strong' || tag === 'b') {
        return (
          <strong key={path} className="font-extrabold" style={inlineStyle}>
            {children}
          </strong>
        );
      }
      if (tag === 'em' || tag === 'i') {
        return (
          <em key={path} className="italic" style={inlineStyle}>
            {children}
          </em>
        );
      }
      if (tag === 'u') {
        return (
          <u key={path} style={inlineStyle}>
            {children}
          </u>
        );
      }
      if (tag === 's' || tag === 'strike') {
        return (
          <s key={path} style={inlineStyle}>
            {children}
          </s>
        );
      }
      if (tag === 'sub') {
        return (
          <sub key={path} style={inlineStyle}>
            {children}
          </sub>
        );
      }
      if (tag === 'sup') {
        return (
          <sup key={path} style={inlineStyle}>
            {children}
          </sup>
        );
      }
      if (tag === 'mark') {
        return (
          <mark
            key={path}
            className="px-1 py-0.5 rounded bg-amber-300/45 text-[var(--text)]"
            style={inlineStyle}
          >
            {children}
          </mark>
        );
      }
      if (tag === 'code') {
        return (
          <code
            key={path}
            className="px-1.5 py-0.5 rounded bg-[var(--panel-soft)] border border-[var(--line)] font-mono text-[0.9em] text-[var(--accent)]"
            style={inlineStyle}
          >
            {children}
          </code>
        );
      }
      if (tag === 'pre') {
        return (
          <pre
            key={path}
            className="my-2.5 p-3 rounded-lg bg-[var(--panel-soft)] border border-[var(--line)] overflow-x-auto font-mono text-[0.88em]"
            style={inlineStyle}
          >
            {children}
          </pre>
        );
      }
      if (tag === 'ul') {
        return (
          <ul key={path} className="my-2 pl-5 list-disc space-y-1.5" style={inlineStyle}>
            {children}
          </ul>
        );
      }
      if (tag === 'ol') {
        return (
          <ol key={path} className="my-2 pl-5 list-decimal space-y-1.5" style={inlineStyle}>
            {children}
          </ol>
        );
      }
      if (tag === 'li') {
        return (
          <li key={path} className="text-[var(--text)]" style={inlineStyle}>
            {children}
          </li>
        );
      }
      if (tag === 'blockquote') {
        const callout = el.getAttribute('data-callout') || '';
        const boxClass =
          callout === 'atencao'
            ? 'border-[var(--warning)]/45 bg-[var(--warning)]/10'
            : callout === 'prazo'
              ? 'border-[var(--accent)]/45 bg-[var(--accent-soft)]/65'
              : callout === 'excecao'
                ? 'border-[var(--bad)]/40 bg-[var(--bad)]/10'
                : callout === 'dica'
                  ? 'border-[var(--good)]/40 bg-[var(--good)]/10'
                  : 'border-[var(--line-strong)] bg-[var(--panel-soft)]';
        return (
          <blockquote
            key={path}
            className={`my-2.5 rounded-xl border px-3.5 py-2.5 ${boxClass}`}
            style={inlineStyle}
          >
            {children}
          </blockquote>
        );
      }
      if (tag === 'table') {
        return (
          <div
            key={path}
            className="my-3 overflow-x-auto rounded-lg border border-[var(--line-strong)]"
          >
            <table className="w-full border-collapse text-left text-[0.93em]" style={inlineStyle}>
              {children}
            </table>
          </div>
        );
      }
      if (tag === 'thead') return <thead key={path}>{children}</thead>;
      if (tag === 'tbody') {
        return (
          <tbody key={path} className="divide-y divide-[var(--line)]">
            {children}
          </tbody>
        );
      }
      if (tag === 'tr') {
        return (
          <tr key={path} className="border-b border-[var(--line)] last:border-b-0">
            {children}
          </tr>
        );
      }
      if (tag === 'th') {
        const colSpan = Number(el.getAttribute('colspan') || '0') || undefined;
        const rowSpan = Number(el.getAttribute('rowspan') || '0') || undefined;
        return (
          <th
            key={path}
            colSpan={colSpan}
            rowSpan={rowSpan}
            className="px-3 py-2 bg-[var(--panel-soft)] font-bold text-[var(--text)] border-r border-[var(--line)] last:border-r-0"
            style={inlineStyle}
          >
            {children}
          </th>
        );
      }
      if (tag === 'td') {
        const colSpan = Number(el.getAttribute('colspan') || '0') || undefined;
        const rowSpan = Number(el.getAttribute('rowspan') || '0') || undefined;
        return (
          <td
            key={path}
            colSpan={colSpan}
            rowSpan={rowSpan}
            className="px-3 py-2 align-top text-[var(--text)] border-r border-[var(--line)] last:border-r-0"
            style={inlineStyle}
          >
            {children}
          </td>
        );
      }
      if (tag === 'a') {
        const href = el.getAttribute('href') || '';
        const isSafeHref = /^(https?:|mailto:)/i.test(href);
        if (isSafeHref) {
          return (
            <a
              key={path}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline hover:opacity-80"
              style={inlineStyle}
            >
              {children}
            </a>
          );
        }
        return (
          <span key={path} style={inlineStyle}>
            {children}
          </span>
        );
      }

      return (
        <span key={path} style={inlineStyle}>
          {children}
        </span>
      );
    };

    return Array.from(parsed.body.childNodes).map((node, idx) =>
      convertNode(node, `root-${idx}`),
    );
  }, [
    clozeHideSignal,
    clozeMode,
    clozeRevealSignal,
    highlightExamWords,
    html,
    scopeKey,
  ]);

  return (
    <div className={`break-words ${className}`} style={style}>
      {renderedNodes}
    </div>
  );
};

const NOTE_PROGRESS_STORAGE_KEY = 'ce-note-scroll-progress-v1';

function loadNoteScrollRatio(noteId: string): number {
  try {
    const raw = localStorage.getItem(NOTE_PROGRESS_STORAGE_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, number>;
    const v = map[noteId];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  } catch {
    return 0;
  }
}

function saveNoteScrollRatio(noteId: string, ratio: number): void {
  try {
    const raw = localStorage.getItem(NOTE_PROGRESS_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[noteId] = Math.max(0, Math.min(1, ratio));
    localStorage.setItem(NOTE_PROGRESS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

interface SummaryReaderModalProps {
  folder: string;
  item: SummaryFile;
  onClose: () => void;
  onEdit: () => void;
  onUpdateMeta: (
    patch: Partial<Pick<SummaryFile, 'pinned' | 'studyStatus' | 'lastOpenedAt'>>,
  ) => void;
  onAddToQueue?: () => void;
}

export const SummaryReaderModal: React.FC<SummaryReaderModalProps> = ({
  folder,
  item,
  onClose,
  onEdit,
  onUpdateMeta,
  onAddToQueue,
}) => {
  const {
    prefs,
    stepFontSize,
    cycleLineHeight,
    toggleFontFamily,
    toggleComfortableWidth,
    toggleHighlightExamWords,
    toggleClozeMode,
  } = useLawReadingPrefs();

  const [clozeRevealSignal, setClozeRevealSignal] = useState(0);
  const [clozeHideSignal, setClozeHideSignal] = useState(0);
  const [showToc, setShowToc] = useState(true);
  const [scrollPct, setScrollPct] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const headings = useMemo(() => {
    if (item.contentHtml?.trim()) {
      return extractHtmlHeadings(item.contentHtml);
    }
    return extractNoteHeadings(item.content || '');
  }, [item.content, item.contentHtml]);

  const estimatedMinutes = useMemo(() => {
    const plain =
      item.content?.trim() || (item.contentHtml ? htmlToPlainText(item.contentHtml) : '');
    const words = plain.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }, [item.content, item.contentHtml]);

  useEffect(() => {
    onUpdateMeta({ lastOpenedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Restore saved scroll position
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const saved = loadNoteScrollRatio(item.id);
    if (saved > 0.03) {
      requestAnimationFrame(() => {
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        if (maxScroll > 0) {
          el.scrollTop = Math.round(maxScroll * saved);
          setScrollPct(Math.round(saved * 100));
        }
      });
    } else {
      setScrollPct(0);
    }
  }, [item.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    const ratio = Math.max(0, Math.min(1, el.scrollTop / maxScroll));
    setScrollPct(Math.round(ratio * 100));
    saveNoteScrollRatio(item.id, ratio);
  };

  const jumpToHeading = (id: string) => {
    const target = scrollContainerRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const displayTitle = item.title?.trim() || visibleName(item.name);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Modo Leitura: ${displayTitle}`}
    >
      <div className="w-full max-w-[1180px] h-[92vh] rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] flex flex-col overflow-hidden shadow-2xl">
        {/* Top reading progress line */}
        <div className="h-1 w-full bg-[var(--panel-soft)] shrink-0">
          <div
            className="h-full bg-[var(--accent)] transition-[width] duration-150"
            style={{ width: `${scrollPct}%` }}
          />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3 shrink-0 bg-[var(--panel)]">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 font-display text-[17px] sm:text-[19px] font-bold text-[var(--text)] truncate">
              {displayTitle}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--muted)] tabular-nums">
              <span>{visibleName(folder)}</span>
              {item.subtopic && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{item.subtopic}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>~{estimatedMinutes} min de leitura</span>
              <span aria-hidden="true">·</span>
              <span>{scrollPct}% lido</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <PinToggleButton
              pinned={item.pinned}
              onToggle={() => onUpdateMeta({ pinned: !item.pinned })}
            />
            <StudyStatusSelect
              value={item.studyStatus}
              onChange={(next) => onUpdateMeta({ studyStatus: next })}
              compact
            />
            {headings.length > 0 && (
              <button
                type="button"
                onClick={() => setShowToc((v) => !v)}
                className={`inline-flex items-center gap-1 h-[30px] px-2.5 rounded-lg border text-[11.5px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  showToc
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                Sumário ({headings.length})
              </button>
            )}
            {onAddToQueue && (
              <button
                type="button"
                onClick={onAddToQueue}
                className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
              >
                <ListPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                Na Fila
              </button>
            )}
            <button
              type="button"
              onClick={() => void exportSummaryNoteDocx(folder, item)}
              title="Baixar documento em formato Word (.docx)"
              className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-[var(--accent)]" />
              .docx
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar modo leitura"
              className="inline-flex items-center gap-1 h-[30px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Fechar
            </button>
          </div>
        </div>

        {/* Typography Toolbar */}
        <div className="px-4 pt-3 shrink-0">
          <LawReadingToolbar
            prefs={prefs}
            onStepFontSize={stepFontSize}
            onCycleLineHeight={cycleLineHeight}
            onToggleFontFamily={toggleFontFamily}
            onToggleComfortableWidth={toggleComfortableWidth}
            onToggleHighlightExamWords={toggleHighlightExamWords}
            showClozeModeToggle
            onToggleClozeMode={toggleClozeMode}
            onClozeRevealAll={() => setClozeRevealSignal((n) => n + 1)}
            onClozeHideAll={() => setClozeHideSignal((n) => n + 1)}
          />
        </div>

        {/* Body: optional TOC + scrollable reading pane */}
        <div className="flex-1 min-h-0 flex overflow-hidden px-4 pb-4 gap-4">
          {showToc && headings.length > 0 && (
            <aside className="hidden md:flex flex-col w-[240px] shrink-0 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 overflow-y-auto">
              <div className="text-[11.5px] font-bold text-[var(--muted)] mb-2 pb-1.5 border-b border-[var(--line)]">
                Sumário do resumo
              </div>
              <nav className="flex flex-col gap-1">
                {headings.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => jumpToHeading(h.id)}
                    className={`text-left text-[12px] py-1 px-2 rounded-md text-[var(--text)] hover:bg-[var(--panel-raised)] hover:text-[var(--accent)] transition-colors truncate cursor-pointer ${
                      h.level === 1
                        ? 'font-bold'
                        : h.level === 2
                          ? 'pl-3.5 font-semibold text-[var(--muted)]'
                          : 'pl-5 text-[11.5px] text-[var(--muted)]'
                    }`}
                    title={h.text}
                  >
                    {h.text}
                  </button>
                ))}
              </nav>
            </aside>
          )}

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-w-0 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-5 py-6 sm:px-8"
          >
            <div
              className={prefs.comfortableWidth ? 'max-w-[68ch] mx-auto' : 'max-w-[92ch] mx-auto'}
              style={{
                fontSize: FONT_SIZE_PX[prefs.fontSize],
                lineHeight: LINE_HEIGHT_VAL[prefs.lineHeight],
                fontFamily: FONT_FAMILY_CSS[prefs.fontFamily],
              }}
            >
              {item.contentHtml?.trim() ? (
                <RichHtmlReactRenderer
                  html={item.contentHtml}
                  scopeKey={`reader-html-${item.id}`}
                  highlightExamWords={prefs.highlightExamWords}
                  clozeMode={Boolean(prefs.clozeMode)}
                  clozeRevealSignal={clozeRevealSignal}
                  clozeHideSignal={clozeHideSignal}
                />
              ) : (
                <RichNoteRenderer
                  content={item.content || ''}
                  scopeKey={`reader-${item.id}`}
                  highlightExamWords={prefs.highlightExamWords}
                  clozeMode={Boolean(prefs.clozeMode)}
                  clozeRevealSignal={clozeRevealSignal}
                  clozeHideSignal={clozeHideSignal}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ReadingQueuePopoverProps {
  queue: ReadingQueueItem[];
  onToggleDone: (id: string) => void;
  onRemove: (id: string) => void;
  onClearDone: () => void;
  onOpenItem: (item: ReadingQueueItem) => void;
}

export const ReadingQueueButton: React.FC<ReadingQueuePopoverProps> = ({
  queue,
  onToggleDone,
  onRemove,
  onClearDone,
  onOpenItem,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pendingCount = queue.filter((q) => !q.done).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const kindText = (k: ReadingQueueItem['kind']) =>
    k === 'law'
      ? 'Lei Seca'
      : k === 'summary'
        ? 'Resumo'
        : k === 'caselaw'
          ? 'Jurisprudência'
          : 'PDF';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg border text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
          open || pendingCount > 0
            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
        }`}
      >
        <ListPlus className="w-3.5 h-3.5" />
        Fila de Leitura
        {queue.length > 0 && (
          <span className="font-mono-num tabular-nums">({pendingCount}/{queue.length})</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[92vw] z-40 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-xl p-3">
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[var(--line)]">
            <span className="text-[12.5px] font-bold text-[var(--text)]">
              Fila de Leitura do Dia
            </span>
            {queue.some((q) => q.done) && (
              <button
                type="button"
                onClick={onClearDone}
                className="text-[11px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
              >
                Limpar concluídos
              </button>
            )}
          </div>

          {queue.length === 0 ? (
            <p className="m-0 py-3 text-[12px] text-[var(--muted)]">
              Adicione leis, resumos, súmulas ou PDFs à fila para estudar em sequência sem perder o ritmo.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-0.5">
              {queue.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-2 rounded-lg border p-2 transition-colors ${
                    entry.done
                      ? 'border-[var(--line)] bg-[var(--panel-soft)]/50 opacity-70'
                      : 'border-[var(--line)] bg-[var(--panel-soft)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleDone(entry.id)}
                    aria-label={entry.done ? 'Desmarcar como lido' : 'Marcar como lido'}
                    className={`mt-0.5 shrink-0 cursor-pointer ${
                      entry.done ? 'text-[var(--good)]' : 'text-[var(--muted)] hover:text-[var(--accent)]'
                    }`}
                  >
                    {entry.done ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenItem(entry);
                        setOpen(false);
                      }}
                      className={`text-left text-[12px] font-bold leading-snug hover:text-[var(--accent)] cursor-pointer block truncate w-full ${
                        entry.done ? 'line-through text-[var(--muted)]' : 'text-[var(--text)]'
                      }`}
                    >
                      {entry.title}
                    </button>
                    <div className="text-[11px] text-[var(--muted)] truncate">
                      {kindText(entry.kind)}
                      {entry.subtitle ? ` · ${entry.subtitle}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenItem(entry);
                        setOpen(false);
                      }}
                      title="Abrir item"
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(entry.id)}
                      title="Remover da fila"
                      className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
