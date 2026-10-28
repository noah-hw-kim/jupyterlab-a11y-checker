import {
  type IA11yMetadata,
  type IGeneralCell,
  type IImageCandidate,
  codeOutputCandidateToDataUrl
} from '@berkeley-dsep-infra/a11y-checker-core';
import { findCurrentReviewCandidate } from './semantic-image-review.js';

/** Prepare a metadata update; only the Apply handler writes it. */
export function buildOutputAltMetadata(
  selected: IImageCandidate,
  cell: IGeneralCell,
  proposedAlt: string
): IA11yMetadata {
  const alt = proposedAlt.trim().replace(/\s+/g, ' ');
  if (!alt) {
    throw new Error('Enter nonempty alt text before applying.');
  }
  const current = findCurrentReviewCandidate(selected, cell, cell.source);
  if (
    !current ||
    current.sourceType !== 'code-output' ||
    current.outputIndex === undefined ||
    !current.dataHash ||
    (current.mimeType !== 'image/png' && current.mimeType !== 'image/jpeg')
  ) {
    throw new Error('This output has changed. Run the notebook check again.');
  }
  const existing = cell.metadata?.a11y_metadata;
  if (existing !== undefined && !isRecord(existing)) {
    throw new Error(
      'Existing accessibility metadata has an unsupported format.'
    );
  }
  if (existing?.outputs !== undefined && !isRecord(existing.outputs)) {
    throw new Error('Existing output metadata has an unsupported format.');
  }
  return {
    ...existing,
    outputs: {
      ...existing?.outputs,
      [String(current.outputIndex)]: {
        ...existing?.outputs?.[String(current.outputIndex)],
        dataHash: current.dataHash,
        mimeType: current.mimeType,
        altText: alt
      }
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface IAppliedOutputAlt {
  original: string | null;
  applied: string;
  src: string;
}

/** Change DOM alt only when the output record and actual rendered bytes match. */
export function syncRenderedOutputAlt(
  image: HTMLImageElement,
  candidate: IImageCandidate | undefined,
  metadata: IA11yMetadata | undefined,
  managed: WeakMap<HTMLImageElement, IAppliedOutputAlt>
): void {
  const src = image.getAttribute('src');
  const stored =
    candidate?.outputIndex === undefined
      ? undefined
      : metadata?.outputs?.[String(candidate.outputIndex)];
  const matches =
    candidate?.sourceType === 'code-output' &&
    stored?.dataHash === candidate.dataHash &&
    stored?.mimeType === candidate.mimeType &&
    typeof stored?.altText === 'string' &&
    stored.altText.trim().length > 0 &&
    src === codeOutputCandidateToDataUrl(candidate);
  const previous = managed.get(image);
  if (!matches || !stored || !src) {
    if (previous) {
      if (image.getAttribute('alt') === previous.applied) {
        if (src === previous.src && previous.original !== null) {
          image.setAttribute('alt', previous.original);
        } else {
          image.removeAttribute('alt');
        }
      }
      managed.delete(image);
    }
    return;
  }
  managed.set(image, {
    original:
      previous?.src === src ? previous.original : image.getAttribute('alt'),
    applied: stored.altText,
    src
  });
  if (image.getAttribute('alt') !== stored.altText) {
    image.setAttribute('alt', stored.altText);
  }
}
