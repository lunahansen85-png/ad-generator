"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoGroupJson } from "@/lib/video-json";
import { prettyCategory, slugifyCategory, VIDEO_MAX_BYTES } from "@/lib/video";
import { suggestVideoNames } from "@/lib/video-names";
import { CATEGORIES, META_OVERSKRIFT_ANBEFALING } from "./kategorier";
import {
  postJson,
  readVideo,
  uploadThumb,
  uploadVideoFile,
  videoContentType,
  type VideoInfo,
} from "./video-upload";

/**
 * Videobiblioteket (fanen "Videoer" i /bibliotek): færdige videoannoncer, ingen redigering af selve
 * videoen. Én video = én gruppe med en eller flere varianter (fx hooks). Meta henter videoen fra
 * den offentlige /v/-URL; Ad Push læser biblioteket via GET /api/videos.
 */

type Group = VideoGroupJson;
type Video = Group["videos"][number];
type Valg = { id: string; label: string };

function fmtVarighed(s: number | null) {
  if (!s || !Number.isFinite(s)) return "";
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sek = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sek}` : `${m}:${sek}`;
}

// Decimale enheder, som Finder viser dem.
function fmtStoerrelse(bytes: number | null) {
  if (!bytes) return "";
  const gb = bytes >= 1e9;
  const n = gb ? bytes / 1e9 : bytes / 1e6;
  return `${n.toLocaleString("da-DK", { maximumFractionDigits: 1 })} ${gb ? "GB" : "MB"}`;
}

const antal = (n: number, ental: string, flertal: string) => `${n} ${n === 1 ? ental : flertal}`;

const NY = "__ny__";

/**
 * Kategori: bibliotekets faste kategorier + dem, videoerne allerede bruger, + "Ny kategori…".
 * En ny kategori gemmes som slug (id); den indtastede tekst vises som navn.
 */
function KategoriVaelger({
  value,
  valg,
  onChange,
}: {
  value: string;
  valg: Valg[];
  onChange: (id: string, label: string) => void;
}) {
  const [ny, setNy] = useState(false);
  const [tekst, setTekst] = useState("");
  const slug = slugifyCategory(tekst);

  function gem() {
    if (!slug) return;
    onChange(slug, tekst.trim());
    setNy(false);
    setTekst("");
  }

  if (ny) {
    return (
      <span className="flex gap-2">
        <input
          autoFocus
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") gem();
            if (e.key === "Escape") setNy(false);
          }}
          placeholder="Navn på den nye kategori"
          className="min-w-0 flex-1 rounded border bg-transparent p-2"
        />
        <button type="button" onClick={gem} disabled={!slug} className="rounded border px-3 text-sm disabled:opacity-40">
          OK
        </button>
        <button type="button" onClick={() => setNy(false)} className="rounded border px-3 text-sm opacity-70">
          Fortryd
        </button>
      </span>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === NY) setNy(true);
        else onChange(e.target.value, valg.find((v) => v.id === e.target.value)?.label ?? e.target.value);
      }}
      className="w-full rounded border bg-transparent p-2"
    >
      {value === "" && (
        <option value="" disabled>
          Vælg kategori…
        </option>
      )}
      {valg.map((v) => (
        <option key={v.id} value={v.id}>
          {v.label}
        </option>
      ))}
      <option value={NY}>Ny kategori…</option>
    </select>
  );
}

/** Overskrift med tæller — samme anbefaling og ordlyd som tekstbibliotekets Meta-annoncetekst. */
function Overskrift({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: (v: string) => void;
}) {
  const lang = value.length > META_OVERSKRIFT_ANBEFALING;
  return (
    <label className="block text-sm">
      <span className="mb-1 block opacity-70">Overskrift</span>
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur?.(e.target.value)}
        className="w-full rounded border bg-transparent p-2"
      />
      <span
        className={`mt-1 block text-xs ${lang ? "text-amber-700" : "opacity-60"}`}
        title={`Metas anbefaling: ${META_OVERSKRIFT_ANBEFALING} tegn (Facebook-feed 27) — en anbefaling, ikke et klippepunkt`}
      >
        {value.length} tegn{lang ? ` — over Metas anbefaling (${META_OVERSKRIFT_ANBEFALING})` : ""}
      </span>
    </label>
  );
}

/** Meta-annoncetekst på et gemt videokort. Gemmes på onBlur som resten af biblioteket. */
function MetaTekstVideo({ group, save }: { group: Group; save: (patch: Partial<Group>) => void }) {
  const [headline, setHeadline] = useState(group.metaHeadline);
  return (
    <div className="mt-3 rounded-lg border border-dashed p-3">
      <p className="mb-2 text-sm font-medium">
        Meta-annoncetekst
        <span className="ml-2 font-normal opacity-60">står i annoncen — gælder alle videoens varianter</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block opacity-70">Primærtekst</span>
          <textarea
            defaultValue={group.metaPrimaryText}
            rows={3}
            onBlur={(e) => e.target.value !== group.metaPrimaryText && save({ metaPrimaryText: e.target.value })}
            className="w-full rounded border bg-transparent p-2"
          />
        </label>
        <Overskrift
          value={headline}
          onChange={setHeadline}
          onBlur={(v) => v !== group.metaHeadline && save({ metaHeadline: v })}
        />
      </div>
    </div>
  );
}

/** Stor visning: afspiller varianten fra den offentlige /v/-URL. Esc, ✕ eller klik udenfor lukker. */
function VideoLightbox({
  group,
  idx,
  onIdx,
  onClose,
}: {
  group: Group;
  idx: number;
  onIdx: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const n = group.videos.length;
  const v = group.videos[idx];
  if (!v) return null;
  const nav = "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-4 py-2 text-3xl text-white hover:bg-black/70";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${group.name} – ${v.variant}`}
    >
      <figure className="flex max-h-full max-w-full flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <video
          key={v.id}
          src={`/v/${v.key}`}
          poster={v.thumbKey ? `/i/${v.thumbKey}` : undefined}
          controls
          autoPlay
          playsInline
          className="max-h-[85vh] max-w-full rounded bg-black"
        />
        <figcaption className="mt-2 text-sm text-white/80">
          {group.name} – {v.variant} ({idx + 1} af {n})
        </figcaption>
      </figure>
      {n > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); onIdx((idx - 1 + n) % n); }} className={`${nav} left-3`} title="Forrige variant">
            ‹
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onIdx((idx + 1) % n); }} className={`${nav} right-3`} title="Næste variant">
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

