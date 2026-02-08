import { readFile, unlink } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ImageFileService } from '../src/services/imageFileService';

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAusB9Y9l9nUAAAAASUVORK5CYII=';
const ONE_BY_ONE_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUVFRUWFxUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OFQ8QFS0dHR0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAEAAgMBAQAAAAAAAAAAAAAABQYBBAcDAv/EADUQAAEDAgQDBgQEBwAAAAAAAAEAAgMEEQUSITEGE0FRYXEHIjKRobEUI0JSYnKCorLh8SNS0f/EABkBAQADAQEAAAAAAAAAAAAAAAABAgMEBf/EACQRAQEAAgIBBAMBAQAAAAAAAAABAhEDIRIxBBNBUSJxFDJh/9oADAMBAAIRAxEAPwD9xREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREB//2Q==';

describe('ImageFileService', () => {
  it('embeds prompt EXIF metadata into PNG output', async () => {
    const service = new ImageFileService();
    const prompt = 'sunset city cover';
    const filePath = await service.saveToTemp(
      {
        bytes: Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'),
        mimeType: 'image/png',
        prompt,
        modelId: 'gemini-3-pro-image-preview'
      },
      'png'
    );

    try {
      const saved = await readFile(filePath);
      expect(saved.includes(Buffer.from('eXIf', 'ascii'))).toBe(true);
      expect(saved.includes(Buffer.from(prompt, 'utf8'))).toBe(true);
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });

  it('embeds prompt EXIF metadata into JPEG output', async () => {
    const service = new ImageFileService();
    const prompt = 'warm product showcase';
    const filePath = await service.saveToTemp(
      {
        bytes: Buffer.from(ONE_BY_ONE_JPEG_BASE64, 'base64'),
        mimeType: 'image/jpeg',
        prompt,
        modelId: 'gemini-3-pro-image-preview'
      },
      'jpg'
    );

    try {
      const saved = await readFile(filePath);
      expect(saved.includes(Buffer.from('Exif\0\0', 'ascii'))).toBe(true);
      expect(saved.includes(Buffer.from(prompt, 'utf8'))).toBe(true);
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });
});
