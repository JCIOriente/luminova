import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const sha256 = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

export const fileSha256 = (file: string) => sha256(readFileSync(file));
