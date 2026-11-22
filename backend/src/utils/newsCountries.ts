// Finds which countries a news text is about, using the words in config/newsFeeds.ts (COUNTRY_WORDS).
import { COUNTRY_WORDS } from '../config/newsFeeds';

// ---------- English ----------

// True if the word is in the text as a whole word: 'oman' is found in "oman said", not in "woman".
// (?<![a-z0-9]) = no letter just before it, (?![a-z0-9]) = no letter just after it.
// (Not \b: it doesn't work for a word that ends with a dot, like 'u.s.')
// Dots or quotes in the word are escaped so they're matched as they are.
function hasEnglishWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(text);
}

// ---------- Arabic ----------

// The same letter is written in several ways (أ إ آ ا). Write them all as ا,
// and drop the short vowel marks (ً-ْ) and the stretching line ـ (ـ).
function normalizeArabic(text: string): string {
  return text.replace(/[أإآ]/g, 'ا').replace(/[ً-ْـ]/g, '');
}

// Endings that can follow a name: اليمن → اليمني / اليمنية / اليمنيون ...
const ARABIC_ENDINGS = ['', 'ي', 'ية', 'يه', 'يون', 'يين', 'ين', 'ون', 'ه', 'ة'];

// One word of the text, and the same word without what can stick in front of it:
// و / ف (and), then ب / ك / ل (in, like, for). "لل" is ل + ال: لليمن → اليمن.
// The word as it is stays in the list too, because some names start with these letters (لبنان, بيروت).
function stripArabicPrefixes(word: string): string[] {
  const forms = [word];
  let w = word;
  if (/^[وف]/.test(w) && w.length > 3) forms.push((w = w.slice(1)));
  if (w.startsWith('لل') && w.length > 3) forms.push('ال' + w.slice(2));
  else if (/^[بكل]/.test(w) && w.length > 3) forms.push(w.slice(1));
  return forms;
}

// True if the Arabic word (or name of two words) is in the text
function hasArabicWord(text: string, words: string[], keyword: string): boolean {
  const kw = normalizeArabic(keyword);
  if (kw.includes(' ')) return text.includes(kw); // two words (حزب الله, تل أبيب): long enough to search as they are
  return words.some((word) => stripArabicPrefixes(word).some((form) => ARABIC_ENDINGS.some((end) => form === kw + end)));
}

// ---------- Both ----------

// The text without the country's "ignore" phrases: "indian ocean" is removed before looking for "indian"
function withoutIgnored(text: string, ignore: string[], lang: 'en' | 'ar'): string {
  let t = text;
  for (const phrase of ignore) t = t.split(lang === 'ar' ? normalizeArabic(phrase) : phrase).join(' ');
  return t;
}

// Does the text talk about this country?
function mentions(text: string, code: string, lang: 'en' | 'ar'): boolean {
  const { en, ar, ignore = [] } = COUNTRY_WORDS[code];
  const t = withoutIgnored(text, ignore, lang);
  if (lang === 'en') return en.some((w) => hasEnglishWord(t, w));
  const words = t.split(/[^؀-ۿ]+/).filter(Boolean); // the text cut into words (anything not an Arabic letter separates them)
  return ar.some((w) => hasArabicWord(t, words, w));
}

// The countries a text is about, e.g. ['YE', 'IL']. Empty if none of the words is in it.
export function countriesIn(text: string, lang: 'en' | 'ar'): string[] {
  const t = lang === 'en' ? text.toLowerCase() : normalizeArabic(text);
  return Object.keys(COUNTRY_WORDS).filter((code) => mentions(t, code, lang));
}