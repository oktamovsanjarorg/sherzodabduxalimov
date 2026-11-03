import { resolve, join } from "node:path";

const ID_RE = /^[a-z0-9]{20,40}$/; // cuid
const VARIANT_RE = /^(1080p|720p|480p|360p)$/;
const SEG_RE = /^seg_\d{4,6}\.ts$/;

export const isVideoId = (s: string) => ID_RE.test(s);
export const isVariant = (s: string) => VARIANT_RE.test(s);
export const isSegment = (s: string) => SEG_RE.test(s);

/** Video fayllari joylashuvi. Barcha id'lar regex bilan tekshiriladi: "../" orqali disk bo'ylab yurib bo'lmaydi. */
export class MediaPaths {
  readonly root: string;
  constructor(mediaDir: string) {
    this.root = resolve(mediaDir);
  }
  private check(id: string) {
    if (!isVideoId(id)) throw new Error("bad video id");
    return id;
  }
  dir(id: string) {
    return join(this.root, "videos", this.check(id));
  }
  original(id: string) {
    return join(this.dir(id), "original.bin");
  }
  key(id: string) {
    return join(this.dir(id), "enc.key"); // hls/ papkasidan TASHQARIDA: nginx uni hech qachon bermaydi
  }
  keyInfo(id: string) {
    return join(this.dir(id), "enc.keyinfo");
  }
  hls(id: string) {
    return join(this.dir(id), "hls");
  }
  variantDir(id: string, variant: string) {
    if (!isVariant(variant)) throw new Error("bad variant");
    return join(this.hls(id), variant);
  }
  playlist(id: string, variant: string) {
    return join(this.variantDir(id, variant), "index.m3u8");
  }
  segment(id: string, variant: string, seg: string) {
    if (!isSegment(seg)) throw new Error("bad segment");
    return join(this.variantDir(id, variant), seg);
  }
}
