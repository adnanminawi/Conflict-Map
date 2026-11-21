// The pictures inside a KMZ file (its icons). A KMZ is a zip: doc.kml + folders like files/tank.png.
// In the KML a pin says <Icon><href>files/tank.png</href></Icon>: that path is how we find its picture.
import AdmZip from 'adm-zip';

export const MAX_PICTURE_BYTES = 256 * 1024; // an icon is small: bigger pictures (photos) are ignored
const MAX_ENTRIES = 2000; // files looked at inside the zip

export interface Picture {
  data: Buffer;
  contentType: string; // image/png, image/jpeg, image/gif, image/webp
}

// What a picture really is, from its first bytes (not from its name, which can lie).
// SVG is not accepted: it can contain scripts.
export function pictureType(data: Buffer): string | null {
  if (data.length > 8 && data.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length > 4 && data.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// "./files/My%20Tank.PNG" → "files/my tank.png": the same spelling for the KML's links and the zip's file names
export function picturePath(href: unknown): string | null {
  if (typeof href !== 'string' || href.trim() === '') return null;
  if (/^[a-z]+:/i.test(href.trim())) return null; // a web link (http://…), not a file inside the KMZ
  let path = href.trim().replace(/\\/g, '/');
  try {
    path = decodeURIComponent(path);
  } catch {
    // a "%" that is not an escape: keep the path as it is
  }
  return path.replace(/^(\.\/|\/)+/, '').toLowerCase();
}

// Every picture of the KMZ, by its path. A .kml file has none (it can't carry pictures).
export function readKmzPictures(file: Buffer, fileName: string): Map<string, Picture> {
  const pictures = new Map<string, Picture>();
  if (!fileName.toLowerCase().endsWith('.kmz')) return pictures;

  let zip: AdmZip;
  try {
    zip = new AdmZip(file);
  } catch {
    return pictures; // a broken zip: the KML reader reports it
  }

  for (const entry of zip.getEntries().slice(0, MAX_ENTRIES)) {
    // header.size = the size after unzipping: checked BEFORE unzipping, so a "zip bomb" is never opened
    if (entry.isDirectory || entry.header.size === 0 || entry.header.size > MAX_PICTURE_BYTES) continue;
    const path = picturePath(entry.entryName);
    if (!path || path.endsWith('.kml')) continue;

    const data = entry.getData();
    const contentType = pictureType(data);
    if (contentType) pictures.set(path, { data, contentType });
  }
  return pictures;
}

// The picture a pin's icon link points to, or null.
// Tries the exact path first, then the file name alone if only one picture has it
// (some tools write "tank.png" for "files/tank.png").
export function findPicture(pictures: Map<string, Picture>, href: unknown): Picture | null {
  const path = picturePath(href);
  if (!path) return null;
  const exact = pictures.get(path);
  if (exact) return exact;

  const name = path.split('/').pop();
  const sameName = [...pictures].filter(([p]) => p.split('/').pop() === name);
  return sameName.length === 1 ? sameName[0][1] : null;
}