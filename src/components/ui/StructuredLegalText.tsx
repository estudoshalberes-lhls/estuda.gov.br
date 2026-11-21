import React, { useMemo } from 'react';
import { LegalBlockKind, segmentLegalText } from '../../lib/legalTextFormatter';

interface StructuredLegalTextProps {
  text: string;
  variant?: 'ui' | 'print';
  className?: string;
  compact?: boolean;
}

const PRINT_LEAD_COLOR: Record<LegalBlockKind, string> = {
  article: 'text-[#071D41]',
  sumula: 'text-[#1351B4]',
  paragraph: 'text-[#0F3066]',
  inciso: 'text-[#1E3A6C]',
  alinea: 'text-[#334E76]',
  bullet: 'text-[#1351B4]',
  prose: 'text-[#071D41]',
};

const UI_LEAD_COLOR: Record<LegalBlockKind, string> = {
  article: 'text-[var(--text)]',
  sumula: 'text-[var(--accent)]',
  paragraph: 'text-[var(--text)]',
  inciso: 'text-[var(--accent)]',
  alinea: 'text-[var(--accent)]',
  bullet: 'text-[var(--accent)]',
  prose: 'text-[var(--text)]',
};

const UI_INDENT_CLASS: Record<LegalBlockKind, string> = {
  article: 'pl-0 mt-1 first:mt-0',
  sumula: 'pl-0 mt-1 first:mt-0',
  paragraph: 'pl-3.5',
  inciso: 'pl-7 -indent-3.5',
  alinea: 'pl-10 -indent-3',
  bullet: 'pl-4 -indent-2.5',
  prose: 'pl-0',
};

/**
 * Renders legal, question, and commentary text cleanly aligned (justified)
 * with automatic hierarchical separation for Articles (Art.), Paragraphs (§),
 * Roman numeral Incisos (I -), Alíneas (a)), Súmulas, and bullets.
 */
export const StructuredLegalText: React.FC<StructuredLegalTextProps> = ({
  text,
  variant = 'ui',
  className = '',
  compact = false,
}) => {
  const blocks = useMemo(() => segmentLegalText(text), [text]);
  if (!blocks.length) return null;

  if (variant === 'print') {
    return (
      <div className={`gov-en-legal-flow text-[#0F1F38] ${className}`}>
        {blocks.map((block, idx) => (
          <p key={idx} className={`gov-en-legal-block gov-en-legal-${block.kind}`}>
            {block.leadBold && (
              <strong className={`font-extrabold ${PRINT_LEAD_COLOR[block.kind]}`}>
                {block.leadBold}
                {block.body ? ' ' : ''}
              </strong>
            )}
            {block.body}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${className}`}
    >
      {blocks.map((block, idx) => (
        <p
          key={idx}
          className={`m-0 text-justify leading-relaxed break-words ${UI_INDENT_CLASS[block.kind]}`}
        >
          {block.leadBold && (
            <strong className={`font-extrabold ${UI_LEAD_COLOR[block.kind]}`}>
              {block.leadBold}
              {block.body ? ' ' : ''}
            </strong>
          )}
          {block.body}
        </p>
      ))}
    </div>
  );
};