type Fil = {
  id: string;
  file: File;
  contentType: string;
  variant: string;
  variantRettet: boolean;
  status: "læser" | "klar" | "fejl" | "uploader" | "færdig";
  info?: VideoInfo;
  preview?: string;
  fejl?: string;
  sendt: number;
  // Sat når filen + thumbnail ligger i bucketen — et nyt forsøg springer den så over.
  resultat?: { groupId: string; assetId: string; key: string; thumbKey: string };
};

const naturligt = (a: string, b: string) => a.localeCompare(b, "da", { numeric: true });

/**
 * "Tilføj video": vælg/træk flere filer ind på én gang = ÉN video med flere varianter.
 * Navn og varianter foreslås ud fra filnavnene (lib/video-names.ts) og kan rettes før upload.
 */
function TilfoejVideo({
  valg,
  onNyKategori,
  onGemt,
  onLuk,
}: {
  valg: Valg[];
  onNyKategori: (id: string, label: string) => void;
  onGemt: (g: Group) => void;
  onLuk: () => void;
}) {
  const [filer, setFiler] = useState<Fil[]>([]);
  const [navn, setNavn] = useState("");
  const [navnRettet, setNavnRettet] = useState(false);
  const [kategori, setKategori] = useState("");
  const [primaer, setPrimaer] = useState("");
  const [overskrift, setOverskrift] = useState("");
  const [travl, setTravl] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);
  const [traekOver, setTraekOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Advar mod at lukke fanen midt i en upload.
  useEffect(() => {
    if (!travl) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [travl]);

  const opdater = (id: string, patch: Partial<Fil>) =>
    setFiler((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  function tilfoej(liste: FileList | File[]) {
    const nye = Array.from(liste);
    const afvist = nye.filter((f) => !videoContentType(f)).map((f) => f.name);
    const forStore = nye.filter((f) => videoContentType(f) && f.size > VIDEO_MAX_BYTES).map((f) => f.name);
    const ok = nye.filter((f) => videoContentType(f) && f.size <= VIDEO_MAX_BYTES && f.size > 0);
    const beskeder = [];
    if (afvist.length) beskeder.push(`Kun MP4- og MOV-filer: ${afvist.join(", ")}`);
    if (forStore.length) beskeder.push(`Større end 4 GB: ${forStore.join(", ")}`);
    setFejl(beskeder.length ? beskeder.join(" · ") : null);
    if (!ok.length) return;

    const tilLaesning: Fil[] = ok.map((file) => ({
      id: crypto.randomUUID(),
      file,
      contentType: videoContentType(file)!,
      variant: "",
      variantRettet: false,
      status: "læser",
      sendt: 0,
    }));
    // Forslag ud fra ALLE valgte filer; det brugeren selv har rettet, røres ikke.
    const sorter = (fs: Fil[]) => [...fs, ...tilLaesning].sort((a, b) => naturligt(a.file.name, b.file.name));
    setFiler((fs) => {
      const alle = sorter(fs);
      const forslag = suggestVideoNames(alle.map((f) => f.file.name));
      return alle.map((f, i) => (f.variantRettet ? f : { ...f, variant: forslag.variants[i] }));
    });
    if (!navnRettet) setNavn(suggestVideoNames(sorter(filer).map((f) => f.file.name)).name);
    laes(tilLaesning);
  }

  // Én video ad gangen: browseren afkoder dem, og det er tungt for store filer.
  async function laes(liste: Fil[]) {
    for (const f of liste) {
      try {
        const info = await readVideo(f.file);
        opdater(f.id, { info, preview: URL.createObjectURL(info.thumb), status: "klar" });
      } catch (e) {
        opdater(f.id, { status: "fejl", fejl: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  function fjern(f: Fil) {
    if (f.preview) URL.revokeObjectURL(f.preview);
    setFiler((fs) => fs.filter((x) => x.id !== f.id));
  }

  function ryd() {
    for (const f of filer) if (f.preview) URL.revokeObjectURL(f.preview);
  }

  const varianter = filer.map((f) => f.variant.trim());
  const dubletter = varianter.some((v, i) => v && varianter.indexOf(v) !== i);
  const mangler = !navn.trim()
    ? "Skriv videoens navn."
    : !kategori
      ? "Vælg en kategori."
      : filer.length === 0
        ? "Vælg mindst én videofil."
        : filer.some((f) => f.status === "læser")
          ? "Læser videoerne…"
          : filer.some((f) => f.status === "fejl" && !f.resultat)
            ? "Fjern filerne med fejl først."
            : varianter.some((v) => !v)
              ? "Alle varianter skal have et navn."
              : dubletter
                ? "To varianter har samme navn."
                : null;

  async function upload() {
    if (mangler || travl) return;
    setTravl(true);
    setFejl(null);
    const ac = new AbortController();
    abortRef.current = ac;
    let groupId = filer.find((f) => f.resultat)?.resultat?.groupId;
    const resultater: NonNullable<Fil["resultat"]>[] = [];
    let aktuel: Fil | null = null;
    try {
      for (const f of filer) {
        if (f.resultat) {
          resultater.push(f.resultat);
          continue;
        }
        aktuel = f;
        opdater(f.id, { status: "uploader", sendt: 0, fejl: undefined });
        const r = await uploadVideoFile({
          file: f.file,
          contentType: f.contentType,
          groupId,
          signal: ac.signal,
          onProgress: (sendt) => opdater(f.id, { sendt }),
        });
        groupId = r.groupId;
        const thumbKey = await uploadThumb(r.groupId, r.assetId, f.info!.thumb, ac.signal);
        const resultat = { ...r, thumbKey };
        resultater.push(resultat);
        opdater(f.id, { status: "færdig", sendt: f.file.size, resultat });
      }
      aktuel = null;
      const { group } = await postJson<{ group: Group }>(
        "/api/videos",
        {
          groupId,
          category: kategori,
          name: navn.trim(),
          metaPrimaryText: primaer,
          metaHeadline: overskrift,
          videos: filer.map((f, i) => ({
            assetId: resultater[i].assetId,
            key: resultater[i].key,
            thumbKey: resultater[i].thumbKey,
            variant: f.variant.trim(),
            filename: f.file.name,
            width: f.info?.width,
            height: f.info?.height,
            durationS: f.info?.durationS,
          })),
        },
        ac.signal
      );
      ryd();
      onGemt(group);
    } catch (e) {
      const annulleret = ac.signal.aborted;
      if (aktuel) opdater(aktuel.id, { status: "klar", sendt: 0 });
      setFejl(annulleret ? "Uploaden blev annulleret." : e instanceof Error ? e.message : String(e));
    } finally {
      abortRef.current = null;
      setTravl(false);
    }
  }

  const iAlt = filer.reduce((n, f) => n + f.file.size, 0);

  return (
    <section className="mb-6 rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-semibold">Tilføj video</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setTraekOver(true);
        }}
        onDragLeave={() => setTraekOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setTraekOver(false);
          if (!travl) tilfoej(e.dataTransfer.files);
        }}
        className={`mb-3 rounded-lg border-2 border-dashed p-4 text-center text-sm ${traekOver ? "border-foreground" : "opacity-80"}`}
      >
        <p className="mb-2">
          Træk videofiler hertil, eller{" "}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={travl} className="underline disabled:opacity-40">
            vælg filer
          </button>
          .
        </p>
        <p className="opacity-60">
          MP4 eller MOV, højst 4 GB pr. fil. Flere filer på én gang = én video med flere varianter (fx hooks).
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/mp4,video/quicktime,.mp4,.mov"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) tilfoej(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {filer.length > 0 && (
        <ul className="mb-3 space-y-2">
          {filer.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 rounded border p-2 text-sm">
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.preview} alt="" className="h-16 w-16 rounded bg-black object-contain" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded border text-xs opacity-60">
                  {f.status === "fejl" ? "Fejl" : "Læser…"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="mb-0.5 block text-xs opacity-60">Variant</span>
                  <input
                    value={f.variant}
                    disabled={travl || !!f.resultat}
                    onChange={(e) => opdater(f.id, { variant: e.target.value, variantRettet: true })}
                    className="w-full rounded border bg-transparent px-2 py-1"
                  />
                </label>
                <p className="mt-1 truncate text-xs opacity-60" title={f.file.name}>
                  {f.file.name} · {fmtStoerrelse(f.file.size)}
                  {f.info ? ` · ${fmtVarighed(f.info.durationS)} · ${f.info.width}×${f.info.height}` : ""}
                </p>
                {f.status === "fejl" && <p className="mt-1 text-xs text-red-600">{f.fejl}</p>}
                {(f.status === "uploader" || f.status === "færdig") && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-black/10">
                    <div
                      className={`h-full ${f.status === "færdig" ? "bg-green-600" : "bg-foreground"}`}
                      style={{ width: `${Math.round((f.sendt / f.file.size) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              <span className="w-20 text-right text-xs opacity-70">
                {f.status === "uploader"
                  ? `${Math.floor((f.sendt / f.file.size) * 100)} %`
                  : f.status === "færdig"
                    ? "Uploadet"
                    : ""}
              </span>
              {!travl && !f.resultat && (
                <button type="button" onClick={() => fjern(f)} title="Fjern filen" className="rounded border px-2 py-1 opacity-70">
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block opacity-70">Videoens navn</span>
          <input
            value={navn}
            disabled={travl}
            onChange={(e) => {
              setNavn(e.target.value);
              setNavnRettet(true);
            }}
            className="w-full rounded border bg-transparent p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block opacity-70">Kategori</span>
          <KategoriVaelger
            value={kategori}
            valg={valg}
            onChange={(id, label) => {
              setKategori(id);
              onNyKategori(id, label);
            }}
          />
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-dashed p-3">
        <p className="mb-2 text-sm font-medium">
          Meta-annoncetekst
          <span className="ml-2 font-normal opacity-60">står i annoncen — gælder alle videoens varianter</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block opacity-70">Primærtekst</span>
            <textarea
              value={primaer}
              rows={3}
              onChange={(e) => setPrimaer(e.target.value)}
              className="w-full rounded border bg-transparent p-2"
            />
          </label>
          <Overskrift value={overskrift} onChange={setOverskrift} />
        </div>
      </div>

      {fejl && <p className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">{fejl}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={upload}
          disabled={!!mangler || travl}
          className="rounded border bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-40"
        >
          {travl ? "Uploader…" : filer.some((f) => f.resultat) ? "Prøv igen" : "Upload"}
        </button>
        {travl ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="rounded border px-3 py-1.5 text-sm">
            Annullér upload
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              ryd();
              onLuk();
            }}
            className="rounded border px-3 py-1.5 text-sm opacity-70"
          >
            Luk
          </button>
        )}
        <span className="text-sm opacity-60">
          {mangler && !travl ? mangler : filer.length ? `${antal(filer.length, "fil", "filer")} · ${fmtStoerrelse(iAlt)}` : ""}
        </span>
      </div>
    </section>
  );
}

function VideoKort({
  group,
  valg,
  onPatch,
  onNyKategori,
  onFavorit,
  onVariant,
  onAaben,
}: {
  group: Group;
  valg: Valg[];
  onPatch: (patch: Partial<Group>) => void;
  onNyKategori: (id: string, label: string) => void;
  onFavorit: (v: Video) => void;
  onVariant: (v: Video, variant: string) => void;
  onAaben: (idx: number) => void;
}) {
  return (
    <li className={`rounded-lg border p-4 ${group.archived ? "opacity-60" : ""}`}>
      {group.note && (
        <span className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-800">
          {group.note}
        </span>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block opacity-70">Videoens navn</span>
          <input
            defaultValue={group.name}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) e.target.value = group.name;
              else if (v !== group.name) onPatch({ name: v });
            }}
            className="w-full rounded border bg-transparent p-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block opacity-70">Kategori</span>
          <KategoriVaelger
            value={group.category}
            valg={valg}
            onChange={(id, label) => {
              onNyKategori(id, label);
              if (id !== group.category) onPatch({ category: id });
            }}
          />
        </label>
      </div>

      <MetaTekstVideo group={group} save={onPatch} />

      <div className="mt-3 flex flex-wrap gap-3">
        {group.videos.map((v, i) => (
          <div key={v.id} className="flex w-32 flex-col">
            <div className="relative">
              <button type="button" onClick={() => onAaben(i)} title={`Afspil ${v.variant}`} className="relative block w-full">
                {v.thumbKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/i/${v.thumbKey}`} alt={v.variant} className="h-32 w-32 rounded border bg-black object-contain" />
                ) : (
                  <span className="flex h-32 w-32 items-center justify-center rounded border bg-black text-white">▶</span>
                )}
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                  ▶ {fmtVarighed(v.durationS)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onFavorit(v)}
                title={v.favorite ? "Fjern favorit" : "Markér som favorit"}
                className="absolute top-0.5 right-0.5 text-base leading-none text-white"
                style={{ textShadow: "0 0 3px rgba(0,0,0,0.6)" }}
              >
                {v.favorite ? "⭐" : "☆"}
              </button>
            </div>
            <input
              defaultValue={v.variant}
              title={v.filename ?? v.variant}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (!t) e.target.value = v.variant;
                else if (t !== v.variant) onVariant(v, t);
              }}
              className="mt-1 w-full rounded border bg-transparent px-1.5 py-0.5 text-xs"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm opacity-60">
          {antal(group.videos.length, "variant", "varianter")}
          {group.archived ? " · arkiveret" : ""}
        </span>
        <button
          type="button"
          onClick={() => onPatch({ archived: !group.archived })}
          className="ml-auto rounded border px-3 py-1.5 text-sm opacity-70"
        >
          {group.archived ? "Gendan" : "Arkivér"}
        </button>
      </div>
    </li>
  );
}

export default function VideoLibrary() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visArkiverede, setVisArkiverede] = useState(false);
  const [tilfoejer, setTilfoejer] = useState(false);
  const [lb, setLb] = useState<{ groupId: string; idx: number } | null>(null);
  // Navne på kategorier oprettet i denne session (id → den indtastede tekst).
  const [nyeKategorier, setNyeKategorier] = useState<Record<string, string>>({});

  useEffect(() => {
    let aktiv = true;
    fetch("/api/videos", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!aktiv) return;
        setGroups(data.groups ?? []);
        setError(null);
      })
      .catch(() => aktiv && setError("Kunne ikke hente videoerne."))
      .finally(() => aktiv && setLoading(false));
    return () => {
      aktiv = false;
    };
  }, []);

  const faste = new Set(CATEGORIES.map((c) => c.id));
  const egne = Array.from(new Set([...groups.map((g) => g.category), ...Object.keys(nyeKategorier)]))
    .filter((id) => !faste.has(id))
    .sort((a, b) => a.localeCompare(b, "da"));
  const valg: Valg[] = [
    ...CATEGORIES,
    ...egne.map((id) => ({ id, label: nyeKategorier[id] ?? prettyCategory(id) })),
  ];
  const kategoriNavn = (id: string) => valg.find((v) => v.id === id)?.label ?? prettyCategory(id);

  function nyKategori(id: string, label: string) {
    if (!faste.has(id) && label) setNyeKategorier((m) => (m[id] ? m : { ...m, [id]: label }));
  }

  async function patchGroup(id: string, patch: Partial<Group>) {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    try {
      await postOrPatch(`/api/videos/groups/${id}`, "PATCH", patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme ændringen.");
    }
  }

  async function toggleFavorit(v: Video) {
    const flip = (gs: Group[]) =>
      gs.map((g) => ({ ...g, videos: g.videos.map((x) => (x.id === v.id ? { ...x, favorite: !x.favorite } : x)) }));
    setGroups(flip);
    try {
      await postOrPatch(`/api/videos/${v.id}/favorite`, "POST");
    } catch (e) {
      setGroups(flip);
      setError(e instanceof Error ? e.message : "Kunne ikke gemme favoritten.");
    }
  }

  async function omdoebVariant(v: Video, variant: string) {
    setGroups((gs) =>
      gs.map((g) => ({ ...g, videos: g.videos.map((x) => (x.id === v.id ? { ...x, variant } : x)) }))
    );
    try {
      await postOrPatch(`/api/videos/${v.id}`, "PATCH", { variant });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme variantens navn.");
    }
  }

  const synlige = groups.filter((g) => visArkiverede || !g.archived);
  const aktive = groups.filter((g) => !g.archived);
  const antalArkiverede = groups.length - aktive.length;
  const lbGroup = lb ? groups.find((g) => g.id === lb.groupId) : undefined;

  // Grupper pr. kategori i den faste rækkefølge (Morten, Testimonials, Retinol, egne).
  const sektioner = valg
    .map((k) => ({ ...k, groups: synlige.filter((g) => g.category === k.id) }))
    .filter((s) => s.groups.length > 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm opacity-60">
          {antal(aktive.length, "video", "videoer")} ·{" "}
          {antal(aktive.reduce((n, g) => n + g.videos.length, 0), "variant", "varianter")}
        </span>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setVisArkiverede((v) => !v)}
            className={`rounded border px-3 py-1.5 text-sm ${visArkiverede ? "bg-amber-100 border-amber-400 text-amber-800" : "opacity-70"}`}
          >
            {visArkiverede ? "Skjul arkiverede" : `Vis arkiverede (${antalArkiverede})`}
          </button>
          {!tilfoejer && (
            <button type="button" onClick={() => setTilfoejer(true)} className="rounded border px-3 py-1.5 text-sm">
              + Tilføj video
            </button>
          )}
        </span>
      </div>

      {tilfoejer && (
        <TilfoejVideo
          valg={valg}
          onNyKategori={nyKategori}
          onGemt={(g) => {
            setGroups((gs) => [g, ...gs]);
            setTilfoejer(false);
          }}
          onLuk={() => setTilfoejer(false)}
        />
      )}

      {error && <p className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p>}

      {loading ? (
        <p className="opacity-60">Henter…</p>
      ) : synlige.length === 0 ? (
        <p className="opacity-60">
          {groups.length === 0 ? "Ingen videoer endnu. Tryk “+ Tilføj video”." : "Alle videoer er arkiveret."}
        </p>
      ) : (
        sektioner.map((s) => (
          <section key={s.id} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-70">{kategoriNavn(s.id)}</h2>
            <ul className="space-y-4">
              {s.groups.map((g) => (
                <VideoKort
                  key={g.id}
                  group={g}
                  valg={valg}
                  onPatch={(patch) => patchGroup(g.id, patch)}
                  onNyKategori={nyKategori}
                  onFavorit={toggleFavorit}
                  onVariant={omdoebVariant}
                  onAaben={(idx) => setLb({ groupId: g.id, idx })}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {lb && lbGroup && lbGroup.videos.length > 0 && (
        <VideoLightbox
          group={lbGroup}
          idx={Math.min(lb.idx, lbGroup.videos.length - 1)}
          onIdx={(i) => setLb((cur) => (cur ? { ...cur, idx: i } : cur))}
          onClose={() => setLb(null)}
        />
      )}
    </div>
  );
}

/** PATCH/POST til vores API; kaster API'ets danske fejlbesked. */
async function postOrPatch(url: string, method: "POST" | "PATCH", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Udløbet login: proxy.ts omdirigerer til /login (HTML i stedet for JSON).
  if (res.redirected) throw new Error("Du er blevet logget ud. Genindlæs siden, og log ind igen.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Kunne ikke gemme ændringen.");
  return data;
}
