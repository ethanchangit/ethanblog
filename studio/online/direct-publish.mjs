/**
 * 「直接发布」 publishes every pending update in this pull, with no second confirm.
 * Commit and publish still run, and already rejected or skipped cards stay that way.
 */
export function directPublishPlan({ pulled, items = [], git = {} }) {
  if (!pulled) return { ok: false, message: '请先拉取最新更新。当前没有可发布的内容。' };
  const ready = items.filter(item => item?.plan && !item.error);
  const approve = ready.filter(item => !item.removal && item.decision !== 'reject' && item.decision !== 'approve');
  const remove = ready.filter(item => item.removal && item.decision !== 'skip' && item.decision !== 'remove');
  // Already chosen on this page, but not yet sent. Publish must commit them.
  const staged = ready.filter(item => !item.flushed && (item.decision === 'approve' || item.decision === 'remove'));
  const drafts = Number(git.draftCount) || 0;
  if (!approve.length && !remove.length && !staged.length && !drafts && !git.pullRequest) {
    return { ok: false, message: '没有可发布的更新。' };
  }
  return { ok: true, approve, remove, staged, commit: approve.length + remove.length + staged.length + drafts > 0, publish: true };
}

/** Text the release bar shows for this click. A blocked plan is never silent. */
export function directPublishFeedback(plan) {
  if (!plan?.ok) return { error: true, message: plan?.message || '没有可发布的更新。' };
  return { error: false, message: '正在直接发布…' };
}
