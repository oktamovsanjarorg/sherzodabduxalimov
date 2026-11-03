import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import type { MediaPaths } from "./paths";

export interface ProbeResult {
  durationSec: number;
  height: number;
  hasAudio: boolean;
}

function run(cmd: string, args: string[], onStdout?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let buf = "";
    p.stdout.on("data", (d: Buffer) => {
      const s = d.toString();
      out += s;
      if (onStdout) {
        buf += s;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        lines.forEach(onStdout);
      }
    });
    p.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${code}: ${err.trim().split("\n").slice(-3).join(" | ")}`))));
  });
}

export async function probe(file: string): Promise<ProbeResult> {
  const json = JSON.parse(
    await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,height:format=duration", "-of", "json", file]),
  ) as { streams?: { codec_type: string; height?: number }[]; format?: { duration?: string } };
  const video = json.streams?.find((s) => s.codec_type === "video");
  if (!video?.height) throw new Error("Faylda video oqimi topilmadi");
  return {
    durationSec: Math.round(Number(json.format?.duration ?? 0)),
    height: video.height,
    hasAudio: Boolean(json.streams?.some((s) => s.codec_type === "audio")),
  };
}

/** Manba sifatiga qarab variantlar: kichik videoni kattalashtirmaymiz */
export function pickVariants(height: number): { name: string; height: number; crf: number }[] {
  if (height >= 720) return [{ name: "720p", height: 720, crf: 23 }, { name: "480p", height: 480, crf: 24 }];
  if (height >= 480) return [{ name: "480p", height: 480, crf: 23 }];
  return [{ name: "360p", height: height - (height % 2), crf: 23 }];
}

/**
 * original.bin dan AES-128 shifrlangan HLS yasaydi.
 * Kalit hls/ papkasidan tashqarida saqlanadi va faqat token bilan /api/media/:id/key orqali beriladi.
 */
export async function transcode(paths: MediaPaths, id: string, onProgress: (pct: number) => void) {
  const src = paths.original(id);
  const info = await probe(src);
  const variants = pickVariants(info.height);

  await rm(paths.hls(id), { recursive: true, force: true });
  const key = randomBytes(16);
  const iv = randomBytes(16).toString("hex");
  await writeFile(paths.key(id), key, { mode: 0o600 });
  // keyinfo: 1-qator: pleylistga yoziladigan URI (API keyin qayta yozadi); 2-qator: kalit fayli; 3-qator: IV
  await writeFile(paths.keyInfo(id), `key\n${paths.key(id)}\n${iv}\n`, { mode: 0o600 });

  const totalUs = Math.max(1, info.durationSec) * 1_000_000 * variants.length;
  let doneUs = 0;

  for (const v of variants) {
    const dir = paths.variantDir(id, v.name);
    await mkdir(dir, { recursive: true });
    const args = [
      "-y", "-hide_banner", "-loglevel", "error", "-nostdin",
      "-i", src,
      "-map", "0:v:0", ...(info.hasAudio ? ["-map", "0:a:0"] : []),
      "-vf", `scale=-2:${v.height}`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", String(v.crf), "-profile:v", "main", "-pix_fmt", "yuv420p",
      "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
      ...(info.hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : []),
      "-hls_time", "6", "-hls_playlist_type", "vod",
      "-hls_key_info_file", paths.keyInfo(id),
      "-hls_segment_filename", `${dir}/seg_%04d.ts`,
      "-progress", "pipe:1",
      `${dir}/index.m3u8`,
    ];
    let lastPct = -1;
    await run("ffmpeg", args, (line) => {
      const m = /^out_time_us=(\d+)/.exec(line);
      if (!m) return;
      const pct = Math.min(99, Math.floor(((doneUs + Number(m[1])) / totalUs) * 100));
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress(pct);
      }
    });
    doneUs += info.durationSec * 1_000_000;
  }

  await rm(paths.keyInfo(id), { force: true });
  return { durationSec: info.durationSec, variants: variants.map((v) => v.name) };
}
