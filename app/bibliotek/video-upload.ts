/**
 * Browser-siden af video-uploaden (bruges af VideoLibrary.tsx).
 *
 * Filerne sendes DIREKTE fra browseren til bucketen via presignede URL'er — ikke gennem appen:
 * proxy.ts faar Next til at buffere og klippe request-bodies ved 10 MB, og Railway afbryder
 * request-bodies efter 5 min. Appen udsteder kun URL'erne og afslutter uploaden (app/api/videos/uploads).
 *
 * Kraever at bucketens CORS tillader PUT fra adgen.kjeldgaards.com og viser ETag-headeren
 * (scripts/set-bucket-cors.mjs) — ellers kan browseren hverken sende delene eller afslutte uploaden.
 */

import { VIDEO_TYPES } from "@/lib/video";

const PARALLELLE_DELE = 3;
const NYE_FORSOEG = 3; // pr. del, efter første forsøg
const FORNY_URLS_EFTER_MS = 45 * 60 * 1000; // URL'erne gaelder 1 time (PRESIGN_TTL_S)
const THUMB_MAX_KANT = 1920;

export type VideoInfo = { width: number; height: number; durationS: number; thumb: Blob };

/** "video/mp4" / "video/quicktime" — ud fra filtypen, ellers endelsen. null = ikke tilladt. */
export function videoContentType(file: File): string | null {
  if (VIDEO_TYPES[file.type]) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".mov")) return "video/quicktime";
  return null;
}

function vent<T extends keyof HTMLVideoElementEventMap>(v: HTMLVideoElement, event: T, ms = 20_000) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => done(new Error("timeout")), ms);
    const ok = () => done();
    const fejl = () => done(new Error("error"));
    function done(err?: Error) {
      clearTimeout(t);
      v.removeEventListener(event, ok);
      v.removeEventListener("error", fejl);
      if (err) reject(err);
      else resolve();
    }
    v.addEventListener(event, ok);
    v.addEventListener("error", fejl);
  });
}

/**
 * Laeser bredde/hoejde/varighed og laver thumbnailen: et JPEG (kvalitet 0,9) af billedet ved
 * min(1 s, varighed/2), i videoens egen oplosning (laengste kant max 1920 px).
 * Meta kraever et thumbnail til videoannoncer, saa fejler dette, stopper uploaden her.
 */
export async function readVideo(file: File): Promise<VideoInfo> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  try {
    const meta = vent(v, "loadedmetadata");
    v.src = url;
    await meta;
    const width = v.videoWidth;
    const height = v.videoHeight;
    if (!width || !height) throw new Error("intet billedspor");
    const durationS = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;

    const t = durationS > 0 ? Math.min(1, durationS / 2) : 0;
    if (t > 0) {
      const seeked = vent(v, "seeked");
      v.currentTime = t;
      await seeked;
    } else if (v.readyState < 2) {
      await vent(v, "loadeddata");
    }

    const scale = Math.min(1, THUMB_MAX_KANT / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const thumb = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!thumb || thumb.size === 0) throw new Error("tomt thumbnail");
    return { width, height, durationS, thumb };
  } catch {
    throw new Error(
      `Browseren kunne ikke afspille “${file.name}” og kan derfor ikke lave et thumbnail. ` +
        "Eksportér videoen som MP4 (H.264), og prøv igen."
    );
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

/** POST med JSON til vores egen API. Kaster en fejl med API'ets danske besked. */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  // Udloebet login: proxy.ts omdirigerer til /login, og svaret er HTML i stedet for JSON.
  if (res.redirected) throw new Error("Du er blevet logget ud. Genindlæs siden, og log ind igen.");
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error ?? `Serveren svarede med fejl ${res.status}.`);
  return data as T;
}

type Oprettet = {
  groupId: string;
  assetId: string;
  key: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  urls: { partNumber: number; url: string }[];
};

class DelFejl extends Error {
  constructor(message: string, public status: number, public endelig = false) {
    super(message);
  }
}

/** PUT af én del med XMLHttpRequest (fetch kan ikke vise upload-fremdrift). Returnerer ETag. */
function putDel(url: string, blob: Blob, signal: AbortSignal, onSent: (bytes: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const afbryd = () => xhr.abort();
    signal.addEventListener("abort", afbryd);
    const slut = () => signal.removeEventListener("abort", afbryd);
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onSent(e.loaded);
    xhr.onload = () => {
      slut();
      if (xhr.status < 200 || xhr.status >= 300) {
        return reject(new DelFejl(`Bucketen svarede ${xhr.status}.`, xhr.status));
      }
      const etag = xhr.getResponseHeader("ETag");
      if (!etag) {
        return reject(
          new DelFejl(
            "Bucketen sendte ingen ETag tilbage — bucketens CORS skal vise ETag-headeren (scripts/set-bucket-cors.mjs).",
            xhr.status,
            true
          )
        );
      }
      resolve(etag);
    };
    xhr.onerror = () => {
      slut();
      reject(new DelFejl("Netværksfejl (eller bucketens CORS afviste uploaden).", 0));
    };
    xhr.onabort = () => {
      slut();
      reject(new DOMException("Annulleret", "AbortError"));
    };
    xhr.send(blob);
  });
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Annulleret", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Uploader én videofil: multipart med 16 MiB-dele, 3 dele ad gangen, op til 3 nye forsøg pr. del.
 * Ved fejl eller annullering afbrydes uploaden i bucketen (/abort), saa halve filer ikke bliver liggende.
 * onProgress kaldes hoejst hvert 200. ms med antal sendte bytes.
 */
