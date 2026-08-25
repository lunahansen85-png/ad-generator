import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

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
