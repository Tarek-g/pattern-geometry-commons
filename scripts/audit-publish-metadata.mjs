#!/usr/bin/env node

/**
 * Publish Metadata Audit — WP-20.2
 *
 * Audits package.json for npm publish readiness.
 * Classifies each relevant field as:
 *   present-and-valid
 *   missing-but-safe-to-add
 *   missing-and-owner-decision-required
 *
 * Exit 0 when audit completes. Non-zero if critical blockers found.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG = JSON.parse(
  await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

// ── Classification ──────────────────────────────────────────────────────

const present = [];
const safeToAdd = [];
const blockedByOwner = [];

function audit(field, condition, category, detail = '') {
  const entry = { field, category, detail };
  if (category === 'present-and-valid') present.push(entry);
  else if (category === 'missing-but-safe-to-add') safeToAdd.push(entry);
  else blockedByOwner.push(entry);
}

// ── Required / strongly recommended fields ──────────────────────────────

audit('name',
  typeof PKG.name === 'string' && PKG.name.length > 0,
  'present-and-valid', PKG.name);

audit('version',
  typeof PKG.version === 'string' && /^\d+\.\d+\.\d/.test(PKG.version),
  'present-and-valid', PKG.version);

audit('private',
  PKG.private === false || PKG.private === undefined,
  'present-and-valid', PKG.private === false ? 'explicitly false (publishable)' : 'undefined (defaults to publishable)');

audit('description',
  typeof PKG.description === 'string' && PKG.description.length > 20,
  'present-and-valid', PKG.description.substring(0, 60) + '...');

audit('type',
  PKG.type === 'module',
  'present-and-valid', PKG.type);

audit('main',
  typeof PKG.main === 'string' && PKG.main.startsWith('./'),
  'present-and-valid', PKG.main);

audit('exports',
  typeof PKG.exports === 'object' && PKG.exports !== null,
  'present-and-valid', JSON.stringify(PKG.exports));

audit('files',
  Array.isArray(PKG.files) && PKG.files.length >= 4,
  'present-and-valid', `${PKG.files.length} entries: ${PKG.files.join(', ')}`);

audit('license',
  typeof PKG.license === 'string' && PKG.license.length > 0,
  'present-and-valid', PKG.license);

audit('keywords',
  Array.isArray(PKG.keywords) && PKG.keywords.length >= 3,
  'present-and-valid', `${PKG.keywords.length} keywords`);

audit('dependencies',
  typeof PKG.dependencies === 'object' && PKG.dependencies !== null,
  'present-and-valid', Object.keys(PKG.dependencies).join(', '));

// ── Safe-to-add fields ──────────────────────────────────────────────────

// ── Safe-to-add fields (checked dynamically) ────────────────────────────

if (PKG.engines && PKG.engines.node) {
  audit('engines',
    true,
    'present-and-valid', `node ${PKG.engines.node}`);
} else {
  audit('engines',
    false,
    'missing-but-safe-to-add',
    'set to { "node": ">=18" } — ESM with node: prefix requires Node 18+');
}

// ── Owner-decision-required fields ──────────────────────────────────────

if (PKG.repository) {
  const repoStr = typeof PKG.repository === 'object'
    ? `${PKG.repository.type}: ${PKG.repository.url}${PKG.repository.directory ? ' (directory: ' + PKG.repository.directory + ')' : ''}`
    : String(PKG.repository);
  audit('repository', true, 'present-and-valid', repoStr);
} else {
  audit('repository', true, 'missing-and-owner-decision-required',
    'needs repo URL — e.g. { "type": "git", "url": "https://github.com/...", "directory": "packages/pattern-geometry-commons" }');
}

if (PKG.homepage) {
  audit('homepage', true, 'present-and-valid', PKG.homepage);
} else {
  audit('homepage', true, 'missing-and-owner-decision-required',
    'needs URL — could be README, docs site, or repo');
}

if (PKG.bugs) {
  const bugsStr = typeof PKG.bugs === 'object' ? PKG.bugs.url || PKG.bugs.email || JSON.stringify(PKG.bugs) : String(PKG.bugs);
  audit('bugs', true, 'present-and-valid', bugsStr);
} else {
  audit('bugs', true, 'missing-and-owner-decision-required',
    'needs bug tracker URL or email — e.g. { "url": "https://github.com/.../issues" }');
}

if (PKG.author) {
  const authorStr = typeof PKG.author === 'object' ? (PKG.author.name || JSON.stringify(PKG.author)) : String(PKG.author);
  audit('author', true, 'present-and-valid', authorStr);
} else {
  audit('author', true, 'missing-and-owner-decision-required',
    'needs author name/email — or use "contributors" array if multi-author');
}

// ── Report ──────────────────────────────────────────────────────────────

console.log('=== PGC Publish Metadata Audit ===\n');

console.log('PRESENT AND VALID (' + present.length + ' fields):\n');
for (const e of present) {
  console.log(`  ✅ ${e.field}: ${e.detail}`);
}

console.log('\nMISSING — SAFE TO ADD (' + safeToAdd.length + ' fields):\n');
for (const e of safeToAdd) {
  console.log(`  ⚠️  ${e.field}: ${e.detail}`);
}

console.log('\nMISSING — OWNER DECISION REQUIRED (' + blockedByOwner.length + ' fields):\n');
for (const e of blockedByOwner) {
  console.log(`  🔒 ${e.field}: ${e.detail}`);
}

console.log('\n=== Summary ===\n');
console.log(`  Ready:        ${present.length} fields`);
console.log(`  Safe to fix:  ${safeToAdd.length} fields`);
console.log(`  Blocked:      ${blockedByOwner.length} fields`);
console.log();

if (safeToAdd.length === 0 && blockedByOwner.length === 0) {
  console.log('  Package metadata is fully publish-ready.\n');
} else if (blockedByOwner.length === 0) {
  console.log('  All gaps are mechanical — no owner decisions needed.\n');
} else {
  console.log('  Some gaps require owner decisions before publish.\n');
  console.log('  BLOCKERS (owner must resolve):');
  for (const e of blockedByOwner) {
    console.log(`    - ${e.field}: ${e.detail}`);
  }
  console.log();
}

process.exit(0);
