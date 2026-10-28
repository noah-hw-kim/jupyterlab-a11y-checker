import { Widget } from '@lumino/widgets';
import type { Cell, ICellModel } from '@jupyterlab/cells';
import type { NotebookPanel } from '@jupyterlab/notebook';
import {
  type IImageCandidate,
  type IModelSettings,
  analyzeImageCandidate,
  codeOutputCandidateToDataUrl,
  OpenAICompatibleModelClient
} from '@berkeley-dsep-infra/a11y-checker-core';
import { notebookToGeneralCells } from '../adapter.js';
import type { ISemanticContextSettings } from '../semantic-context-settings.js';
import { describeSuggestionValidation } from '../semantic-validation-status.js';
import {
  buildReviewedMarkdownSource,
  findCurrentReviewCandidate
} from '../semantic-image-review.js';
import { resolveSemanticImageDataUrl } from '../semantic-image-resolver.js';
import { buildOutputAltMetadata } from '../output-alt.js';

/** Explicit author review for Markdown and static code-output images. */
export class ImageReviewWidget extends Widget {
  private readonly sourceSnapshot: string;
  private readonly analyzeButton: HTMLButtonElement;
  private readonly status: HTMLParagraphElement;
  private readonly suggestion: HTMLTextAreaElement;
  private readonly existingAlt: HTMLParagraphElement;
  private readonly actions: HTMLDivElement;
  private readonly applyButton: HTMLButtonElement;
  private recommendationReady = false;

  constructor(
    private readonly notebook: NotebookPanel,
    private readonly cell: Cell<ICellModel>,
    private readonly selected: IImageCandidate,
    aiEnabled: boolean,
    private readonly settings: IModelSettings,
    private readonly getContextSettings: () => ISemanticContextSettings = () => ({
      contextStrategy: 'minimal'
    })
  ) {
    super();
    this.addClass('issue-widget');
    this.sourceSnapshot = cell.model.sharedModel.getSource();

    // 1. Header with cell, output indices, and Locate button
    const headerContainer = document.createElement('div');
    headerContainer.style.display = 'flex';
    headerContainer.style.justifyContent = 'space-between';
    headerContainer.style.alignItems = 'center';
    headerContainer.style.marginBottom = '8px';

    const title = document.createElement('h3');
    title.textContent =
      selected.sourceType === 'code-output'
        ? `Cell ${selected.cellIndex + 1}, output ${selected.outputIndex! + 1}`
        : `Cell ${selected.cellIndex + 1}, Markdown image`;
    title.style.margin = '0';

    const locateButton = document.createElement('button');
    locateButton.type = 'button';
    locateButton.className = 'jp-Button2 locate-button';
    locateButton.innerHTML = `<span class="material-icons" aria-hidden="true" style="font-size: 16px; margin-right: 4px;">search</span>Locate`;
    locateButton.addEventListener('click', () => {
      this.navigateToCell();
    });

    headerContainer.append(title, locateButton);

    const imageInfo = document.createElement('div');
    if (selected.sourceType === 'code-output') {
      const preview = document.createElement('img');
      preview.src = codeOutputCandidateToDataUrl(selected);
      preview.alt = selected.existingAltText || 'Code-output image preview';
      preview.style.maxWidth = '100%';
      imageInfo.appendChild(preview);
    } else {
      const source = document.createElement('p');
      source.textContent = `Image source: ${selected.src}`;
      imageInfo.appendChild(source);
    }

    this.existingAlt = document.createElement('p');
    this.existingAlt.textContent = selected.existingAltText
      ? `Current alt text: ${selected.existingAltText}`
      : 'No nonempty current alt text.';

    // Analyze only on explicit author request.
    this.analyzeButton = document.createElement('button');
    this.analyzeButton.type = 'button';
    this.analyzeButton.className = 'jp-Button2 suggest-button';
    this.analyzeButton.textContent = 'Analyze image';
    this.analyzeButton.style.display = aiEnabled ? 'flex' : 'none';
    this.analyzeButton.addEventListener('click', () => {
      void this.analyzeImage();
    });

    // 5. Accessible live region for status / errors
    this.status = document.createElement('p');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-atomic', 'true');
    this.status.textContent = 'Not analyzed.';

    // Recommendations can be edited before explicit application.
    this.suggestion = document.createElement('textarea');
    this.suggestion.rows = 4;
    this.suggestion.style.width = '100%';
    this.suggestion.setAttribute('aria-label', 'Suggested alt text for image');
    this.suggestion.hidden = true;

    this.actions = document.createElement('div');
    this.actions.hidden = true;
    this.applyButton = document.createElement('button');
    this.applyButton.type = 'button';
    this.applyButton.className = 'jp-Button2';
    this.applyButton.textContent = 'Apply alt text';
    this.applyButton.addEventListener('click', () =>
      this.applyRecommendation()
    );

    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'jp-Button2';
    dismissButton.textContent = 'Dismiss';
    dismissButton.addEventListener('click', () => this.dismissRecommendation());
    this.actions.append(this.applyButton, dismissButton);

    this.suggestion.addEventListener('input', () => {
      this.applyButton.disabled = !this.suggestion.value.trim();
      this.status.textContent =
        'Edited text has not been checked by AI validation. Review it before applying.';
    });

    // Attach all elements to the Lumino widget node
    this.node.append(
      headerContainer,
      imageInfo,
      this.existingAlt,
      this.analyzeButton,
      this.status,
      this.suggestion,
      this.actions
    );
  }

