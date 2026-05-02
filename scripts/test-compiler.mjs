#!/usr/bin/env node

/**
 * Pattern Geometry IR Compiler Test Suite
 *
 * Tests:
 *   1. Public API exports (loadSchema, validateIr, compileIr, listExamples, listFormats)
 *   2. Compile all 10 valid examples to SVG without errors
 *   3. Output validity: SVG contains expected XML structure
 *   4. Determinism: same input → same output
 *   5. Invalid IR correctly rejected by compileIr with validate=true
 *   6. CLI --list lists available formats
 *
 * Exit 0 when all checks pass.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG = join(__dirname, '..');
const COMPILE_CLI = join(__dirname, 'compile.mjs');

let passed = 0;
let failed = 0;

function check(description, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${description}`);
  } else {
    failed++;
    console.error(`  FAIL: ${description}${detail ? ' — ' + detail : ''}`);
  }
}

// ---- Test 1: Public API ----

console.log('=== Test 1: Public API exports ===');

const api = await import('../src/index.mjs');
check('loadSchema is a function', typeof api.loadSchema === 'function');
check('validateIr is a function', typeof api.validateIr === 'function');
check('compileIr is a function', typeof api.compileIr === 'function');
check('listExamples is a function', typeof api.listExamples === 'function');
check('listFormats is a function', typeof api.listFormats === 'function');
check('getValidator is a function', typeof api.getValidator === 'function');
check('registerBackend is a function', typeof api.registerBackend === 'function');
check('loadExample is a function', typeof api.loadExample === 'function');
check('compileSvg is a function', typeof api.compileSvg === 'function');
check('compileMakerJsJson is a function', typeof api.compileMakerJsJson === 'function');
check('compileMakerJsSvg is a function', typeof api.compileMakerJsSvg === 'function');
check('compileMakerJsDxf is a function', typeof api.compileMakerJsDxf === 'function');
check('getSchemaPath is a function', typeof api.getSchemaPath === 'function');

const formats = api.listFormats();
check('listFormats returns array with svg', Array.isArray(formats) && formats.includes('svg'));
check('listFormats returns makerjs-json', Array.isArray(formats) && formats.includes('makerjs-json'));
check('listFormats returns makerjs-svg', Array.isArray(formats) && formats.includes('makerjs-svg'));
check('listFormats returns makerjs-dxf', Array.isArray(formats) && formats.includes('makerjs-dxf'));

// ---- Test 2: listExamples ----

console.log('');
console.log('=== Test 2: listExamples ===');

const examples = await api.listExamples();
check('listExamples returns array', Array.isArray(examples));
check('listExamples length >= 10', examples.length >= 10);
check('each example has path, category, name', examples.every((e) => e.path && e.category && e.name));

// Verify categories present
const cats = new Set(examples.map((e) => e.category));
check('has islamic category', cats.has('islamic'));
check('has abstract category', cats.has('abstract'));
check('has fabrication category', cats.has('fabrication'));

// ---- Test 3: Compile all valid examples to SVG ----

console.log('');
console.log('=== Test 3: Compile all valid examples to SVG ===');

for (const ex of examples) {
  const ir = await api.loadExample(ex.path);
  try {
    const { result, meta } = await api.compileIr(ir, { format: 'svg' });
    const isSvgStr = typeof result === 'string';
    const hasXmlHeader = isSvgStr && result.startsWith('<?xml');
    const hasSvgTag = isSvgStr && result.includes('<svg') && result.includes('</svg>');
    const hasTileCount = meta && typeof meta.tileCount === 'number' && meta.tileCount > 0;

    check(
      `${ex.category}/${ex.name}: compiles to SVG`,
      isSvgStr && hasXmlHeader && hasSvgTag && hasTileCount,
      !isSvgStr ? 'not a string' : !hasXmlHeader ? 'no xml header' : !hasSvgTag ? 'no svg tag' : 'no tile count'
    );
  } catch (err) {
    check(`${ex.category}/${ex.name}: compiles to SVG`, false, err.message);
  }
}

// ---- Test 4: Determinism ----

console.log('');
console.log('=== Test 4: Determinism ===');

const detExample = examples.find((e) => e.name === '01-hex-star-field');
if (detExample) {
  const ir = await api.loadExample(detExample.path);
  const r1 = await api.compileIr(ir, { format: 'svg' });
  const r2 = await api.compileIr(ir, { format: 'svg' });
  check('Same IR → same SVG output', r1.result === r2.result);
  const m1 = await api.compileIr(ir, { format: 'makerjs-json' });
  const m2 = await api.compileIr(ir, { format: 'makerjs-json' });
  check('Same IR → same Maker.js JSON output', JSON.stringify(m1.result) === JSON.stringify(m2.result));
}

// ---- Test 4b: Maker.js JSON backend ----

console.log('');
console.log('=== Test 4b: Maker.js JSON backend ===');

for (const ex of examples.slice(0, 4)) {
  const ir = await api.loadExample(ex.path);
  try {
    const { result, meta } = await api.compileIr(ir, { format: 'makerjs-json' });
    const hasModel = result && typeof result === 'object' && result.units === 'mm';
    const hasGeometry = !!(result.models || result.paths);
    const hasMeta = meta && meta.backend === 'makerjs' && meta.motifCount > 0;
    check(
      `${ex.category}/${ex.name}: compiles to Maker.js JSON`,
      hasModel && hasGeometry && hasMeta,
      !hasModel ? 'missing Maker.js model' : !hasGeometry ? 'missing geometry' : 'missing meta'
    );
  } catch (err) {
    check(`${ex.category}/${ex.name}: compiles to Maker.js JSON`, false, err.message);
  }
}

// ---- Test 4c: Maker.js SVG export backend ----

console.log('');
console.log('=== Test 4c: Maker.js SVG export backend ===');

for (const ex of examples.slice(0, 4)) {
  const ir = await api.loadExample(ex.path);
  try {
    const { result, meta } = await api.compileIr(ir, { format: 'makerjs-svg' });
    const isStr = typeof result === 'string';
    const hasSvgTag = isStr && result.includes('<svg') && result.includes('</svg>');
    const hasMeta = meta && meta.backend === 'makerjs' && meta.format === 'makerjs-svg' && meta.motifCount > 0;
    check(
      `${ex.category}/${ex.name}: compiles to Maker.js SVG`,
      isStr && hasSvgTag && hasMeta,
      !isStr ? 'not a string' : !hasSvgTag ? 'no svg tag' : 'missing meta'
    );
  } catch (err) {
    check(`${ex.category}/${ex.name}: compiles to Maker.js SVG`, false, err.message);
  }
}

// ---- Test 4d: Maker.js DXF export backend ----

console.log('');
console.log('=== Test 4d: Maker.js DXF export backend ===');

for (const ex of examples.slice(0, 4)) {
  const ir = await api.loadExample(ex.path);
  try {
    const { result, meta } = await api.compileIr(ir, { format: 'makerjs-dxf' });
    const isStr = typeof result === 'string';
    const hasDxfHeader = isStr && result.startsWith('0\nSECTION');
    const hasMeta = meta && meta.backend === 'makerjs' && meta.format === 'makerjs-dxf' && meta.motifCount > 0;
    check(
      `${ex.category}/${ex.name}: compiles to Maker.js DXF`,
      isStr && hasDxfHeader && hasMeta,
      !isStr ? 'not a string' : !hasDxfHeader ? 'missing DXF header' : 'missing meta'
    );
  } catch (err) {
    check(`${ex.category}/${ex.name}: compiles to Maker.js DXF`, false, err.message);
  }
}

// ---- Test 4e: Maker.js SVG/ DXF determinism ----

console.log('');
console.log('=== Test 4e: Maker.js SVG/DXF determinism ===');

if (detExample) {
  const ir = await api.loadExample(detExample.path);
  const s1 = await api.compileIr(ir, { format: 'makerjs-svg' });
  const s2 = await api.compileIr(ir, { format: 'makerjs-svg' });
  check('Same IR → same Maker.js SVG output', s1.result === s2.result);
  const d1 = await api.compileIr(ir, { format: 'makerjs-dxf' });
  const d2 = await api.compileIr(ir, { format: 'makerjs-dxf' });
  check('Same IR → same Maker.js DXF output', d1.result === d2.result);
}

// ---- Test 5: Invalid IR rejection ----

console.log('');
console.log('=== Test 5: Invalid IR rejection ===');

const invalidPath = join(PKG, 'examples', 'invalid', '01-missing-pattern-id.json');
const invalidIr = JSON.parse(await readFile(invalidPath, 'utf-8'));

try {
  await api.compileIr(invalidIr, { format: 'svg', validate: true });
  check('Invalid IR rejected by compileIr', false, 'should have thrown');
} catch (err) {
  check(
    'Invalid IR rejected by compileIr',
    err.code === 'IR_VALIDATION_FAILED',
    `code=${err.code}`
  );
}

// Test skip validation
try {
  const r = await api.compileIr(invalidIr, { format: 'svg', validate: false });
  check('Invalid IR with validate=false passes through', typeof r.result === 'string');
} catch (err) {
  check('Invalid IR with validate=false passes through', false, err.message);
}

// ---- Test 6: Unknown format ----

console.log('');
console.log('=== Test 6: Unknown format rejection ===');

const validIr = examples.length > 0 ? await api.loadExample(examples[0].path) : null;
if (validIr) {
  try {
    await api.compileIr(validIr, { format: 'pdf', validate: false });
    check('Unknown format rejected', false, 'should have thrown');
  } catch (err) {
    check('Unknown format rejected', err.code === 'UNKNOWN_FORMAT');
  }
}

// ---- Test 7: CLI --list ----

console.log('');
console.log('=== Test 7: CLI --list ===');

try {
  const out = execFileSync(process.execPath, [COMPILE_CLI, '--list'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  check('CLI --list includes svg and makerjs-json', out.includes('svg') && out.includes('makerjs-json'));
  check('CLI --list includes makerjs-svg', out.includes('makerjs-svg'));
  check('CLI --list includes makerjs-dxf', out.includes('makerjs-dxf'));
} catch (err) {
  check('CLI --list succeeds', false, err.stderr || err.message);
}

// ---- Test 9: CLI Maker.js JSON to stdout ----

console.log('');
console.log('=== Test 9: CLI compile Maker.js JSON to stdout ===');

if (detExample) {
  try {
    const out = execFileSync(
      process.execPath,
      [COMPILE_CLI, detExample.path, '--format', 'makerjs-json', '--no-validate'],
      {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const parsed = JSON.parse(out);
    check(
      'CLI compiles Maker.js JSON to stdout',
      parsed.meta?.backend === 'makerjs' && parsed.result?.units === 'mm'
    );
  } catch (err) {
    check('CLI compiles Maker.js JSON to stdout', false, err.stderr || err.message);
  }
}

// ---- Test 9b: CLI compile Maker.js SVG to stdout ----

console.log('');
console.log('=== Test 9b: CLI compile Maker.js SVG to stdout ===');

if (detExample) {
  try {
    const out = execFileSync(
      process.execPath,
      [COMPILE_CLI, detExample.path, '--format', 'makerjs-svg', '--no-validate'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    check('CLI compiles Maker.js SVG to stdout', out.includes('<svg') && out.includes('</svg>'));
  } catch (err) {
    check('CLI compiles Maker.js SVG to stdout', false, err.stderr || err.message);
  }
}

// ---- Test 9c: CLI compile Maker.js DXF to stdout ----

console.log('');
console.log('=== Test 9c: CLI compile Maker.js DXF to stdout ===');

if (detExample) {
  try {
    const out = execFileSync(
      process.execPath,
      [COMPILE_CLI, detExample.path, '--format', 'makerjs-dxf', '--no-validate'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    check('CLI compiles Maker.js DXF to stdout', out.startsWith('0\nSECTION'));
  } catch (err) {
    check('CLI compiles Maker.js DXF to stdout', false, err.stderr || err.message);
  }
}

// ---- Test 8: CLI compilation to stdout ----

console.log('');
console.log('=== Test 8: CLI compile to stdout ===');

if (detExample) {
  try {
    const out = execFileSync(process.execPath, [COMPILE_CLI, detExample.path, '--no-validate'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    check('CLI compiles to stdout', out.includes('<svg') && out.includes('</svg>'));
  } catch (err) {
    check('CLI compiles to stdout', false, err.stderr || err.message);
  }
}

// ---- Test 10: CLI contracts (--help, exit codes, error messages) ----

console.log('');
console.log('=== Test 10: CLI contract tests ===');

const VALIDATE_CLI = join(__dirname, 'validate.mjs');

function cli(args, opts = {}) {
  try {
    const out = execFileSync(process.execPath, args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    return { out, status: 0 };
  } catch (err) {
    return {
      out: err.stdout || '',
      err: err.stderr || '',
      status: err.status || 1,
      killed: err.killed,
    };
  }
}

// compile.mjs --help
{
  const r = cli([COMPILE_CLI, '--help']);
  check('compile.mjs --help exits 0', r.status === 0);
  check('compile.mjs --help shows usage', r.out.includes('Usage:') && r.out.includes('compile.mjs'));
  check('compile.mjs --help lists formats', r.out.includes('svg') && r.out.includes('makerjs-dxf'));
  check('compile.mjs --help shows examples', r.out.includes('Examples:'));
  check('compile.mjs --help shows exit codes', r.out.includes('Exit Codes:'));
}

// compile.mjs -h (short flag)
{
  const r = cli([COMPILE_CLI, '-h']);
  check('compile.mjs -h exits 0', r.status === 0);
}

// compile.mjs with no input → exit 2
{
  const r = cli([COMPILE_CLI]);
  check('compile.mjs (no args) exits 2', r.status === 2);
  check('compile.mjs (no args) shows error', r.err.includes('Error:') || r.out.includes('Error:'));
}

// compile.mjs with missing file → exit 2 + clear message
{
  const r = cli([COMPILE_CLI, '/nonexistent/file.json']);
  check('compile.mjs (missing file) exits 2', r.status === 2);
  check('compile.mjs (missing file) reports file not found', r.err.includes('File not found') || r.err.includes('ERROR'));
}

// compile.mjs with invalid format → exit 1 + hint to use --list
{
  if (detExample) {
    const r = cli([COMPILE_CLI, detExample.path, '--format', 'invalid-format', '--no-validate']);
    check('compile.mjs (bad format) exits 1', r.status === 1);
    check('compile.mjs (bad format) suggests --list', r.err.includes('--list') || r.err.includes('Unknown output format'));
  }
}

// validate.mjs --help
{
  const r = cli([VALIDATE_CLI, '--help']);
  check('validate.mjs --help exits 0', r.status === 0);
  check('validate.mjs --help shows usage', r.out.includes('Usage:') && r.out.includes('validate.mjs'));
  check('validate.mjs --help shows examples', r.out.includes('Examples:'));
  check('validate.mjs --help shows exit codes', r.out.includes('Exit Codes:'));
}

// validate.mjs -h (short flag)
{
  const r = cli([VALIDATE_CLI, '-h']);
  check('validate.mjs -h exits 0', r.status === 0);
}

// validate.mjs with no input → exit 2
{
  const r = cli([VALIDATE_CLI]);
  check('validate.mjs (no args) exits 2', r.status === 2);
  check('validate.mjs (no args) shows error', r.err.includes('Error:') || r.out.includes('Error:'));
}

// validate.mjs with valid file → exit 0
{
  const validPath = join(PKG, 'examples', 'islamic', '01-hex-star-field.json');
  const r = cli([VALIDATE_CLI, validPath]);
  check('validate.mjs (valid file) exits 0', r.status === 0);
  check('validate.mjs (valid file) shows PASS', r.out.includes('PASS'));
}

// validate.mjs with invalid file → exit 1
{
  const invalidPath = join(PKG, 'examples', 'invalid', '01-missing-pattern-id.json');
  const r = cli([VALIDATE_CLI, invalidPath]);
  check('validate.mjs (invalid file) exits 1', r.status === 1);
  check('validate.mjs (invalid file) shows FAIL', r.err.includes('FAIL') || r.out.includes('FAIL'));
  check('validate.mjs (invalid file) shows violation count', r.err.includes('schema violation') || r.out.includes('schema violation'));
}

// ---- Results ----

console.log('');
console.log(`Results: ${passed}/${passed + failed} passed` + (failed > 0 ? `, ${failed} failed` : ''));
console.log('');

if (failed > 0) {
  process.exit(1);
}
