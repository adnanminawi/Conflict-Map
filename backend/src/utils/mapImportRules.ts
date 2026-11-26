// Guesses for the "Import map" tab: what each KML folder is, and which side it belongs to.
// They are only guesses: the admin sees them in the preview and can change any of them.
// Add words here when a new file uses other names.

// Folders of places that are not military: the base map already shows cities and mountains
const SKIP_WORDS = /cit(y|ies)|towns?|villages?|mountains?|المدن|مدن|قرى|القرى|جبال|الجبال/i;

// Folders of strikes → events
const STRIKE_WORDS = /strikes?|air ?raids?|bombing|shelling|attacks|غارة|غارات|قصف|استهداف|ضربة|ضربات/i;

// Folders skipped unless the admin changes it in the preview: only places that are not military (cities, mountains).
// Everything else in the file is kept, also site parts (launchers, bunkers) and inactive sites.
export function isSkipFolder(name: string): boolean {
  return SKIP_WORDS.test(name);
}

export function isStrikeFolder(name: string): boolean {
  return STRIKE_WORDS.test(name);
}

// ---------- Sides ----------

// Other names (mostly Arabic) for the sides in our database. `side` matches our side's name,
// `words` are what a KML file may write instead. Example: our "Houthis" ↔ "حركة انصار الله (الحوثي)".
const SIDE_ALIASES: { side: RegExp; words: RegExp }[] = [
  { side: /houthi/i, words: /حوثي|حوثى|الحوثيين|انصار الله|أنصار الله|صنعاء/ },
  { side: /government|presidential|legitimate/i, words: /المجلس الرئاسي|الحكومة|الحكومي|الشرعية/ },
  { side: /giants/i, words: /العمالقة/ },
  { side: /stc|southern transitional/i, words: /الانتقالي/ },
  { side: /saudi/i, words: /السعودي|السعودية|التحالف/ },
  { side: /hezbollah/i, words: /حزب الله/ },
  { side: /israel|idf/i, words: /إسرائيل|اسرائيل|الإسرائيلي|الاحتلال/ },
];

// How strongly a text points to this side: its own name, or one of its other names
function mentions(text: string, sideName: string): boolean {
  if (text.toLowerCase().includes(sideName.toLowerCase())) return true;
  return SIDE_ALIASES.some((a) => a.side.test(sideName) && a.words.test(text));
}

// The side a frontline folder belongs to, or null if nothing points to one side.
// The folder's name counts most (10 points); each shape name that mentions a side adds 1.
// Only the sides of the file's country are tried, so "Government" of Yemen is not confused with another country's.
export function guessSide(
  folderName: string,
  shapeNames: string[],
  sides: { id: number; name: string; country_code: string }[],
  country: string,
): number | null {
  let best: { id: number; score: number } | null = null;
  for (const side of sides.filter((s) => s.country_code === country)) {
    let score = mentions(folderName, side.name) ? 10 : 0;
    for (const name of shapeNames) if (mentions(name, side.name)) score++;
    if (score > 0 && (!best || score > best.score)) best = { id: side.id, score };
  }
  return best?.id ?? null;
}

// ---------- Icons on frontline layers ----------

// A pin inside a frontline folder: an explosion, a fighting icon, or just its name written on the map ("text").
// My Maps icon 1145 = "crisis explosion". Google Earth: the picture's file name.
export function frontlineIcon(style: unknown, iconLink: unknown): 'explosion' | 'fighting' | 'text' {
  const text = `${typeof style === 'string' ? style : ''} ${typeof iconLink === 'string' ? iconLink : ''}`;
  if (/#icon-1145\b|explosion|blast|fire/i.test(text)) return 'explosion';
  if (/fight|battle|swords?|clash/i.test(text)) return 'fighting';
  return 'text';
}