  private async analyzeImage(): Promise<void> {
    if (this.analyzeButton.disabled || this.isDisposed) {
      return;
    }

    // Enter loading state
    this.analyzeButton.disabled = true;
    this.recommendationReady = false;
    this.actions.hidden = true;
    this.status.textContent = 'Analyzing image...';
    this.suggestion.value = '';
    this.suggestion.hidden = true;

    try {
      let contextSettings: ISemanticContextSettings;
      try {
        contextSettings = this.getContextSettings();
      } catch {
        this.status.textContent = 'Check the AI image context settings above.';
        return;
      }
      // Re-fetch the live cell and verify the selected image still matches.
      const currentIndex = this.notebook.content.widgets.indexOf(this.cell);
      const generalCells = notebookToGeneralCells(this.notebook);
      const currentCell = generalCells[currentIndex];
      const candidate = currentCell
        ? findCurrentReviewCandidate(
            this.selected,
            currentCell,
            this.sourceSnapshot
          )
        : undefined;

      if (!candidate || !currentCell) {
        this.status.textContent =
          'This image has changed or is unavailable. Run the accessibility check again.';
        return;
      }

      // Step B: Generate and validate before displaying the suggestion.
      const client = new OpenAICompatibleModelClient(this.settings);
      const analysis = await analyzeImageCandidate(
        candidate,
        currentCell,
        client,
        {
          modelName: this.settings.model,
          validator: client,
          ...contextSettings,
          notebookCells: generalCells,
          resolveImageDataUrl: imageCandidate =>
            resolveSemanticImageDataUrl(
              imageCandidate.src,
              this.notebook.context.urlResolver
            )
        }
      );

      // Step C: Check if widget was closed while waiting
      if (this.isDisposed) {
        return;
      }
      const latestIndex = this.notebook.content.widgets.indexOf(this.cell);
      const latestCell = notebookToGeneralCells(this.notebook)[latestIndex];
      if (
        !latestCell ||
        !findCurrentReviewCandidate(candidate, latestCell, currentCell.source)
      ) {
        this.status.textContent =
          'This image changed during analysis. Run the accessibility check again.';
        return;
      }
      if (!analysis.metadata.success || !analysis.result) {
        this.status.textContent =
          analysis.metadata.errorMessage ||
          'AI analysis failed. Please try again.';
        return;
      }

      // Step D: Display recommendation
      if (analysis.result.concern) {
        if (!analysis.result.suggestion) {
          this.status.textContent = 'No replacement suggestion was returned.';
          return;
        }
        this.suggestion.value = analysis.result.suggestion;
        this.suggestion.hidden = false;
        this.recommendationReady = true;
        this.applyButton.disabled = false;
        this.actions.hidden = false;
        this.status.textContent = describeSuggestionValidation(
          analysis.validation
        );
      } else {
        this.status.textContent =
          'AI analysis recommends no improvement to the existing alt text.';
      }
    } catch (error) {
      console.error(error);
      if (!this.isDisposed) {
        this.status.textContent = 'Error analyzing image. Please try again.';
      }
    } finally {
      // Step E: Re-enable the button if widget is still alive
      if (!this.isDisposed) {
        this.analyzeButton.disabled = false;
      }
    }
  }

  private applyRecommendation(): void {
    if (
      this.isDisposed ||
      !this.recommendationReady ||
      this.analyzeButton.disabled ||
      this.applyButton.hidden
    ) {
      return;
    }
    try {
      const index = this.notebook.content.widgets.indexOf(this.cell);
      const currentCell = notebookToGeneralCells(this.notebook)[index];
      if (!currentCell) {
        throw new Error(
          'This cell is unavailable. Run the notebook check again.'
        );
      }
      if (this.selected.sourceType === 'code-output') {
        const metadata = buildOutputAltMetadata(
          this.selected,
          currentCell,
          this.suggestion.value
        );
        this.cell.model.setMetadata('a11y_metadata', metadata);
      } else {
        const source = buildReviewedMarkdownSource(
          this.selected,
          currentCell,
          this.sourceSnapshot,
          this.suggestion.value
        );
        this.cell.model.sharedModel.setSource(source);
      }
      this.existingAlt.textContent = `Current alt text: ${this.suggestion.value.trim().replace(/\s+/g, ' ')}`;
      this.recommendationReady = false;
      this.actions.hidden = true;
      this.suggestion.hidden = true;
      this.analyzeButton.disabled = true;
      this.status.textContent =
        'Alt text applied. Run the notebook check again to refresh this card.';
      this.status.tabIndex = -1;
      this.status.focus();
    } catch (error) {
      this.status.textContent =
        error instanceof Error
          ? error.message
          : 'Could not apply alt text. The recommendation is still available.';
    }
  }

  private dismissRecommendation(): void {
    if (this.isDisposed || !this.recommendationReady) {
      return;
    }
    this.recommendationReady = false;
    this.suggestion.value = '';
    this.suggestion.hidden = true;
    this.actions.hidden = true;
    this.status.textContent =
      'Recommendation dismissed. Current alt text was kept.';
    this.analyzeButton.focus();
  }

  private navigateToCell(): void {
    this.cell.node.scrollIntoView({ behavior: 'auto', block: 'nearest' });

    requestAnimationFrame(() => {
      this.cell.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    this.cell.node.style.transition = 'background-color 0.5s ease';
    this.cell.node.style.backgroundColor =
      'var(--a11y-highlight-locate, var(--error-red))';

    setTimeout(() => {
      this.cell.node.style.backgroundColor = '';
    }, 1000);
  }
}
