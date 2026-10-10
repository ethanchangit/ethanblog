#!/usr/bin/env node
/**
 * Keeps the Cloudflare side of the blog's hosts in place. Idempotent; runs on every deploy.
 * - ethanchang.io       the blog (already the Pages project's custom domain)
 * - cn.ethanchang.io    old Chinese host; the Worker 301s it to ethanchang.io (src/lib/hosts.ts)
 * - www.ethanchang.io   the Worker 301s it to ethanchang.io as well
 * Each extra host is attached to the Pages project with a proxied CNAME to ethanblog.pages.dev.
 * Needs CLOUDFLARE_API_TOKEN with Pages edit and DNS edit on ethanchang.io, and CLOUDFLARE_ACCOUNT_ID.
 * A host that fails is reported as a warning and the others are still checked.
 */
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const PROJECT = 'ethanblog';
const ZONE = 'ethanchang.io';
const DOMAINS = [
  { name: 'cn.ethanchang.io', record: 'cn', comment: 'Old Chinese host, redirects to ethanchang.io (ethanblog Pages)' },
  { name: 'www.ethanchang.io', record: 'www', comment: 'Redirects to ethanchang.io (ethanblog Pages)' },
];

if (!token || !account) {
  console.error('ensure-domains: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.');
  process.exit(1);
}

async function api(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const reason = (body.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || response.statusText;
    throw new Error(`${init.method || 'GET'} ${path} failed (${response.status}): ${reason}`);
  }
  return body.result;
}

const attached = await api(`/accounts/${account}/pages/projects/${PROJECT}/domains`);
const zones = await api(`/zones?name=${ZONE}`);
if (!zones?.length) throw new Error(`Zone ${ZONE} is not in this Cloudflare account.`);
const zone = zones[0].id;
const target = `${PROJECT}.pages.dev`;

let failed = 0;
for (const { name, record, comment } of DOMAINS) {
  try {
    if (!attached.some((domain) => domain.name === name)) {
      await api(`/accounts/${account}/pages/projects/${PROJECT}/domains`, { method: 'POST', body: JSON.stringify({ name }) });
      console.log(`Attached ${name} to Pages project ${PROJECT}.`);
    }
    const records = await api(`/zones/${zone}/dns_records?name=${name}`);
    const cname = records.find((r) => r.type === 'CNAME');
    if (!records.length) {
      await api(`/zones/${zone}/dns_records`, { method: 'POST', body: JSON.stringify({ type: 'CNAME', name: record, content: target, proxied: true, comment }) });
      console.log(`Created CNAME ${name} -> ${target}.`);
    } else if (!cname || cname.content !== target) {
      console.log(`::warning::${name} already has DNS records that do not point at ${target}; left unchanged.`);
    }
    const domain = await api(`/accounts/${account}/pages/projects/${PROJECT}/domains/${name}`);
    console.log(`${name}: ${domain.status}${domain.status === 'active' ? '' : ' (certificate and verification can take a few minutes)'}`);
  } catch (error) {
    failed += 1;
    console.log(`::warning::${name} is not set up: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
