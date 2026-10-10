/**
 * Shared image-finding utilities used by image and color detection.
 */

import {
  IGeneralCell,
  IImageCandidate,
  AltTextState,
  IA11yMetadata,
  IOutputA11yMetadata,
} from "../types.js";

/**
 * Find all <img ...> tags using indexOf-based scanning (no ReDoS).
 */
export function findImgTags(
  html: string,
): Array<{ tag: string; start: number; end: number }> {
  const results: Array<{ tag: string; start: number; end: number }> = [];
  const lower = html.toLowerCase();
  let searchFrom = 0;
  while (searchFrom < lower.length) {
    const idx = lower.indexOf("<img", searchFrom);
    if (idx === -1) {
      break;
    }
    // Ensure it's actually an <img tag (next char must be space, >, /)
    const charAfter = lower[idx + 4];
    if (
      charAfter !== undefined &&
      charAfter !== ">" &&
      charAfter !== " " &&
      charAfter !== "\t" &&
      charAfter !== "\n" &&
      charAfter !== "\r" &&
      charAfter !== "/"
    ) {
      searchFrom = idx + 1;
      continue;
    }
    const closeIdx = html.indexOf(">", idx + 4);
    if (closeIdx === -1) {
      break;
    }
    const end = closeIdx + 1;
    results.push({ tag: html.slice(idx, end), start: idx, end });
    searchFrom = end;
  }
  return results;
}

export interface IParsedImgTag {
  src: string;
  existingAltText?: string;
  hasAlt: boolean;
}

export function parseHtmlImgTag(tag: string): IParsedImgTag | null {
  // Use (?:^|[\s<]) instead of \b so that data-src or my-src are never matched
  const srcMatch = tag.match(
    /(?:^|[\s<])src\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/i,
  );
  const src = srcMatch ? (srcMatch[1] ?? srcMatch[2] ?? "").trim() : "";

  if (!src) {
    return null;
  }

  // Use (?:^|[\s<]) so data-alt or aria-alt are never matched
  const hasAlt = /(?:^|[\s<])alt(\s*=\s*|\s|>|\/)/i.test(tag);
  let existingAltText: string | undefined = undefined;

  if (hasAlt) {
    const altMatch = tag.match(
      /(?:^|[\s<])alt\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/i,
    );
    existingAltText = altMatch ? (altMatch[1] ?? altMatch[2] ?? "") : "";
  }

  return { src, existingAltText, hasAlt };
}

/**
 * Find all markdown images ![...](...) using indexOf scanning (no ReDoS).
 */
export function findMarkdownImages(
  text: string,
): Array<{ match: string; start: number; end: number }> {
  const results: Array<{ match: string; start: number; end: number }> = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const bangIdx = text.indexOf("![", searchFrom);
    if (bangIdx === -1) {
      break;
    }
    const bracketClose = text.indexOf("](", bangIdx + 2);
    if (bracketClose === -1) {
      searchFrom = bangIdx + 1;
      continue;
    }
    const parenClose = text.indexOf(")", bracketClose + 2);
    if (parenClose === -1) {
      searchFrom = bracketClose + 1;
      continue;
    }
    const end = parenClose + 1;
    results.push({ match: text.slice(bangIdx, end), start: bangIdx, end });
    searchFrom = end;
  }
  return results;
}

/**
 * Extract image URL from a matched image string (markdown or HTML).
 */
export function extractImageUrl(imageStr: string): string | null {
  // Markdown: ![...](url)
  const parenOpen = imageStr.indexOf("(");
  if (parenOpen !== -1) {
    const parenClose = imageStr.indexOf(")", parenOpen + 1);
    if (parenClose !== -1) {
      return imageStr.slice(parenOpen + 1, parenClose).trim();
    }
  }
  // HTML: src="url" or src='url'
  const lower = imageStr.toLowerCase();
  const srcIdx = lower.indexOf("src=");
  if (srcIdx !== -1) {
    const quote = imageStr[srcIdx + 4];
    if (quote === '"' || quote === "'") {
      const closeQuote = imageStr.indexOf(quote, srcIdx + 5);
      if (closeQuote !== -1) {
        return imageStr.slice(srcIdx + 5, closeQuote);
      }
    }
  }
  return null;
}

/**
 * Resolve the directory that a notebook's relative image paths are relative to.
 *
 * Callers hand us the notebook's own path (e.g. JupyterLab's
 * `NotebookPanel.context.path`), which points at the `.ipynb` file, not the
 * folder holding it. Interpolating that directly produced URLs like
 * `files/PS0/intro.ipynb/diagram.png`, which always 404.
 *
 * Returns "" for a notebook at the root, so callers join to `files/diagram.png`
 * rather than `files//diagram.png`.
 */
