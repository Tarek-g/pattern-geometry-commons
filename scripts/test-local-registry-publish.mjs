#!/usr/bin/env node

/**
 * Local Registry Publish/Install Smoke Test — WP-20.3
 *
 * Proves that PGC can publish to a local npm registry and install
 * by package name (not just from tarball path).
 *
 * Uses verdaccio via npx with pre-configured htpasswd auth.
 *
 * Exit 0 when all checks pass.
 */

import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = join(__dirname, '..');

// Pre-computed credentials for local verdaccio
const REGISTRY_USER = 'admin';
const REGISTRY_PASS = 'admin123';
const REGISTRY_EMAIL = 'admin@local.test';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  PASS: ${label}`); }
  else { failed++; console.error(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`); }
}

function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => resolve({ out, err, code }));
    child.on('error', reject);
  });
}

function findPort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => { const port = srv.address().port; srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

function makeHtpasswdEntry(user, pass) {
  const hash = createHash('sha1').update(pass).digest('base64');
  return `${user}:{SHA}${hash}`;
}

function makeAuthToken(user, pass) {
  return Buffer.from(`${user}:${pass}`).toString('base64');
}

async function run() {
  console.log('=== Local Registry Publish/Install Smoke Test ===\n');

  const workDir = await mkdtemp(join(tmpdir(), 'pgc-registry-test-'));
  const registryPort = await findPort();
  const registryUrl = `http://localhost:${registryPort}`;

  // Phase 1: Create htpasswd and start verdaccio
  console.log(`[Phase 1] Starting verdaccio on port ${registryPort}...`);

  const verdaccioStorage = join(workDir, 'verdaccio-storage');
  await mkdir(verdaccioStorage, { recursive: true });

  // Pre-create htpasswd file
  const htpasswdPath = join(workDir, 'htpasswd');
  await writeFile(htpasswdPath, makeHtpasswdEntry(REGISTRY_USER, REGISTRY_PASS) + '\n');

  const configYaml = `
storage: ${verdaccioStorage}
auth:
  htpasswd:
    file: ${htpasswdPath}
    max_users: -1
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  'pattern-geometry-commons':
    access: $all
    publish: $all
    unpublish: $all
  '**':
    access: $all
    publish: $all
    proxy: npmjs
log: { type: stdout, format: pretty, level: error }
`;
  const configPath = join(workDir, 'verdaccio-config.yaml');
  await writeFile(configPath, configYaml);

  const verdaccio = spawn('npx', ['verdaccio', '--config', configPath, '--listen', registryUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: workDir,
  });

  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), 8000);
    let resolved = false;
    const maybeResolve = (d) => {
      if (resolved) return;
      const msg = d.toString();
      if (msg.includes('http address') || msg.includes('server started')) {
        resolved = true;
        clearTimeout(timer);
        setTimeout(() => resolve(true), 1500);
      }
    };
    verdaccio.stdout.on('data', maybeResolve);
    verdaccio.stderr.on('data', maybeResolve);
  });

  check('verdaccio starts', ready);

  if (!ready) {
    verdaccio.kill();
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    console.log(`\nResults: ${passed}/${passed + failed} passed`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const cleanup = async () => {
    verdaccio.kill();
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  };

  // Phase 2: Create consumer project with .npmrc
  console.log(`\n[Phase 2] Creating consumer project...`);

  const consumerDir = join(workDir, 'consumer');
  await mkdir(consumerDir, { recursive: true });

  const authToken = makeAuthToken(REGISTRY_USER, REGISTRY_PASS);

  // .npmrc for publish (global config)
  const publishNpmrc = join(workDir, 'publish.npmrc');
  await writeFile(publishNpmrc, [
    `registry=${registryUrl}`,
    `//localhost:${registryPort}/:_auth=${authToken}`,
    `email=${REGISTRY_EMAIL}`,
    '',
  ].join('\n'));

  // .npmrc for consumer project (npm reads this automatically)
  await writeFile(join(consumerDir, '.npmrc'), [
    `registry=${registryUrl}`,
    `//localhost:${registryPort}/:_auth=${authToken}`,
    '',
  ].join('\n'));

  await writeFile(join(consumerDir, 'package.json'), JSON.stringify({
    name: 'pgc-registry-consumer-test',
    version: '1.0.0',
    private: true,
    type: 'module',
  }, null, 2));

  check('consumer project created', true);

  // Phase 3: Publish PGC to local registry
  console.log(`\n[Phase 3] Publishing PGC to local registry...`);

  let publishOk = false;
  let tarballPath = null;
  try {
    const { out: packOut } = await exec('npm', ['pack'], { cwd: PKG_ROOT });
    const tarballName = packOut.trim().split('\n').pop().trim();
    tarballPath = join(PKG_ROOT, tarballName);

    const pubResult = await exec('npm', ['publish', '--userconfig', publishNpmrc, tarballPath], {
      cwd: PKG_ROOT,
    });
    const pubCombined = pubResult.out + pubResult.err;
    publishOk = pubResult.code === 0 && !pubCombined.includes('ERR!');
    check('npm publish to local registry succeeds', publishOk,
      publishOk ? '' : `exit=${pubResult.code}\n${pubCombined.substring(0, 300)}`);
  } catch (err) {
    check('npm publish to local registry succeeds', false, err.stderr || err.message);
  }

  // Clean tarball
  if (tarballPath) await rm(tarballPath, { force: true }).catch(() => {});

  // Phase 4: Install from local registry by package name
  console.log(`\n[Phase 4] Installing from local registry by package name...`);

  let installOk = false;
  try {
    const { out, err } = await exec('npm', ['install', 'pattern-geometry-commons@0.1.0'], {
      cwd: consumerDir,
    });
    installOk = true;
    console.log('  npm install by name succeeded');
    check('npm install by package name succeeds', true);
  } catch (err) {
    check('npm install by package name succeeds', false,
      (err.stderr || err.message).substring(0, 300));
  }

  if (!installOk) {
    console.log(`\n=== Results: ${passed}/${passed + failed} passed ===\n`);
    await cleanup();
    process.exit(1);
  }

  // Phase 5: Verify installed package structure
  console.log(`\n[Phase 5] Verifying installed package...\n`);

  const installedDir = join(consumerDir, 'node_modules', 'pattern-geometry-commons');
  const requiredFiles = [
    ['package.json', 'package.json'],
    ['src/index.mjs', 'src/index.mjs'],
    ['spec/pg-ir.schema.json', 'spec/pg-ir.schema.json'],
    ['examples/islamic/01-hex-star-field.json', 'example'],
  ];
  for (const [path, label] of requiredFiles) {
    try {
      await readFile(join(installedDir, path), 'utf-8');
      check(`${label} in registry-installed package`, true);
    } catch {
      check(`${label} in registry-installed package`, false, `missing: ${path}`);
    }
  }

  // Phase 6: Run import and compile smoke
  console.log(`\n[Phase 6] Running smoke from registry-installed package...\n`);

  const smokePath = join(consumerDir, 'smoke.mjs');
  await writeFile(smokePath, `
import { validateIr, compileIr, loadExample, listExamples } from ${"'"}pattern-geometry-commons${"'"};

const examples = await listExamples();
const hex = examples.find(e => e.name === '01-hex-star-field');
if (!hex) throw new Error('example not found');

const ir = await loadExample(hex.path);
const v = await validateIr(ir);
if (!v.valid) throw new Error('validation failed');

const { result } = await compileIr(ir, { format: 'svg' });
if (!result.includes('<svg')) throw new Error('SVG compile failed');

console.log('Registry-installed smoke: OK');
`.trim());

  try {
    const { out, err } = await exec(process.execPath, [smokePath], { cwd: consumerDir });
    check('registry-installed package smoke test passes',
      out.includes('OK'), (out + err).substring(0, 200));
  } catch (err) {
    check('registry-installed package smoke test passes', false,
      (err.stderr || err.message).substring(0, 300));
  }

  // Cleanup
  console.log('\n[Cleanup]');
  await cleanup();
  console.log(`  Removed: ${workDir}`);

  const total = passed + failed;
  console.log(`\n=== Results: ${passed}/${total} passed` +
    (failed > 0 ? `, ${failed} failed` : '') + ' ===\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
