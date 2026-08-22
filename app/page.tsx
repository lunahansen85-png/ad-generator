"use client";

import { useState } from "react";
import Papa from "papaparse";

type Category = "morten" | "testimonial" | "retinol";

const CATEGORY_LABELS: Record<Category, string> = {
  morten: "Magazine ads",
  testimonial: "Testimonial ads",
  retinol: "Retinol ads",
};

type GeneratedImage = {
  id: string;
  label: string;
  filename: string;
  dataUrl: string;
};

const SOURCE_OPTIONS = [
  { value: "trustpilot", label: "Trustpilot" },
  { value: "video", label: "Video" },
  { value: "meta", label: "Meta" },
  { value: "other", label: "Other" },
];

// Column names match the fields /api/generate already expects for each
// category, so a parsed CSV row can be spread straight into the request body.
const CATEGORY_CSV: Record<
  Category,
  { columns: string[]; example: Record<string, string>; required: string[] }
> = {
  morten: {
    columns: ["text"],
    example: { text: "Skriv din hook her..." },
    required: ["text"],
  },
  testimonial: {
    columns: ["headline", "quote", "name", "source"],
    example: {
      headline: "Overskrift (valgfri)",
      quote: "Testimonial-citatet",
      name: "– Navn Navnesen",
      source: "other",
    },
    required: ["quote", "name"],
  },
  retinol: {
    columns: ["headline", "subheadline", "body"],
    example: {
      headline: "Overskrift",
      subheadline: "Underoverskrift (valgfri)",
      body: "Brødtekst (valgfri)",
    },
    required: ["headline"],
  },
};

type BulkImage = GeneratedImage & { rowIndex: number };

