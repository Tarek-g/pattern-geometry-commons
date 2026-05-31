#!/usr/bin/env node

/**
 * PGC Pack Contract Test — WP-19.1
 *
 * Proves that `npm pack` produces a correct, complete tarball.
 * Verifies that required files are present and unwanted files are absent.
 *
 * Exit 0 when all checks pass.
 */

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);
const PACKAGE_NAME = '@tarek-g/pattern-geometry-commons';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || PKG_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      if (code === 0) resolve({ out, err, code });
      else {
        const e = new Error(`${cmd} ${args.join(' ')} exited ${code}`);
        e.stdout = out; e.stderr = err; e.code = code;
        reject(e);
      }
    });
  });
}

async function run() {
  console.log('=== PGC Pack Contract Test ===\n');

  // Phase 1: Create temp working directory
  const tmpDir = await mkdtemp(join(tmpdir(), 'pgc-pack-test-'));
  console.log(`[Phase 1] Temp dir: ${tmpDir}`);

  // Phase 2: Run npm pack --json (or plain npm pack)
  console.log('[Phase 2] Running npm pack...');

  let tarballName;
  try {
    const { out } = await exec('npm', ['pack', '--json'], { cwd: PKG_ROOT });
    // npm pack --json outputs an array with the tarball metadata.
    const results = JSON.parse(out.trim());
    const entry = Array.isArray(results) ? results[0] : results;
    tarballName = entry.filename || entry.name;
    console.log(`  Packed: ${tarballName}`);
    check('npm pack produces tarball name', !!tarballName, tarballName);
  } catch (err) {
    // Fallback: npm pack without --json
    try {
      const { out } = await exec('npm', ['pack'], { cwd: PKG_ROOT });
      tarballName = out.trim().split('\n').pop().trim();
      console.log(`  Packed: ${tarballName}`);
    } catch (err2) {
      check('npm pack succeeds', false, err.stderr || err2.message);
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      console.log(`\nResults: ${passed}/${passed + failed} passed`);
      process.exit(failed > 0 ? 1 : 0);
      return;
    }
  }

  const tarballPath = join(PKG_ROOT, tarballName);

  // Phase 3: Extract tarball to temp dir and list contents
  console.log('[Phase 3] Extracting and listing tarball contents...');

  let fileList = [];
  try {
    const { out } = await exec('tar', ['-tzf', tarballPath], { cwd: tmpDir });
    fileList = out.trim().split('\n').filter(Boolean);
    console.log(`  ${fileList.length} entries in tarball`);
  } catch (err) {
    check('tar -tzf succeeds', false, err.stderr || err.message);
    // Cleanup tarball
    await rm(tarballPath, { force: true }).catch(() => {});
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    console.log(`\nResults: ${passed}/${passed + failed} passed`);
    process.exit(1);
  }

  // Phase 4: Required files check
  console.log('[Phase 4] Required files must be present...\n');

  const pkgPrefix = 'package/';

  const REQUIRED = {
    'package.json': 'package.json',
    'README.md': 'README.md',
    'src/index.mjs': 'src/index.mjs',
    'spec/pg-ir.schema.json': 'spec/pg-ir.schema.json',
  };

  for (const [path, label] of Object.entries(REQUIRED)) {
    const fullPath = pkgPrefix + path;
    const found = fileList.some(f => f === fullPath);
    check(`${label} in tarball`, found, found ? '' : `expected "${fullPath}"`);
  }

  // src/ files
  const requiredSrcFiles = [
    'src/index.mjs',
    'src/schema-loader.mjs',
    'src/validator.mjs',
    'src/compiler.mjs',
    'src/example-lister.mjs',
    'src/backends/svg-backend.mjs',
    'src/backends/makerjs-backend.mjs',
  ];
  for (const f of requiredSrcFiles) {
    check(`${f} in tarball`, fileList.some(e => e === pkgPrefix + f));
  }

  // scripts/ (CLI tools)
  const requiredScriptFiles = [
    'scripts/validate.mjs',
    'scripts/validate-all.mjs',
    'scripts/compile.mjs',
  ];
  for (const f of requiredScriptFiles) {
    check(`${f} in tarball`, fileList.some(e => e === pkgPrefix + f));
  }

  // examples/ (at least one per category)
  const exampleDirs = fileList
    .filter(f => f.startsWith(pkgPrefix + 'examples/'))
    .map(f => f.replace(pkgPrefix, ''));
  const hasIslamic = exampleDirs.some(f => f.includes('islamic/'));
  const hasAbstract = exampleDirs.some(f => f.includes('abstract/'));
  const hasFabrication = exampleDirs.some(f => f.includes('fabrication/'));
  const hasInvalid = exampleDirs.some(f => f.includes('invalid/'));
  check('islamic examples in tarball', hasIslamic);
  check('abstract examples in tarball', hasAbstract);
  check('fabrication examples in tarball', hasFabrication);
  check('invalid examples in tarball', hasInvalid);

  // Phase 5: Unwanted files must be absent
  console.log('\n[Phase 5] Unwanted files must be absent...\n');

  const UNWANTED_PATTERNS = ['output/', 'node_modules/', '.DS_Store', '__pycache__'];
  for (const pat of UNWANTED_PATTERNS) {
    const found = fileList.some(f => f.includes(pat));
    check(`"${pat}" NOT in tarball`, !found, found ? `found in tarball` : '');
  }

  // Phase 6: Verify package.json inside tarball
  console.log('\n[Phase 6] Verify package.json in tarball...\n');

  try {
    await exec('tar', ['-xzf', tarballPath, '-C', tmpDir]);
    const extractedPkg = JSON.parse(
      await readFile(join(tmpDir, 'package', 'package.json'), 'utf-8')
    );
    check('tarball package name matches', extractedPkg.name === PACKAGE_NAME,
      extractedPkg.name);
    check('tarball version is 0.1.0', extractedPkg.version === '0.1.0',
      extractedPkg.version);
    check('tarball has files field', Array.isArray(extractedPkg.files));
    check('tarball type is module', extractedPkg.type === 'module');
    check('tarball exports match', extractedPkg.exports?.['.'] === './src/index.mjs');
  } catch (err) {
    check('extract and verify tarball package.json', false, err.stderr || err.message);
  }

  // Phase 7: Cleanup
  console.log('\n[Cleanup]');
  await rm(tarballPath, { force: true }).catch(() => {});
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  console.log(`  Removed: ${tarballPath}`);
  console.log(`  Removed: ${tmpDir}`);

  // Results
  const total = passed + failed;
  console.log(`\n=== Results: ${passed}/${total} passed` +
    (failed > 0 ? `, ${failed} failed` : '') + ' ===\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
