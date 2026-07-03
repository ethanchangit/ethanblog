#!/usr/bin/env node
/**
 * 为 AudioClip 组件预计算波形峰值。
 * 用法: node scripts/audio-peaks.mjs public/media/xxx.wav [峰值数量]
 * 输出: 0-1 的峰值 JSON 数组，粘贴进 MDX 的 peaks prop。
 * 目前支持 PCM16 WAV；其他格式请先转成 WAV（如 ffmpeg -i in.m4a out.wav）。
 */
import { readFileSync } from 'node:fs';

const [file, countArg] = process.argv.slice(2);
if (!file) {
  console.error('用法: node scripts/audio-peaks.mjs <file.wav> [peaks=96]');
  process.exit(1);
}
const buckets = Number(countArg) || 96;
const buf = readFileSync(file);

if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
  console.error('不是 WAV 文件');
  process.exit(1);
}

// 定位 fmt 与 data chunk
let offset = 12;
let dataStart = -1;
let dataLen = 0;
let channels = 1;
let bits = 16;
while (offset < buf.length - 8) {
  const id = buf.toString('ascii', offset, offset + 4);
  const size = buf.readUInt32LE(offset + 4);
  if (id === 'fmt ') {
    channels = buf.readUInt16LE(offset + 10);
    bits = buf.readUInt16LE(offset + 22);
  } else if (id === 'data') {
    dataStart = offset + 8;
    dataLen = size;
    break;
  }
  offset += 8 + size + (size % 2);
}
if (dataStart < 0 || bits !== 16) {
  console.error('仅支持 PCM16 WAV');
  process.exit(1);
}

const samples = Math.floor(dataLen / 2 / channels);
const per = Math.floor(samples / buckets);
const peaks = [];
for (let b = 0; b < buckets; b++) {
  let max = 0;
  for (let s = b * per; s < (b + 1) * per; s += 8) {
    const v = Math.abs(buf.readInt16LE(dataStart + s * 2 * channels)) / 32768;
    if (v > max) max = v;
  }
  peaks.push(Number(max.toFixed(3)));
}
console.log(JSON.stringify(peaks));
