import crypto from "node:crypto";
import fs from "node:fs";
import sharp from "sharp";

/** SHA-256 of a file's bytes, streamed so large files don't blow up memory. */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Perceptual difference hash (dHash). Resize to 9x8 grayscale and compare each
 * pixel to its right neighbour -> 64-bit hash rendered as 16 hex chars. Similar
 * images produce hashes with small Hamming distance.
 */
export async function dHash(input: Buffer | string): Promise<string> {
  const w = 9;
  const h = 8;
  const data = await sharp(input)
    .greyscale()
    .resize(w, h, { fit: "fill" })
    .raw()
    .toBuffer();

  let bits = "";
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w - 1; col++) {
      const left = data[row * w + col];
      const right = data[row * w + col + 1];
      bits += left < right ? "1" : "0";
    }
  }
  // 64 bits -> 16 hex chars
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** Hamming distance between two equal-length hex hashes. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}
