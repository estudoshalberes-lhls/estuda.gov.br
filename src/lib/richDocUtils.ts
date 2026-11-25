import { SummaryFile } from '../types/study';
import { triggerBlobDownload } from './fileStorage';
import { cleanSafeName, localDateIso, visibleName } from './parsers';

const ALLOWED_TAGS = new Set([
  'p',
  'div',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'sub',
  'sup',
  'mark',
  'span',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'code',
  'pre',
  'font',
]);

const DROP_ENTIRELY_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'meta',
  'link',
  'svg',
  'math',
  'noscript',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'line-height',
  'margin-left',
  'padding-left',
]);

function isSafeCssValue(prop: string, rawValue: string): boolean {
  const val = rawValue.trim();
  if (!val || val.length > 120) return false;
  const lower = val.toLowerCase();
  if (
    lower.includes('url(') ||
    lower.includes('expression(') ||
    lower.includes('javascript:') ||
    lower.includes('behavior:') ||
    lower.includes('@import') ||
    lower.includes('var(--') === false && /[<>{};]/.test(val)
  ) {
    return false;
  }
  if (prop === 'text-align') {
    return /^(left|right|center|justify|start|end)$/i.test(val);
  }
  if (prop === 'font-weight') {
    return /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(val);
  }
  if (prop === 'font-style') {
    return /^(normal|italic|oblique)$/i.test(val);
  }
  if (prop === 'text-decoration') {
    return /^(none|underline|line-through|underline line-through|line-through underline)$/i.test(val);
  }
  if (prop === 'font-size') {
    return /^(\d+(?:\.\d+)?(?:px|pt|em|rem|%)|small|medium|large|x-large)$/i.test(val);
  }
  if (prop === 'line-height') {
    return /^(\d+(?:\.\d+)?(?:px|em|%)?|normal)$/i.test(val);
  }
  if (prop === 'margin-left' || prop === 'padding-left') {
    return /^\d+(?:\.\d+)?(?:px|pt|em|rem)$/.test(val);
  }
  if (prop === 'color' || prop === 'background-color') {
    return /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)|transparent|inherit|currentcolor|[a-z]{3,20})$/i.test(
      val,
    );
  }
  if (prop === 'font-family') {
    return /^[a-z0-9\s,'"-]+$/i.test(val);
  }
  return false;
}

function sanitizeInlineStyle(styleAttr: string): string {
  const parts = styleAttr.split(';');
  const kept: string[] = [];
  for (const part of parts) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    if (!isSafeCssValue(prop, val)) continue;
    kept.push(`${prop}: ${val}`);
  }
  return kept.join('; ');
}

function sanitizeSafeUrl(rawHref: string): string | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, 'https://example.invalid');
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:'
    ) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

const FONT_SIZE_LEGACY_MAP: Record<string, string> = {
  '1': '11px',
  '2': '12px',
  '3': '14px',
  '4': '16px',
  '5': '18px',
  '6': '22px',
  '7': '26px',
};

function cleanDomNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent || '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as HTMLElement;
  let tag = el.tagName.toLowerCase();

  if (DROP_ENTIRELY_TAGS.has(tag)) {
    return null;
  }

  // Unwrap disallowed tags while preserving their sanitized children
  if (!ALLOWED_TAGS.has(tag)) {
    const frag = doc.createDocumentFragment();
    Array.from(el.childNodes).forEach((child) => {
      const cleaned = cleanDomNode(child, doc);
      if (cleaned) frag.appendChild(cleaned);
    });
    return frag;
  }

  // Convert legacy <font> tags emitted by execCommand into clean <span>
  const extraStyles: string[] = [];
  if (tag === 'font') {
    tag = 'span';
    const color = el.getAttribute('color');
    const face = el.getAttribute('face');
    const size = el.getAttribute('size');
    if (color && isSafeCssValue('color', color)) {
      extraStyles.push(`color: ${color.trim()}`);
    }
    if (face && isSafeCssValue('font-family', face)) {
      extraStyles.push(`font-family: ${face.trim()}`);
    }
    if (size && FONT_SIZE_LEGACY_MAP[size.trim()]) {
      extraStyles.push(`font-size: ${FONT_SIZE_LEGACY_MAP[size.trim()]}`);
    }
  }

  const outEl = doc.createElement(tag);

  // Preserve safe callout marker attribute
  const calloutAttr = el.getAttribute('data-callout');
  if (
    calloutAttr &&
    ['atencao', 'prazo', 'excecao', 'dica'].includes(calloutAttr.toLowerCase())
  ) {
    outEl.setAttribute('data-callout', calloutAttr.toLowerCase());
  }

  // Preserve colspan/rowspan on table cells
  if (tag === 'td' || tag === 'th') {
    const colspan = el.getAttribute('colspan');
    const rowspan = el.getAttribute('rowspan');
    if (colspan && /^\d{1,2}$/.test(colspan)) outEl.setAttribute('colspan', colspan);
    if (rowspan && /^\d{1,2}$/.test(rowspan)) outEl.setAttribute('rowspan', rowspan);
  }

  // Preserve safe href on links
  if (tag === 'a') {
    const href = el.getAttribute('href') || '';
    const safeUrl = sanitizeSafeUrl(href);
    if (safeUrl) {
      outEl.setAttribute('href', safeUrl);
      outEl.setAttribute('target', '_blank');
      outEl.setAttribute('rel', 'noopener noreferrer');
    }
  }

  // Sanitize inline styles
  const rawStyle = el.getAttribute('style') || '';
  const mergedStyle = [sanitizeInlineStyle(rawStyle), ...extraStyles]
    .filter(Boolean)
    .join('; ');
  if (mergedStyle) {
    outEl.setAttribute('style', mergedStyle);
  }

  Array.from(el.childNodes).forEach((child) => {
    const cleaned = cleanDomNode(child, doc);
    if (cleaned) outEl.appendChild(cleaned);
  });

  return outEl;
}

