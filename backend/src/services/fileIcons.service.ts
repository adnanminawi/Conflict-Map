// The icons inside a KMZ file: saved in the database and linked to the pins that use them.
// Used by the three imports (Import map, Frontlines, Bases).
import { createHash } from 'node:crypto';
import type { Feature } from 'geojson';
import type { Pool, PoolClient } from 'pg';
import * as iconsRepository from '../repositories/icons.repository';
import { findPicture, readKmzPictures } from '../utils/kmzPictures';

type Queryable = Pool | PoolClient;

export interface FileIcons {
  count: number; // pictures found in the file
  has: (iconLink: unknown) => boolean; // does this pin's icon link point to a picture in the file?
  idFor: (conn: Queryable, iconLink: unknown) => Promise<number | null>; // saves the picture (once), returns its id
  markPins: (conn: Queryable, features: Feature[]) => Promise<Feature[]>; // frontline pins: icon "file" + iconId
}

// Reads the file's pictures once. Only the pictures that pins really use are saved, when a pin asks for one.
export function fileIcons(file: Buffer, fileName: string): FileIcons {
  const pictures = readKmzPictures(file, fileName);
  const savedIds = new Map<string, number>(); // hash → id: each picture saved once per import

  async function idFor(conn: Queryable, iconLink: unknown): Promise<number | null> {
    const picture = findPicture(pictures, iconLink);
    if (!picture) return null;
    // sha256 = the picture's fingerprint: the same picture gets the same hash, so it's stored once
    const hash = createHash('sha256').update(picture.data).digest('hex');
    if (!savedIds.has(hash)) savedIds.set(hash, await iconsRepository.save(conn, hash, picture.contentType, picture.data));
    return savedIds.get(hash)!;
  }

  // A frontline pin with a picture in the file → { icon: "file", iconId: 12 }. Other pins don't change.
  async function markPins(conn: Queryable, features: Feature[]): Promise<Feature[]> {
    const marked: Feature[] = [];
    for (const feature of features) {
      // iconLink = the file's own icon when `icon` was already changed (Import map tab), else `icon` itself
      const link = feature.properties?.iconLink ?? feature.properties?.icon;
      const iconId = feature.geometry?.type === 'Point' ? await idFor(conn, link) : null;
      marked.push(iconId === null ? feature : { ...feature, properties: { ...feature.properties, icon: 'file', iconId } });
    }
    return marked;
  }

  return {
    count: pictures.size,
    has: (iconLink) => findPicture(pictures, iconLink) !== null,
    idFor,
    markPins,
  };
}