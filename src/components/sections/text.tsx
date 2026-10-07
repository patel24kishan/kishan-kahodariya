import { Fragment, type ReactNode } from 'react';

/**
 * The owner's text, rendered exactly as written: blank lines separate paragraphs and single
 * line breaks stay line breaks. Nothing is trimmed, rewritten or "fixed".
 */
export function paragraphs(text: string): string[] {
  return text.split(/\r?\n\s*\r?\n/).filter((paragraph) => paragraph.trim() !== '');
}

/** One paragraph's lines with <br /> between them. */
export function withLineBreaks(paragraph: string): ReactNode {
  const lines = paragraph.split(/\r?\n/);
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}

/** Paragraph elements for a block of owner text. Returns null for an empty string. */
export function Paragraphs({ text, className }: { text: string; className?: string }) {
  const blocks = paragraphs(text);
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block, index) => (
        <p key={index} className={className}>
          {withLineBreaks(block)}
        </p>
      ))}
    </>
  );
}
