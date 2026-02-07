import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { GeneratedImagePayload } from '../types';

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

export class ImageFileService {
  async saveToTemp(payload: GeneratedImagePayload, preferredFormat: string): Promise<string> {
    const outputDir = path.join(os.tmpdir(), 'nano-banana-images');
    await mkdir(outputDir, { recursive: true });

    const extension = this.resolveExtension(payload.mimeType, preferredFormat);
    const filename = `nano-banana-${Date.now()}-${randomUUID()}.${extension}`;
    const filePath = path.join(outputDir, filename);

    await writeFile(filePath, payload.bytes);
    return filePath;
  }

  private resolveExtension(mimeType: string, preferredFormat: string): string {
    const fromMime = MIME_EXTENSION_MAP[mimeType.toLowerCase()];
    if (fromMime) {
      return fromMime;
    }

    const normalizedPreferred = preferredFormat.trim().toLowerCase();
    if (normalizedPreferred) {
      return normalizedPreferred;
    }

    return 'png';
  }
}