export function sanitizeDocHtml(rawHtml: string): string {
  if (!rawHtml || !rawHtml.trim()) return '';
  if (typeof DOMParser === 'undefined') {
    return rawHtml.replace(/<[^>]+>/g, '');
  }
  const parser = new DOMParser();
  const parsed = parser.parseFromString(rawHtml, 'text/html');
  const outDoc = document.implementation.createHTMLDocument('');
  const container = outDoc.createElement('div');

  Array.from(parsed.body.childNodes).forEach((child) => {
    const cleaned = cleanDomNode(child, outDoc);
    if (cleaned) container.appendChild(cleaned);
  });

  return container.innerHTML.trim();
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdownToHtml(line: string): string {
  const escaped = escapeHtmlText(line);
  return escaped
    .replace(/==([^=]+)==/g, '<mark style="background-color: #fef08a; color: #111827">$1</mark>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Converts legacy plain-text or Markdown notes into clean formatted HTML
 * for editing inside the Word/Google Docs-style RichDocumentEditor.
 */
export function markdownToInitialHtml(text: string): string {
  if (!text || !text.trim()) return '';
  const lines = text.split(/\r?\n/);
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const level = Math.min(3, hMatch[1].length);
      htmlParts.push(`<h${level}>${inlineMarkdownToHtml(hMatch[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

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
            .map((c) => c.trim()),
        );
      if (rows.length > 0) {
        const [head, ...body] = rows;
        const thead = `<thead><tr>${head
          .map((c) => `<th>${inlineMarkdownToHtml(c)}</th>`)
          .join('')}</tr></thead>`;
        const tbody = `<tbody>${body
          .map(
            (r) =>
              `<tr>${r.map((c) => `<td>${inlineMarkdownToHtml(c)}</td>`).join('')}</tr>`,
          )
          .join('')}</tbody>`;
        htmlParts.push(`<table>${thead}${tbody}</table>`);
      }
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const first = quoteLines[0] || '';
      const tagMatch = first.match(/^\[!(ATEN[ÇC][ÃA]O|PEGADINHA|PRAZO|EXCE[ÇC][ÃA]O|DICA)\]\s*(.*)$/i);
      let callout = '';
      if (tagMatch) {
        const up = tagMatch[1].toUpperCase();
        callout = up.startsWith('PRAZO')
          ? 'prazo'
          : up.startsWith('EXCE')
            ? 'excecao'
            : up.startsWith('DICA')
              ? 'dica'
              : 'atencao';
        quoteLines[0] = tagMatch[2].trim();
      }
      const attr = callout ? ` data-callout="${callout}"` : '';
      const inner = quoteLines
        .filter(Boolean)
        .map((l) => `<p>${inlineMarkdownToHtml(l)}</p>`)
        .join('');
      htmlParts.push(`<blockquote${attr}>${inner || '<p></p>'}</blockquote>`);
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      htmlParts.push(
        `<ul>${items.map((it) => `<li>${inlineMarkdownToHtml(it)}</li>`).join('')}</ul>`,
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      htmlParts.push(
        `<ol>${items.map((it) => `<li>${inlineMarkdownToHtml(it)}</li>`).join('')}</ol>`,
      );
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      htmlParts.push('<hr>');
      i += 1;
      continue;
    }

    htmlParts.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
    i += 1;
  }

  return sanitizeDocHtml(htmlParts.join(''));
}

export function htmlToPlainText(html: string): string {
  if (!html || !html.trim()) return '';
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizeDocHtml(html), 'text/html');
  const lines: string[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').replace(/\u200B/g, '');
      if (txt) {
        if (lines.length === 0) lines.push('');
        lines[lines.length - 1] += txt;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      lines.push('');
      return;
    }
    if (tag === 'hr') {
      lines.push('---');
      lines.push('');
      return;
    }
    if (tag === 'tr') {
      const cells = Array.from(el.children).map((c) => (c.textContent || '').trim());
      if (cells.length) {
        lines.push(`| ${cells.join(' | ')} |`);
      }
      return;
    }
    if (tag === 'li') {
      const parentTag = el.parentElement?.tagName.toLowerCase();
      const idx =
        parentTag === 'ol'
          ? Array.from(el.parentElement?.children || []).indexOf(el) + 1
          : 0;
      const prefix = parentTag === 'ol' ? `${idx}. ` : '• ';
      lines.push(prefix);
      Array.from(el.childNodes).forEach(walk);
      lines.push('');
      return;
    }

    const isBlock = [
      'p',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'blockquote',
      'ul',
      'ol',
      'table',
      'pre',
    ].includes(tag);

    if (isBlock && lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    Array.from(el.childNodes).forEach(walk);
    if (isBlock) {
      lines.push('');
    }
  };

  Array.from(doc.body.childNodes).forEach(walk);

  return lines
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface HtmlHeadingAnchor {
  id: string;
  level: 1 | 2 | 3;
  text: string;
}

export function slugifyDocHeading(text: string, idx: number): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `doc-h-${base || 'sec'}-${idx}`;
}

export function extractHtmlHeadings(html: string): HtmlHeadingAnchor[] {
  if (!html || !html.trim() || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(sanitizeDocHtml(html), 'text/html');
  const out: HtmlHeadingAnchor[] = [];
  let idx = 0;
  doc.body.querySelectorAll('h1, h2, h3, h4').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (!text) return;
    const tag = el.tagName.toLowerCase();
    const level = (tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3) as 1 | 2 | 3;
    out.push({ id: slugifyDocHeading(text, idx++), level, text });
  });
  return out;
}

// =============================================================================
// REAL .DOCX (OpenXML) EXPORT & IMPORT
// =============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cssColorToHex6(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return (v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase();
  }
  const rgb = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (rgb) {
    const hex = [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0'))
      .join('');
    return hex.toUpperCase();
  }
  return null;
}

function mapBgHexToWordHighlight(hex: string | null): string | null {
  if (!hex) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (r > 220 && g > 200 && b < 170) return 'yellow';
  if (g > 200 && r < 210 && b < 210) return 'green';
  if (b > 210 && r < 210) return 'cyan';
  if (r > 220 && b > 180 && g < 215) return 'magenta';
  if (r > 220 && g > 140 && g <= 215 && b < 170) return 'darkYellow';
  return null;
}

interface RunStyleState {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  sub?: boolean;
  sup?: boolean;
  colorHex?: string | null;
  bgHex?: string | null;
  fontFamily?: string;
  fontSizeHalfPt?: number;
}

function parseFontSizeHalfPt(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const px = raw.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (px) return Math.round(Number(px[1]) * 0.75 * 2);
  const pt = raw.trim().match(/^(\d+(?:\.\d+)?)pt$/i);
  if (pt) return Math.round(Number(pt[1]) * 2);
  return undefined;
}

function buildRunXml(text: string, state: RunStyleState): string {
  const cleanedText = text.replace(/\u200B/g, '');
  if (!cleanedText) return '';
  const rPr: string[] = [];
  if (state.fontFamily) {
    const cleanFace = escapeXml(state.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
    if (cleanFace) {
      rPr.push(`<w:rFonts w:ascii="${cleanFace}" w:hAnsi="${cleanFace}" w:cs="${cleanFace}"/>`);
    }
  }
  if (state.bold) rPr.push('<w:b/>');
  if (state.italic) rPr.push('<w:i/>');
  if (state.underline) rPr.push('<w:u w:val="single"/>');
  if (state.strike) rPr.push('<w:strike/>');
  if (state.sub) rPr.push('<w:vertAlign w:val="subscript"/>');
  if (state.sup) rPr.push('<w:vertAlign w:val="superscript"/>');
  if (state.colorHex) rPr.push(`<w:color w:val="${state.colorHex}"/>`);
  if (state.fontSizeHalfPt) {
    rPr.push(`<w:sz w:val="${state.fontSizeHalfPt}"/><w:szCs w:val="${state.fontSizeHalfPt}"/>`);
  }
  if (state.bgHex) {
    const hl = mapBgHexToWordHighlight(state.bgHex);
    if (hl) {
      rPr.push(`<w:highlight w:val="${hl}"/>`);
    } else {
      rPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${state.bgHex}"/>`);
    }
  }
  const rPrXml = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '';
  return `<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(cleanedText)}</w:t></w:r>`;
}

function collectInlineRunsXml(node: Node, inherited: RunStyleState): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const txt = node.textContent || '';
    return txt ? buildRunXml(txt, inherited) : '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    return '<w:r><w:br/></w:r>';
  }

  const next: RunStyleState = { ...inherited };
  if (tag === 'strong' || tag === 'b') next.bold = true;
  if (tag === 'em' || tag === 'i') next.italic = true;
  if (tag === 'u') next.underline = true;
  if (tag === 's' || tag === 'strike') next.strike = true;
  if (tag === 'sub') next.sub = true;
  if (tag === 'sup') next.sup = true;
  if (tag === 'mark') next.bgHex = next.bgHex || 'FEF08A';
  if (tag === 'code') {
    next.fontFamily = 'Consolas';
    next.bgHex = next.bgHex || 'F1F5F9';
  }

  if (el.style) {
    if (el.style.fontWeight === 'bold' || Number(el.style.fontWeight) >= 600) next.bold = true;
    if (el.style.fontStyle === 'italic') next.italic = true;
    if (el.style.textDecoration?.includes('underline')) next.underline = true;
    if (el.style.textDecoration?.includes('line-through')) next.strike = true;
    const cHex = cssColorToHex6(el.style.color);
    if (cHex) next.colorHex = cHex;
    const bgHex = cssColorToHex6(el.style.backgroundColor);
    if (bgHex) next.bgHex = bgHex;
    if (el.style.fontFamily) next.fontFamily = el.style.fontFamily;
    const sz = parseFontSizeHalfPt(el.style.fontSize);
    if (sz) next.fontSizeHalfPt = sz;
  }

  return Array.from(el.childNodes)
    .map((child) => collectInlineRunsXml(child, next))
    .join('');
}

