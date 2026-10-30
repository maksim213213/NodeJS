# Lab 1 Standard Library

This command-line program creates a gzip-compressed tar archive when the names of files directly inside a source directory change. It uses the Node.js standard library and the system `tar` executable. TypeScript and ts-node are development tools only.

## Requirements

- Node.js 22 or newer and npm.
- GNU tar or bsdtar on `PATH`, with support for `--null` and `-T`.

Check the available tools:

```powershell
node --version
npm.cmd --version
tar --version
```

## Install and run

Open PowerShell in this project directory:

```powershell
cd "$env:USERPROFILE\Documents\NodeJS\Lab1"
npm.cmd install
npm.cmd start -- ./source ./backups
```

The direct invocation from the assignment also works with the locally installed ts-node:

```powershell
npx.cmd ts-node ./src/index.ts ./source ./backups
```

Some Windows builds of the system tar fail on Cyrillic filenames. If Git for Windows is installed in its default location, select its GNU tar for the current PowerShell session:

```powershell
$env:TAR_COMMAND = 'C:\Program Files\Git\usr\bin\tar.exe'
$env:Path = 'C:\Program Files\Git\usr\bin;' + $env:Path
npm.cmd start -- ./source ./backups
```

`TAR_COMMAND` is optional; by default the program runs `tar` from `PATH`. The added Git directory also makes GNU tar's `gzip` helper available. No system settings are changed. The included compatibility test checks Cyrillic filenames using Git's tar when available on Windows.

Exactly two arguments are required. Relative paths are resolved from the current working directory. Put paths containing spaces in quotes.

Run the same command again to get `SKIPPED: No changes detected`. Add a file to the sample source directory, then run it again to create another archive:

```powershell
Set-Content -LiteralPath ./source/new-file.txt -Value 'New file'
npm.cmd start -- ./source ./backups
```

## Behavior

1. Create the backup directory if necessary.
2. Read only regular files directly inside the source directory. Ignore subdirectories and symbolic links.
3. Sort their names, serialize the list with `JSON.stringify`, and calculate its SHA-256 hash.
4. Read the most recent `HASH: ` line from `backup_log.txt` in the backup directory. A missing log means this is the first run.
5. Skip archiving when the hashes match.
6. Otherwise, run `tar` and archive exactly the listed files. Empty source directories produce valid empty archives.
7. Append the success result and new hash to the log only after `tar` succeeds.
8. On failure, append a `FAILED` entry and set a nonzero exit code. A failed `tar` command does not update the saved hash, and any partially created archive is removed.

The archive name includes an ISO timestamp with colons and the decimal point replaced by hyphens, for example `backup-2026-10-16T12-30-45-123Z.tar.gz`.

The tar arguments `-c`, `-z`, and `-f` create a gzip-compressed archive at the specified path. `-C` selects the source directory. `-T -` reads the filename list from standard input, and `--null` makes the list NUL-separated. Each filename is prefixed with `./`. The program launches tar directly with an argument array.

Tar runs with the backup directory as its working directory and receives the archive's basename. This also supports GNU tar on Windows without interpreting a drive letter in the archive path as a remote hostname.

Example log:

```text
2026-10-16T12:30:45.123Z: SUCCESS: Backup created
HASH: <64 hexadecimal SHA-256 characters>
2026-10-16T12:31:45.123Z: SKIPPED: No changes detected
2026-10-16T12:32:45.123Z: FAILED: tar command failed
```

## Assignment limits

Changing a file's contents without changing its name does not trigger a backup. Adding, deleting, or renaming a top-level regular file does trigger one. Changes inside subdirectories are ignored.

Use a dedicated backup directory for each source directory, and run one instance at a time. The log stores one sequence of filename hashes. The source and backup directories must be different; storing backups outside the source directory is recommended. If the backup directory or log is not writable, the program reports the failure in the terminal because it cannot write the log. Invalid command-line arguments are also reported in the terminal.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
```

Tests run the compiled CLI in temporary directories. They verify first-run backups, unchanged filenames, content-only changes, added/deleted/renamed files, ignored nested files, empty sources, paths and names with spaces and Unicode, command-line validation, and failure recovery after tar is unavailable. They also check archive contents and extraction.

Build and run the JavaScript version:

```powershell
npm.cmd run build
node ./dist/index.js ./source ./backups
```

## Files

- `src/index.ts`: complete application code.
- `source/`: sample input files.
- `test/backup.test.cjs`: integration tests using `node:test`.
- `tsconfig.json`: TypeScript compiler settings.
- `package.json`: npm commands and development dependencies.
- `backups/`: generated archives and `backup_log.txt`, created by the first run.
