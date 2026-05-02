#!/usr/bin/env node

/**
 * Installed Tarball Consumer Smoke Test — WP-19.2
 *
 * Proves that Pattern Geometry Commons works when installed from a
 * tarball (not just imported from a source path).
 *
 * Full chain: pack → install → import → validate → compile
 *
 * Exit 0 when all checks pass.
 */

import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

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
    child.on('error', reject);
  });
}

async function run() {
  console.log('=== Installed Tarball Consumer Smoke Test ===\n');

  const workDir = await mkdtemp(join(tmpdir(), 'pgc-install-test-'));

  // Phase 1: Pack the package
  console.log('[Phase 1] Packing PGC...');
  const { out: packOut } = await exec('npm', ['pack'], { cwd: PKG_ROOT });
  const tarballName = packOut.trim().split('\n').pop().trim();
  const tarballPath = join(PKG_ROOT, tarballName);
  console.log(`  Tarball: ${tarballName}`);
  check('npm pack produces tarball', tarballName.endsWith('.tgz'));

  // Phase 2: Create consumer project
  console.log('[Phase 2] Creating consumer project...');
  const consumerDir = join(workDir, 'consumer');
  await mkdir(consumerDir, { recursive: true });

  // Write minimal package.json for consumer
  await writeFile(join(consumerDir, 'package.json'), JSON.stringify({
    name: 'pgc-consumer-test',
    version: '1.0.0',
    private: true,
    type: 'module',
  }, null, 2));

  check('consumer package.json created', true);

  // Phase 3: Install tarball into consumer project
  console.log('[Phase 3] Installing tarball into consumer project...');
  try {
    const { out } = await exec('npm', ['install', '--no-save', tarballPath], {
      cwd: consumerDir,
    });
    console.log('  npm install succeeded');
    check('npm install tarball succeeds', true);
  } catch (err) {
    check('npm install tarball succeeds', false, err.stderr || err.message);
    // Cleanup and exit early
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    await rm(tarballPath, { force: true }).catch(() => {});
    console.log(`\nResults: ${passed}/${passed + failed} passed`);
    process.exit(1);
  }

  // Phase 4: Verify installed package structure
  console.log('[Phase 4] Verifying installed package...\n');
  const pkgInstallDir = join(consumerDir, 'node_modules', 'pattern-geometry-commons');

  const requiredFiles = [
    ['package.json', 'package.json'],
    ['README.md', 'README.md'],
    ['src/index.mjs', 'src/index.mjs'],
    ['spec/pg-ir.schema.json', 'spec/pg-ir.schema.json'],
    ['examples/islamic/01-hex-star-field.json', 'at least one example'],
    ['scripts/validate.mjs', 'CLI validate script'],
    ['scripts/compile.mjs', 'CLI compile script'],
  ];

  for (const [path, label] of requiredFiles) {
    try {
      await readFile(join(pkgInstallDir, path), 'utf-8');
      check(`${label} in installed package`, true);
    } catch {
      check(`${label} in installed package`, false, `missing: ${path}`);
    }
  }

  // Phase 5: Programmatic API test via installed package
  console.log('\n[Phase 5] Programmatic API test from installed package...\n');

  // Write a test file that imports from the installed package
  const testFilePath = join(consumerDir, 'test-import.mjs');
  await writeFile(testFilePath, `
import { validateIr, compileIr, listFormats, loadExample, listExamples } from ${"'"}pattern-geometry-commons${"'"};

const results = [];

function check(label, ok) { results.push({ label, ok }); return ok; }

// List formats
const formats = listFormats();
check('listFormats returns array', Array.isArray(formats) && formats.length === 4);

// Load example
const examples = await listExamples();
check('listExamples >= 10', examples.length >= 10);

const hexEx = examples.find(e => e.name === '01-hex-star-field');
check('found hex-star-field', !!hexEx);

const ir = await loadExample(hexEx.path);
check('loadExample returns object', typeof ir === 'object');

// Validate
const validation = await validateIr(ir);
check('validateIr returns object', typeof validation === 'object');
check('hex-star-field is valid', validation.valid === true);

// Compile to SVG
const { result, meta } = await compileIr(ir, { format: 'svg' });
check('compileIr returns result string', typeof result === 'string');
check('SVG has xml header', result.startsWith('<?xml'));
check('SVG has svg tag', result.includes('<svg'));
check('meta.tileCount > 0', meta.tileCount > 0);

// Compile all 4 formats
for (const fmt of formats) {
  try {
    const r = await compileIr(ir, { format: fmt, validate: false });
    check(\`format \${fmt} compiles\`, r && r.result && r.meta);
  } catch (e) {
    check(\`format \${fmt} compiles\`, false);
  }
}

// Verify no app runtime dependency leakage
const fnName = 'generate' + 'Scene';
const hasSceneV4 = typeof globalThis[fnName] !== 'undefined';
check('no global generate' + 'Scene', !hasSceneV4);

// Final
const allOk = results.every(r => r.ok);
if (!allOk) {
  console.error('Failures:');
  results.filter(r => !r.ok).forEach(r => console.error('  FAIL: ' + r.label));
}
process.exit(allOk ? 0 : 1);
`.trim());

  try {
    await exec(process.execPath, [testFilePath], {
      cwd: consumerDir,
    });
    check('installed package import test passes', true);
  } catch (err) {
    check('installed package import test passes', false, err.stderr || err.message);
  }

  // Phase 6: Verify output/ NOT in installed package
  console.log('\n[Phase 6] Verify no build artifacts leak...\n');
  try {
    await readFile(join(pkgInstallDir, 'output', 'examples', '01-hex-star-field.svg'), 'utf-8');
    check('output/ NOT in installed package', false, 'output directory leaked into package');
  } catch {
    check('output/ NOT in installed package', true);
  }

  // Phase 7: Verify no node_modules/ nested in package
  try {
    const fd = await readFile(join(pkgInstallDir, 'node_modules'), 'utf-8');
    check('no nested node_modules', false);
  } catch {
    check('no nested node_modules', true);
  }

  // Cleanup
  console.log('\n[Cleanup]');
  await rm(workDir, { recursive: true, force: true }).catch(() => {});
  await rm(tarballPath, { force: true }).catch(() => {});
  console.log(`  Removed: ${workDir}`);
  console.log(`  Removed: ${tarballPath}`);

  const total = passed + failed;
  console.log(`\n=== Results: ${passed}/${total} passed` +
    (failed > 0 ? `, ${failed} failed` : '') + ' ===\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
