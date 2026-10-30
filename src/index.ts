import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const [sourcePath, backupPath, ...extraArguments] = process.argv.slice(2);

if (!sourcePath || !backupPath || extraArguments.length > 0) {
  console.error('Usage: ts-node ./src/index.ts <source-directory> <backup-directory>');
  process.exit(1);
}

const sourceDir = resolve(sourcePath);
const backupDir = resolve(backupPath);
const logFilePath = join(backupDir, 'backup_log.txt');
const tarCommand = process.env.TAR_COMMAND || 'tar';

function writeLog(message: string, hash?: string): void {
  const line = `${new Date().toISOString()}: ${message}`;
  const hashLine = hash ? `HASH: ${hash}\n` : '';
  appendFileSync(logFilePath, `${line}\n${hashLine}`, 'utf8');
  console.log(line);
}

function readPreviousHash(): string | undefined {
  try {
    const lines = readFileSync(logFilePath, 'utf8').split('\n');
    return lines.reverse().find((line) => line.startsWith('HASH: '))?.slice(6);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

try {
  mkdirSync(backupDir, { recursive: true });

  if (sourceDir === backupDir) {
    throw new Error('Source and backup directories must be different');
  }

  const fileNames = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const currentHash = createHash('sha256')
    .update(JSON.stringify(fileNames))
    .digest('hex');

  if (currentHash === readPreviousHash()) {
    writeLog('SKIPPED: No changes detected');
  } else {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilePath = join(backupDir, `backup-${timestamp}.tar.gz`);

    try {
      execFileSync(
        tarCommand,
        ['-czf', basename(backupFilePath), '-C', sourceDir, '--null', '-T', '-'],
        {
          cwd: backupDir,
          input: fileNames.map((name) => `./${name}\0`).join(''),
          stdio: ['pipe', 'ignore', 'pipe'],
          windowsHide: true,
        },
      );
    } catch {
      rmSync(backupFilePath, { force: true });
      throw new Error('tar command failed');
    }

    writeLog('SUCCESS: Backup created', currentHash);
    console.log(`Archive: ${backupFilePath}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  try {
    writeLog(`FAILED: ${message}`);
  } catch {
    console.error(`FAILED: ${message}`);
    console.error(`Could not write log: ${logFilePath}`);
  }

  process.exitCode = 1;
}