export async function uploadVideoFile(opts: {
  file: File;
  contentType: string;
  groupId?: string;
  signal: AbortSignal;
  onProgress: (sent: number) => void;
}): Promise<{ groupId: string; assetId: string; key: string }> {
  const { file, signal } = opts;
  const u = await postJson<Oprettet>(
    "/api/videos/uploads",
    { groupId: opts.groupId, contentType: opts.contentType, size: file.size },
    signal
  );

  // Én fejlet del stopper de andre (og brugerens "Annullér" stopper alle).
  const intern = new AbortController();
  const stopAlle = () => intern.abort();
  signal.addEventListener("abort", stopAlle);

  const urls = new Map(u.urls.map((x) => [x.partNumber, x.url]));
  let hentet = Date.now();
  let fornyer: Promise<void> | null = null;
  const faerdige: { partNumber: number; etag: string }[] = [];

  async function fornyUrls() {
    fornyer ??= (async () => {
      const mangler = Array.from({ length: u.partCount }, (_, i) => i + 1).filter(
        (n) => !faerdige.some((f) => f.partNumber === n)
      );
      const r = await postJson<{ urls: { partNumber: number; url: string }[] }>(
        "/api/videos/uploads/parts",
        { key: u.key, uploadId: u.uploadId, partNumbers: mangler },
        intern.signal
      );
      for (const x of r.urls) urls.set(x.partNumber, x.url);
      hentet = Date.now();
    })().finally(() => {
      fornyer = null;
    });
    return fornyer;
  }

  const sendt = new Map<number, number>();
  let sidst = 0;
  const meld = (tving = false) => {
    const nu = Date.now();
    if (!tving && nu - sidst < 200) return;
    sidst = nu;
    let sum = 0;
    for (const b of sendt.values()) sum += b;
    opts.onProgress(Math.min(sum, file.size));
  };

  let naeste = 1;
  async function arbejder() {
    while (naeste <= u.partCount) {
      const n = naeste++;
      const start = (n - 1) * u.partSize;
      const blob = file.slice(start, Math.min(start + u.partSize, file.size));
      for (let forsoeg = 0; ; forsoeg++) {
        if (intern.signal.aborted) throw new DOMException("Annulleret", "AbortError");
        try {
          if (Date.now() - hentet > FORNY_URLS_EFTER_MS) await fornyUrls();
          const etag = await putDel(urls.get(n)!, blob, intern.signal, (b) => {
            sendt.set(n, b);
            meld();
          });
          faerdige.push({ partNumber: n, etag });
          sendt.set(n, blob.size);
          meld();
          break;
        } catch (err) {
          if (intern.signal.aborted || (err instanceof DelFejl && err.endelig)) throw err;
          sendt.set(n, 0);
          if (forsoeg >= NYE_FORSOEG) {
            const grund = err instanceof Error ? err.message : String(err);
            throw new Error(`Del ${n} af ${u.partCount} fejlede ${NYE_FORSOEG + 1} gange: ${grund}`);
          }
          await pause(1000 * 2 ** forsoeg, intern.signal);
          // 403 = typisk en udloebet URL — hent friske foer naeste forsoeg.
          if (err instanceof DelFejl && err.status === 403) await fornyUrls();
        }
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(PARALLELLE_DELE, u.partCount) }, () =>
        arbejder().catch((err) => {
          intern.abort();
          throw err;
        })
      )
    );
    await postJson("/api/videos/uploads/complete", { key: u.key, uploadId: u.uploadId, parts: faerdige }, signal);
    meld(true);
    return { groupId: u.groupId, assetId: u.assetId, key: u.key };
  } catch (err) {
    // Ryd op i bucketen. keepalive, saa det ogsaa sker, hvis siden lukkes lige efter.
    fetch("/api/videos/uploads/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: u.key, uploadId: u.uploadId }),
      keepalive: true,
    }).catch(() => {});
    if (signal.aborted) throw new DOMException("Annulleret", "AbortError");
    throw err;
  } finally {
    signal.removeEventListener("abort", stopAlle);
  }
}

/** Uploader thumbnailen (JPEG) til den noegle, serveren anviser. Returnerer thumbKey. */
export async function uploadThumb(groupId: string, assetId: string, thumb: Blob, signal: AbortSignal) {
  const { thumbKey, url } = await postJson<{ thumbKey: string; url: string }>(
    "/api/videos/thumb-url",
    { groupId, assetId },
    signal
  );
  // Content-Type SKAL sendes: den er ikke en del af signaturen, og uden den gemmer bucketen
  // filen som binary/octet-stream (se presignPut i lib/storage.ts).
  const res = await fetch(url, { method: "PUT", body: thumb, headers: { "Content-Type": "image/jpeg" }, signal });
  if (!res.ok) throw new Error(`Thumbnailen kunne ikke uploades (bucketen svarede ${res.status}).`);
  return thumbKey;
}
