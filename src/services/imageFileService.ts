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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const CRC32_TABLE = buildCrc32Table();

export class ImageFileService {
  async saveToTemp(
    payload: GeneratedImagePayload,
    preferredFormat: string,
    outputDirectory?: string
  ): Promise<string> {
    const outputDir = resolveOutputDirectory(outputDirectory);
    await mkdir(outputDir, { recursive: true });

    const extension = this.resolveExtension(payload.mimeType, preferredFormat);
    const filename = `nano-banana-${Date.now()}-${randomUUID()}.${extension}`;
    const filePath = path.join(outputDir, filename);
    const bytesWithMetadata = attachPromptMetadata(payload.bytes, payload.mimeType, payload.prompt);

    await writeFile(filePath, bytesWithMetadata);
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

function resolveOutputDirectory(configuredOutputDirectory: string | undefined): string {
  const trimmed = configuredOutputDirectory?.trim();
  if (!trimmed) {
    return path.join(os.tmpdir(), 'nano-banana-images');
  }

  return path.resolve(trimmed);
}

function attachPromptMetadata(bytes: Buffer, mimeType: string, prompt: string): Buffer {
  const normalizedPrompt = normalizePrompt(prompt);
  if (!normalizedPrompt) {
    return bytes;
  }

  const normalizedMimeType = mimeType.trim().toLowerCase();
  try {
    if (normalizedMimeType === 'image/png') {
      return injectPngExif(bytes, normalizedPrompt);
    }

    if (normalizedMimeType === 'image/jpeg' || normalizedMimeType === 'image/jpg') {
      return injectJpegExif(bytes, normalizedPrompt);
    }
  } catch {
    return bytes;
  }

  return bytes;
}

function normalizePrompt(prompt: string): string {
  const compact = prompt.trim().replace(/\s+/g, ' ');
  if (!compact) {
    return '';
  }

  return compact.slice(0, 2000);
}

function injectPngExif(bytes: Buffer, prompt: string): Buffer {
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return bytes;
  }

  const chunks = extractPngChunks(bytes);
  if (!chunks.length) {
    return bytes;
  }

  const exifData = buildExifTiff(prompt);
  const withoutExif = chunks.filter((chunk) => chunk.type !== 'eXIf');
  const firstIdat = withoutExif.findIndex((chunk) => chunk.type === 'IDAT');
  const insertIndex = firstIdat === -1 ? withoutExif.length : Math.max(1, firstIdat);
  withoutExif.splice(insertIndex, 0, { type: 'eXIf', data: exifData });

  const rebuilt: Uint8Array[] = [PNG_SIGNATURE];
  for (const chunk of withoutExif) {
    rebuilt.push(buildPngChunk(chunk.type, chunk.data));
  }

  return Buffer.concat(rebuilt);
}

function extractPngChunks(bytes: Buffer): Array<{ type: string; data: Buffer }> {
  const chunks: Array<{ type: string; data: Buffer }> = [];
  let offset = PNG_SIGNATURE.length;

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) {
      return [];
    }

    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset = chunkEnd;

    if (type === 'IEND') {
      break;
    }
  }

  return chunks;
}

function buildPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.allocUnsafe(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcBuffer = Buffer.allocUnsafe(4);
  crcBuffer.writeUInt32BE(calculateCrc32(crcInput), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function injectJpegExif(bytes: Buffer, prompt: string): Buffer {
  if (bytes.length < 4 || !bytes.subarray(0, 2).equals(JPEG_SOI)) {
    return bytes;
  }

  const tiffData = buildExifTiff(prompt);
  const exifPayload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiffData]);
  const exifSegmentLength = exifPayload.length + 2;
  if (exifSegmentLength > 0xffff) {
    return bytes;
  }

  const app1Header = Buffer.allocUnsafe(4);
  app1Header.writeUInt16BE(0xffe1, 0);
  app1Header.writeUInt16BE(exifSegmentLength, 2);

  return Buffer.concat([bytes.subarray(0, 2), app1Header, exifPayload, bytes.subarray(2)]);
}

function buildExifTiff(prompt: string): Buffer {
  const description = Buffer.from(prompt, 'utf8');
  const valueSize = description.length + 1;
  const ifdEntryCount = 1;
  const ifdBodySize = 2 + ifdEntryCount * 12 + 4;
  const valueOffset = 8 + ifdBodySize;
  const totalLength = valueSize <= 4 ? 8 + ifdBodySize : 8 + ifdBodySize + valueSize;
  const exif = Buffer.alloc(totalLength);

  exif.write('MM', 0, 'ascii');
  exif.writeUInt16BE(0x002a, 2);
  exif.writeUInt32BE(8, 4);

  exif.writeUInt16BE(ifdEntryCount, 8);
  const entryOffset = 10;
  exif.writeUInt16BE(0x010e, entryOffset);
  exif.writeUInt16BE(2, entryOffset + 2);
  exif.writeUInt32BE(valueSize, entryOffset + 4);

  if (valueSize <= 4) {
    description.copy(exif, entryOffset + 8);
    exif[entryOffset + 8 + description.length] = 0x00;
  } else {
    exif.writeUInt32BE(valueOffset, entryOffset + 8);
    description.copy(exif, valueOffset);
    exif[valueOffset + description.length] = 0x00;
  }

  exif.writeUInt32BE(0, 8 + 2 + ifdEntryCount * 12);
  return exif;
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) === 0 ? c >>> 1 : 0xedb88320 ^ (c >>> 1);
    }
    table[i] = c >>> 0;
  }

  return table;
}

function calculateCrc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
