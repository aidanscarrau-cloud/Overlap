import "server-only";
import crypto from "node:crypto";
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/* Match videos: uploaded by the coach's browser straight to Cloudflare R2 (never through our servers),
 * analysed by the GPU worker on Modal, then deleted. Server-only: the storage keys and worker secret
 * never reach the browser.
 *
 * Env (Vercel): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 *               VIDEO_WORKER_URL (the Modal web endpoint), VIDEO_WORKER_SECRET (shared with Modal). */

export const MAX_BYTES = 10 * 1024 ** 3;

export function videoConfigured() {
  return !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT));
}
export function workerConfigured() {
  return !!(process.env.VIDEO_WORKER_URL && process.env.VIDEO_WORKER_SECRET);
}

let client: S3Client | null = null;
function r2() {
  client ??= new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: !!process.env.R2_ENDPOINT,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  return client;
}
const Bucket = () => process.env.R2_BUCKET!;

/** Parts of at least 64 MB (R2 needs ≥5 MB and at most 10,000 parts). */
export function partSize(size: number) {
  return Math.max(64 * 1024 ** 2, Math.ceil(size / 9000));
}

export async function startUpload(key: string, size: number, contentType: string) {
  const { UploadId } = await r2().send(new CreateMultipartUploadCommand({ Bucket: Bucket(), Key: key, ContentType: contentType }));
  if (!UploadId) throw new Error("Couldn't start the upload.");
  const ps = partSize(size);
  const count = Math.ceil(size / ps);
  const urls = await Promise.all(
    Array.from({ length: count }, (_, i) => getSignedUrl(r2(), new UploadPartCommand({ Bucket: Bucket(), Key: key, UploadId, PartNumber: i + 1 }), { expiresIn: 6 * 3600 })),
  );
  return { uploadId: UploadId, partSize: ps, urls };
}

export async function finishUpload(key: string, uploadId: string, parts: { n: number; etag: string }[]) {
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: Bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: [...parts].sort((a, b) => a.n - b.n).map((p) => ({ PartNumber: p.n, ETag: p.etag })) },
    }),
  );
}

export async function abortUpload(key: string, uploadId: string) {
  await r2().send(new AbortMultipartUploadCommand({ Bucket: Bucket(), Key: key, UploadId: uploadId })).catch(() => {});
}

export async function deleteVideo(key: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: Bucket(), Key: key }));
}

/** A private link the worker uses to download the video (expires in 12 hours). */
export async function readUrl(key: string) {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: Bucket(), Key: key }), { expiresIn: 12 * 3600 });
}

/* ---------------------------------------------------------------- worker */

export async function sendToWorker(job: { job_id: string; video_url: string; callback_url: string }) {
  const res = await fetch(process.env.VIDEO_WORKER_URL!, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.VIDEO_WORKER_SECRET}` },
    body: JSON.stringify(job),
  });
  if (!res.ok) throw new Error(`The video worker didn't accept the job (${res.status}).`);
}

/** Callbacks are signed by the worker: HMAC-SHA256 of "<timestamp>.<body>" with the shared secret. */
export function verifyWorker(body: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.VIDEO_WORKER_SECRET;
  if (!secret || !timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 600) return false;
  const want = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const a = Buffer.from(want);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
