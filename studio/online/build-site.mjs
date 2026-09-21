import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const onlineRoot = path.join(repo, 'studio/online');
const clientOut = path.join(repo, '.studio-build/client');
const serverOut = path.join(repo, '.studio-build/server');

async function files(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(full, relative));
    else out.push({ relative, full });
  }
  return out;
}

await viteBuild({
  root: onlineRoot,
  base: '/dashboard/',
  configFile: false,
  plugins: [tailwindcss()],
  resolve: { alias: { '@': path.join(repo, 'src') } },
  build: {
    outDir: clientOut,
    emptyOutDir: true,
    rollupOptions: { input: path.join(onlineRoot, 'index.html') },
  },
});

const assets = {};
// Built by Astro from the real Doc and Card components, not a second layout.
assets['preview.html'] = { text: await readFile(path.join(repo, 'dist/dashboard/preview/index.html'), 'utf8') };
for (const item of await files(clientOut)) {
  const bytes = await readFile(item.full);
  assets[item.relative] = /\.(?:woff2?|png|jpg|jpeg|gif|webp|ico)$/i.test(item.relative)
    ? { binary: bytes.toString('base64') }
    : { text: bytes.toString('utf8') };
}

const generated = `const decode = (value) => { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); };\nexport const assets = ${JSON.stringify(assets)};\nfor (const [key, value] of Object.entries(assets)) if (value && value.binary) assets[key] = decode(value.binary); else if (value && Object.hasOwn(value, 'text')) assets[key] = value.text;\n`;
await writeFile(path.join(onlineRoot, 'assets.generated.mjs'), generated);
await mkdir(serverOut, { recursive: true });
await esbuild({
  entryPoints: [path.join(onlineRoot, 'worker.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: path.join(serverOut, 'index.js'),
  sourcemap: false,
});
