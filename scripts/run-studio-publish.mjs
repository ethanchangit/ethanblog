import { createHmac } from 'node:crypto';

const id = process.env.STUDIO_JOB_ID;
const runnerId = process.env.GITHUB_RUN_ID;
const secret = process.env.STUDIO_SECRET;
if (!/^[a-f0-9]{64}$/.test(id) || !/^[0-9]{1,20}$/.test(runnerId) || !secret) throw new Error('Missing publication runner configuration.');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let errors = 0, last = '';
const deadline = Date.now() + 90 * 60000;
while (Date.now() < deadline) {
  let result;
  try {
    const body = JSON.stringify({ purpose: 'studio-publish', jobId: id, runnerId, timestamp: Date.now() });
    const response = await fetch('https://ethanchang.io/dashboard/api/publish/step', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(110000),
      headers: { 'content-type': 'application/json', 'x-studio-signature': createHmac('sha256', secret).update(body).digest('hex') }, body,
    });
    if ([401, 403, 404].includes(response.status)) throw Object.assign(new Error('Publication runner authorization or job is unavailable.'), { terminal: true });
    if (!response.ok) throw new Error('Publication step temporarily unavailable.');
    result = await response.json();
    if (!['queued', 'running', 'failed', 'succeeded'].includes(result.status)) throw new Error('Invalid publication progress.');
    errors = 0;
  } catch (error) {
    if (error.terminal || ++errors >= 15) throw new Error('Cloud publication paused. Resume this run or use Retry in the dashboard.');
    await pause(Math.min(60000, 5000 * errors));
    continue;
  }
  const progress = `${result.stage}: ${result.completed}/${result.total} (${result.status})`;
  if (progress !== last) { console.log(progress); last = progress; }
  if (result.status === 'succeeded') process.exit(0);
  if (result.status === 'failed') throw new Error('Publication needs attention. Private details are available in the dashboard.');
  await pause(Math.max(1000, Math.min(120000, (result.retryAt || 0) - Date.now()), ['checks', 'deploy'].includes(result.stage) ? 15000 : 0));
}
throw new Error('Publication exceeded the runner window. The saved job can be resumed.');
