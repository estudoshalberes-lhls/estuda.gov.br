export type LegalBlockKind =
  | 'article'
  | 'paragraph'
  | 'inciso'
  | 'alinea'
  | 'sumula'
  | 'bullet'
  | 'prose';

export interface StructuredLegalBlock {
  kind: LegalBlockKind;
  leadBold?: string;
  body: string;
}

/**
 * Normalizes typography to WinAnsi/Latin-1 safe characters for jsPDF Helvetica
 * while preserving all Portuguese accents (á, é, í, ó, ú, ã, õ, â, ê, ô, ç, º, ª, §).
 */
export function normalizePdfLegalText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25AA\u25AB\u25B8\u25BA\u25CF\u25E6]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ROMAN_NUMERAL_SRC =
  '(?:L?X{1,3}(?:IX|IV|V?I{0,3})|L(?:IX|IV|V?I{0,3})?|IX|IV|V?I{1,3}|V)';

/**
 * Splits dense legal & study texts into clean structured blocks (Art., §, Parágrafo único,
 * Roman numeral incisos, lettered alíneas, Súmulas, bullets, and normal prose) without
 * breaking inline mid-sentence citations like "nos termos do art. 5º da CF".
 */
export function segmentLegalText(rawText: string): StructuredLegalBlock[] {
  const normalized = normalizePdfLegalText(rawText);
  if (!normalized) return [];

  // Insert structural line breaks ONLY after sentence/clause delimiters (., ;, :, !, ?)
  // so inline references ("conforme o art. 5º", "no § 1º") stay intact.
  let prepared = normalized;

  // 1. Articles (Art. 5º, Artigo 37, Art. 121-A) after clause terminator
  prepared = prepared.replace(
    /([.;:!?])\s+(?=(?:Art\.?|Artigo)\s*\d+(?:\s*[º°])?)/gi,
    '$1\n',
  );

  // 2. Paragraphs (§ 1º, §1°, Parágrafo único) after clause terminator
  prepared = prepared.replace(
    /([.;:!?])\s+(?=(?:§\s*\d+|Par[áa]grafo\s+[úu]nico)\b)/gi,
    '$1\n',
  );

  // 3. Súmulas / Enunciados after sentence terminator
  prepared = prepared.replace(
    /([.;:!?])\s+(?=(?:S[úu]mula(?:\s+Vinculante)?|Enunciado)\s+(?:n[º°.]?\s*)?\d+)/gi,
    '$1\n',
  );

  // 4. Roman numeral incisos (I -, II -, III -, IV -) after ., ;, or :
  const incisoSplitRegex = new RegExp(
    `([.;:])\\s+(?=${ROMAN_NUMERAL_SRC}\\s*-\\s+\\S)`,
    'g',
  );
  prepared = prepared.replace(incisoSplitRegex, '$1\n');

  // 5. Lettered alíneas (a), b), c)) after ., ;, or :
  prepared = prepared.replace(/([.;:])\s+(?=[a-z]\)\s+\S)/g, '$1\n');

  // 6. Inline dash-bullet items after sentence ending (e.g., "...texto. - Item 2")
  prepared = prepared.replace(/([.;!?])\s+(?=-\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, '$1\n');

  const rawLines = prepared
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const incisoMatchRegex = new RegExp(`^(${ROMAN_NUMERAL_SRC}\\s*-)\\s+(.+)$`);

  const blocks: StructuredLegalBlock[] = [];

  for (const line of rawLines) {
    // Article caput: Art. 5º, Art. 37., Art. 121-A., Artigo 10
    const artMatch = line.match(
      /^((?:Art\.?|Artigo)\s*\d+(?:\.\d+)*(?:-[A-Za-z])?(?:\s*[º°])?\.?(?:\s*[-:])?)\s*(.*)$/i,
    );
    if (artMatch) {
      const lead = artMatch[1].replace(/\s+/g, ' ').trim();
      const rest = (artMatch[2] || '').trim();
      blocks.push({
        kind: 'article',
        leadBold: lead,
        body: rest,
      });
      continue;
    }

    // Parágrafo (§ 1º, § 2º-A, Parágrafo único.)
    const paraMatch = line.match(
      /^((?:§\s*\d+(?:-[A-Za-z])?(?:\s*[º°])?\.?|Par[áa]grafo\s+[úu]nico\.?)(?:\s*[-:])?)\s*(.*)$/i,
    );
    if (paraMatch) {
      const lead = paraMatch[1].replace(/\s+/g, ' ').trim();
      const rest = (paraMatch[2] || '').trim();
      blocks.push({
        kind: 'paragraph',
        leadBold: lead,
        body: rest,
      });
      continue;
    }

    // Súmula / Enunciado
    const sumulaMatch = line.match(
      /^((?:S[úu]mula(?:\s+Vinculante)?|Enunciado)\s+(?:n[º°.]?\s*)?\d+(?:\s+(?:do\s+)?(?:STF|STJ|TST|TSE|TNU|TRF|TJ[A-Z]{2}))?\s*[:.-]?)\s*(.*)$/i,
    );
    if (sumulaMatch) {
      const lead = sumulaMatch[1].replace(/\s+/g, ' ').trim();
      const rest = (sumulaMatch[2] || '').trim();
      blocks.push({
        kind: 'sumula',
        leadBold: lead,
        body: rest,
      });
      continue;
    }

    // Inciso (I -, II -, IV -)
    const incisoMatch = line.match(incisoMatchRegex);
    if (incisoMatch) {
      blocks.push({
        kind: 'inciso',
        leadBold: incisoMatch[1].replace(/\s*-\s*$/, ' -'),
        body: incisoMatch[2].trim(),
      });
      continue;
    }

    // Alínea (a), b), c))
    const alineaMatch = line.match(/^([a-z]\))\s+(.+)$/);
    if (alineaMatch) {
      blocks.push({
        kind: 'alinea',
        leadBold: alineaMatch[1],
        body: alineaMatch[2].trim(),
      });
      continue;
    }

    // Numbered list item or bullet (- , * , 1. , 1) )
    const bulletMatch = line.match(/^([-*]|\d+[.)])\s+(.+)$/);
    if (bulletMatch) {
      blocks.push({
        kind: 'bullet',
        leadBold: bulletMatch[1] === '*' ? '-' : bulletMatch[1],
        body: bulletMatch[2].trim(),
      });
      continue;
    }

    blocks.push({
      kind: 'prose',
      body: line,
    });
  }

  return blocks;
}

