import { describe, expect, it } from 'vitest';
import type { IGeneralCell } from '@berkeley-dsep-infra/a11y-checker-core';
import {
  buildReviewedMarkdownSource,
  findCurrentReviewCandidate,
  selectImageReviewCandidates
} from '../semantic-image-review.js';

function markdown(source: string, cellIndex = 0): IGeneralCell {
  return { cellIndex, type: 'markdown', source };
}

describe('image review selection', () => {
  it('includes existing-alt Markdown and code outputs without duplicating missing-alt findings', () => {
    const cells: IGeneralCell[] = [
      markdown(
        '![graph](plot.png) ![](empty.png) <img src="missing.png"> <img src="html.png" alt="chart">'
      ),
      {
        cellIndex: 1,
        type: 'code',
        source: 'plot()',
        outputs: [
          {
            output_type: 'display_data',
            data: { 'image/png': 'aGVsbG8=' },
            metadata: {}
          }
        ]
      }
    ];
    expect(selectImageReviewCandidates(cells).map(c => c.sourceType)).toEqual([
      'markdown-inline',
      'markdown-html',
      'code-output'
    ]);
  });

  it('retains the exact selected image when a Markdown cell repeats an image URL', () => {
    const cell = markdown('![first](plot.png) ![second](plot.png)');
    const selected = selectImageReviewCandidates([cell])[1];
    expect(
      findCurrentReviewCandidate(selected, cell, cell.source)
    ).toMatchObject({ existingAltText: 'second', offsets: selected.offsets });
  });

  it('rejects edited or moved Markdown targets instead of selecting a different image', () => {
    const cell = markdown('![graph](plot.png)');
    const selected = selectImageReviewCandidates([cell])[0];
    expect(
      findCurrentReviewCandidate(
        selected,
        markdown('![changed](plot.png)'),
        cell.source
      )
    ).toBeUndefined();
    expect(
      findCurrentReviewCandidate(
        selected,
        markdown(cell.source, 1),
        cell.source
      )
    ).toBeUndefined();
  });
});

describe('reviewed Markdown application', () => {
  it('updates only the selected image and preserves its URL and title', () => {
    const cell = markdown(
      'Before ![first](plot.png "Title") ![second](plot.png "Title") after'
    );
    const selected = selectImageReviewCandidates([cell])[1];
    const source = buildReviewedMarkdownSource(
      selected,
      cell,
      cell.source,
      'Updated description'
    );
    expect(source).toBe(
      'Before ![first](plot.png "Title") ![Updated description](plot.png "Title") after'
    );
    expect(cell.source).toContain('![second]');
  });

  it('escapes edited Markdown text so it cannot introduce markup', () => {
    const cell = markdown('![graph](plot.png)');
    const selected = selectImageReviewCandidates([cell])[0];
    expect(
      buildReviewedMarkdownSource(
        selected,
        cell,
        cell.source,
        '[A] <img> & *B*'
      )
    ).toBe('![&#91;A&#93; &lt;img&gt; &amp; &#42;B&#42;](plot.png)');
  });

  it('updates the HTML alt attribute without touching other attributes', () => {
    const cell = markdown(
      `<img src="plot.png" title=" alt='keep'" data-alt="keep" alt="graph" width="200">`
    );
    const selected = selectImageReviewCandidates([cell])[0];
    expect(
      buildReviewedMarkdownSource(selected, cell, cell.source, 'A "quote" & $&')
    ).toBe(
      `<img src="plot.png" title=" alt='keep'" data-alt="keep" alt="A &quot;quote&quot; &amp; $&amp;" width="200">`
    );
  });

  it('rejects empty edits and stale targets without mutating the cell', () => {
    const cell = markdown('![graph](plot.png)');
    const selected = selectImageReviewCandidates([cell])[0];
    expect(() =>
      buildReviewedMarkdownSource(selected, cell, cell.source, '  ')
    ).toThrow('nonempty');
    const changed = markdown('![changed](plot.png)');
    expect(() =>
      buildReviewedMarkdownSource(selected, changed, cell.source, 'New')
    ).toThrow('changed');
    expect(changed.source).toBe('![changed](plot.png)');
  });
});
