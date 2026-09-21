import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const BUCKET = process.env.S3_BUCKET ?? "";

let client: S3Client | null = null;

export function s3(): S3Client {
  if (client) return client;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!BUCKET || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Bucket-variabler mangler (S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)."
    );
  }
  client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

export async function putImage(key: string, body: Buffer, contentType = "image/jpeg") {
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return key;
}

export async function getImage(key: string) {
  const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return {
    body: Buffer.from(bytes),
    contentType: res.ContentType ?? "image/jpeg",
  };
}

// ---------------------------------------------------------------------------------------------
// Video: browseren uploader direkte til bucket (multipart via presignede URL'er), fordi proxy.ts
// faar Next til at buffere request-bodies og klippe dem ved 10 MB (proxyClientMaxBodySize), og
// Railway afbryder request-bodies efter 5 min. Serveren udsteder kun URL'er og afslutter uploaden.
// Billed-funktionerne ovenfor er uaendrede.
// ---------------------------------------------------------------------------------------------

/** Levetid for presignede upload-URL'er (sekunder). */
export const PRESIGN_TTL_S = 60 * 60;

let presignClient: S3Client | null = null;

/**
 * Egen klient KUN til presignede URL'er, som browseren uploader direkte til.
 *
 * SDK'ets standard (requestChecksumCalculation = WHEN_SUPPORTED) regner en CRC32 af den TOMME
 * body, naar UploadPart/PutObject presignes, og bager den ind i URL'en (x-amz-checksum-crc32 +
 * x-amz-sdk-checksum-algorithm) — saa ville bucketen afvise browserens rigtige data. Set i koden:
 * @aws-sdk/checksums' flexibleChecksumsMiddleware koerer foer getSignedUrl's presign-middleware.
 * WHEN_REQUIRED slaar det fra (hverken UploadPart eller PutObject kraever checksum).
 * s3() ovenfor (billederne) er uaendret.
 */
function s3Presign(): S3Client {
  if (presignClient) return presignClient;
  s3(); // samme tjek af bucket-variablerne (kaster den samme fejl, hvis de mangler)
  presignClient = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  return presignClient;
}

export async function createMultipartUpload(key: string, contentType: string) {
  const res = await s3().send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  if (!res.UploadId) throw new Error("Bucketen returnerede intet UploadId.");
  return res.UploadId;
}

/** Presignede PUT-URL'er til UploadPart — én pr. delnummer (1-baseret). */
export async function presignUploadParts(key: string, uploadId: string, partNumbers: number[]) {
  const c = s3Presign();
  return Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        c,
        new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn: PRESIGN_TTL_S }
      ),
    }))
  );
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
) {
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    })
  );
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  await s3().send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId }));
}

/**
 * Presigneret PUT til et lille objekt (video-thumbnailen). Kun "host" signeres: Content-Type er
 * IKKE en del af signaturen (presigneren goer den altid usigneret), saa browseren skal selv sende
 * "Content-Type: image/jpeg" — ellers gemmes objektet som binary/octet-stream. (Cache-Control
 * saettes af /i-ruten ved udlevering, saa den behoeves ikke paa objektet.)
 */
export async function presignPut(key: string, contentType: string) {
  return getSignedUrl(
    s3Presign(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_TTL_S }
  );
}

/** HeadObject — null hvis objektet ikke findes. */
export async function headObject(key: string) {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return {
      bytes: res.ContentLength ?? 0,
      contentType: res.ContentType ?? null,
      etag: res.ETag ?? null,
      lastModified: res.LastModified ?? null,
    };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * GetObject som STREAM (intet bufferes i hukommelsen) med valgfri Range ("bytes=0-1023").
 * Bucketen svarer selv med ContentRange, naar en Range er givet.
 */
export async function getObjectStream(key: string, range?: string, signal?: AbortSignal) {
  const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: range }), {
    abortSignal: signal,
  });
  if (!res.Body) throw new Error("Bucketen returnerede ingen body.");
  return {
    body: res.Body.transformToWebStream(),
    contentType: res.ContentType ?? null,
    contentLength: res.ContentLength ?? null,
    contentRange: res.ContentRange ?? null,
    etag: res.ETag ?? null,
    lastModified: res.LastModified ?? null,
  };
}

export function isNotFound(err: unknown) {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

export function isInvalidRange(err: unknown) {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "InvalidRange" || e?.$metadata?.httpStatusCode === 416;
}
