// Saetter bucketens CORS, saa browseren paa https://adgen.kjeldgaards.com kan uploade videoer
// DIREKTE til bucketen (presignede PUT-URL'er, se app/bibliotek/video-upload.ts) og laese ETag
// fra svaret (skal bruges til at afslutte multipart-uploaden).
//
// ⚠️ LIVE-AENDRING af bucketen. Koeres kun efter Thomas' udtrykkelige JA.
//
// Kraever S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (+ evt. S3_REGION) i
// miljoeet — de samme variabler som appen bruger. Scriptet skriver ALDRIG noegle-vaerdierne ud.
//
//   node scripts/set-bucket-cors.mjs               1) backup  2) saet  3) laes tilbage
//   node scripts/set-bucket-cors.mjs --overwrite   kraeves, hvis bucketen ALLEREDE har CORS-regler:
//                                                  PutBucketCors erstatter HELE konfigurationen.
//
// Backup: bucket-cors-backup-<tidspunkt>.json i den mappe, scriptet koeres fra ("none", hvis
// bucketen ingen CORS havde). Ren .mjs, saa den ikke afhaenger af dev-dependencies.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const NY_CORS = {
  CORSRules: [
    {
      AllowedOrigins: ["https://adgen.kjeldgaards.com"],
      AllowedMethods: ["PUT"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3000,
    },
  ],
};

const { S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
const mangler = Object.entries({ S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY })
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (mangler.length) {
  console.error(`Mangler i miljoeet: ${mangler.join(", ")} — intet er aendret.`);
  process.exit(1);
}

const client = new S3Client({
  region: S3_REGION || "auto",
  endpoint: S3_ENDPOINT,
  credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
});

// Kun navn, besked og HTTP-status — et helt SDK-fejlobjekt kan indeholde felter fra bucketens
// fejlsvar (fx AWSAccessKeyId), og de maa ikke ende i en terminal eller et log.
function fejlTekst(err) {
  return `${err?.name ?? "Fejl"}: ${err?.message ?? ""} (HTTP ${err?.$metadata?.httpStatusCode ?? "?"})`;
}

async function hentCors() {
  try {
    const r = await client.send(new GetBucketCorsCommand({ Bucket: S3_BUCKET }));
    return { CORSRules: r.CORSRules ?? [] };
  } catch (err) {
    if (err?.name === "NoSuchCORSConfiguration" || err?.$metadata?.httpStatusCode === 404) return "none";
    throw err;
  }
}

try {
  const endpointHost = new URL(S3_ENDPOINT).host;
  console.log(`Bucket: ${S3_BUCKET} @ ${endpointHost}`);

  // 1) Backup af den nuvaerende konfiguration.
  const nu = await hentCors();
  const stempel = new Date().toISOString().replace(/[:.]/g, "-");
  const fil = resolve(process.cwd(), `bucket-cors-backup-${stempel}.json`);
  writeFileSync(
    fil,
    JSON.stringify({ bucket: S3_BUCKET, endpointHost, takenAt: new Date().toISOString(), cors: nu }, null, 2) + "\n"
  );
  console.log(`1) Backup gemt: ${fil}`);
  console.log(`   Nuvaerende CORS: ${nu === "none" ? "none" : JSON.stringify(nu, null, 2)}`);

  const harRegler = nu !== "none" && nu.CORSRules.length > 0;
  if (harRegler && !process.argv.includes("--overwrite")) {
    console.error(
      "\nBucketen har allerede CORS-regler (se ovenfor). PutBucketCors ville erstatte dem ALLE.\n" +
        "Intet er aendret. Koer igen med --overwrite, hvis de maa erstattes."
    );
    process.exit(2);
  }

  // 2) Saet den nye konfiguration.
  await client.send(new PutBucketCorsCommand({ Bucket: S3_BUCKET, CORSConfiguration: NY_CORS }));
  console.log("2) PutBucketCors: OK");

  // 3) Laes tilbage og vis, hvad bucketen faktisk har nu.
  const efter = await hentCors();
  console.log(`3) CORS i bucketen nu: ${efter === "none" ? "none" : JSON.stringify(efter, null, 2)}`);
} catch (err) {
  console.error(`Stoppet: ${fejlTekst(err)}`);
  process.exit(1);
}
