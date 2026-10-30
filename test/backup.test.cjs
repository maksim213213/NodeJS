const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { delimiter, join, resolve } = require('node:path');
const { test } = require('node:test');

const cliPath = resolve(__dirname, '../dist/index.js');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lab1-backup-'));
  const source = join(root, 'source files');
  const backups = join(root, 'backup files');
  mkdirSync(source);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, source, backups, log: join(backups, 'backup_log.txt') };
}

function run(source, backups, options = {}) {
  return spawnSync(process.execPath, [cliPath, source, backups], {
    encoding: 'utf8',
    ...options,
  });
}

function archives(backups) {
  return readdirSync(backups).filter((name) => name.endsWith('.tar.gz'));
}

function savedHashes(log) {
  return readFileSync(log, 'utf8').split('\n').filter((line) => line.startsWith('HASH: '));
}

test('first run archives only top-level files and persists the correct hash', (t) => {
  const { root, source, backups, log } = fixture(t);
  const names = ['z-last.txt', 'hello world.txt', '-option.txt', 'example.txt'];
  names.forEach((name) => writeFileSync(join(source, name), `Contents of ${name}`, 'utf8'));
  mkdirSync(join(source, 'nested'));
  writeFileSync(join(source, 'nested', 'ignored.txt'), 'Do not archive');

  const result = run(source, backups);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SUCCESS: Backup created/);
  const [archive] = archives(backups);
  assert.equal(archives(backups).length, 1);
  assert.match(archive, /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.tar\.gz$/);
  const expectedHash = createHash('sha256').update(JSON.stringify([...names].sort())).digest('hex');
  assert.deepEqual(savedHashes(log), [`HASH: ${expectedHash}`]);

  const entries = execFileSync('tar', ['-tzf', join(backups, archive)], { encoding: 'utf8' })
    .trim().split(/\r?\n/).map((name) => name.replace(/^\.\//, '')).sort();
  assert.deepEqual(entries, [...names].sort());
  const extracted = join(root, 'extracted');
  mkdirSync(extracted);
  execFileSync('tar', ['-xzf', join(backups, archive), '-C', extracted]);
  names.forEach((name) => assert.equal(readFileSync(join(extracted, name), 'utf8'), `Contents of ${name}`));
});

test('unchanged filenames and content-only or nested changes are skipped', (t) => {
  const { source, backups, log } = fixture(t);
  writeFileSync(join(source, 'one.txt'), 'Before');
  assert.equal(run(source, backups).status, 0);
  assert.match(run(source, backups).stdout, /SKIPPED: No changes detected/);
  writeFileSync(join(source, 'one.txt'), 'After');
  mkdirSync(join(source, 'nested'));
  writeFileSync(join(source, 'nested', 'new.txt'), 'Ignored');
  const result = run(source, backups);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SKIPPED: No changes detected/);
  assert.equal(archives(backups).length, 1);
  assert.equal(savedHashes(log).length, 1);
  assert.equal(readFileSync(log, 'utf8').match(/SKIPPED:/g).length, 2);
});

test('Unicode filenames work with a Unicode-capable tar selected through TAR_COMMAND', (t) => {
  const { root, source, backups } = fixture(t);
  const env = { ...process.env };
  let tarCommand = env.TAR_COMMAND || 'tar';
  if (process.platform === 'win32' && !env.TAR_COMMAND) {
    const gitBin = join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin');
    tarCommand = join(gitBin, 'tar.exe');
    if (!existsSync(tarCommand)) {
      t.skip('Set TAR_COMMAND to a Unicode-capable tar to run this compatibility test');
      return;
    }
    env.TAR_COMMAND = tarCommand;
    env.PATH = `${gitBin}${delimiter}${process.env.PATH || ''}`;
  }
  const name = 'Пример.txt';
  writeFileSync(join(source, name), 'Unicode filename contents', 'utf8');
  const result = run(source, backups, { env });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const [archive] = archives(backups);
  const extracted = join(root, 'unicode-extracted');
  mkdirSync(extracted);
  execFileSync(tarCommand, ['-xzf', archive, '-C', extracted], { cwd: backups, env });
  assert.equal(readFileSync(join(extracted, name), 'utf8'), 'Unicode filename contents');
});

test('adding, deleting, and renaming a file each create a new backup', (t) => {
  const { source, backups, log } = fixture(t);
  writeFileSync(join(source, 'one.txt'), 'One');
  assert.equal(run(source, backups).status, 0);
  writeFileSync(join(source, 'two.txt'), 'Two');
  assert.equal(run(source, backups).status, 0);
  rmSync(join(source, 'one.txt'));
  assert.equal(run(source, backups).status, 0);
  renameSync(join(source, 'two.txt'), join(source, 'renamed.txt'));
  assert.equal(run(source, backups).status, 0);
  assert.equal(archives(backups).length, 4);
  assert.equal(savedHashes(log).length, 4);
});

test('an empty source produces an empty archive and the next run is skipped', (t) => {
  const { source, backups } = fixture(t);
  assert.equal(run(source, backups).status, 0);
  const [archive] = archives(backups);
  assert.equal(execFileSync('tar', ['-tzf', join(backups, archive)], { encoding: 'utf8' }), '');
  assert.match(run(source, backups).stdout, /SKIPPED: No changes detected/);
});

test('a missing source is logged as a failure without saving a hash', (t) => {
  const { root, backups, log } = fixture(t);
  const result = run(join(root, 'missing'), backups);
  assert.equal(result.status, 1);
  assert.match(readFileSync(log, 'utf8'), /FAILED: .*ENOENT/);
  assert.deepEqual(savedHashes(log), []);
  assert.deepEqual(archives(backups), []);
});

test('tar failure preserves the previous hash and the next working run retries', (t) => {
  const { root, source, backups, log } = fixture(t);
  writeFileSync(join(source, 'one.txt'), 'One');
  assert.equal(run(source, backups).status, 0);
  const originalHashes = savedHashes(log);
  writeFileSync(join(source, 'two.txt'), 'Two');
  const emptyPath = join(root, 'empty-path');
  mkdirSync(emptyPath);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  delete env.TAR_COMMAND;
  env.PATH = emptyPath;

  const failed = run(source, backups, { env });
  assert.equal(failed.status, 1);
  assert.match(readFileSync(log, 'utf8'), /FAILED: tar command failed/);
  assert.deepEqual(savedHashes(log), originalHashes);
  assert.equal(archives(backups).length, 1);
  const retried = run(source, backups);
  assert.equal(retried.status, 0, retried.stderr);
  assert.match(retried.stdout, /SUCCESS: Backup created/);
  assert.equal(archives(backups).length, 2);
  assert.equal(savedHashes(log).length, 2);
});

test('a backup destination that is a file reports its logging failure', (t) => {
  const { root, source } = fixture(t);
  const destination = join(root, 'not-a-directory');
  writeFileSync(destination, 'Keep this file');
  const result = run(source, destination);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAILED:/);
  assert.match(result.stderr, /Could not write log:/);
  assert.equal(readFileSync(destination, 'utf8'), 'Keep this file');
});

test('source and backup directories cannot be the same', (t) => {
  const { source } = fixture(t);
  const result = run(source, source);
  assert.equal(result.status, 1);
  assert.match(readFileSync(join(source, 'backup_log.txt'), 'utf8'), /directories must be different/);
  assert.deepEqual(archives(source), []);
});

test('missing and extra arguments produce usage errors', () => {
  for (const args of [[], ['./source'], ['./source', './backups', 'extra']]) {
    const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
});