const SECTION_LABEL_SRC =
  '(?:Gabarito|Resposta|Coment[áa]rio|Fundamenta[çc][ãa]o(?:\\s+legal)?|Base\\s+legal|Justificativa|Conclus[ãa]o|Aten[çc][ãa]o|Observa[çc][ãa]o|Obs\\.?|Regra(?:\\s+geral)?|Exce[çc][ãa]o|Pegadinha|Resumo|Importante|Dica|Jurisprud[êe]ncia|Entendimento|Erro|Acerto|Corret[ao]|Incorret[ao]|Cert[ao]|Errad[ao])';

const ALTERNATIVE_LEAD_SRC =
  '(?:Alternativa\\s+[A-Ea-e]|Letra\\s+[A-Ea-e]|Item\\s+(?:[A-Ea-e]|\\d+|' +
  ROMAN_NUMERAL_SRC +
  ')|Assertiva\\s+(?:[A-Ea-e]|\\d+|' +
  ROMAN_NUMERAL_SRC +
  ')|\\([A-Ea-e]\\)|[A-E]\\))';

const STRUCTURAL_LINE_START_RE = new RegExp(
  '^(?:' +
    '(?:Art\\.?|Artigo)\\s*\\d+' +
    '|(?:§\\s*\\d+|Par[áa]grafo\\s+[úu]nico)\\b' +
    '|(?:S[úu]mula(?:\\s+Vinculante)?|Enunciado|Tema|Informativo)\\s+(?:n[º°.]?\\s*)?\\d+' +
    `|${ROMAN_NUMERAL_SRC}\\s*[-–—.]\\s+\\S` +
    '|[a-z]\\)\\s+\\S' +
    `|${ALTERNATIVE_LEAD_SRC}(?:\\s*[-:.–—)]|\\s+\\S)` +
    `|${SECTION_LABEL_SRC}\\s*[:\\-]` +
    '|(?:[-*•▪▸►●◦✔✓➤➔]|\\d+[.)])\\s+\\S' +
    ')',
  'i',
);

const SECTION_LABEL_LINE_RE = new RegExp(`^(${SECTION_LABEL_SRC})\\s*([:\\-])\\s*(.*)$`, 'i');
const ALTERNATIVE_LINE_RE = new RegExp(
  `^(${ALTERNATIVE_LEAD_SRC})\\s*([-:.–—]?)(?:\\s+(.*))?$`,
);

