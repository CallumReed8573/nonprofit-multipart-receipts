import assert from "node:assert/strict";
import { PART_SIZE, shouldUseMultipart } from "./receipt_upload.js";

assert.equal(shouldUseMultipart(PART_SIZE), false);
assert.equal(shouldUseMultipart(PART_SIZE + 1), true);
console.log("large receipt media selects multipart upload");
