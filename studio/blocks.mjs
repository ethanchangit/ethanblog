/**
 * Ensure DocList / DocRef are imported when Heptabase card mentions become embed blocks.
 * Used by the online dashboard's content conversion. The local block editor is gone.
 */

export const MEDIA_IMPORT = "import { DocList, DocRef } from '@/components/media';";

export function ensureMediaImport(imports) {
  const lines = String(imports ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const fromMedia = lines.find((line) => line.includes("@/components/media"));
  if (!fromMedia) return [MEDIA_IMPORT, ...lines].join('\n');
  const names = new Set();
  const named = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/media['"]/.exec(fromMedia);
  if (named) {
    for (const part of named[1].split(',')) names.add(part.trim());
  }
  names.add('DocList');
  names.add('DocRef');
  const merged = `import { ${[...names].join(', ')} } from '@/components/media';`;
  return lines.map((line) => (line === fromMedia ? merged : line)).join('\n');
}
