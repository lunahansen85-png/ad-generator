/**
 * Forslag til videoens navn + varianternes navne ud fra filnavnene, naar flere filer vaelges paa
 * én gang (= én video med flere varianter, fx hooks). Ren funktion uden DOM — testet i
 * lib/video-names.test.ts (npm test). Alt kan rettes i formularen foer upload.
 *
 *   ["VID 76 Hook 1.mov", …, "VID 76 Hook 4.mov"]      → "VID 76"      + "Hook 1" … "Hook 4"
 *   ["Founder VSL  - Kort - 9x16.mov", …]              → "Founder VSL" + "Kort - 9x16" …
 *   én fil "Min video.mp4"                             → "Min video"   + "Hovedversion"
 */

export const HOVEDVERSION = "Hovedversion";

// Tegn der adskiller ord i et filnavn: mellemrum, bindestreg, understreg, tankestreg, punktum, komma.
const SEP = "\\s\\-_–—.,";
const isSep = (ch: string) => new RegExp(`^[${SEP}]$`, "u").test(ch);
const trimSep = (s: string) => s.replace(new RegExp(`^[${SEP}]+|[${SEP}]+$`, "gu"), "");
const trimEndSep = (s: string) => s.replace(new RegExp(`[${SEP}]+$`, "u"), "");

/** Filnavn uden endelse. Kun en endelse med mindst ét bogstav fjernes ("v1.2" beholder ".2"). */
export function stripExtension(filename: string) {
  return filename.replace(/\.[a-z0-9]*[a-z][a-z0-9]*$/i, "").trim();
}

function commonPrefix(list: string[]) {
  let p = list[0];
  for (const s of list.slice(1)) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}

/** Klip praefikset tilbage, saa det ikke slutter midt i et ord ("VID 76 Hoo" → "VID 76 "). */
function toWordBoundary(p: string, bases: string[]) {
  if (!p || isSep(p[p.length - 1])) return p;
  if (bases.every((b) => b.length === p.length || isSep(b[p.length]))) return p;
  let i = p.length - 1;
  while (i >= 0 && !isSep(p[i])) i--;
  return p.slice(0, i + 1);
}

/** Fjern det sidste ord (og separatorerne efter det): "VID 76 Hook " → "VID 76 ". */
function dropLastWord(p: string) {
  return trimEndSep(p).replace(new RegExp(`[^${SEP}]+$`, "u"), "");
}

const rest = (base: string, p: string) => trimSep(base.slice(p.length));
const hasLetter = (s: string) => /\p{L}/u.test(s);

export function suggestVideoNames(filenames: string[]): { name: string; variants: string[] } {
  const bases = filenames.map(stripExtension);
  if (bases.length === 0) return { name: "", variants: [] };
  if (bases.length === 1) return { name: trimSep(bases[0]), variants: [HOVEDVERSION] };

  // 1) Laengste faelles praefiks, klippet ved en ordgraense.
  let p = toWordBoundary(commonPrefix(bases), bases);
  const fuldtNavn = trimSep(p);

  // 2) En variant der kun er et tal ("1") siger intet alene — tag ordet foran med ("Hook 1").
  while (p && bases.some((b) => rest(b, p) !== "" && !hasLetter(rest(b, p)))) {
    p = dropLastWord(p);
  }

  // 3) Blev navnet tomt af det, beholdes det fulde faelles navn, og varianterne faar hele filnavnet.
  return {
    name: trimSep(p) || fuldtNavn,
    variants: bases.map((b) => rest(b, p) || b),
  };
}
