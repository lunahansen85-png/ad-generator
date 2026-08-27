"use client";

import { useCallback, useEffect, useState } from "react";

type Img = { id: string; templateId: string; label: string; filename: string; key: string };
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
                  {row.images.map((img) => (
                    <a
                      key={img.id}
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
