/**
 * Faelles regler for videobiblioteket — bruges af baade API-ruterne og browseren
 * (app/bibliotek/VideoLibrary.tsx). Ingen server-imports her.
 */

/** Tilladte videotyper (MP4 og MOV) → filendelse i bucket-noeglen. */
export const VIDEO_TYPES: Record<string, "mp4" | "mov"> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

/**
 * Max filstoerrelse: 4 GB som Finder viser det (4.000.000.000 bytes, decimal) — saa "4,1 GB" i
 * Finder ogsaa er for stor her.
 */
export const VIDEO_MAX_BYTES = 4_000_000_000;

/** Stoerrelse paa hver del i multipart-uploaden (16 MiB). S3 kraever min. 5 MiB, max 10.000 dele. */
export const VIDEO_PART_SIZE = 16 * 1024 * 1024;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Bucket-noegle for selve videoen. Serveres offentligt af /v/<noegle>. */
export function videoKey(groupId: string, assetId: string, ext: "mp4" | "mov") {
  return `vid/${groupId}/${assetId}.${ext}`;
}

/**
 * Bucket-noegle for thumbnailen. Serveres af den eksisterende /i/-rute (samme som billederne).
 * Bevidst IKKE under img/: Ad Studio laeser /i/img/<adCopyId>/<templateId>/… som et biblioteksbillede.
 */
export function thumbKey(groupId: string, assetId: string) {
  return `vthumb/${groupId}/${assetId}.jpg`;
}

const U = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Praecis de noegler videoKey() laver — /v/ serverer intet andet. */
export const VIDEO_KEY_RE = new RegExp(`^vid/${U}/${U}\\.(mp4|mov)$`);

/**
 * Kategori-id fra en ny, indtastet kategori: smaa bogstaver, alt andet end bogstaver/tal bliver
 * til "-". æ/ø/å bevares. "Før & efter" → "før-efter".
 */
export function slugifyCategory(label: string) {
  return label
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function isCategoryId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 40 && slugifyCategory(v) === v;
}

/** Visningsnavn for et kategori-id, der ikke er en af bibliotekets faste: "før-efter" → "Før efter". */
export function prettyCategory(id: string) {
  const s = id.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
