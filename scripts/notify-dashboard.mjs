// Called only after the tested deployment is verified. No password or token output.
import { signReceipt } from '../studio/online/release-sync.mjs';
const secret = process.env.STUDIO_SECRET;
if (!secret) throw new Error('Configure STUDIO_SECRET in GitHub and Cloudflare before enabling dashboard publication.');
const body = JSON.stringify({ commitSha: process.env.GITHUB_SHA, timestamp: Date.now() });
for (let attempt = 0; attempt < 5; attempt++) {
  const response = await fetch('https://ethanchang.io/dashboard/api/deployed', {
    method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { 'content-type': 'application/json', 'x-studio-signature': await signReceipt(secret, body) },
  });
  if (response.ok) { console.log('Dashboard publication and Heptabase metadata confirmed.'); process.exit(0); }
  if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 5000));
}
throw new Error('The site was deployed, but the dashboard receipt needs attention. Open the dashboard to retry metadata synchronization.');
