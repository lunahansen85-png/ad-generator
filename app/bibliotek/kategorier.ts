// Delt mellem tekstbiblioteket (page.tsx) og videobiblioteket (VideoLibrary.tsx).
// Ligger i sin egen fil i stedet for at blive eksporteret fra page.tsx: page.tsx importerer
// VideoLibrary, saa en import den anden vej ville give en cirkulaer import.

export const CATEGORIES = [
  { id: "morten", label: "Morten" },
  { id: "testimonial", label: "Testimonials" },
  { id: "retinol", label: "Retinol" },
];

// Metas anbefaling for overskriften. 40 er en ANBEFALING, ikke et klippepunkt: Thomas' egen live
// annonce med 35 tegn vises fuldt ud (verificeret 03.09.2026). Samme tal og samme formulering som
// Ad Studios taeller (web/app.js: META_OVERSKRIFT_MAX), saa de to vaerktoejer siger det samme.
export const META_OVERSKRIFT_ANBEFALING = 40;
