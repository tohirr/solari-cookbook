/**
 * Enough PNG to crop a Chrome screenshot to what was drawn. Chrome needs a
 * window height up front and the pages are set in a webfont it does not wait
 * for, so shots are taken tall, the last row that is not the page background
 * is found, and the image is cut there. Chrome writes 8-bit RGB or RGBA,
 * non-interlaced; that is all this reads and writes. (sips cannot do the cut:
 * every form of its crop is centred.)
 */
import zlib from "node:zlib";

interface Decoded { w: number; h: number; bpp: number; colorType: number; rows: Buffer[] }

function decode(png: Buffer): Decoded {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), colorType = png[25];
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (png[24] !== 8 || !bpp || png[28] !== 0) throw new Error("unexpected PNG layout from Chrome");
  const idat: Buffer[] = [];
  for (let off = 8; off < png.length;) {
    const len = png.readUInt32BE(off), type = png.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (f === 1) row[i] += a; else if (f === 2) row[i] += b; else if (f === 3) row[i] += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); row[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    }
    rows.push(row); prev = row;
  }
  return { w, h, bpp, colorType, rows };
}

/** The last row that is not the background, plus padding. */
export function contentHeight(png: Buffer, paper: [number, number, number], pad = 28): number {
  const { w, h, bpp, rows } = decode(png);
  let last = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const i = x * bpp;
      if (Math.abs(row[i] - paper[0]) + Math.abs(row[i + 1] - paper[1]) + Math.abs(row[i + 2] - paper[2]) > 24) { last = y; return; }
    }
  });
  return Math.min(h, last + pad);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf: Buffer) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** The top `height` rows of the image, as a new PNG. */
export function cropPng(png: Buffer, height: number): Buffer {
  const { w, h, bpp, colorType, rows } = decode(png);
  const keep = Math.min(h, height);
  const raw = Buffer.concat(rows.slice(0, keep).map((r) => Buffer.concat([Buffer.from([0]), r])));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(keep, 4); ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  void bpp;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
