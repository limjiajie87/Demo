import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'bundle');
const sources = ['backend', 'frontend', 'cli'];
const push = process.argv.slice(2).includes('--push');
if (process.argv.slice(2).some((arg) => arg !== '--push')) {
  throw new Error('Usage: node scripts/build-bundle.mjs [--push]');
}

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32' && command === 'npm.cmd',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr ?? `exit ${result.status}`}`);
  }
  return capture ? result.stdout.trim() : '';
}

function git(args, cwd = root, capture = false) {
  return run('git', args, cwd, capture);
}

function requireClean(cwd, label) {
  if (git(['status', '--porcelain', '--untracked-files=normal'], cwd, true)) {
    throw new Error(`${label} has uncommitted changes; preserve them before rebuilding`);
  }
}

if (git(['branch', '--show-current'], root, true) !== 'main') {
  throw new Error('Run this script from a main branch checkout');
}
requireClean(root, 'Superproject');
git(['submodule', 'update', '--init', '--remote', ...sources]);
git(['submodule', 'update', '--init', 'bundle']);
for (const source of sources) requireClean(join(root, source), source);
requireClean(bundle, 'Bundle');

const frontend = join(root, 'frontend');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
run(npm, ['ci'], frontend);
run(npm, ['run', 'build'], frontend);
const output = join(frontend, 'dist', 'snip-frontend', 'browser');
if (!existsSync(join(output, 'index.html'))) {
  throw new Error('Angular output is missing frontend/dist/snip-frontend/browser/index.html');
}

rmSync(join(bundle, 'public'), { recursive: true, force: true });
mkdirSync(join(bundle, 'public'), { recursive: true });
cpSync(output, join(bundle, 'public'), { recursive: true });
cpSync(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
cpSync(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
writeFileSync(join(bundle, '.env'), 'PUBLIC_DIR=./public\n');
writeFileSync(join(bundle, 'package.json'), JSON.stringify({
  name: 'snip-bundle', private: true, scripts: { start: 'bun server.js' },
}, null, 2) + '\n');
writeFileSync(join(bundle, 'Dockerfile'), 'FROM oven/bun:1-alpine\nWORKDIR /app\nCOPY . .\nENV PORT=3000\nEXPOSE 3000\nCMD ["bun", "server.js"]\n');
writeFileSync(join(bundle, '.dockerignore'), '.git\nnode_modules\n');
writeFileSync(join(bundle, 'railway.json'), JSON.stringify({ build: { builder: 'DOCKERFILE' } }, null, 2) + '\n');

git(['add', '-A'], bundle);
const bundleDiff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: bundle });
if (bundleDiff.status === 1) {
  const name = git(['config', 'user.name'], root, true);
  const email = git(['config', 'user.email'], root, true);
  git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-m',
    'Build generated Snip bundle', '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
    '-m', 'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>'], bundle);
} else if (bundleDiff.status === 0) {
  console.log('Bundle unchanged; nothing to commit.');
} else {
  throw new Error('Unable to inspect staged bundle changes');
}
git(['add', '--', ...sources, 'bundle']);
const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root });
if (diff.status === 1) {
  git(['commit', '-m', 'Update component and bundle pointers', '-m',
    'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
    '-m', 'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>']);
} else if (diff.status !== 0) {
  throw new Error('Unable to inspect staged superproject changes');
} else {
  console.log('Superproject unchanged; nothing to commit.');
}
if (push) {
  git(['push', 'origin', 'HEAD:bundle'], bundle);
  git(['push', 'origin', 'main']);
}
