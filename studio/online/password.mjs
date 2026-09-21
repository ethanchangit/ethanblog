import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { passwordRecord } from './auth.mjs';

if (!process.stdin.isTTY) throw new Error('请在自己的终端运行此命令，密码不会显示或进入命令历史。');
const silent = new Writable({ write(_chunk, _encoding, next) { next(); } });
const input = createInterface({ input: process.stdin, output: silent, terminal: true });
const question = (label) => new Promise((resolve) => { process.stdout.write(label); input.question('', (value) => { process.stdout.write('\n'); resolve(value); }); });
const first = await question('设定后台密码（至少 12 个字符，不回显）：');
const second = await question('再次输入：');
input.close();
if (first !== second) throw new Error('两次密码不同。');
const record = await passwordRecord(first);
console.log('将密码摘要保存到 Cloudflare 的 ethanblog 项目，已有后台会话将失效。');
const child = spawn('npx', ['wrangler', 'pages', 'secret', 'put', 'STUDIO_PASSWORD_HASH', '--project-name=ethanblog'], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(record);
child.on('error', () => { console.error('无法启动 Cloudflare 配置工具，请检查本机环境后重试。'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