export default function Home() {
  const [category, setCategory] = useState<Category>("morten");
  const [text, setText] = useState("");
  const [headline, setHeadline] = useState("");
  const [quote, setQuote] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("other");
  const [rHeadline, setRHeadline] = useState("");
  const [rSubheadline, setRSubheadline] = useState("");
  const [rBody, setRBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [zipping, setZipping] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<Record<string, string>[]>([]);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkParseError, setBulkParseError] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkImages, setBulkImages] = useState<BulkImage[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkZipping, setBulkZipping] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setImages([]);

    try {
      const payload =
        category === "morten"
          ? { category, text }
          : category === "retinol"
            ? { category, headline: rHeadline, subheadline: rSubheadline, body: rBody }
            : { category, headline, quote, name, source };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate images.");
      }
      setImages(data.images);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadAll() {
    if (images.length === 0) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const img of images) {
        const base64 = img.dataUrl.split(",")[1];
        zip.file(img.filename, base64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${category}-ads.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  function downloadCsvTemplate() {
    const { columns, example } = CATEGORY_CSV[category];
    const csv = Papa.unparse({
      fields: columns,
      data: [columns.map((c) => example[c] ?? "")],
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${category}-template.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleBulkFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    setBulkParseError(null);
    setBulkRows([]);
    setBulkImages([]);
    setBulkError(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setBulkParseError(results.errors[0].message);
          return;
        }
        const { required } = CATEGORY_CSV[category];
        const badRows: number[] = [];
        results.data.forEach((row, i) => {
          const missing = required.some((col) => !row[col]?.trim());
          if (missing) badRows.push(i + 1);
        });
        if (badRows.length > 0) {
          setBulkParseError(
            `Row${badRows.length > 1 ? "s" : ""} ${badRows.join(", ")} missing a required column (${required.join(", ")}).`
          );
          return;
        }
        if (results.data.length === 0) {
          setBulkParseError("No rows found in that file.");
          return;
        }
        setBulkRows(results.data);
      },
      error: (err) => setBulkParseError(err.message),
    });
  }

  async function handleBulkGenerate() {
    setBulkGenerating(true);
    setBulkError(null);
    setBulkImages([]);
    setBulkProgress({ done: 0, total: bulkRows.length });

    const collected: BulkImage[] = [];
    try {
      for (let i = 0; i < bulkRows.length; i++) {
        const payload = { category, ...bulkRows[i] };
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(`Row ${i + 1}: ${data.error || "Failed to generate."}`);
        }
        for (const img of data.images as GeneratedImage[]) {
          collected.push({ ...img, rowIndex: i + 1 });
        }
        setBulkProgress({ done: i + 1, total: bulkRows.length });
      }
      setBulkImages(collected);
    } catch (err: any) {
      setBulkError(err.message || "Something went wrong.");
    } finally {
      setBulkGenerating(false);
    }
  }

  async function handleBulkDownloadZip() {
    if (bulkImages.length === 0) return;
    setBulkZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const img of bulkImages) {
        const base64 = img.dataUrl.split(",")[1];
        const folder = zip.folder(img.label) || zip;
        folder.file(`row${img.rowIndex}_${img.filename}`, base64, { base64: true });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${category}-bulk.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBulkZipping(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Ad Generator</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick a category, type your copy, and generate every template in one go.
        </p>

        <div className="mt-8 flex gap-2">
          {(["morten", "testimonial", "retinol"] as const).map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c);
                setImages([]);
                setError(null);
                setBulkRows([]);
                setBulkFileName(null);
                setBulkParseError(null);
                setBulkImages([]);
                setBulkError(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                category === c
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleGenerate}
          className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-zinc-200"
        >
          {category === "morten" ? (
            <div>
              <label className="block text-sm font-medium text-zinc-700">Hook / text</label>
              <textarea
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Skriv din hook her..."
                className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-zinc-400">
                Generates all 10 Magazine ads templates with this text.
              </p>
            </div>
          ) : category === "retinol" ? (
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">Headline</label>
                <input
                  required
                  value={rHeadline}
                  onChange={(e) => setRHeadline(e.target.value)}
                  placeholder="Overskrift"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Subheadline
                </label>
                <input
                  value={rSubheadline}
                  onChange={(e) => setRSubheadline(e.target.value)}
                  placeholder="Underoverskrift (valgfri, bruges kun på nogle templates)"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Body text</label>
                <textarea
                  value={rBody}
                  onChange={(e) => setRBody(e.target.value)}
                  rows={4}
                  placeholder="Brødtekst (valgfri, bruges kun på nogle templates)"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <p className="text-xs text-zinc-400">
                Not every Retinol template uses all three fields — headline-only templates
                will just ignore the subheadline and body text.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Headline
                </label>
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Overskrift (bruges kun på de templates der har en overskrift)"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Quote</label>
                <textarea
                  required
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  rows={3}
                  placeholder="Testimonial-citatet"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Name</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="– Navn Navnesen"
                    className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Source</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  >
                    {SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-zinc-400">
                The Trustpilot-stars template is only generated when source is set to
                Trustpilot.
              </p>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate images"}
          </button>
        </form>

        <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-zinc-200">
          <button
            onClick={() => setBulkOpen(!bulkOpen)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <h2 className="text-sm font-medium text-zinc-900">Bulk generate from CSV</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Generate images for many rows of copy at once.
              </p>
            </div>
            <span className="text-zinc-400">{bulkOpen ? "–" : "+"}</span>
          </button>

          {bulkOpen && (
            <div className="mt-5 border-t border-zinc-100 pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={downloadCsvTemplate}
                  className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-100"
                >
                  Download CSV template
                </button>
                <span className="text-xs text-zinc-400">
                  Columns: {CATEGORY_CSV[category].columns.join(", ")}
                </span>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-zinc-700">
                  Upload filled-out CSV
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleBulkFileChange}
                  className="mt-1.5 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700"
                />
                {bulkFileName && !bulkParseError && bulkRows.length > 0 && (
                  <p className="mt-1.5 text-xs text-zinc-400">
                    {bulkFileName} — {bulkRows.length} row{bulkRows.length !== 1 ? "s" : ""} ready.
                  </p>
                )}
                {bulkParseError && (
                  <p className="mt-1.5 text-xs text-red-600">{bulkParseError}</p>
                )}
              </div>

              {bulkError && <p className="mt-3 text-sm text-red-600">{bulkError}</p>}

              <button
                onClick={handleBulkGenerate}
                disabled={bulkRows.length === 0 || bulkGenerating}
                className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                {bulkGenerating
                  ? `Generating... row ${bulkProgress.done} of ${bulkProgress.total}`
                  : "Generate from CSV"}
              </button>

              {bulkImages.length > 0 && (
                <div className="mt-4 flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
                  <span className="text-sm text-zinc-700">
                    {bulkImages.length} images generated from {bulkRows.length} row
                    {bulkRows.length !== 1 ? "s" : ""}.
                  </span>
                  <button
                    onClick={handleBulkDownloadZip}
                    disabled={bulkZipping}
                    className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {bulkZipping ? "Zipping..." : "Download all (.zip)"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {images.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-700">
                {images.length} image{images.length !== 1 ? "s" : ""} generated
              </h2>
              <button
                onClick={handleDownloadAll}
                disabled={zipping}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-100 disabled:opacity-50"
              >
                {zipping ? "Zipping..." : "Download all (.zip)"}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.label}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-2 p-2">
                    <span className="truncate text-xs text-zinc-600">{img.label}</span>
                    <a
                      href={img.dataUrl}
                      download={img.filename}
                      className="shrink-0 text-xs font-medium text-zinc-900 underline"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