export function getNotebookDirectory(notebookPath: string): string {
  if (!notebookPath) {
    return "";
  }
  const lastSlash = notebookPath.lastIndexOf("/");
  return lastSlash === -1 ? "" : notebookPath.slice(0, lastSlash);
}

/**
 * Join a notebook-relative directory and an image path without producing an
 * empty segment when the directory is "" (notebook at the root).
 */
export function joinNotebookPath(directory: string, imagePath: string): string {
  return directory ? `${directory}/${imagePath}` : imagePath;
}

export function computeImageHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return (hash >>> 0).toString(16);
}

function findOutputMetadata(
  a11y: IA11yMetadata | undefined,
  outputIndex: number,
  dataHash: string,
): IOutputA11yMetadata | undefined {
  const metadata = a11y?.outputs?.[String(outputIndex)];

  if (!metadata || metadata.dataHash !== dataHash) {
    return undefined;
  }

  return metadata;
}

export function extractImageCandidates(
  cells: IGeneralCell[],
): IImageCandidate[] {
  const candidates: IImageCandidate[] = [];

  for (const cell of cells) {
    if (cell.type === "markdown") {
      // 1. Markdown inline images: ![alt](url)
      const markdownMatches = findMarkdownImages(cell.source);
      for (const m of markdownMatches) {
        const bracketClose = m.match.indexOf("](");
        const altText = m.match.slice(2, bracketClose);
        const src = extractImageUrl(m.match) ?? "";
        const isAttachment = src.startsWith("attachment:");
        let mimeType: string | undefined = undefined;
        if (isAttachment && cell.attachments) {
          const filename = src.replace("attachment:", "");
          const attachmentEntry = cell.attachments[filename];
          if (attachmentEntry) {
            mimeType = Object.keys(attachmentEntry)[0]; // e.g. "image/png"
          }
        }

        const candidate: IImageCandidate = {
          cellIndex: cell.cellIndex,
          sourceType: isAttachment ? "attachment" : "markdown-inline",
          src,
          mimeType,
          existingAltText: altText,
          altState: altText === "" ? "empty" : "present",
          offsets: { start: m.start, end: m.end },
        };
        candidates.push(candidate);
      }

      // 2. HTML image tags: <img src="..." alt="...">
      const htmlMatches = findImgTags(cell.source);
      for (const m of htmlMatches) {
        const parsed = parseHtmlImgTag(m.tag);
        if (!parsed) {
          continue;
        }

        candidates.push({
          cellIndex: cell.cellIndex,
          sourceType: "markdown-html",
          src: parsed.src,
          existingAltText: parsed.existingAltText,
          altState: !parsed.hasAlt
            ? "missing"
            : parsed.existingAltText === ""
              ? "empty"
              : "present",
          offsets: { start: m.start, end: m.end },
        });
      }
    } else if (cell.type === "code" && cell.outputs) {
      let totalImageOutputs = 0;
      for (const out of cell.outputs) {
        if (out.data && (out.data["image/png"] || out.data["image/jpeg"])) {
          totalImageOutputs++;
        }
      }

      for (
        let outputIndex = 0;
        outputIndex < cell.outputs.length;
        outputIndex++
      ) {
        const output = cell.outputs[outputIndex];
        if (!output.data) {
          continue;
        }
        // Check image format
        let mimeType: string | null = null;
        if (output.data["image/png"]) {
          mimeType = "image/png";
        } else if (output.data["image/jpeg"]) {
          mimeType = "image/jpeg";
        }
        if (!mimeType) {
          continue;
        }

        const rawData = output.data[mimeType];
        const dataHash = computeImageHash(rawData);
        let storedAlt: string | undefined = undefined;
        const a11y = cell.metadata?.a11y_metadata;
        const perOutputMeta = findOutputMetadata(a11y, outputIndex, dataHash);

        if (perOutputMeta) {
          storedAlt = perOutputMeta.altText;
        } else if (totalImageOutputs === 1 && a11y?.altText !== undefined) {
          if (!a11y.dataHash || a11y.dataHash === dataHash) {
            storedAlt = a11y.altText;
          }
        }
        let altState: AltTextState = "missing";
        if (storedAlt === "") {
          altState = "empty";
        } else if (storedAlt !== undefined) {
          altState = "present";
        }
        candidates.push({
          cellIndex: cell.cellIndex,
          outputIndex,
          sourceType: "code-output",
          src: rawData,
          mimeType,
          existingAltText: storedAlt,
          altState,
          dataHash,
        });
      }
    }
  }
  return candidates;
}
