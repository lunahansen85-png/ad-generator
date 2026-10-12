"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORIES, META_OVERSKRIFT_ANBEFALING } from "./kategorier";
import VideoLibrary from "./VideoLibrary";

// Fanen "Videoer" viser videobiblioteket (VideoLibrary.tsx) i stedet for tekstraekkerne.
const VIDEOER = "videoer";

type Img = { id: string; templateId: string; label: string; filename: string; key: string; favorite: boolean };
// Ét layout = én stamme, fx morten_3 → BAADE 1:1 og 9:16 (Ad Push springer et 1:1 uden sin
// 9:16-soester over). Hentes fra /api/layouts, fordi denne side er "use client" og ikke kan
// importere skabelonerne.
type Layout = { stem: string; label: string };
const LAYOUT_NOEGLE = "adgen.layouts.v1";
type Row = {
  id: string;
  category: string;
  headline: string;
  quote: string;
  name: string;
  source: string;
  text: string;
  subheadline: string;
  body: string;
  metaPrimaryText: string;
  metaHeadline: string;
  note: string;
  archived: boolean;
  updatedAt: string;
  images: Img[];
};

/**
 * Meta-annoncetekst for én tekstraekke: den tekst der staar i SELVE annoncen paa Facebook/Instagram
 * — ikke paa billedet. Faelles for alle raekkens layouts, og hentes af Ad Studio sammen med billederne.
 * Gemmer paa onBlur som resten af siden; overskriften har en live taeller, saa den har egen state.
 */
function MetaTekst({ row, save }: { row: Row; save: (id: string, field: string, value: string) => void }) {
  const [headline, setHeadline] = useState(row.metaHeadline ?? "");
  const lang = headline.length > META_OVERSKRIFT_ANBEFALING;
  return (
    <div className="mt-3 rounded-lg border border-dashed p-3">
      <p className="mb-2 text-sm font-medium">
        Meta-annoncetekst
        <span className="ml-2 font-normal opacity-60">
          står i annoncen, ikke på billedet — bruges af alle denne teksts layouts
        </span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block opacity-70">Primærtekst</span>
          <textarea
            defaultValue={row.metaPrimaryText ?? ""}
            rows={3}
            onBlur={(e) => save(row.id, "metaPrimaryText", e.target.value)}
            className="w-full rounded border bg-transparent p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block opacity-70">Overskrift</span>
          <textarea
            value={headline}
            rows={3}
            onChange={(e) => setHeadline(e.target.value)}
            onBlur={(e) => save(row.id, "metaHeadline", e.target.value)}
            className="w-full rounded border bg-transparent p-2"
          />
          <span
            className={`mt-1 block text-xs ${lang ? "text-amber-700" : "opacity-60"}`}
            title="Metas anbefaling: 40 tegn (Facebook-feed 27) — en anbefaling, ikke et klippepunkt"
          >
            {headline.length} tegn{lang ? ` — over Metas anbefaling (${META_OVERSKRIFT_ANBEFALING})` : ""}
          </span>
        </label>
      </div>
    </div>
  );
}

/**
 * Landingsside (standard) for den valgte kategori (24.09.2026): den side, kategoriens annoncer er
 * lavet til. Gemmes med det samme (PUT /api/categories) som resten af biblioteket, og laeses af
 * Ad Push sammen med teksterne — saa adressen kun staar ét sted. Tomt felt = ingen standard.
 */
function Landingsside({
  category,
  label,
  value,
  onSaved,
}: {
  category: string;
  label: string;
  value: string;
  onSaved: (url: string) => void;
}) {
  // Kaldes med key={category} af siden, saa et kategori-skift giver et nyt felt med den nye
  // kategoris adresse — i stedet for en useEffect, der skriver state om efter hver render.
  const [tekst, setTekst] = useState(value);
  const [fejl, setFejl] = useState<string | null>(null);
  const [gemt, setGemt] = useState(false);

  async function gem() {
    if (tekst.trim() === value) return;
    try {
      const res = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, landingUrl: tekst }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGemt(false);
        setFejl(data.error ?? "Kunne ikke gemme landingssiden.");
        return;
      }
      setFejl(null);
      setTekst(data.landingUrl ?? "");
      setGemt(true);
      onSaved(data.landingUrl ?? "");
    } catch {
      setGemt(false);
      setFejl("Kunne ikke gemme landingssiden — prøv igen.");
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-dashed p-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">
          Landingsside (standard)
          <span className="ml-2 font-normal opacity-60">
            siden som {label}-annoncerne er lavet til — Ad Push bruger den som annoncens link
          </span>
        </span>
        <input
          type="url"
          value={tekst}
          onChange={(e) => {
            setTekst(e.target.value);
            setGemt(false);
          }}
          onBlur={gem}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="https://kjeldgaards.com/… (tom = ingen standard)"
          className="w-full rounded border bg-transparent p-2"
        />
      </label>
      {fejl ? (
        <p className="mt-1 text-xs text-red-600">{fejl}</p>
      ) : gemt ? (
        <p className="mt-1 text-xs opacity-60">Gemt.</p>
      ) : null}
    </div>
  );
}

