import type { SandboxSetup, SandpackTemplate } from '@codesandbox/sandpack-client';

export type PlaygroundTemplate = 'vanilla' | 'vanilla-ts' | 'react' | 'svelte';

export interface PlaygroundFile {
  code: string;
  hidden?: boolean;
}

const TEMPLATE_MAP: Record<PlaygroundTemplate, SandpackTemplate> = {
  vanilla: 'static',
  'vanilla-ts': 'parcel',
  react: 'create-react-app',
  svelte: 'svelte',
};

const DEFAULT_ENTRY: Record<PlaygroundTemplate, string> = {
  vanilla: '/index.js',
  'vanilla-ts': '/index.ts',
  react: '/App.js',
  svelte: '/App.svelte',
};

/** 将组件 props 转为 Sandpack SandboxSetup（纯数据，可序列化）。 */
export function buildSandboxSetup(
  code: string,
  title: string,
  files: Record<string, PlaygroundFile> | undefined,
  template: PlaygroundTemplate
): SandboxSetup {
  const sandpackTemplate = TEMPLATE_MAP[template];

  if (files && Object.keys(files).length > 0) {
    const normalized: SandboxSetup['files'] = {};
    for (const [path, file] of Object.entries(files)) {
      const p = path.startsWith('/') ? path : `/${path}`;
      normalized[p] = { code: file.code, hidden: file.hidden };
    }
    return { files: normalized, template: sandpackTemplate };
  }

  const entry = title.startsWith('/') ? title : `/${title}`;
  const fallbackEntry = DEFAULT_ENTRY[template];
  const resolvedEntry = title === 'playground.js' || title === 'playground.ts' ? fallbackEntry : entry;

  const fileMap: SandboxSetup['files'] = { [resolvedEntry]: { code } };

  if (template === 'vanilla') {
    fileMap['/index.html'] = {
      code: '<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body><script src="./index.js"></script></body></html>',
      hidden: true,
    };
  }

  return {
    files: fileMap,
    template: sandpackTemplate,
    entry: resolvedEntry,
  };
}
