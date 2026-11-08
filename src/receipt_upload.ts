import { z } from "zod";
import { infrai } from "./infrai.js";

const receiptRequest = z.object({
  donorId: z.string().min(1),
  campaignId: z.string().min(1),
  mediaName: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  contentType: z.string().min(1),
  bytes: z.number().int().positive(),
});

export const PART_SIZE = 8 * 1024 * 1024;

export function parseReceiptRequest(input: unknown) {
  return receiptRequest.parse(input);
}

export function shouldUseMultipart(bytes: number): boolean {
  return bytes > PART_SIZE;
}

export async function startReceiptUpload(input: unknown) {
  const request = parseReceiptRequest(input);
  const bucket = "nonprofit-media";
  await infrai.storage.bucket.create({ name: bucket });
  const key = `receipts/${request.campaignId}/${request.donorId}/${request.mediaName}`;
  if (!shouldUseMultipart(request.bytes)) return { mode: "single-part", bucket, key };
  const upload = await infrai.storage.multipart.create(bucket, {
    key,
    content_type: request.contentType,
    idempotency_key: `receipt-${request.campaignId}-${request.donorId}`,
  });
  return { mode: "multipart", bucket, key, uploadId: upload.upload_id, partSize: PART_SIZE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const body = JSON.parse(process.env.RECEIPT_UPLOAD ?? "{}");
  console.log(await startReceiptUpload(body));
}
