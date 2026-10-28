// Imports bases / airports from a KML or KMZ file, from the terminal.
// Same logic as the admin page upload (locations.service.ts).
//
// Usage:
//   npm run import:kml -- <file> <type> <country> [--dry-run]
// Example:
//   npm run import:kml -- ./data/egy.kml military_base EG --dry-run
import 'dotenv/config';
import fs from 'fs';
import { db } from '../src/config/db';
import * as locationsService from '../src/services/locations.service';

async function main() {
  const [filePath, typeCode, country] = process.argv.slice(2);
  const dryRun = process.argv.includes('--dry-run');

  if (!filePath || !typeCode || !country) {
    console.log('Usage: npm run import:kml -- <file.kml|file.kmz> <type> <country> [--dry-run]');
    return;
  }

  const s = await locationsService.importKml(fs.readFileSync(filePath), filePath, typeCode, country, dryRun);

  console.log(`Found:            ${s.found}`);
  console.log(`${dryRun ? 'Would save' : 'Saved'}:       ${s.saved}`);
  console.log(`Already existed:  ${s.duplicates}`);
  console.log(`Skipped shapes:   ${s.notPoints}`);
  console.log(`Bad coordinates:  ${s.invalid}`);
  console.log(`Auto-named:       ${s.autoNamed}`);
  if (dryRun) console.log('\nDry run: nothing was saved.');
}

main()
  .catch((err) => console.error('Import failed:', err.message))
  .finally(() => db.end()); // close the database so the script can exit