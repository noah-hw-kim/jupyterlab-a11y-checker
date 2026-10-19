import type { NotebookPanel } from '@jupyterlab/notebook';
import { BrowserImageProcessor } from './image-processor.js';

export async function resolveSemanticImageDataUrl(
  src: string,
  urlResolver: NotebookPanel['context']['urlResolver']
): Promise<string> {
  if (!src.trim()) {
    throw new Error('Image source is empty.');
  }

  if (!urlResolver.isLocal(src)) {
    throw new Error(
      'Only notebook-local image paths are supported by this resolver.'
    );
  }

  const resolvedPath = await urlResolver.resolveUrl(src);
  const downloadUrl = await urlResolver.getDownloadUrl(resolvedPath);

  const processor = new BrowserImageProcessor();
  const image = await processor.loadImage(downloadUrl);
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (width <= 0 || height <= 0) {
    throw new Error('Image dimensions must be greater than zero.');
  }

  const canvas = processor.createCanvas(width, height);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create a canvas drawing context.');
  }

  context.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}
