// A PNG encoder in fifty lines.
//
// Lifted out of `make-logo.mjs` when a second tool needed it. Node has zlib
// built in, and truecolour-with-alpha at filter 0 is the whole format for our
// purposes — the images this writes are tiny and every one of them is pixel
// art, so there is nothing for a filter or a palette to win.

import { deflateSync } from 'node:zlib';

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const payload = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(payload));
  return Buffer.concat([len, payload, crc]);
}

/** A `makePix` buffer to PNG bytes. */
export function toPNG(pix) {
  const stride = pix.w * 4;
  const raw = Buffer.alloc((stride + 1) * pix.h);
  for (let y = 0; y < pix.h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none. The images are tiny.
    Buffer.from(pix.data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pix.w, 0);
  ihdr.writeUInt32BE(pix.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
