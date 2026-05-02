#!/usr/bin/env node

/**
 * Validate all PG-IR examples and the intentional invalid sample.
 *
 * Runs two validation passes:
 *   1. All 10 valid examples — must all pass.
 *   2. Invalid sample — must fail with clear error.
 *
 * Exit code 0 only when pass-1 is clean and pass-2 produces exactly the expected failures.
 */

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG = join(__dirname, '..');
const VALIDATOR = join(__dirname, 'validate.mjs');

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(join(dir, entry.name));
    }
  }
  files.sort();
  return files;
}

function run(args) {
  try {
    const out = execFileSync(process.execPath, [VALIDATOR, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: out };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status ?? 1,
    };
  }
}

function main() {
  let exitCode = 0;

  // ---- Pass 1: valid examples ----
  const islamic = collect(join(PKG, 'examples', 'islamic'));
  const abstract = collect(join(PKG, 'examples', 'abstract'));
  const fab = collect(join(PKG, 'examples', 'fabrication'));
  const validFiles = [...islamic, ...abstract, ...fab];

  console.log('=== Pass 1: Valid Examples ===');
  console.log(`  Files: ${validFiles.length}`);
  console.log('');

  const pass1 = run(validFiles);
  console.log(pass1.stdout);
  if (pass1.stderr) console.error(pass1.stderr);

  if (!pass1.ok) {
    console.error('ERROR: Valid examples must all pass validation.');
    exitCode = 1;
  }

  // ---- Pass 2: invalid sample ----
  const invalidDir = join(PKG, 'examples', 'invalid');
  const invalidFiles = collect(invalidDir);

  console.log('');
  console.log('=== Pass 2: Invalid Sample ===');
  console.log(`  Files: ${invalidFiles.length} (expected to fail)`);
  console.log('');

  const pass2 = run(invalidFiles);
  console.log(pass2.stdout);
  if (pass2.stderr) console.error(pass2.stderr);

  if (pass2.ok) {
    console.error('ERROR: Invalid sample must FAIL validation. Got PASS instead.');
    exitCode = 1;
  } else if (!pass2.stderr.includes('must have required property')) {
    console.error('ERROR: Invalid sample should fail with a clear "required property" message.');
    exitCode = 1;
  } else {
    console.log('  Invalid sample correctly rejected with clear error.');
  }

  console.log('');
  if (exitCode === 0) {
    console.log('All checks passed.');
  } else {
    console.error('One or more checks failed.');
  }
  process.exit(exitCode);
}

main();
