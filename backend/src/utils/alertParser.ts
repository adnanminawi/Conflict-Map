// Reads one message of the Telegram alerts channel and splits it into: type, time blocks, place names.

//
// A message looks like this:
//   Цева адом в Хайфа, Акко [09:35]:            ← title: type (+ a summary we ignore)
//   08/06/2026 09:35:43:                        ← time of the block below (Israel time)
//   • Ха-Мифрац - Хайфа - запад, Кирьят Ям      ← zone - place, place, ...
//   • כפר ח'וואלד - כפר ח'וואלד                 ← place without translation: written twice, in Hebrew
//   || региональный совет: ... ||               ← summary: ignored
//   Отправлено от @CumtaAlertsRussianChannel    ← footer: ignored
// Long alerts continue in the next message, without the title (and maybe without a time first).

export type AlertType = 'rockets' | 'drone' | 'other';

export interface AlertBlock {
  time: Date | null; // null = the block started before any time line (continuation of the last message)
  places: string[]; // place names exactly as written
  lines: string[]; // the original lines, saved as raw_text
}

export interface ParsedAlertMessage {
  type: AlertType | null; // null = no title (continuation of the last message)
  blocks: AlertBlock[];
}


function readType(title: string): AlertType {
  const t = title.toLowerCase();
  if (t.startsWith('цева адом')) return 'rockets';
  if (t.startsWith('проникновение')) return 'drone';
  return 'other';
}

// Israel time (with summer / winter time) → the same moment in UTC
export function israelTimeToUtc(year: number, month: number, day: number, h: number, m: number, s: number): Date {
  const asIfUtc = Date.UTC(year, month - 1, day, h, m, s);

  // What does the clock in Israel show at that UTC moment? The difference = Israel's offset (2 or 3 hours).
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(asIfUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const israelClock = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));

  return new Date(asIfUtc - (israelClock - asIfUtc));
}

// "Хайфа - запад, Кирьят Ям, Хайфа, Кирьят Хаим , Кирьят" → the place names.
// Some official names contain commas, so after splitting we try to glue 2–4 pieces back together
// and keep the longest one that is a known place.
export function splitPlaces(list: string, isKnown: (name: string) => boolean): string[] {
  const pieces = list.split(',');
  const places: string[] = [];

  let i = 0;
  while (i < pieces.length) {
    let size = 1;
    for (let n = Math.min(4, pieces.length - i); n > 1; n--) {
      if (isKnown(pieces.slice(i, i + n).join(',').trim())) {
        size = n;
        break;
      }
    }
    places.push(pieces.slice(i, i + size).join(',').trim());
    i += size;
  }
  return places.filter((p) => p !== '');
}

// One "• ..." line → its place names
function readPlaceLine(text: string, isKnown: (name: string) => boolean): string[] {
  // "X - X" (the same text twice): a place without translation. X itself may contain " - " or commas.
  const half = (text.length - 3) / 2;
  if (Number.isInteger(half) && text.slice(half, half + 3) === ' - ' && text.slice(0, half) === text.slice(half + 3)) {
    return [text.slice(0, half)];
  }

  // "zone - place, place, ..." → split only at the FIRST " - " (place names can contain " - " too)
  const dash = text.indexOf(' - ');
  if (dash === -1) return [];
  return splitPlaces(text.slice(dash + 3), isKnown);
}

const TITLE = /\[\d{1,2}:\d{2}\]:?\s*$/; // ends with "[09:35]:"
const TIME = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}):?$/; // "08/06/2026 09:35:43:"

export function parseAlertMessage(text: string, isKnown: (name: string) => boolean): ParsedAlertMessage {
  const result: ParsedAlertMessage = { type: null, blocks: [] };
  let block: AlertBlock | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (TITLE.test(line) && line.includes(' в ')) {
      result.type = readType(line);
      continue;
    }

    const time = line.match(TIME);
    if (time) {
      const [, d, mo, y, h, mi, s] = time.map(Number);
      block = { time: israelTimeToUtc(y, mo, d, h, mi, s), places: [], lines: [line] };
      result.blocks.push(block);
      continue;
    }

    if (line.startsWith('•')) {
      if (!block) {
        // Places before any time line = continuation of the previous message
        block = { time: null, places: [], lines: [] };
        result.blocks.push(block);
      }
      block.places.push(...readPlaceLine(line.slice(1).trim(), isKnown));
      block.lines.push(line);
    }
    // Anything else (summaries "|| ... ||", footer, empty lines) is ignored
  }

  // Drop blocks without places (e.g. a time line with nothing under it)
  result.blocks = result.blocks.filter((b) => b.places.length > 0);
  return result;
}