/**
 * Layout-vaelger (12.10.2026). Thomas: "vi skal IKKE lave 60 billeder naar der skal bruges LANGT
 * FAERRE". Fluebenene afgoer hvilke layouts "Generér billeder" laver — standard er alle valgt, saa
 * siden opfoerer sig som hidtil for den, der ikke roerer noget. Ét flueben = 1:1 + 9:16, fordi
 * Ad Push springer et layout uden 9:16-soester over.
 */
function LayoutVaelger({
  layouts,
  valgt,
  onValgt,
  thumbs,
}: {
  layouts: Layout[];
  valgt: string[];
  onValgt: (stems: string[]) => void;
  thumbs: Record<string, string>;
}) {
  const alle = layouts.map((l) => l.stem);
  const skift = (stem: string) =>
    onValgt(
      valgt.includes(stem)
        ? valgt.filter((s) => s !== stem)
        : alle.filter((s) => s === stem || valgt.includes(s))
    );

  return (
    <div className="mb-4 rounded-lg border border-dashed p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          Layouts der skal laves
          <span className="ml-2 font-normal opacity-60">
            {valgt.length} af {layouts.length} valgt — hvert flueben giver både 1:1 og 9:16
          </span>
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={() => onValgt(alle)} className="rounded border px-3 py-1 text-sm">
            Vælg alle
          </button>
          <button type="button" onClick={() => onValgt([])} className="rounded border px-3 py-1 text-sm">
            Ryd
          </button>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {layouts.map((l) => {
          const paa = valgt.includes(l.stem);
          return (
            <label
              key={l.stem}
              title={l.label}
              className={`flex w-28 cursor-pointer flex-col items-center gap-1 rounded border p-2 text-xs ${
                paa ? "border-foreground" : "opacity-50"
              }`}
            >
              <span className="flex w-full items-center gap-1">
                <input type="checkbox" checked={paa} onChange={() => skift(l.stem)} />
                <span className="truncate">{l.label}</span>
              </span>
              {thumbs[l.stem] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={`/i/${thumbs[l.stem]}`} alt={l.label} className="h-20 w-20 rounded object-cover" />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded border border-dashed p-1 text-center opacity-60">
                  intet billede endnu
                </span>
              )}
            </label>
          );
        })}
      </div>
      {valgt.length === 0 && (
        <p className="mt-2 text-xs text-amber-700">
          Intet layout valgt — sæt flueben ved mindst ét, før du genererer.
        </p>
      )}
    </div>
  );
}

/**
 * Stor visning af ét billede. Klik på en thumbnail åbner den; ← → bladrer mellem de viste billeder
 * i samme tekstraekke; Esc, ✕ eller klik uden for billedet lukker. Erstatter det tidligere
 * target="_blank"-link (10.09.2026, Thomas: billedet må ikke åbne i en ny fane).
 */
