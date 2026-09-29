import { fail, hash, withLock } from './auth.mjs';

const active = job => job && ['queued', 'running'].includes(job.status);
const select = (env, id) => env.DB.prepare('SELECT * FROM studio_publish_jobs WHERE id = ?1').bind(id).first();
const labels = { decisions: '正在准备发布', commit: '正在提交更新', checks: '正在检查', deploy: '正在上线', done: '已上线' };

export function jobView(row) {
  if (!row) return null;
  const payload = JSON.parse(row.payload);
  return {
    id: row.id, status: row.status, stage: row.stage, accepted: Boolean(row.dispatched), completed: row.cursor, total: payload.decisions.length,
    message: row.status === 'failed' ? '发布需要处理' : row.status === 'succeeded' ? (row.release_id ? '已上线' : '已处理，没有新的页面需要上线') : labels[row.stage],
    error: row.error || null, retryAt: row.retry_at, releaseId: row.release_id, updatedAt: row.updated_at,
    workflowUrl: row.runner_id ? `https://github.com/${row.repository}/actions/runs/${row.runner_id}` : null,
  };
}

export async function latestJob(env, identity, { repository, branch }) {
  return jobView(await env.DB.prepare('SELECT * FROM studio_publish_jobs WHERE user_id = ?1 AND repository = ?2 AND branch = ?3 ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .bind(identity.id, repository, branch).first());
}

function requestPayload(input) {
  if (input.confirmPublish !== true) throw fail('请确认发布这次更新。', 409);
  if (input.requestId != null && !/^[a-f0-9]{32}$/.test(input.requestId)) throw fail('发布请求编号无效。');
  if (!Array.isArray(input.decisions) || input.decisions.length > 200) throw fail('发布清单不完整或过大，请重新拉取。');
  const seen = new Set();
  for (const d of input.decisions) {
    if (!d || !['review', 'removal', 'removal-cancel'].includes(d.kind) || typeof d.cardLink !== 'string' || !/^heptabase:\/\/card\/[a-f0-9-]{36}$/i.test(d.cardLink) || seen.has(d.cardLink)) throw fail('发布清单中有重复或无法识别的卡片。');
    seen.add(d.cardLink);
    if (d.kind === 'review' && (!['approve', 'reject'].includes(d.decision) || (d.decision === 'approve' && d.confirmPublic !== true))) throw fail('请确认正文和全部引用可以公开。', 409);
    if (d.kind === 'removal' && d.confirmDelete !== true) throw fail('请确认要撤下的文章。', 409);
    if (d.kind !== 'removal-cancel' && ['sourceHash', 'documentHash', 'planHash'].some(k => !/^[a-f0-9]{64}$/.test(d[k]))) throw fail('请先拉取完整的审核清单。', 409);
  }
  return { requestId: input.requestId || null, decisions: input.decisions, ...(input.pageChoice ? { pageChoice: input.pageChoice } : {}), message: '发布博客更新' };
}

async function dispatch(env, row, send) {
  if (!row.dispatched && active(row)) {
    // No content, remarks or credentials go into the public Actions event/logs.
    await send(row.id);
    await env.DB.prepare('UPDATE studio_publish_jobs SET dispatched = 1, error = NULL WHERE id = ?1').bind(row.id).run();
    row.dispatched = 1;
  }
  return jobView(row);
}

export async function enqueueJob(env, identity, config, input, send) {
  const payload = requestPayload(input);
  const id = await hash(JSON.stringify([identity.id, config.repository, config.branch, payload]));
  return withLock(env, 'publish-queue', async () => {
    const existing = await select(env, id);
    if (existing) return dispatch(env, existing, send);
    const running = await env.DB.prepare("SELECT * FROM studio_publish_jobs WHERE user_id = ?1 AND repository = ?2 AND branch = ?3 AND status IN ('queued','running')")
      .bind(identity.id, config.repository, config.branch).first();
    if (running) throw fail('上一批更新仍在云端发布。完成后再发布新的更新。', 409);
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO studio_publish_jobs (id, user_id, repository, branch, payload, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)')
      .bind(id, identity.id, config.repository, config.branch, JSON.stringify(payload), now).run();
    return dispatch(env, await select(env, id), send);
  });
}

export async function retryJob(env, identity, config, id, send) {
  return withLock(env, 'publish-queue', async () => {
    const row = await select(env, id);
    if (!row || row.user_id !== identity.id || row.repository !== config.repository || row.branch !== config.branch) throw fail('没有找到这次发布。', 404);
    if (row.status === 'succeeded') return jobView(row);
    const other = await env.DB.prepare("SELECT id FROM studio_publish_jobs WHERE status IN ('queued','running') AND id != ?1").bind(id).first();
    if (other) throw fail('另一批更新正在发布，请等待它完成。', 409);
    await env.DB.prepare("UPDATE studio_publish_jobs SET status = 'queued', dispatched = 0, attempts = 0, retry_at = 0, error = NULL WHERE id = ?1").bind(id).run();
    return dispatch(env, await select(env, id), send);
  });
}

/** One durable step per cloud request. Every operation is independently retryable. */
export async function advanceJob(env, id, runnerId, ops) {
  return withLock(env, `publish-job:${id}`, async lease => {
    const row = await select(env, id);
    if (!row) throw fail('没有找到这次发布。', 404);
    if (!active(row) || row.retry_at > Date.now()) return jobView(row);
    const payload = JSON.parse(row.payload), identity = { id: row.user_id };
    const update = async changes => {
      await lease();
      Object.assign(row, changes, { updated_at: new Date().toISOString() });
      const keys = [...Object.keys(changes), 'updated_at'];
      await env.DB.prepare(`UPDATE studio_publish_jobs SET ${keys.map((key, i) => `${key} = ?${i + 1}`).join(', ')} WHERE id = ?${keys.length + 1}`)
        .bind(...keys.map(key => row[key]), id).run();
    };
    await update({ status: 'running', dispatched: 1, runner_id: runnerId || row.runner_id });
    try {
      if (row.stage === 'decisions') {
        if (payload.pageChoice && !row.page_done) {
          await ops.pages(identity, payload.pageChoice);
          await update({ page_done: 1 });
        } else if (row.cursor < payload.decisions.length) {
          const decision = payload.decisions[row.cursor], prepared = row.prepared && JSON.parse(row.prepared);
          if (decision.markReferences && !prepared) {
            await update({ prepared: JSON.stringify({ snapshot: await ops.prepareReferences(identity, decision) }) });
          } else if (prepared?.snapshot) {
            const ready = await ops.finishReferences(identity, decision, prepared.snapshot);
            await update({ prepared: JSON.stringify({ decision: ready }) });
          } else {
            await ops.decide(identity, { decisions: [prepared?.decision || decision], removalBatch: payload.decisions.filter(d => d.kind === 'removal') });
            await update({ cursor: row.cursor + 1, prepared: null });
          }
        } else await update({ stage: 'commit' });
      } else if (row.stage === 'commit') {
        const result = await ops.commit(identity, payload.message);
        if (result.pullRequest) await update({ stage: 'checks', commit_sha: result.pullRequest.sha });
        else if (result.release && ['queued', 'running'].includes(result.release.status)) await update({ stage: 'deploy', release_id: result.release.id });
        else await update({ stage: 'done', status: 'succeeded' });
      } else if (row.stage === 'checks') {
        const result = await ops.publish(identity, row.commit_sha);
        if (result.release) await update({ stage: 'deploy', release_id: result.release.id });
        else if (result.commitSha) await update({ commit_sha: result.commitSha });
      } else if (row.stage === 'deploy') {
        const release = await ops.release(row.release_id);
        if (release?.status === 'failed') throw fail('网站上线失败，请查看发布记录后重试。', 409);
        if (release?.status === 'succeeded' && !release.heptabase?.pending && !release.heptabase?.remarks?.pending) await update({ stage: 'done', status: 'succeeded' });
      }
      await update({ attempts: 0, retry_at: 0, error: null });
    } catch (error) {
      const retryable = !error.status || error.status >= 500 || error.status === 429 || error.message === '上一次操作仍在进行，请稍后再试。';
      const attempts = row.attempts + 1;
      await update({ status: retryable && attempts < 8 ? 'running' : 'failed', attempts,
        retry_at: retryable ? Date.now() + Math.min(120000, 5000 * 2 ** attempts) : 0, error: error.message });
    }
    return jobView(row);
  });
}
