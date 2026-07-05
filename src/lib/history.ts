/**
 * 版本历史即媒介（Upwelling/Patchwork）：把一篇故事的 git 提交史变成可读的成长时间线。
 * 只在构建期（.astro frontmatter）调用——execSync 永远不会进客户端 bundle。
 * 提交信息约定（.claude/skills/publish/SKILL.md）：
 *   首次发布  publish: <slug> — <一句话意图>
 *   修订      revise: <slug> — <改了什么/为什么>
 */
import { execSync } from 'node:child_process';

export interface CommitInfo {
  hash: string;
  /** ISO 8601 提交时间 */
  date: string;
  /** 提交信息首行（publish:/revise: 前缀已剥掉） */
  subject: string;
  kind: 'publish' | 'revise' | 'other';
}

export function getFileHistory(filePath?: string): CommitInfo[] {
  if (!filePath) return [];
  try {
    const out = execSync(
      `git log --follow --format=%h%x09%cI%x09%s -- ${JSON.stringify(filePath)}`,
      { encoding: 'utf8' }
    );
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, date, ...rest] = line.split('\t');
        const raw = rest.join('\t');
        const m = /^(publish|revise):\s*(.*)$/.exec(raw);
        return {
          hash,
          date,
          subject: m ? m[2] : raw,
          kind: (m ? m[1] : 'other') as CommitInfo['kind'],
        };
      });
  } catch {
    // 无 .git、git 不可用、浅克隆等场景：静默隐藏区块，构建照常
    return [];
  }
}
