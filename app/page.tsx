"use client";

import { useState } from "react";

type Category = "morten" | "testimonial";

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

export default function Home() {
  const [category, setCategory] = useState<Category>("morten");
  const [text, setText] = useState("");
  const [headline, setHeadline] = useState("");
  const [quote, setQuote] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("other");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [zipping, setZipping] = useState(false);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setImages([]);

    try {
      const payload =
        category === "morten"
          ? { category, text }
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

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Ad Generator</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick a category, type your copy, and generate every template in one go.
        </p>

        <div className="mt-8 flex gap-2">
          {(["morten", "testimonial"] as const).map((c) => (
            <button
              key={c}
              onClick={() => {
                setCategory(c);
                setImages([]);
                setError(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                category === c
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100"
              }`}
            >
              {c === "morten" ? "Morten" : "Testimonial"}
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
                Generates all 10 Morten templates with this text.
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
