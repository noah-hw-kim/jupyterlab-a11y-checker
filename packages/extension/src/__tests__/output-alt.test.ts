// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  type IGeneralCell,
  extractImageCandidates,
  codeOutputCandidateToDataUrl
} from '@berkeley-dsep-infra/a11y-checker-core';
import {
  buildOutputAltMetadata,
  syncRenderedOutputAlt
} from '../output-alt.js';

function cell(): IGeneralCell {
  return {
    cellIndex: 0,
    type: 'code',
    source: 'plot()',
    outputs: [
      { output_type: 'stream', text: 'log' },
      { data: { 'image/png': 'aGVsbG8=' } },
      { data: { 'image/png': 'd29ybGQ=' } }
    ],
    metadata: { a11y_metadata: { note: 'keep', outputs: {} } }
  };
}

describe('accepted output alt text', () => {
  it('round trips the exact output through saved metadata without changing source or outputs', () => {
    const original = cell();
    const before = JSON.stringify(original);
    const selected = extractImageCandidates([original])[1];
    const metadata = buildOutputAltMetadata(selected, original, 'Second plot');
    expect(metadata.note).toBe('keep');
    expect(Object.keys(metadata.outputs!)).toEqual(['2']);
    expect(metadata.outputs!['2']).toMatchObject({
      mimeType: 'image/png',
      dataHash: selected.dataHash,
      altText: 'Second plot'
    });
    const reopened = JSON.parse(
      JSON.stringify({
        ...original,
        metadata: { a11y_metadata: metadata }
      })
    );
    expect(extractImageCandidates([reopened])[1].existingAltText).toBe(
      'Second plot'
    );
    expect(JSON.stringify(original)).toBe(before);
  });

  it('rejects changed output data, MIME type, or blank edits before preparing a write', () => {
    const original = cell();
    const selected = extractImageCandidates([original])[0];
    const changed = cell();
    changed.outputs![1].data = { 'image/png': 'Y2hhbmdlZA==' };
    expect(() => buildOutputAltMetadata(selected, changed, 'New')).toThrow(
      'changed'
    );
    changed.outputs![1].data = { 'image/jpeg': selected.src };
    expect(() => buildOutputAltMetadata(selected, changed, 'New')).toThrow(
      'changed'
    );
    expect(() => buildOutputAltMetadata(selected, original, ' ')).toThrow(
      'nonempty'
    );
  });

  it('restores alt only on the rendered image with matching data and MIME', () => {
    const original = cell();
    const candidate = extractImageCandidates([original])[0];
    const metadata = buildOutputAltMetadata(candidate, original, 'First plot');
    const image = document.createElement('img');
    image.src = codeOutputCandidateToDataUrl(candidate);
    const managed = new WeakMap();
    syncRenderedOutputAlt(image, candidate, metadata, managed);
    expect(image.alt).toBe('First plot');
    const other = document.createElement('img');
    other.src = 'data:image/png;base64,b3RoZXI=';
    syncRenderedOutputAlt(other, candidate, metadata, managed);
    expect(other.hasAttribute('alt')).toBe(false);
    metadata.outputs!['1'].mimeType = 'image/jpeg';
    syncRenderedOutputAlt(image, candidate, metadata, managed);
    expect(image.hasAttribute('alt')).toBe(false);
  });

  it('removes a managed description when a reused image node changes data', () => {
    const original = cell();
    const candidate = extractImageCandidates([original])[0];
    const metadata = buildOutputAltMetadata(candidate, original, 'First plot');
    const image = document.createElement('img');
    image.src = codeOutputCandidateToDataUrl(candidate);
    image.alt = 'Renderer default';
    const managed = new WeakMap();
    syncRenderedOutputAlt(image, candidate, metadata, managed);
    image.src = 'data:image/png;base64,Y2hhbmdlZA==';
    syncRenderedOutputAlt(image, candidate, metadata, managed);
    expect(image.hasAttribute('alt')).toBe(false);
  });

  it('restores the renderer alt when metadata is removed from an unchanged image', () => {
    const original = cell();
    const candidate = extractImageCandidates([original])[0];
    const metadata = buildOutputAltMetadata(candidate, original, 'First plot');
    const image = document.createElement('img');
    image.src = codeOutputCandidateToDataUrl(candidate);
    image.alt = 'Renderer default';
    const managed = new WeakMap();
    syncRenderedOutputAlt(image, candidate, metadata, managed);
    syncRenderedOutputAlt(image, candidate, undefined, managed);
    expect(image.alt).toBe('Renderer default');
  });
});
