import { Widget } from '@lumino/widgets';
import type { Cell, ICellModel } from '@jupyterlab/cells';
import type { NotebookPanel } from '@jupyterlab/notebook';
import {
  type IImageCandidate,
  type IModelSettings,
  analyzeImageCandidate,
  codeOutputCandidateToDataUrl,
  findCurrentCodeOutputCandidate,
  OpenAICompatibleModelClient
} from '@berkeley-dsep-infra/a11y-checker-core';
import { notebookToGeneralCells } from '../adapter.js';
import type { ISemanticContextSettings } from '../semantic-context-settings.js';

/** Analysis-only output review; accepting output alt text belongs to Phase 6. */
export class CodeOutputImageWidget extends Widget {
  private readonly analyzeButton: HTMLButtonElement;
  private readonly status: HTMLParagraphElement;
  private readonly suggestion: HTMLTextAreaElement;

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

    // 1. Header with cell, output indices, and Locate button
    const headerContainer = document.createElement('div');
    headerContainer.style.display = 'flex';
    headerContainer.style.justifyContent = 'space-between';
    headerContainer.style.alignItems = 'center';
    headerContainer.style.marginBottom = '8px';

    const title = document.createElement('h3');
    title.textContent = `Cell ${selected.cellIndex + 1}, output ${selected.outputIndex! + 1}`;
    title.style.margin = '0';

    const locateButton = document.createElement('button');
    locateButton.type = 'button';
    locateButton.className = 'jp-Button2 locate-button';
    locateButton.innerHTML = `<span class="material-icons" aria-hidden="true" style="font-size: 16px; margin-right: 4px;">search</span>Locate`;
    locateButton.addEventListener('click', () => {
      this.navigateToCell();
    });

    headerContainer.append(title, locateButton);

    // 2. Plot thumbnail preview
    const preview = document.createElement('img');
    preview.src = codeOutputCandidateToDataUrl(selected);
    preview.alt = selected.existingAltText || 'Code-output image preview';
    preview.style.maxWidth = '100%';

    // 3. Stored alt text info
    const existingAlt = document.createElement('p');
    existingAlt.textContent = selected.existingAltText
      ? `Stored alt text: ${selected.existingAltText}`
      : 'No nonempty stored alt text.';

    // 4. "Analyze output image" button
    this.analyzeButton = document.createElement('button');
    this.analyzeButton.type = 'button';
    this.analyzeButton.className = 'jp-Button2 suggest-button';
    this.analyzeButton.textContent = 'Analyze output image';
    this.analyzeButton.style.display = aiEnabled ? 'flex' : 'none';
    this.analyzeButton.addEventListener('click', () => {
      void this.analyzeOutput();
    });

    // 5. Accessible live region for status / errors
    this.status = document.createElement('p');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-atomic', 'true');

    // 6. Read-only text area for displaying the suggestion
    this.suggestion = document.createElement('textarea');
    this.suggestion.readOnly = true;
    this.suggestion.rows = 4;
    this.suggestion.style.width = '100%';
    this.suggestion.setAttribute(
      'aria-label',
      'Suggested alt text for code-output image'
    );
    this.suggestion.hidden = true;

    // Attach all elements to the Lumino widget node
    this.node.append(
      headerContainer,
      preview,
      existingAlt,
      this.analyzeButton,
      this.status,
      this.suggestion
    );
  }

  private async analyzeOutput(): Promise<void> {
    if (this.analyzeButton.disabled || this.isDisposed) {
      return;
    }

    // Enter loading state
    this.analyzeButton.disabled = true;
    this.status.textContent = 'Analyzing output image...';
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
      // Step A: Re-fetch the live cell and verify output hasn't changed
      const currentIndex = this.notebook.content.widgets.indexOf(this.cell);
      const generalCells = notebookToGeneralCells(this.notebook);
      const currentCell = generalCells[currentIndex];
      const candidate = currentCell
        ? findCurrentCodeOutputCandidate(this.selected, currentCell)
        : undefined;

      if (!candidate || !currentCell) {
        this.status.textContent =
          'This output has changed or is unavailable. Run the accessibility check again.';
        return;
      }

      // Step B: Send to AI model
      const analysis = await analyzeImageCandidate(
        candidate,
        currentCell,
        new OpenAICompatibleModelClient(this.settings),
        {
          modelName: this.settings.model,
          ...contextSettings,
          notebookCells: generalCells
        }
      );

      // Step C: Check if widget was closed while waiting
      if (this.isDisposed) {
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
        this.status.textContent =
          'Suggestion ready for review. The notebook has not been changed.';
      } else {
        this.status.textContent =
          'The existing alt text does not need a replacement.';
      }
    } catch (error) {
      console.error(error);
      if (!this.isDisposed) {
        this.status.textContent =
          'Error analyzing output image. Please try again.';
      }
    } finally {
      // Step E: Re-enable the button if widget is still alive
      if (!this.isDisposed) {
        this.analyzeButton.disabled = false;
      }
    }
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
