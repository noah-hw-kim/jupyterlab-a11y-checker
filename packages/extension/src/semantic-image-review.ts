import {
  type IGeneralCell,
  type IImageCandidate,
  extractImageCandidates,
  escapeHtmlAttr,
  replaceSlice,
  findCurrentCodeOutputCandidate
} from '@berkeley-dsep-infra/a11y-checker-core';

export function selectImageReviewCandidates(
  cells: IGeneralCell[]
): IImageCandidate[] {
  return extractImageCandidates(cells).filter(
    candidate =>
      candidate.sourceType === 'code-output' ||
      ((candidate.sourceType === 'markdown-inline' ||
        candidate.sourceType === 'markdown-html') &&
        candidate.altState === 'present')
  );
}

export function findCurrentReviewCandidate(
  selected: IImageCandidate,
  cell: IGeneralCell,
  sourceSnapshot: string
): IImageCandidate | undefined {
  if (selected.sourceType === 'code-output') {
    const current = findCurrentCodeOutputCandidate(selected, cell);
    return current?.existingAltText === selected.existingAltText
      ? current
      : undefined;
  }
  if (
    cell.type !== 'markdown' ||
    cell.cellIndex !== selected.cellIndex ||
    cell.source !== sourceSnapshot ||
    !selected.offsets ||
    (selected.sourceType !== 'markdown-inline' &&
      selected.sourceType !== 'markdown-html')
  ) {
    return undefined;
  }
  const matches = extractImageCandidates([cell]).filter(
    candidate =>
      candidate.sourceType === selected.sourceType &&
      candidate.offsets?.start === selected.offsets!.start &&
      candidate.offsets?.end === selected.offsets!.end &&
      candidate.src === selected.src &&
      candidate.existingAltText === selected.existingAltText
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Build a replacement without writing to the notebook. */
export function buildReviewedMarkdownSource(
  selected: IImageCandidate,
  cell: IGeneralCell,
  sourceSnapshot: string,
  proposedAlt: string
): string {
  const alt = proposedAlt.trim().replace(/\s+/g, ' ');
  if (!alt) {
    throw new Error('Enter nonempty alt text before applying.');
  }
  const current = findCurrentReviewCandidate(selected, cell, sourceSnapshot);
  if (!current || cell.type !== 'markdown' || !current.offsets) {
    throw new Error('This image has changed. Run the notebook check again.');
  }
  const { start, end } = current.offsets;
  const original = cell.source.slice(start, end);
  let replacement: string;
  if (current.sourceType === 'markdown-inline') {
    const close = original.indexOf('](');
    if (close < 0) {
      throw new Error('The selected Markdown image is unavailable.');
    }
    const safeAlt = escapeHtmlAttr(alt).replace(
      /[\\[\]`*_]/g,
      character => `&#${character.charCodeAt(0)};`
    );
    replacement = `![${safeAlt}${original.slice(close)}`;
  } else if (current.sourceType === 'markdown-html') {
    // Consume complete attribute values so text inside title/data attributes
    // cannot be mistaken for the image's alt attribute.
    const attributes =
      /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
    const altAttribute = Array.from(original.matchAll(attributes)).find(
      match => match[1].toLowerCase() === 'alt'
    );
    if (!altAttribute || altAttribute.index === undefined) {
      throw new Error('The selected image alt attribute is unavailable.');
    }
    replacement = replaceSlice(
      original,
      altAttribute.index,
      altAttribute.index + altAttribute[0].length,
      ` alt="${escapeHtmlAttr(alt)}"`
    );
  } else {
    throw new Error('This action requires a Markdown image.');
  }
  return replaceSlice(cell.source, start, end, replacement);
}
