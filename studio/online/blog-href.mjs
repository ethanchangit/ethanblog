/** Target of the dashboard “查看博客” link. Localhost opens the Chinese sample preview. */
export function blogViewHref(hostname) {
  let host = String(hostname || '').trim().toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    host = end === -1 ? host : host.slice(1, end);
  } else if (/^[a-z0-9.-]+:\d+$/.test(host)) host = host.replace(/:\d+$/, '');
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
  return local ? '/sample-blog/' : 'https://ethanchang.io';
}