function alignmentToWordVal(align?: string): string | null {
  const a = (align || '').trim().toLowerCase();
  if (a === 'center') return 'center';
  if (a === 'right' || a === 'end') return 'right';
  if (a === 'justify') return 'both';
  if (a === 'left' || a === 'start') return 'left';
  return null;
}

function buildParagraphXml(
  el: HTMLElement,
  opts?: {
    styleId?: string;
    numId?: number;
    callout?: string;
    baseRunStyle?: RunStyleState;
  },
): string {
  const pPr: string[] = [];
  if (opts?.styleId) pPr.push(`<w:pStyle w:val="${opts.styleId}"/>`);
  if (opts?.numId) {
    pPr.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${opts.numId}"/></w:numPr>`);
  }
  const jc = alignmentToWordVal(el.style?.textAlign);
  if (jc) pPr.push(`<w:jc w:val="${jc}"/>`);
  if (opts?.callout) {
    const fillMap: Record<string, string> = {
      atencao: 'FEF3C7',
      prazo: 'DBEAFE',
      excecao: 'FEE2E2',
      dica: 'DCFCE7',
    };
    const fill = fillMap[opts.callout] || 'F1F5F9';
    pPr.push(
      `<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="6" w:color="CBD5E1"/></w:pBdr>`,
    );
    pPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`);
    pPr.push('<w:ind w:left="240" w:right="240"/>');
  }
  pPr.push('<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>');
  const runs = collectInlineRunsXml(el, opts?.baseRunStyle || {});
  return `<w:p><w:pPr>${pPr.join('')}</w:pPr>${runs || '<w:r><w:t></w:t></w:r>'}</w:p>`;
}

function buildTableXml(tableEl: HTMLElement): string {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (!rows.length) return '';
  const trXml = rows
    .map((tr) => {
      const cells = Array.from(tr.children).filter((c) => {
        const t = c.tagName.toLowerCase();
        return t === 'td' || t === 'th';
      }) as HTMLElement[];
      const tcXml = cells
        .map((cell) => {
          const isTh = cell.tagName.toLowerCase() === 'th';
          const shd = isTh ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEF6"/>' : '';
          const pXml = buildParagraphXml(cell, {
            baseRunStyle: isTh ? { bold: true, colorHex: '071D41' } : {},
          });
          return `<w:tc><w:tcPr>${shd}<w:tcMar><w:top w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:left w:w="130" w:type="dxa"/><w:right w:w="130" w:type="dxa"/></w:tcMar></w:tcPr>${pXml}</w:tc>`;
        })
        .join('');
      return `<w:tr>${tcXml}</w:tr>`;
    })
    .join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/></w:tblBorders></w:tblPr>${trXml}</w:tbl>`;
}

export async function buildDocxBlobFromHtml(params: {
  title: string;
  subject: string;
  subtopic?: string;
  tags?: string[];
  html: string;
}): Promise<Blob> {
  const safeHtml = sanitizeDocHtml(params.html);
  const bodyBlocks: string[] = [];

  // Institutional header block in the Word document
  const metaLine = [
    params.subject,
    params.subtopic?.trim() || '',
    params.tags && params.tags.length > 0 ? `Etiquetas: ${params.tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  bodyBlocks.push(
    `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1351B4"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(
      metaLine || 'Dossiê de Resumos',
    )}</w:t></w:r></w:p>`,
  );
  bodyBlocks.push(
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="6" w:color="1351B4"/></w:pBdr><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="071D41"/><w:sz w:val="34"/></w:rPr><w:t xml:space="preserve">${escapeXml(
      params.title || 'Resumo sem título',
    )}</w:t></w:r></w:p>`,
  );

  if (typeof DOMParser !== 'undefined' && safeHtml) {
    const doc = new DOMParser().parseFromString(safeHtml, 'text/html');
    const processElement = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = (node.textContent || '').trim();
        if (txt) {
          bodyBlocks.push(
            `<w:p><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>${buildRunXml(txt, {})}</w:p>`,
          );
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'h1') {
        bodyBlocks.push(
          buildParagraphXml(el, {
            styleId: 'Heading1',
            baseRunStyle: { bold: true, colorHex: '071D41', fontSizeHalfPt: 30 },
          }),
        );
      } else if (tag === 'h2') {
        bodyBlocks.push(
          buildParagraphXml(el, {
            styleId: 'Heading2',
            baseRunStyle: { bold: true, colorHex: '1351B4', fontSizeHalfPt: 26 },
          }),
        );
      } else if (tag === 'h3' || tag === 'h4') {
        bodyBlocks.push(
          buildParagraphXml(el, {
            styleId: 'Heading3',
            baseRunStyle: { bold: true, colorHex: '1E293B', fontSizeHalfPt: 23 },
          }),
        );
      } else if (tag === 'ul' || tag === 'ol') {
        const numId = tag === 'ul' ? 1 : 2;
        Array.from(el.children).forEach((li) => {
          if (li.tagName.toLowerCase() === 'li') {
            bodyBlocks.push(buildParagraphXml(li as HTMLElement, { numId }));
          }
        });
      } else if (tag === 'blockquote') {
        const callout = el.getAttribute('data-callout') || 'nota';
        const innerPs = Array.from(el.children).filter((c) =>
          ['p', 'div'].includes(c.tagName.toLowerCase()),
        );
        if (innerPs.length > 0) {
          innerPs.forEach((p) =>
            bodyBlocks.push(buildParagraphXml(p as HTMLElement, { callout })),
          );
        } else {
          bodyBlocks.push(buildParagraphXml(el, { callout }));
        }
      } else if (tag === 'table') {
        bodyBlocks.push(buildTableXml(el));
        bodyBlocks.push('<w:p/>');
      } else if (tag === 'hr') {
        bodyBlocks.push(
          '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CBD5E1"/></w:pBdr></w:pPr></w:p>',
        );
      } else {
        bodyBlocks.push(buildParagraphXml(el));
      }
    };

    Array.from(doc.body.childNodes).forEach(processElement);
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyBlocks.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="0F172A"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="071D41"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1351B4"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="23"/><w:color w:val="1E293B"/></w:rPr>
  </w:style>