function shouldKeepBreakBetween(prevLine: string, nextLine: string): boolean {
  if (!prevLine || !nextLine) return true;
  if (STRUCTURAL_LINE_START_RE.test(nextLine)) return true;
  // Previous line ends with sentence or clause terminator
  if (/[.;:!?]["')»\]]*$/.test(prevLine)) return true;
  // Previous line looks like a short heading/title without trailing comma/conjunction
  if (
    prevLine.length <= 58 &&
    !/[,/(]$/.test(prevLine) &&
    !/\b(?:de|da|do|das|dos|e|ou|a|o|as|os|em|no|na|nos|nas|por|para|com|que|se|ao|aos|à|às)$/i.test(
      prevLine,
    ) &&
    /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9]/.test(nextLine)
  ) {
    return true;
  }
  return false;
}

/**
 * Cleans and structurally organizes raw correction / study text (e.g. copied from
 * question platforms, PDFs, Lei Seca, or notes) into aligned, hierarchical plain text:
 * - Unwraps accidental mid-sentence PDF/column line breaks
 * - Separates Articles (Art.), Paragraphs (§ / Parágrafo único), Roman Incisos (I -),
 *   Alíneas (a)), Súmulas, section labels (Gabarito:, Fundamentação:, Atenção:),
 *   and alternative explanations with clean spacing and indentation
 * - Keeps mid-sentence legal citations ("nos termos do art. 5º da CF") intact inline.
 */
export function formatCorrectionTextStructured(rawText: string): string {
  if (!rawText || !rawText.trim()) return '';

  // Step 1: Normalize characters & whitespace while preserving Portuguese accents
  const cleaned = String(rawText)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\t+/g, ' ')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/^[ \t]*[•▪▫▸►●◦✔✓➤➔→][ \t]*/gm, '- ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!cleaned) return '';

  // Step 2: Unwrap accidental mid-sentence line breaks inside each raw paragraph
  const rawParagraphs = cleaned.split(/\n{2,}/);
  const unwrappedParagraphs: string[] = [];

  for (const para of rawParagraphs) {
    const lines = para
      .split('\n')
      .map((l) => l.replace(/[ \t]{2,}/g, ' ').trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const mergedLines: string[] = [lines[0]];
    for (let i = 1; i < lines.length; i += 1) {
      const prev = mergedLines[mergedLines.length - 1];
      const curr = lines[i];

      // Join hyphenated word split across PDF lines (e.g. "administra-\nção" -> "administração"),
      // while preserving true Portuguese enclitic hyphens (e.g. "revogá-\nlos" -> "revogá-los").
      if (/[a-záéíóúâêôãõç]-$/i.test(prev) && /^[a-záéíóúâêôãõç]/i.test(curr)) {
        const isEnclitic =
          /[áéíóúâêô]-$/i.test(prev) ||
          /^(?:lo|la|los|las|se|me|te|lhe|lhes|vos)\b/i.test(curr);
        mergedLines[mergedLines.length - 1] = isEnclitic
          ? `${prev}${curr}`
          : `${prev.slice(0, -1)}${curr}`;
        continue;
      }

      if (shouldKeepBreakBetween(prev, curr)) {
        mergedLines.push(curr);
      } else {
        mergedLines[mergedLines.length - 1] = `${prev} ${curr}`;
      }
    }

    unwrappedParagraphs.push(mergedLines.join('\n'));
  }

  // Step 3: Insert structural line breaks for glued legal devices, labels, and alternatives
  let prepared = unwrappedParagraphs.join('\n\n');

  // Fix stray spaces before punctuation
  prepared = prepared.replace(/ +([,.;:!?])/g, '$1');

  // Separate glued section labels after sentence endings (e.g. "...errada. Fundamentação: ...")
  const inlineLabelRe = new RegExp(
    `([.;:!?])\\s+(?=${SECTION_LABEL_SRC}\\s*[:\\-]\\s*\\S)`,
    'gi',
  );
  prepared = prepared.replace(inlineLabelRe, '$1\n\n');

  // Separate glued alternative comments after sentence endings (e.g. "...correta. Alternativa B: ...")
  const inlineAltRe = new RegExp(
    `([.;:!?])\\s+(?=${ALTERNATIVE_LEAD_SRC}(?:\\s*[-:.]|\\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]))`,
    'g',
  );
  prepared = prepared.replace(inlineAltRe, '$1\n');

  // Separate glued Articles (Art. 5º, Artigo 37) ONLY after clause/sentence terminators
  prepared = prepared.replace(
    /([.;:!?])\s+(?=(?:Art\.?|Artigo)\s*\d+(?:\s*[º°])?)/gi,
    '$1\n',
  );

  // Separate glued Paragraphs (§ 1º, Parágrafo único) after clause/sentence terminators
  prepared = prepared.replace(
    /([.;:!?])\s+(?=(?:§\s*\d+|Par[áa]grafo\s+[úu]nico)\b)/gi,
    '$1\n',
  );

  // Separate glued Súmulas / Enunciados / Temas after clause/sentence terminators
  prepared = prepared.replace(
    /([.;:!?])\s+(?=(?:S[úu]mula(?:\s+Vinculante)?|Enunciado|Tema|Informativo)\s+(?:n[º°.]?\s*)?\d+)/gi,
    '$1\n',
  );

  // Separate glued Roman numeral incisos (I -, II -, III -) after ., ;, or :
  const inlineIncisoRe = new RegExp(
    `([.;:])\\s+(?=${ROMAN_NUMERAL_SRC}\\s*-\\s+\\S)`,
    'g',
  );
  prepared = prepared.replace(inlineIncisoRe, '$1\n');

  // Separate glued lettered alíneas (a), b), c)) after ., ;, or :
  prepared = prepared.replace(/([.;:])\s+(?=[a-z]\)\s+\S)/g, '$1\n');

  // Separate glued dash-bullet items after sentence ending
  prepared = prepared.replace(/([.;!?])\s+(?=-\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, '$1\n');

  // Step 4: Classify each resulting line and assemble cleanly indented, well-spaced output
  type LineRole =
    | 'article'
    | 'sumula'
    | 'paragraph'
    | 'inciso'
    | 'alinea'
    | 'alternative'
    | 'label'
    | 'bullet'
    | 'prose';

  const incisoLineRe = new RegExp(`^(${ROMAN_NUMERAL_SRC})\\s*[-.]\\s+(.+)$`);
  const paragraphsIn = prepared.split(/\n{2,}/);
  const outputLines: string[] = [];
  let prevRole: LineRole | null = null;
  let lastHadBlank = true;

  const pushFormatted = (role: LineRole, text: string, forceBlankBefore = false) => {
    const needsBlank =
      outputLines.length > 0 &&
      !lastHadBlank &&
      (forceBlankBefore ||
        role === 'article' ||
        role === 'sumula' ||
        role === 'label' ||
        (role === 'prose' &&
          prevRole !== null &&
          prevRole !== 'label') ||
        (role === 'alternative' &&
          prevRole !== null &&
          prevRole !== 'alternative' &&
          prevRole !== 'label') ||
        (role === 'bullet' &&
          prevRole !== null &&
          prevRole !== 'bullet' &&
          prevRole !== 'label'));

    if (needsBlank) {
      outputLines.push('');
    }
    outputLines.push(text);
    prevRole = role;
    lastHadBlank = false;
  };

  paragraphsIn.forEach((paraBlock, pIdx) => {
    if (pIdx > 0 && outputLines.length > 0 && !lastHadBlank) {
      outputLines.push('');
      lastHadBlank = true;
    }

    const lines = paraBlock
      .split('\n')
      .map((l) => l.replace(/[ \t]{2,}/g, ' ').trim())
      .filter(Boolean);

    for (const line of lines) {
      // Article caput
      const artMatch = line.match(
        /^((?:Art\.?|Artigo)\s*\d+(?:\.\d+)*(?:-[A-Za-z])?(?:\s*[º°])?\.?(?:\s*[-:])?)\s*(.*)$/i,
      );
      if (artMatch) {
        const lead = artMatch[1]
          .replace(/^art\.?\s*/i, 'Art. ')
          .replace(/^artigo\s*/i, 'Art. ')
          .replace(/\s+([º°])/g, '$1')
          .replace(/\s+/g, ' ')
          .trim();
        const rest = (artMatch[2] || '').trim();
        pushFormatted('article', rest ? `${lead} ${rest}` : lead, true);
        continue;
      }

      // Parágrafo (§ 1º / Parágrafo único)
      const paraMatch = line.match(
        /^((?:§\s*\d+(?:-[A-Za-z])?(?:\s*[º°])?\.?|Par[áa]grafo\s+[úu]nico\.?)(?:\s*[-:])?)\s*(.*)$/i,
      );
      if (paraMatch) {
        const lead = paraMatch[1]
          .replace(/^§\s*/, '§ ')
          .replace(/\s+([º°])/g, '$1')
          .replace(/\s+/g, ' ')
          .trim();
        const rest = (paraMatch[2] || '').trim();
        pushFormatted('paragraph', `  ${rest ? `${lead} ${rest}` : lead}`);
        continue;
      }

      // Súmula / Enunciado / Tema / Informativo
      const sumulaMatch = line.match(
        /^((?:S[úu]mula(?:\s+Vinculante)?|Enunciado|Tema|Informativo)\s+(?:n[º°.]?\s*)?\d+(?:\s+(?:do\s+)?(?:STF|STJ|TST|TSE|TNU|TRF|TJ[A-Z]{2}))?\s*[:.-]?)\s*(.*)$/i,
      );
      if (sumulaMatch) {
        const lead = sumulaMatch[1].replace(/\s+/g, ' ').trim();
        const rest = (sumulaMatch[2] || '').trim();
        pushFormatted('sumula', rest ? `${lead} ${rest}` : lead, true);
        continue;
      }

      // Roman numeral Inciso (I -, II -, IV -)
      const incisoMatch = line.match(incisoLineRe);
      if (incisoMatch) {
        pushFormatted('inciso', `    ${incisoMatch[1]} - ${incisoMatch[2].trim()}`);
        continue;
      }

      // Lettered Alínea (a), b), c))
      const alineaMatch = line.match(/^([a-z]\))\s+(.+)$/);
      if (alineaMatch) {
        pushFormatted('alinea', `      ${alineaMatch[1]} ${alineaMatch[2].trim()}`);
        continue;
      }

      // Alternative evaluation (Alternativa A:, Letra B -, (A), A))
      const altMatch = line.match(ALTERNATIVE_LINE_RE);
      if (altMatch && (altMatch[3] || altMatch[2])) {
        const lead = altMatch[1].trim();
        const sep = altMatch[2] ? (altMatch[2] === '-' ? ' -' : altMatch[2]) : '';
        const rest = (altMatch[3] || '').trim();
        const formattedAlt = rest ? `${lead}${sep} ${rest}` : `${lead}${sep}`;
        pushFormatted('alternative', formattedAlt);
        continue;
      }

      // Section labels (Gabarito:, Fundamentação:, Atenção:, etc.)
      const labelMatch = line.match(SECTION_LABEL_LINE_RE);
      if (labelMatch) {
        const label = labelMatch[1].trim();
        const rest = (labelMatch[3] || '').trim();
        pushFormatted('label', rest ? `${label}: ${rest}` : `${label}:`, true);
        continue;
      }

      // Bullets or numbered items (- , * , 1. , 1) )
      const bulletMatch = line.match(/^([-*]|\d+[.)])\s+(.+)$/);
      if (bulletMatch) {
        const marker = bulletMatch[1] === '*' ? '-' : bulletMatch[1];
        pushFormatted('bullet', `  ${marker} ${bulletMatch[2].trim()}`);
        continue;
      }

      pushFormatted('prose', line);
    }
  });

  return outputLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Inserts a clipboard paste into a textarea value while automatically structuring
 * the pasted text and preserving surrounding text + cursor placement.
 */
export function insertFormattedPaste(
  currentValue: string,
  selectionStart: number,
  selectionEnd: number,
  rawPasted: string,
): { nextValue: string; nextCursorPos: number; changed: boolean } {
  const formattedClip = formatCorrectionTextStructured(rawPasted);
  const before = currentValue.slice(0, selectionStart);
  const after = currentValue.slice(selectionEnd);

  // If replacing everything or pasting into an empty field, return the formatted clip directly
  if (!before.trim() && !after.trim()) {
    return {
      nextValue: formattedClip,
      nextCursorPos: formattedClip.length,
      changed: formattedClip !== rawPasted,
    };
  }

  // Otherwise insert cleanly at cursor, adding paragraph separation if appropriate
  const needsLeadingBreak =
    before.length > 0 &&
    !before.endsWith('\n') &&
    formattedClip.includes('\n');
  const needsTrailingBreak =
    after.length > 0 &&
    !after.startsWith('\n') &&
    formattedClip.includes('\n');

  const prefix = needsLeadingBreak ? `${before}\n\n` : before;
  const suffix = needsTrailingBreak ? `\n\n${after}` : after;
  const nextValue = `${prefix}${formattedClip}${suffix}`;
  const nextCursorPos = prefix.length + formattedClip.length;

  return {
    nextValue,
    nextCursorPos,
    changed: formattedClip !== rawPasted,
  };
}

