// Guesses a site's type from its words (name, then KML folder), like a GIS "attribute rule".
// Returns a location_types code, or null when no rule matches (the import then uses the admin's chosen type).
// Checked in order: the first rule that matches wins. Add words here when a new file uses other names.

const RULES: { type: string; words: RegExp }[] = [
  // Radars first: "EL/M-2080" is the Arrow system's radar, not a launcher
  { type: 'radar', words: /\bradars?\b|^EL\/M-|^AN\/(TPY|MPQ|TPQ|FPS|SPY)|aerostat|رادار/i },
  {
    type: 'air_defence',
    // "ID" / "DS" only as the whole name (Iron Dome / David's Sling): as part of a word they mean other things
    words:
      /^(ID|DS)$|iron dome|david'?s sling|\barrow\b|patriot|thaad|nasams|iris-t|\bS-?[34]00\b|pantsir|bavar|khordad|\bhawk\b|\bSAMs?\b|air defen[cs]e|دفاع جوي|القبة الحديدية/i,
  },
  { type: 'airport', words: /airport|airfield|air ?base|مطار/i },
  { type: 'naval_base', words: /naval|navy|harbou?r|بحري/i },
];

export function classifySite(text: string | null): string | null {
  if (!text) return null;
  return RULES.find((rule) => rule.words.test(text.trim()))?.type ?? null;
}

// Short names some KML files use for a system: the pin's name → the system's name in the weapons table.
// Add a line here when a new file uses another short name.
const SYSTEM_ALIASES: Record<string, string> = {
  id: 'Iron Dome',
  ds: "David's Sling",
  'arrow-2/3': 'Arrow 2',
};

// The system a pin's name stands for (an alias, or the name itself), in lower case for comparing.
// "ID" → "iron dome", "THAAD" → "thaad"
export function systemNameOf(pinName: string): string {
  const key = pinName.trim().toLowerCase();
  return (SYSTEM_ALIASES[key] ?? key).toLowerCase();
}