</w:styles>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="540" w:hanging="260"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="540" w:hanging="260"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/_rels/document.xml.rels', docRelsXml);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/numbering.xml', numberingXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function exportSummaryNoteDocx(
  subjectKey: string,
  item: SummaryFile,
): Promise<void> {
  const title = item.title?.trim() || visibleName(item.name);
  const html = item.contentHtml?.trim()
    ? item.contentHtml
    : markdownToInitialHtml(item.content || '');
  const blob = await buildDocxBlobFromHtml({
    title,
    subject: visibleName(subjectKey),
    subtopic: item.subtopic,
    tags: item.tags,
    html,
  });
  const slug = cleanSafeName(title, 'resumo').replace(/\s+/g, '_');
  triggerBlobDownload(blob, `resumo_${slug}_${localDateIso()}.docx`);
}

const WORD_HIGHLIGHT_TO_CSS: Record<string, string> = {
  yellow: '#fef08a',
  green: '#bbf7d0',
  cyan: '#bae6fd',
  magenta: '#fbcfe8',
  darkYellow: '#fed7aa',
  red: '#fecaca',
  blue: '#bfdbfe',
  lightGray: '#e2e8f0',
};

/**
 * Safely imports an uploaded .docx (Word / Google Docs) file into sanitized HTML.
 */
