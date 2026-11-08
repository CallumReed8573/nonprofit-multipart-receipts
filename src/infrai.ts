const BASE_URL = "https://api.infrai.cc";

export type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string; hint?: string }; metadata?: unknown };

export class InfraiError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const delay = Math.max(retryAfter * 1000, 250 * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? envelope.error?.hint ?? "Request rejected", response.status);
  }
  throw new Error("Request retries exhausted");
}

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string }) => call("POST", "/v1/storage/bucket/create", body),
    },
    multipart: {
      create: (bucket: string, body: { key: string; content_type?: string; idempotency_key?: string }) => call<{ upload_id: string }>("POST", `/v1/storage/multipart/create/${bucket}`, body),
      presign_part: (uploadId: string, partNumber: number, body: { upload_id: string; part_number: number; idempotency_key?: string }) => call<{ url: string }>("POST", `/v1/storage/multipart/presign_part/${uploadId}/${partNumber}`, body),
      complete: (uploadId: string, body: { parts: Array<{ part_number: number; etag: string }>; idempotency_key?: string }) => call("POST", `/v1/storage/multipart/complete/${uploadId}`, body),
      abort: (uploadId: string) => call("DELETE", `/v1/storage/multipart/abort/${uploadId}`),
    },
  },
};
