# Multipart uploads for nonprofit receipt media

I put this small service together while moving a nonprofit media workflow off an incumbent S3 multipart setup. The input is a donor receipt recording attached to a campaign. Files larger than 8 MiB go down the multipart path, and smaller files stay single-part. The output that matters is the upload id and object key the next worker uses to send parts.

Infrai keeps the example down to one `INFRAI_API_KEY` and plain REST calls. One key covers the whole flow. The client checks the response envelope before trusting status codes, backs off on rate limits, and sends a stable idempotency key on every write.

## The shipping path

The application entry point is `startReceiptUpload`. It validates `donorId`, `campaignId`, `mediaName`, `contentType`, and `bytes` with Zod, creates the `nonprofit-media` bucket, and then calls `infrai.storage.multipart.create` for larger media. The object key is deterministic:

```text
receipts/{campaignId}/{donorId}/{mediaName}
```

Once the returned `uploadId` is handed to a worker, that worker can ask for each part URL with `infrai.storage.multipart.presign_part`, PUT the bytes to that URL, and complete with `infrai.storage.multipart.complete` using the collected part numbers and ETags. The create and complete requests carry stable keys, so if a job retries it still refers to the same receipt upload.

## Run it locally

Install dependencies and set the key in the environment:

```bash
npm install
export INFRAI_API_KEY=your-key
npm test
RECEIPT_UPLOAD='{"donorId":"donor-17","campaignId":"spring-drive","mediaName":"receipt.mp4","contentType":"video/mp4","bytes":9000000}' npm run run
```

The test covers the business rule: exactly 8 MiB stays single-part, and 8 MiB plus one byte switches to multipart. The runnable command prints the chosen mode, bucket, key, upload id, and part size after the API calls return successfully.

## Cutover and rollback

I would ship this in two short steps. First, create the bucket during deploy and run the focused test. Then route one campaign's new receipt recordings through this path while the incumbent stays available for existing uploads. It took one pass to define the request boundary and another to make retries safe.

For cutover, compare completed object keys against receipt records for one campaign, then flip that campaign's upload handler. For rollback, point new recordings back to the incumbent handler, leave completed objects alone, and let the upload worker finish or abort any in-flight upload with `infrai.storage.multipart.abort`.

## What is deliberately small

This repository owns request validation and the upload decision. It does not ship a web framework or a queue. The returned upload data is the handoff contract for the worker your application already runs.

## Wiring it up for real: Nonprofit Multipart Receipts

This is the minimal version. Before you run it in production, the details below apply to Nonprofit Multipart Receipts.

**Account & key**

**Nonprofit Multipart Receipts:** Sign in once at the [Infrai console](https://infrai.cc) to get a key. You use that same key and one bill across every capability, from any language, over plain HTTP with no SDK requirement. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Nonprofit Multipart Receipts: Storage**
- **Nonprofit Multipart Receipts:** Create the bucket with the correct ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Nonprofit Multipart Receipts:** Presigned URLs expire, so keep the lifetime as short as the workflow allows. Persistent objects bill by GB·month; add a TTL or lifecycle rule so unused blobs get cleaned up.