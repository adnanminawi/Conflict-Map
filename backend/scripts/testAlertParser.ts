// Checks the alert parser on sample messages, without Telegram or the database.
//
// Usage:  npm run test:alerts                       (uses scripts/alert-samples.txt)
//         npm run test:alerts -- my-messages.txt
//
// In the file, messages are separated by the line "Кумта - тревога - Cumta - Red Alert:"
// (that's what Telegram adds when you copy several messages).
// The result shows every place name that is not found in the official list.
import fs from 'fs';
import cities from 'pikud-haoref-api/cities.json';
import { parseAlertMessage } from '../src/utils/alertParser';

const file = process.argv[2] ?? 'scripts/alert-samples.txt';
const SEPARATOR = 'Кумта - тревога - Cumta - Red Alert:';

// Same names the backend knows: official Russian + Hebrew names
const known = new Set<string>();
for (const city of cities as any[]) {
  known.add(city.name_ru);
  known.add(city.name);
}
const isKnown = (name: string) => known.has(name);

const messages = fs.readFileSync(file, 'utf8').split(SEPARATOR);
let found = 0;
const unknown: string[] = [];

messages.forEach((text, i) => {
  const parsed = parseAlertMessage(text, isKnown);
  if (parsed.blocks.length === 0) return; // e.g. a photo without text

  console.log(`Message ${i + 1}: type = ${parsed.type ?? '(continues the last message)'}`);
  for (const block of parsed.blocks) {
    const missing = block.places.filter((p) => !isKnown(p));
    found += block.places.length - missing.length;
    unknown.push(...missing);
    console.log(`  ${block.time?.toISOString() ?? '(time of the last message)'}  ${block.places.length} places`);
  }
});

console.log(`\nFound: ${found}   Unknown: ${unknown.length}`);
if (unknown.length > 0) console.log('Unknown places:', unknown);