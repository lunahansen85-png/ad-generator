/**
 * Landingsside pr. kategori (24.09.2026): den side, kategoriens annoncer er lavet til.
 * Kun http(s) gemmes — Ad Push saetter vaerdien direkte som annoncens link, saa en halv
 * adresse maa aldrig naa databasen. Tom vaerdi er tilladt og betyder "ingen standard".
 *
 * Ingen server-imports her: bruges af baade API-ruten og browseren.
 */

export type LandingUrlResultat = { ok: true; url: string } | { ok: false; fejl: string };

const MAX = 2000;

/**
 * Tjekker og normaliserer en indtastet landingsside.
 * "kjeldgaards.com/morten" → "https://kjeldgaards.com/morten" (samme haandsraekning som Ad Studios
 * link-felt giver). Alt andet end http/https afvises med en dansk besked.
 */
export function normaliserLandingUrl(raw: unknown): LandingUrlResultat {
  if (typeof raw !== "string") return { ok: false, fejl: "Landingssiden skal være tekst." };
  const tekst = raw.trim();
  if (!tekst) return { ok: true, url: "" };
  if (tekst.length > MAX) return { ok: false, fejl: `Landingssiden må højst være ${MAX} tegn.` };
  if (/\s/.test(tekst)) return { ok: false, fejl: "Landingssiden må ikke indeholde mellemrum." };

  const medProtokol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(tekst) ? tekst : `https://${tekst}`;

  let url: URL;
  try {
    url = new URL(medProtokol);
  } catch {
    return { ok: false, fejl: "Det ligner ikke en adresse. Skriv fx https://kjeldgaards.com/morten/" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, fejl: "Landingssiden skal starte med http:// eller https://" };
  }
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) {
    return { ok: false, fejl: "Skriv hele domænet, fx https://kjeldgaards.com/morten/" };
  }
  return { ok: true, url: url.toString() };
}
