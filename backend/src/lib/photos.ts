import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError } from './http.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 25_000_000;
const maxEncodedLength = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 64;
export const photoSchema = z.string().max(maxEncodedLength, 'La foto debe pesar como máximo 5 MB.').nullable().optional();
export type PreparedPhoto = { buffer: Buffer; hash: string };

export async function preparePhoto(value: string | null | undefined): Promise<PreparedPhoto | null | undefined> {
  if (value == null) return value;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new AppError(400, 'INVALID_PHOTO', 'Elige una foto JPG, PNG o WebP válida.');
  const input = Buffer.from(match[2], 'base64');
  if (input.length > MAX_PHOTO_BYTES) throw new AppError(413, 'PHOTO_TOO_LARGE', 'La foto debe pesar como máximo 5 MB.');
  if (!input.length || input.toString('base64') !== match[2]) throw new AppError(400, 'INVALID_PHOTO', 'No pudimos leer la foto seleccionada.');
  const detected = input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg'
    : input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
    : input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (detected !== match[1]) throw new AppError(400, 'INVALID_PHOTO', 'El archivo no corresponde a una foto JPG, PNG o WebP.');
  try {
    const pipeline = sharp(input, { limitInputPixels: MAX_PHOTO_PIXELS, failOn: 'warning' });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PHOTO_PIXELS) {
      throw new AppError(400, 'PHOTO_DIMENSIONS_TOO_LARGE', 'La foto tiene demasiados píxeles. Elige una imagen más pequeña.');
    }
    if ((metadata.pages || 1) > 1) throw new AppError(400, 'ANIMATED_PHOTO_NOT_SUPPORTED', 'Elige una foto sin animación.');
    // Orientation is applied before resizing. Sharp strips EXIF/GPS metadata by default.
    const buffer = await pipeline.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer();
    if (buffer.length > 2 * 1024 * 1024) throw new AppError(413, 'PHOTO_TOO_LARGE', 'La foto sigue siendo muy pesada. Elige una imagen más pequeña.');
    return { buffer, hash: createHash('sha256').update(buffer).digest('hex') };
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError(400, 'INVALID_PHOTO', 'No pudimos procesar la foto. Elige otra imagen JPG, PNG o WebP.');
  }
}
