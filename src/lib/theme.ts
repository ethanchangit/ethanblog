export const THEME_STORAGE_KEY = 'theme';

export type Theme = 'light' | 'dark';

export const THEME_COLORS: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#191919',
};

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

export function getStoredTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta#theme-color');
  if (meta) meta.content = THEME_COLORS[theme];
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const current = (document.documentElement.dataset.theme as Theme | undefined) ?? 'light';
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

let started = false;

export function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(resolveTheme(getStoredTheme(), prefersDark));

  if (started) return;
  started = true;

  document.addEventListener('astro:after-swap', () => {
    applyTheme(
      resolveTheme(getStoredTheme(), window.matchMedia('(prefers-color-scheme: dark)').matches),
    );
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (!getStoredTheme()) {
      applyTheme(event.matches ? 'dark' : 'light');
    }
  });
}