export async function importDocxFileToHtml(
  file: File,
): Promise<{ title: string; html: string }> {
  const MAX_DOCX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_DOCX_BYTES) {
    throw new Error('O arquivo .docx excede o limite máximo de 15 MB.');
  }
  const arrayBuffer = await file.arrayBuffer();
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) {
    throw new Error('Arquivo .docx inválido: documento principal não encontrado.');
  }
  const xmlText = await docEntry.async('text');
  if (xmlText.length > 10_000_000) {
    throw new Error('Conteúdo XML do documento excede o limite suportado.');
  }
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  const parseErr = xmlDoc.getElementsByTagName('parsererror');
  if (parseErr.length > 0) {
    throw new Error('Não foi possível ler o conteúdo XML do arquivo .docx.');
  }

  const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const getW = (parent: Element, local: string): Element[] =>
    Array.from(parent.getElementsByTagNameNS(W_NS, local));
  const getDirectW = (parent: Element, local: string): Element[] =>
    Array.from(parent.childNodes).filter(
      (n): n is Element =>
        n.nodeType === Node.ELEMENT_NODE &&
        (n as Element).localName === local,
    );
  const getAttrW = (el: Element | undefined, name: string): string => {
    if (!el) return '';
    return el.getAttributeNS(W_NS, name) || el.getAttribute(`w:${name}`) || el.getAttribute(name) || '';
  };

  const renderParagraph = (p: Element): string => {
    const pPr = getDirectW(p, 'pPr')[0];
    const pStyle = pPr ? getAttrW(getDirectW(pPr, 'pStyle')[0], 'val') : '';
    const jc = pPr ? getAttrW(getDirectW(pPr, 'jc')[0], 'val') : '';
    const hasNum = Boolean(pPr && getDirectW(pPr, 'numPr').length > 0);

    const alignCss =
      jc === 'center'
        ? 'text-align: center'
        : jc === 'right'
          ? 'text-align: right'
          : jc === 'both'
            ? 'text-align: justify'
            : '';

    const runs = getDirectW(p, 'r');
    const inner = runs
      .map((r) => {
        const rPr = getDirectW(r, 'rPr')[0];
        const isBold = Boolean(rPr && getDirectW(rPr, 'b').length > 0);
        const isItalic = Boolean(rPr && getDirectW(rPr, 'i').length > 0);
        const isUnderline = Boolean(rPr && getDirectW(rPr, 'u').length > 0);
        const isStrike = Boolean(rPr && getDirectW(rPr, 'strike').length > 0);
        const colorVal = rPr ? getAttrW(getDirectW(rPr, 'color')[0], 'val') : '';
        const hlVal = rPr ? getAttrW(getDirectW(rPr, 'highlight')[0], 'val') : '';
        const szVal = rPr ? getAttrW(getDirectW(rPr, 'sz')[0], 'val') : '';

        let txt = '';
        Array.from(r.childNodes).forEach((cn) => {
          if (cn.nodeType !== Node.ELEMENT_NODE) return;
          const loc = (cn as Element).localName;
          if (loc === 't') txt += cn.textContent || '';
          else if (loc === 'br') txt += '\n';
          else if (loc === 'tab') txt += '    ';
        });
        if (!txt) return '';

        let piece = escapeHtmlText(txt).replace(/\n/g, '<br>');
        const styles: string[] = [];
        if (colorVal && /^[0-9a-f]{6}$/i.test(colorVal) && colorVal.toLowerCase() !== '000000') {
          styles.push(`color: #${colorVal}`);
        }
        if (hlVal && WORD_HIGHLIGHT_TO_CSS[hlVal]) {
          styles.push(`background-color: ${WORD_HIGHLIGHT_TO_CSS[hlVal]}`);
          styles.push('color: #111827');
        }
        if (szVal && /^\d+$/.test(szVal)) {
          const px = Math.round((Number(szVal) / 2) * 1.333);
          if (px >= 10 && px <= 34 && px !== 14 && px !== 15) {
            styles.push(`font-size: ${px}px`);
          }
        }
        if (styles.length) piece = `<span style="${styles.join('; ')}">${piece}</span>`;
        if (isStrike) piece = `<s>${piece}</s>`;
        if (isUnderline) piece = `<u>${piece}</u>`;
        if (isItalic) piece = `<em>${piece}</em>`;
        if (isBold) piece = `<strong>${piece}</strong>`;
        return piece;
      })
      .join('');

    if (!inner.trim()) return '';

    const styleAttr = alignCss ? ` style="${alignCss}"` : '';
    if (hasNum) return `<li>${inner}</li>`;
    if (/^heading\s*1$/i.test(pStyle) || pStyle === 'Title' || pStyle === 'Titulo1') {
      return `<h1${styleAttr}>${inner}</h1>`;
    }
    if (/^heading\s*2$/i.test(pStyle) || pStyle === 'Subtitle' || pStyle === 'Titulo2') {
      return `<h2${styleAttr}>${inner}</h2>`;
    }
    if (/^heading\s*[3-6]$/i.test(pStyle) || pStyle === 'Titulo3') {
      return `<h3${styleAttr}>${inner}</h3>`;
    }
    return `<p${styleAttr}>${inner}</p>`;
  };

  const body = getW(xmlDoc.documentElement, 'body')[0];
  if (!body) {
    throw new Error('Corpo do documento .docx vazio.');
  }

  const outBlocks: string[] = [];
  let pendingLis: string[] = [];
  const flushLis = () => {
    if (pendingLis.length > 0) {
      outBlocks.push(`<ul>${pendingLis.join('')}</ul>`);
      pendingLis = [];
    }
  };

  Array.from(body.childNodes).forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    if (el.localName === 'p') {
      const rendered = renderParagraph(el);
      if (rendered.startsWith('<li>')) {
        pendingLis.push(rendered);
      } else {
        flushLis();
        if (rendered) outBlocks.push(rendered);
      }
    } else if (el.localName === 'tbl') {
      flushLis();
      const rows = getDirectW(el, 'tr');
      const trHtml = rows
        .map((tr, rIdx) => {
          const cells = getDirectW(tr, 'tc');
          const cellTag = rIdx === 0 ? 'th' : 'td';
          const cellsHtml = cells
            .map((tc) => {
              const cellPs = getDirectW(tc, 'p').map(renderParagraph).filter(Boolean).join('');
              return `<${cellTag}>${cellPs || ''}</${cellTag}>`;
            })
            .join('');
          return `<tr>${cellsHtml}</tr>`;
        })
        .join('');
      if (trHtml) outBlocks.push(`<table><tbody>${trHtml}</tbody></table>`);
    }
  });
  flushLis();

  const title = file.name.replace(/\.docx$/i, '').replace(/[_-]+/g, ' ').trim() || 'Documento importado';
  return {
    title,
    html: sanitizeDocHtml(outBlocks.join('')),
  };
}
