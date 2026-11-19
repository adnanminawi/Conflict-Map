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
      /^(ID|DS)$|iron dome|david'?s sling|\barrow\b|patriot|thaad|nasams|iris-t|\bS-?[34]00\b|pantsir|bavar|khordad|\bhawk\b|\bSAMs?\b|air defen[cs]e|دفاع جوي|الدفاع الجوي|دفاعات جوية|الدفاعات الجوية|القبة الحديدية/i,
  },
  // Attack missiles (after air defence: "Patriot missile" is air defence)
  { type: 'missile_base', words: /missile|ballistic|launcher|صاروخ|صواريخ|منصة إطلاق|منصات إطلاق/i },
  // "قاعدة … الجوية" = an air base → airport (before the "قاعدة" = base rule below)
  { type: 'airport', words: /airport|airfield|air ?base|مطار|مهبط|الجوية/i },
  { type: 'naval_base', words: /naval|navy|harbou?r|\bport\b|بحري|ميناء|موانئ/i },
  // Last: the general words for a base / camp
  { type: 'military_base', words: /\bbases?\b|\bcamps?\b|garrison|barracks|brigade|معسكر|قاعدة|قواعد|لواء|ثكنة/i },
];

export function classifySite(text: string | null): string | null {
  if (!text) return null;
  return RULES.find((rule) => rule.words.test(text.trim()))?.type ?? null;
}

// Google My Maps writes each pin's icon number in its style: "#icon-1504-0288D1-nodesc" → 1504.
// The icon is what the map's author picked, so it tells the type even when the name doesn't.
// Add numbers here when a file uses other icons.
const MY_MAPS_ICONS: Record<string, string> = {
  '1504': 'airport', // plane
  '1623': 'naval_base', // anchor / port
  '1899': 'military_base', // military star
};

// Google Earth icons are picture links instead, e.g. ".../kml/shapes/airports.png"
const ICON_LINK_RULES: { type: string; words: RegExp }[] = [
  { type: 'airport', words: /airports?\.png|airplane|plane\.png/i },
  { type: 'naval_base', words: /marina|ferry|anchor|harbor|port\.png/i },
];

// A pin's type from its icon, or null. `style` = its styleUrl, `iconLink` = its icon picture link.
export function classifyIcon(style: unknown, iconLink: unknown): string | null {
  const number = typeof style === 'string' ? /#icon-(\d+)/.exec(style)?.[1] : undefined;
  if (number && MY_MAPS_ICONS[number]) return MY_MAPS_ICONS[number];
  if (typeof iconLink === 'string') return ICON_LINK_RULES.find((r) => r.words.test(iconLink))?.type ?? null;
  return null;
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