function Lightbox({
  items,
  idx,
  onIdx,
  onClose,
}: {
  items: Img[];
  idx: number;
  onIdx: (i: number) => void;
  onClose: () => void;
}) {
  const n = items.length;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onIdx((idx + 1) % n);
      else if (e.key === "ArrowLeft") onIdx((idx - 1 + n) % n);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, n, onIdx, onClose]);

  const img = items[idx];
  if (!img) return null;
  const nav = "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-4 py-2 text-3xl text-white hover:bg-black/70";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={img.filename}
    >
      <figure className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/i/${img.key}`}
          alt={img.filename}
          className="max-h-[85vh] max-w-full rounded object-contain"
        />
        <figcaption className="mt-2 text-sm text-white/80">
          {img.filename} ({idx + 1} af {n})
        </figcaption>
      </figure>
      {n > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); onIdx((idx - 1 + n) % n); }} className={`${nav} left-3`} title="Forrige (←)">
            ‹
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onIdx((idx + 1) % n); }} className={`${nav} right-3`} title="Næste (→)">
            ›
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 rounded-full bg-black/50 px-3 py-1 text-2xl text-white hover:bg-black/70"
        title="Luk (Esc)"
      >
        ✕
      </button>
    </div>
  );
}

const FIELDS: Record<string, { key: keyof Row; label: string; rows?: number }[]> = {
  morten: [{ key: "text", label: "Billedtekst", rows: 3 }],
  testimonial: [
    { key: "headline", label: "Overskrift" },
    { key: "quote", label: "Citat", rows: 3 },
    { key: "name", label: "Navn" },
  ],
  retinol: [
    { key: "headline", label: "Overskrift" },
    { key: "subheadline", label: "Underoverskrift" },
    { key: "body", label: "Brødtekst", rows: 3 },
  ],
};

export default function Bibliotek() {
  const [category, setCategory] = useState("morten");
  const [rows, setRows] = useState<Row[]>([]);
  // Landingsside pr. kategori — kommer med i svaret fra /api/copy, saa der ikke skal hentes to gange.
  const [landingUrls, setLandingUrls] = useState<Record<string, string>>({});
  // Layouts pr. kategori (/api/layouts) + hvilke der er sat flueben ved. Valget gemmes i browseren
  // pr. kategori, saa det staar der naeste gang; standard = alle valgt.
  const [layouts, setLayouts] = useState<Record<string, Layout[]>>({});
  const [valgte, setValgte] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Aabent billede i stor visning: hvilken raekke og hvilket af raekkens VISTE billeder.
  const [lb, setLb] = useState<{ rowId: string; idx: number } | null>(null);
  const visibleImages = useCallback(
    (row: Row) => row.images.filter((img) => !favoritesOnly || img.favorite),
    [favoritesOnly]
  );
  const lbRow = lb ? rows.find((r) => r.id === lb.rowId) : undefined;
  const lbItems = lbRow ? visibleImages(lbRow) : [];
  const closeLb = useCallback(() => setLb(null), []);
  const setLbIdx = useCallback((i: number) => setLb((cur) => (cur ? { ...cur, idx: i } : cur)), []);

  const load = useCallback(async () => {
    if (category === VIDEOER) return; // videofanen henter selv (VideoLibrary)
    setLoading(true);
    try {
      const res = await fetch(`/api/copy?category=${category}`, { cache: "no-store" });
      const data = await res.json();
      setRows(data.rows ?? []);
      setLandingUrls(data.landingUrls ?? {});
      setError(null);
    } catch {
      setError("Kunne ikke hente teksterne.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const res = await fetch("/api/layouts", { cache: "no-store" });
        const data = await res.json();
        const alle: Record<string, Layout[]> = data.layouts ?? {};
        if (!aktiv) return;
        let gemt: Record<string, string[]> = {};
        try {
          gemt = JSON.parse(localStorage.getItem(LAYOUT_NOEGLE) ?? "{}") ?? {};
        } catch {
          gemt = {};
        }
        const start: Record<string, string[]> = {};
        for (const [kat, liste] of Object.entries(alle)) {
          const kendte = liste.map((l) => l.stem);
          const raa = gemt[kat];
          if (!Array.isArray(raa)) {
            start[kat] = kendte; // intet gemt valg = alle, som hidtil
            continue;
          }
          const kendt = raa.filter((stem) => kendte.includes(stem));
          // Et gemt valg, hvor INTET navn findes mere (omdoebte skabeloner), falder tilbage til alle
          // — i stedet for at efterlade kategorien med nul valgte uden grund.
          start[kat] = raa.length > 0 && kendt.length === 0 ? kendte : kendt;
        }
        setLayouts(alle);
        setValgte(start);
      } catch {
        // Uden listen vises vaelgeren ikke, og generering koerer praecis som foer 12.10.2026.
      }
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  const saetValgte = useCallback((kat: string, stems: string[]) => {
    setValgte((cur) => {
      const naeste = { ...cur, [kat]: stems };
      try {
        localStorage.setItem(LAYOUT_NOEGLE, JSON.stringify(naeste));
      } catch {
        // privat vindue / blokeret lager: valget gaelder stadig denne gang
      }
      return naeste;
    });
  }, []);

  async function addRow() {
    await fetch("/api/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    load();
  }

  async function save(id: string, field: string, value: string) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
    await fetch(`/api/copy/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function remove(id: string) {
    if (!confirm("Slet denne tekst og dens billeder?")) return;
    await fetch(`/api/copy/${id}`, { method: "DELETE" });
    load();
  }

  async function toggleFavorite(imgId: string) {
    setRows((r) =>
      r.map((row) => ({
        ...row,
        images: row.images.map((img) =>
          img.id === imgId ? { ...img, favorite: !img.favorite } : img
        ),
      }))
    );
    await fetch(`/api/image/${imgId}/favorite`, { method: "POST" });
  }

  const kategoriLayouts = layouts[category] ?? [];
  const valgtNu = valgte[category] ?? [];
  // Uden listen fra /api/layouts vises vaelgeren ikke, og kaldene sendes uden `layouts` = alle.
  const vaelgerKlar = kategoriLayouts.length > 0;
  const ingenValgt = vaelgerKlar && valgtNu.length === 0;
  const layoutKrop = vaelgerKlar ? { layouts: valgtNu } : {};
  const knapTekst = vaelgerKlar
    ? ` (${valgtNu.length} af ${kategoriLayouts.length} layouts)`
    : "";

  // Thumbnail pr. layout: foerste billede med samme stamme blandt de raekker siden ALLEREDE har
  // hentet — intet ekstra kald. Stammen findes ved at matche skabelon-id'et mod listen fra
  // /api/layouts (laengste stamme foerst), saa reglen kun staar ét sted (lib/layouts.ts).
  // Et kvadratisk billede foretraekkes i den kvadratiske ramme.
  const thumbs = useMemo(() => {
    const stems = (layouts[category] ?? []).map((l) => l.stem).sort((a, b) => b.length - a.length);
    const ud: Record<string, string> = {};
    const kvadrat: Record<string, boolean> = {};
    for (const row of rows) {
      for (const img of row.images) {
        // Samme alias som lib/layouts.ts: grundskabelonen hedder `tp_stars`, stammen
        // `template_tp_stars`. Gaelder KUN hvilket thumbnail der vises — hvad der GENERERES,
        // afgoeres altid af lib/layouts.ts.
        const id = img.templateId === "tp_stars" ? "template_tp_stars" : img.templateId;
        const stem = stems.find((x) => id === x || id.startsWith(`${x}_`));
        if (!stem) continue;
        const er1x1 = img.templateId.endsWith("_1080x1080");
        if (!ud[stem] || (er1x1 && !kvadrat[stem])) {
          ud[stem] = img.key;
          kvadrat[stem] = er1x1;
        }
      }
    }
    return ud;
  }, [rows, layouts, category]);

  async function generateOne(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/copy/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layoutKrop),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generering fejlede.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generering fejlede.");
    } finally {
      setBusy(null);
    }
  }

  // Portionsvis, saa lange koersler ikke rammer en timeout — og saa man kan foelge med.
  async function generateAll() {
    const targets = rows.filter((r) => !r.archived);
    setProgress({ done: 0, total: targets.length });
    setError(null);
    for (let i = 0; i < targets.length; i++) {
      try {
        await fetch(`/api/copy/${targets[i].id}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(layoutKrop),
        });
      } catch {
        setError("En raekke fejlede — resten fortsatte.");
      }
      setProgress({ done: i + 1, total: targets.length });
    }
    await load();
    setProgress(null);
  }

  const totalImages = rows.reduce((n, r) => n + r.images.length, 0);

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tekstbibliotek</h1>
          <p className="text-sm opacity-70">
            Fælles for Thomas og Luna. Rettelser gemmes med det samme og gælder for begge.
          </p>
        </div>
        <a href="/" className="text-sm underline opacity-80">
          → Enkelt-generatoren
        </a>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              category === c.id ? "bg-foreground text-background" : "opacity-70"
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => setCategory(VIDEOER)}
          className={`rounded-full border px-4 py-1.5 text-sm ${
            category === VIDEOER ? "bg-foreground text-background" : "opacity-70"
          }`}
        >
          Videoer
        </button>
        <span className={`ml-auto flex gap-2 ${category === VIDEOER ? "hidden" : ""}`}>
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`rounded border px-3 py-1.5 text-sm ${favoritesOnly ? "bg-amber-100 border-amber-400 text-amber-800" : "opacity-70"}`}
          >
            ⭐ {favoritesOnly ? "Alle billeder" : "Kun favoritter"}
          </button>
          <button onClick={addRow} className="rounded border px-3 py-1.5 text-sm">
            + Ny tekst
          </button>
          <button
            onClick={generateAll}
            disabled={!!progress || rows.length === 0 || ingenValgt}
            title={ingenValgt ? "Sæt flueben ved mindst ét layout" : undefined}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {progress ? `Genererer ${progress.done}/${progress.total}…` : `Generér alle${knapTekst}`}
          </button>
          <a
            href={`/api/export?category=${category}`}
            className="rounded border px-3 py-1.5 text-sm"
          >
            ⬇ CSV til Ad Studio
          </a>
        </span>
      </div>

      {category !== VIDEOER && !loading && (
        <Landingsside
          key={category}
          category={category}
          label={CATEGORIES.find((c) => c.id === category)?.label ?? category}
          value={landingUrls[category] ?? ""}
          onSaved={(url) => setLandingUrls((m) => ({ ...m, [category]: url }))}
        />
      )}

      {category !== VIDEOER && !loading && vaelgerKlar && (
        <LayoutVaelger
          layouts={kategoriLayouts}
          valgt={valgtNu}
          onValgt={(stems) => saetValgte(category, stems)}
          thumbs={thumbs}
        />
      )}

      {error && category !== VIDEOER && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p>
      )}

      {category !== VIDEOER && (
        <p className="mb-3 text-sm opacity-60">
          {rows.length} tekster · {totalImages} billeder gemt
        </p>
      )}

      {category === VIDEOER ? (
        <VideoLibrary />
      ) : loading ? (
        <p className="opacity-60">Henter…</p>
      ) : rows.length === 0 ? (
        <p className="opacity-60">Ingen tekster endnu. Tryk “+ Ny tekst”.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border p-4">
              {row.note && (
                <span className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-800">
                  {row.note}
                </span>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS[row.category]?.map((f) => (
                  <label key={String(f.key)} className="block text-sm">
                    <span className="mb-1 block opacity-70">{f.label}</span>
                    <textarea
                      defaultValue={String(row[f.key] ?? "")}
                      rows={f.rows ?? 1}
                      onBlur={(e) => save(row.id, String(f.key), e.target.value)}
                      className="w-full rounded border bg-transparent p-2"
                    />
                  </label>
                ))}
                {row.category === "testimonial" && (
                  <label className="block text-sm">
                    <span className="mb-1 block opacity-70">Kilde</span>
                    <select
                      defaultValue={row.source}
                      onChange={(e) => save(row.id, "source", e.target.value)}
                      className="w-full rounded border bg-transparent p-2"
                    >
                      <option value="other">Andet</option>
                      <option value="trustpilot">Trustpilot</option>
                    </select>
                  </label>
                )}
              </div>

              <MetaTekst row={row} save={save} />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => generateOne(row.id)}
                  disabled={busy === row.id || ingenValgt}
                  title={ingenValgt ? "Sæt flueben ved mindst ét layout" : undefined}
                  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {busy === row.id ? "Genererer…" : `Generér billeder${knapTekst}`}
                </button>
                <span className="text-sm opacity-60">{row.images.length} billeder</span>
                <button
                  onClick={() => remove(row.id)}
                  className="ml-auto rounded border px-3 py-1.5 text-sm opacity-70"
                >
                  Slet
                </button>
              </div>

              {row.images.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {visibleImages(row).map((img, i) => (
                      <div key={img.id} className="relative">
                        <button
                          type="button"
                          onClick={() => setLb({ rowId: row.id, idx: i })}
                          title={img.filename}
                          className="block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/i/${img.key}`}
                            alt={img.filename}
                            className="h-20 w-20 rounded border object-cover"
                          />
                        </button>
                        <button
                          onClick={() => toggleFavorite(img.id)}
                          title={img.favorite ? "Fjern favorit" : "Markér som favorit"}
                          className="absolute top-0.5 right-0.5 text-base leading-none"
                          style={{ textShadow: "0 0 3px rgba(0,0,0,0.6)" }}
                        >
                          {img.favorite ? "⭐" : "☆"}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {lb && lbItems.length > 0 && (
        <Lightbox
          items={lbItems}
          idx={Math.min(lb.idx, lbItems.length - 1)}
          onIdx={setLbIdx}
          onClose={closeLb}
        />
      )}
    </main>
  );
}
