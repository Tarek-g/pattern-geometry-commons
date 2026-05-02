#!/usr/bin/env node

/*
 * Pattern Geometry Commons — Package Boundary Guard
 *
 * WP-11: Standalone-readiness guard for the PGC package.
 * Asserts public API surface, blocks forbidden coupling, and
 * verifies the package manifest.
 *
 * Exit 0 when all checks pass.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG = join(__dirname, '..');
const SELF = __filename;

const SOURCE_DIRS = ['src', 'scripts'];

// Meta-test files that generate code containing import statements.
// The boundary scanner's regex-based approach cannot distinguish
// generated import literals from real dependency imports.
const META_TEST_SKIP = new Set([
  'scripts/test-cross-node-smoke.mjs',
]);

// ── helpers ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(description, condition, detail) {
  if (condition) { passed++; console.log(`  PASS: ${description}`); }
  else { failed++; console.error(`  FAIL: ${description}${detail ? ' — ' + detail : ''}`); }
}

function setEq(actual, expected) {
  actual.sort(); expected.sort();
  return actual.length === expected.length && actual.every((v, i) => v === expected[i]);
}

// ── comment stripping for content-aware scanning ─────────────────────

function stripComments(content) {
  // Remove block comments
  let s = content.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove line comments (avoid matching URLs // in strings — rough but good enough)
  s = s.replace(/\/\/.*$/gm, ' ');
  return s;
}

// ── import/require extraction (on stripped content) ──────────────────

function extractSpecifiers(content) {
  const out = [];
  // static imports: import ... from '...'
  for (const m of content.matchAll(/import\s*(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"]/g)) {
    out.push(m[1]);
  }
  // dynamic imports: import('...')
  for (const m of content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1]);
  }
  // require('...')  (skip require.resolve — it's a feature check, not a dep)
  for (const m of content.matchAll(/(?<!\.resolve\s*\()require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1]);
  }
  return out;
}

// ── recursive file collector ─────────────────────────────────────────

async function collectFiles(dir) {
  const files = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return files; }
  for (const e of entries) {
    const fp = join(dir, e.name);
    if (e.isDirectory()) files.push(...await collectFiles(fp));
    else if (['.mjs', '.js'].includes(extname(e.name))) files.push(fp);
  }
  return files;
}

// ══════════════════════════════════════════════════════════════════════
// Section 1 — Public API exports
// ══════════════════════════════════════════════════════════════════════

console.log('=== Section 1: Public API exports ===\n');

const EXPECTED = [
  'loadSchema', 'getSchemaPath', 'validateIr', 'getValidator',
  'compileIr', 'registerBackend', 'listFormats', 'listExamples',
  'loadExample', 'compileSvg', 'compileMakerJsJson',
  'compileMakerJsSvg', 'compileMakerJsDxf',
];

const api = await import('../src/index.mjs');
const actual = Object.keys(api);

check('public exports exact match', setEq([...actual], [...EXPECTED]),
  `expected ${EXPECTED.length} keys, found extra=[${actual.filter(k => !EXPECTED.includes(k))}] missing=[${EXPECTED.filter(k => !actual.includes(k))}]`);

for (const k of EXPECTED) {
  check(`${k} is a function`, typeof api[k] === 'function', `type=${typeof api[k]}`);
}

console.log();

// ══════════════════════════════════════════════════════════════════════
// Section 2 — listFormats exact set
// ══════════════════════════════════════════════════════════════════════

console.log('=== Section 2: listFormats ===\n');

const EXPECTED_FMTS = ['svg', 'makerjs-json', 'makerjs-svg', 'makerjs-dxf'];
const fmts = api.listFormats();

check('listFormats exact set', setEq([...fmts], [...EXPECTED_FMTS]),
  `got [${fmts}]`);

console.log();

// ══════════════════════════════════════════════════════════════════════
// Section 3 — Forbidden coupling scan
// ══════════════════════════════════════════════════════════════════════

console.log('=== Section 3: Forbidden coupling scan ===\n');

const FORBIDDEN = {
  // app internals — string literals/identifiers that must never appear
  GENERATE_SCENE:    { re: /\bgenerateScene\b/,          label: 'generateScene (app internals)' },
  SCENE_V4:          { re: /\bscene-v4\b/,               label: 'scene-v4 (app internals)' },
  ORNAMENT_IR_V1:    { re: /\bornament-ir-v1\b/,         label: 'ornament-ir-v1 (app internals)' },
  TAPRATS:           { re: /\btaprats\b/,                label: 'taprats (corpus tooling)' },
  // browser-only globals
  WINDOW_DOT:        { re: /[^.]window\./,               label: 'window. (browser-only global)' },
  DOCUMENT_DOT:      { re: /[^.]document\./,             label: 'document. (browser-only global)' },
  LOCALSTORAGE:      { re: /\blocalStorage\b/,           label: 'localStorage (browser-only API)' },
  SESSIONSTORAGE:    { re: /\bsessionStorage\b/,         label: 'sessionStorage (browser-only API)' },
  NAVIGATOR_DOT:     { re: /[^.]navigator\./,            label: 'navigator. (browser-only API)' },
  // UI frameworks
  REACT_IMPORT:      { re: /require\s*\(\s*['"]react['"]|from\s+['"]react['"]/, label: 'React (UI framework)' },
  // browser-automation deps
  PUPPETEER:         { re: /\bpuppeteer\b/,              label: 'puppeteer (browser automation)' },
  PLAYWRIGHT:        { re: /\bplaywright\b/,             label: 'playwright (browser automation)' },
  // browser UI deps
  GSAP:              { re: /require\s*\(\s*['"]gsap|from\s+['"]gsap/, label: 'GSAP (browser animation)' },
  // editor-only deps
  TLDRAW:            { re: /\btldraw\b/,                  label: 'tldraw (browser editor)' },
  PAPER_JS:          { re: /from\s+['"]paper['"]/,       label: 'paper.js (browser vector editor)' },
};

const ROOT_SRC_RE    = /from\s+['"]\.\.\/\.\.(?:\/\.\.)*\/src\//;
const COMPONENTS_RE  = /from\s+['"][^'"]*\/components\//;
const PATH_ESCAPE_RE = /from\s+['"]\.\.\/\.\.\/\.\.\//;  // 3+ levels up escapes package

// Allowed non-relative / non-node specifiers
const ALLOWED_DEPS = new Set([
  'ajv', 'makerjs', 'jspdf',  // jspdf: availability-check only in test-cross-backend
]);

const allFiles = [];
for (const d of SOURCE_DIRS) {
  allFiles.push(...await collectFiles(join(PKG, d)));
}

console.log(`  Scanning ${allFiles.length} source files...\n`);

let violations = 0;

for (const fp of allFiles) {
  // Don't scan self
  if (fp === SELF) continue;

  const rel = fp.replace(PKG + '/', '');

  // Skip meta-test files that generate code with import statements
  if (META_TEST_SKIP.has(rel)) continue;
  const raw = await readFile(fp, 'utf-8');
  const clean = stripComments(raw);

  // ── forbidden keyword checks (on raw content, not stripped) ──
  // Use raw to catch keywords in strings too (we need to be strict),
  // but ONLY for the non-self files. The boundary test's own config
  // was already skipped above.
  for (const [key, { re, label }] of Object.entries(FORBIDDEN)) {
    if (re.test(raw)) {
      const hits = raw.split('\n')
        .map((l, i) => re.test(l) ? `  L${i+1}: ${l.trim().substring(0, 120)}` : null)
        .filter(Boolean)
        .slice(0, 3);
      violations++;
      check(`${rel}: no ${label}`, false, '\n' + hits.join('\n'));
    }
  }

  // ── root src/ and components/ path checks ──
  if (ROOT_SRC_RE.test(raw)) {
    violations++;
    check(`${rel}: no root-level src/ imports`, false);
  }
  if (COMPONENTS_RE.test(raw)) {
    violations++;
    check(`${rel}: no components/ imports`, false);
  }
  if (PATH_ESCAPE_RE.test(raw)) {
    violations++;
    check(`${rel}: no path escape beyond PGC root`, false);
  }

  // ── non-relative import audit (on clean content) ──
  for (const spec of extractSpecifiers(clean)) {
    if (spec.startsWith('.') || spec.startsWith('..')) continue;
    if (spec.startsWith('node:')) continue;
    if (ALLOWED_DEPS.has(spec) || [...ALLOWED_DEPS].some(d => spec.startsWith(d + '/'))) continue;
    violations++;
    check(`${rel}: allowed external dep`, false, `"${spec}" — not in allowed set`);
  }
}

if (violations === 0) {
  console.log('  All source files pass forbidden-pattern and import boundary scans.\n');
}

// ══════════════════════════════════════════════════════════════════════
// Section 4 — Package.json manifest
// ══════════════════════════════════════════════════════════════════════

console.log('=== Section 4: Package.json manifest ===\n');

let pkg;
try { pkg = JSON.parse(await readFile(join(PKG, 'package.json'), 'utf-8')); }
catch { pkg = null; }

if (pkg) {
  check('"name" is pattern-geometry-commons', pkg.name === 'pattern-geometry-commons', pkg.name);
  check('"type" is module', pkg.type === 'module', pkg.type);
  check('"main" → ./src/index.mjs', pkg.main === './src/index.mjs', pkg.main);
  check('"exports" → ./src/index.mjs', pkg.exports?.['.'] === './src/index.mjs',
    JSON.stringify(pkg.exports));
  check('dep: makerjs', !!pkg.dependencies?.makerjs,
    `deps=${JSON.stringify(Object.keys(pkg.dependencies || {}))}`);
  check('dep: ajv', !!pkg.dependencies?.ajv,
    `deps=${JSON.stringify(Object.keys(pkg.dependencies || {}))}`);
  check('no dep: jspdf', !pkg.dependencies?.jspdf && !pkg.devDependencies?.jspdf,
    'jspdf must not appear in dependencies or devDependencies');
}

// ══════════════════════════════════════════════════════════════════════
// Section 5 — Required artefacts
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Section 5: Required artefacts ===\n');

check('spec/pg-ir.schema.json', (await stat(join(PKG, 'spec', 'pg-ir.schema.json')).catch(() => null))?.isFile());
check('README.md', (await stat(join(PKG, 'README.md')).catch(() => null))?.isFile());
check('src/index.mjs', (await stat(join(PKG, 'src', 'index.mjs')).catch(() => null))?.isFile());

// ══════════════════════════════════════════════════════════════════════

console.log(`\nResults: ${passed}/${passed + failed} passed` +
  (failed ? `, ${failed} failed` : ''));
console.log();

process.exit(failed ? 1 : 0);
