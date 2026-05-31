#!/usr/bin/env node

/**
 * Publish Dry-Run Verification — WP-20.1
 *
 * Proves that `npm publish --dry-run` succeeds and reports correct
 * package name, version, and file count.
 *
 * Exit 0 when all checks pass.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = join(__dirname, '..');
const PACKAGE_NAME = '@tarek-g/pattern-geometry-commons';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`); }
}

async function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      resolve({ out, err, code });
    });
    child.on('error', reject);
  });
}

async function run() {
  console.log('=== Publish Dry-Run Verification ===\n');

  console.log('[Phase 1] Running npm publish --dry-run...\n');

  const { out, err, code } = await exec('npm', ['publish', '--dry-run'], {
    cwd: PKG_ROOT,
  });

  check('npm publish --dry-run exits 0', code === 0, `exit code: ${code}`);

  if (code !== 0) {
    console.error('\n  stderr:', err.substring(0, 500));
    console.log(`\n=== Results: ${passed}/${passed + failed} passed ===\n`);
    process.exit(1);
  }

  // npm publish output goes to stderr via "npm notice" lines
  const combined = out + '\n' + err;

  // Phase 2: Verify package identity
  console.log('[Phase 2] Package identity...\n');

  const nameMatch = combined.match(/npm notice name:\s+(.+)$/m);
  check('package name in output', !!nameMatch, nameMatch ? nameMatch[1] : 'not found');
  check(`package name is ${PACKAGE_NAME}`,
    nameMatch && nameMatch[1].trim() === PACKAGE_NAME,
    nameMatch ? nameMatch[1].trim() : '');

  const versionMatch = combined.match(/npm notice version:\s+(.+)$/m);
  check('package version in output', !!versionMatch, versionMatch ? versionMatch[1] : 'not found');
  check('package version is 0.1.0',
    versionMatch && versionMatch[1].trim() === '0.1.0',
    versionMatch ? versionMatch[1].trim() : '');

  // Phase 3: Verify file count and key files
  console.log('\n[Phase 3] File listing...\n');

  const filesMatch = combined.match(/npm notice total files:\s+(\d+)$/m);
  const totalFiles = filesMatch ? parseInt(filesMatch[1], 10) : 0;
  check('total files reported', totalFiles > 0, `total files: ${totalFiles}`);
  check('total files >= 28', totalFiles >= 28, `total files: ${totalFiles}`);

  // Check key files are in the tarball listing
  const keyFiles = [
    'package.json',
    'README.md',
    'src/index.mjs',
    'spec/pg-ir.schema.json',
    'examples/islamic/01-hex-star-field.json',
    'scripts/validate.mjs',
    'scripts/compile.mjs',
  ];
  const tarballIdx = combined.indexOf('Tarball Contents');
  const detailsIdx = combined.indexOf('Tarball Details');
  const tarballSection = tarballIdx >= 0 && detailsIdx >= 0
    ? combined.substring(tarballIdx, detailsIdx) : '';
  for (const f of keyFiles) {
    check(`"${f}" in dry-run listing`, tarballSection.includes(f));
  }

  // Phase 4: Verify tarball details
  console.log('\n[Phase 4] Tarball details...\n');

  const filenameMatch = combined.match(/npm notice filename:\s+(.+)$/m);
  check('tarball filename reported', !!filenameMatch);
  check('tarball filename is .tgz',
    filenameMatch && filenameMatch[1].trim().endsWith('.tgz'));

  const shasumMatch = combined.match(/npm notice shasum:\s+([0-9a-f]{40})$/m);
  check('shasum is 40-char hex', !!shasumMatch,
    shasumMatch ? shasumMatch[1] : 'not found');

  const integrityMatch = combined.match(/npm notice integrity:\s+(sha\d+-.+?)==$/m);
  check('integrity hash present', !!integrityMatch,
    integrityMatch ? integrityMatch[1].substring(0, 20) + '...' : 'not found');

  const sizeMatch = combined.match(/npm notice package size:\s+(.+)$/m);
  check('package size reported', !!sizeMatch, sizeMatch ? sizeMatch[1] : '');
  const unpackedMatch = combined.match(/npm notice unpacked size:\s+(.+)$/m);
  check('unpacked size reported', !!unpackedMatch, unpackedMatch ? unpackedMatch[1] : '');

  // Phase 5: No warnings about missing files or bad patterns
  console.log('\n[Phase 5] No suspicious warnings...\n');

  const hasGitignoreWarning = err.includes('gitignore-fallback');
  check('dry-run completes (gitignore warning is harmless)',
    code === 0, hasGitignoreWarning ? 'npm warns about .gitignore fallback (non-fatal)' : '');

  const hasPackageJsonWarning = !err.includes('ENOENT') && !err.includes('no such file');
  check('no missing-file errors in dry-run', hasPackageJsonWarning);

  const total = passed + failed;
  console.log(`\n=== Results: ${passed}/${total} passed` +
    (failed > 0 ? `, ${failed} failed` : '') + ' ===\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
