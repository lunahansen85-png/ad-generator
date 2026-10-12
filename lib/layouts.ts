import { testimonialTemplates, testimonialFormatTemplates } from "./templates/testimonial";
import { mortenTemplates } from "./templates/morten";
import { retinolTemplates } from "./templates/retinol";

/**
 * Layout-vaelgeren (12.10.2026): "Generer billeder" maa kun lave de layouts der er sat flueben ved
 * — Thomas: "vi skal IKKE lave 60 billeder naar der skal bruges LANGT FAERRE".
 *
 * Enheden er layout-STAMMEN, aldrig den enkelte fil: vaelges `morten_3`, renderes BAADE
 * `morten_3_1080x1080` og `morten_3_9x16`. Det er bindende — Ad Push og automationen springer et
 * layout uden 9:16-soester over ("ingen billeder med 9:16-par", Ad Push `src/automation.py:1386`,
 * tjekket 12.10.2026), saa et 1:1 uden sin soester bliver aldrig en annonce.
 */
export type Layout = { stem: string; label: string };

// Formatet ligger som endelse paa skabelon-id'et.
const FORMAT_SUFFIXES = ["_9x16", "_1080x1080"];

// Trustpilot-skabelonen hedder `tp_stars` i grundlisten, men `template_tp_stars_9x16` /
// `template_tp_stars_1080x1080` i formatlisten. Uden dette alias ville de vaere TO stammer, og
// skabelonen ville falde ud i tavshed, naar man valgte den ene af dem.
const ALIASES: Record<string, string> = { tp_stars: "template_tp_stars" };

const SKABELONER: Record<string, { id: string; label: string }[]> = {
  morten: mortenTemplates,
  retinol: retinolTemplates,
  testimonial: [...testimonialTemplates, ...testimonialFormatTemplates],
};

/** `morten_3_1080x1080` → `morten_3`. Ukendte id'er gives uaendret tilbage. */
export function layoutStem(id: string): string {
  let stem = String(id).trim();
  for (const suffix of FORMAT_SUFFIXES) {
    if (stem.endsWith(suffix)) {
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }
  return ALIASES[stem] ?? stem;
}

/** Kategoriens layouts i skabelonlistens egen raekkefoelge (morten 10, retinol 10, testimonial 11). */
export function layoutsForCategory(kategori: string): Layout[] {
  const set = new Set<string>();
  const ud: Layout[] = [];
  for (const tpl of SKABELONER[kategori] ?? []) {
    const stem = layoutStem(tpl.id);
    if (set.has(stem)) continue;
    set.add(stem);
    ud.push({ stem, label: tpl.label.split(" – ")[0].trim() });
  }
  return ud;
}

/**
 * Beholder kun de skabeloner, hvis stamme er valgt. Tomt/udefineret `valg` = listen UAENDRET
 * (dagens opfoersel for den, der ikke roerer noget). Ukendte navne springes over; rammer valget
 * INGEN skabeloner, kastes en fejl — man skal aldrig faa nul billeder i tavshed.
 */
export function filterByLayouts<T extends { id: string }>(liste: T[], valg?: string[] | null): T[] {
  if (!valg || valg.length === 0) return liste;
  const valgte = new Set(valg.map((v) => layoutStem(v)).filter((s) => s.length > 0));
  const ud = liste.filter((tpl) => valgte.has(layoutStem(tpl.id)));
  if (ud.length === 0) {
    throw new Error(
      `Ingen skabeloner passer til de valgte layouts (${valg.join(", ")}) — sæt flueben ved mindst ét layout, der hører til kategorien.`
    );
  }
  return ud;
}
