/** True for the dev server's own machine. Production dashboard login does not use this. */
export function isLocalHost(hostHeader) {
  const hostname = String(hostHeader ?? '')
    .replace(/^\[/, '')
    .replace(/\]:\d+$/, '')
    .replace(/:\d+$/, '')
    .replace(/\]$/, '');
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '';
}
