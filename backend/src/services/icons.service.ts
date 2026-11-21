// The saved icons (table map_icons): show one, list them, or add one the admin uploads.
// (The icons that come inside a KMZ are handled by fileIcons.service.ts.)
import { createHash } from 'node:crypto';
import { db } from '../config/db';
import * as iconsRepository from '../repositories/icons.repository';
import { AppError } from '../utils/AppError';
import { MAX_PICTURE_BYTES, pictureType } from '../utils/kmzPictures';

export async function getIcon(id: number) {
  const icon = await iconsRepository.findById(id);
  if (!icon) throw AppError.notFound('Icon not found');
  return icon;
}

// For the admin's icon picker: the ids of all saved icons
export async function listIcons() {
  return iconsRepository.findAllIds();
}

// A picture the admin uploads as an icon. The same picture uploaded twice keeps one row (same hash).
export async function uploadIcon(data: Buffer): Promise<{ id: number }> {
  if (data.length > MAX_PICTURE_BYTES) throw AppError.badRequest('The picture is too big for an icon (max 256 KB)');
  // Checked from its bytes, not its name: only real PNG / JPEG / GIF / WEBP pictures (no SVG: it can hold scripts)
  const contentType = pictureType(data);
  if (!contentType) throw AppError.badRequest('Only PNG, JPEG, GIF or WEBP pictures');

  const hash = createHash('sha256').update(data).digest('hex');
  return { id: await iconsRepository.save(db, hash, contentType, data) };
}

// A base / pin may only point to an icon that exists
export async function checkIcon(id: number | null | undefined) {
  if (id != null && !(await iconsRepository.exists(id))) throw AppError.badRequest('This icon does not exist');
}