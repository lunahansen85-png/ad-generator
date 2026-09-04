"use client";

import { useCallback, useEffect, useState } from "react";

type Img = { id: string; templateId: string; label: string; filename: string; key: string; favorite: boolean };
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

const CATEGORIES = [
  { id: "morten", label: "Morten" },
  { id: "testimonial", label: "Testimonials" },
  { id: "retinol", label: "Retinol" },
];

// Metas anbefaling for overskriften. 40 er en ANBEFALING, ikke et klippepunkt: Thomas' egen live
// annonce med 35 tegn vises fuldt ud (verificeret 03.09.2026). Samme tal og samme formulering som
// Ad Studios taeller (web/app.js: META_OVERSKRIFT_MAX), saa de to vaerktoejer siger det samme.
const META_OVERSKRIFT_ANBEFALING = 40;

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

const FIELDS: Record<string, { key: keyof Row; label: string; rows?: number }[]> = {
  morten: [{ key: "text", label: "Tekst", rows: 3 }],
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/copy?category=${category}`, { cache: "no-store" });
      const data = await res.json();
      setRows(data.rows ?? []);
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

  async function generateOne(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/copy/${id}/generate`, { method: "POST" });
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
        await fetch(`/api/copy/${targets[i].id}/generate`, { method: "POST" });
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
        <span className="ml-auto flex gap-2">
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
            disabled={!!progress || rows.length === 0}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            {progress ? `Genererer ${progress.done}/${progress.total}…` : "Generér alle"}
          </button>
          <a
            href={`/api/export?category=${category}`}
            className="rounded border px-3 py-1.5 text-sm"
          >
            ⬇ CSV til Ad Studio
          </a>
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p>
      )}

      <p className="mb-3 text-sm opacity-60">
        {rows.length} tekster · {totalImages} billeder gemt
      </p>

      {loading ? (
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
                  disabled={busy === row.id}
                  className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  {busy === row.id ? "Genererer…" : "Generér billeder"}
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
                  {row.images
                    .filter((img) => !favoritesOnly || img.favorite)
                    .map((img) => (
                      <div key={img.id} className="relative">
                        <a
                          href={`/i/${img.key}`}
                          target="_blank"
                          rel="noreferrer"
                          title={img.filename}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/i/${img.key}`}
                            alt={img.filename}
                            className="h-20 w-20 rounded border object-cover"
                          />
                        </a>
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
    </main>
  );
}
