// Finds which air defence / radar system a pin is, from its name, its description or its folder,
// so the site gets linked to that system in the weapons table (and its range shows on the map).
//   "SA-2"                                       → the weapon "S-75" (NATO name = Russian name)
//   folder ".../Category: SA-20B (S-300PMU2)"    → the weapon "S-300"
//   "EWR", description "1 x P-12/18"             → the radar "P-18"
// Only systems of the same type (air_defence / radar) and country as the site.

// What we need to know about each system of the weapons table
export interface SystemRow {
  id: number;
  name: string; // 'S-300PMU2'
  type_code: string; // 'air_defence' or 'radar'
  country_code: string; // 'AZ'
}

// Short names a whole pin name can be: "ID" → Iron Dome. (As a part of a longer name they mean other things.)
const WHOLE_NAME_ALIASES: Record<string, string> = {
  id: 'iron dome',
  ds: 'davids sling',
};

// Names of the same system: the NATO name, the Russian name, the factory code. Written like norm() writes them.
// A weapon called by any of these is found by all of them. Add a line when a file uses other names.
const SAME_SYSTEM: string[][] = [
  ['sa2', 's75', 'dvina'],
  ['sa3', 's125', 'pechora', 'neva'],
  ['sa4', 'krug', '2k11'],
  ['sa5', 's200', 'vega', 'angara'],
  ['sa6', 'kub', '2k12', 'kvadrat'],
  ['sa8', 'osa', '9k33'],
  ['sa10', 's300p'],
  ['sa11', 'buk-m1', '9k37'],
  ['sa15', 'tor', '9k330', '9k331', '9k332'],
  ['sa17', 'buk-m2', '9k317'],
  ['sa20', 's300pmu1', 's300pmu2', 'favorit'],
  ['sa21', 's400', 'triumf'],
  ['sa22', 'pantsir'],
  ['sa23', 's300vm', 'antey2500'],
];

// Writes a name the same way every file and every admin might write it:
// (also "P-12/18", meaning P-12 or P-18, becomes "p12/p18" so both are found)
// lower case, no apostrophes, and no "-" inside a code: "SA-2" / "SA 2" / "sa2" → "sa2", "S-300PMU-2" → "s300pmu2".
// Spaces between words stay: "Iron Dome" → "iron dome".
export function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/([a-z])[_-]+(?=\d)/g, '$1') // letter + "-" + digit: "sa-2" → "sa2"
    .replace(/([a-z]{2})\s+(?=\d)/g, '$1') // a word + space + digit: "sa 2" → "sa2" (not "1 x 36D6": one letter)
    .replace(/(\d)[_-]+(?=[a-z\d])/g, '$1') // digit + "-" + letter or digit: "s300-pmu2" → "s300pmu2"
    .replace(/([a-z]+-?)(\d+)\/(\d+)(?![\d])/g, '$1$2/$1$3'); // two versions: "p12/18" → "p12/p18", "arrow2/3" → "arrow2/arrow3"
}

// True if `key` is in `text` as its own word.
// Before it: no letter or digit ("sa2" is not found in "usa2").
// After it: no digit ("sa2" is not found in "sa20"). After a code ending in a digit, letters are allowed: they're
// the version ("s300" is found in "s300pmu2"). After a word ending in a letter, nothing ("tor" is not "torpedo").
function hasKey(text: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const after = /\d$/.test(key) ? '(?![0-9])' : '(?![a-z0-9])';
  return new RegExp(`(?<![a-z0-9])${escaped}${after}`).test(text);
}

// The names one weapon is found by: its own name, plus the other names of the same system
function keysOf(weaponName: string): string[] {
  const own = norm(weaponName);
  const keys = new Set([own]);
  for (const group of SAME_SYSTEM) {
    if (group.some((name) => hasKey(own, name))) group.forEach((name) => keys.add(name));
  }
  return [...keys];
}

// Prepares the systems once (for a whole file), and returns the function that finds a pin's system.
export function makeSystemFinder(systems: SystemRow[]) {
  const prepared = systems.map((s) => ({ ...s, keys: keysOf(s.name) }));

  // texts: what to look in, most precise first: the pin's name, its description, its folder.
  // countries: the pin's country first, then the file's country.
  // Returns the weapon id, or null when none of the systems matches.
  return function findSystem(texts: (string | null)[], typeCode: string, countries: string[]): number | null {
    const candidates = prepared.filter((s) => s.type_code === typeCode);
    if (candidates.length === 0) return null;

    for (const country of countries) {
      const ofCountry = candidates.filter((s) => s.country_code === country);
      for (const raw of texts) {
        if (!raw) continue;
        let text = norm(raw);
        text = WHOLE_NAME_ALIASES[text.trim()] ?? text; // "ID" → "iron dome"

        // Every system found in this text. The longest name wins: "S-300PMU2" before "S-300".
        let best: { id: number; length: number } | null = null;
        for (const s of ofCountry) {
          for (const key of s.keys) {
            if (hasKey(text, key) && (!best || key.length > best.length)) best = { id: s.id, length: key.length };
          }
        }
        if (best) return best.id;
      }
    }
    return null;
  };
}