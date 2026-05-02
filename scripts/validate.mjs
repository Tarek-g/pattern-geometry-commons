#!/usr/bin/env node

/**
 * Pattern Geometry IR Validator
 *
 * Validates one or more Pattern Geometry IR JSON files against the
 * pg-ir-v0 JSON Schema using Ajv.
 *
 * Usage:
 *   node validate.mjs <file.ir.json> [file2.ir.json ...]
 *   node validate.mjs --help
 *
 * Exit codes:
 *   0 — all files valid
 *   1 — one or more files invalid (schema violations)
 *   2 — usage error (missing file, file not found, parse error)
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCHEMA_PATH = join(__dirname, '..', 'spec', 'pg-ir.schema.json');

function printHelp() {
  console.log(`Pattern Geometry IR Validator — pg-ir-v0

Usage:
  node validate.mjs <file.ir.json> [file2.ir.json ...]

Validates one or more Pattern Geometry IR JSON files against the pg-ir-v0 schema.

Options:
  --help, -h    Show this help message

Exit Codes:
  0   All files valid
  1   One or more files have schema violations
  2   Usage error (missing file, file not found, parse error)

Examples:
  # Validate a single file
  node validate.mjs examples/islamic/01-hex-star-field.json

  # Validate multiple files
  node validate.mjs examples/islamic/*.json

  # Validate all examples
  node validate-all.mjs

  # Check exit code
  node validate.mjs my-file.json && echo "Valid" || echo "Invalid"

Schema: spec/pg-ir.schema.json (JSON Schema draft 2020-12)`);
}

async function loadSchema() {
  const raw = await readFile(SCHEMA_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function validateFiles(filePaths) {
  const schema = await loadSchema();
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  let allValid = true;
  let total = 0;
  let passed = 0;
  let failed = 0;

  for (const fp of filePaths) {
    total++;
    let instance;
    try {
      const raw = await readFile(fp, 'utf-8');
      instance = JSON.parse(raw);
    } catch (err) {
      console.error(`  PARSE ERROR: ${fp}`);
      console.error(`  ${err.message}`);
      failed++;
      allValid = false;
      continue;
    }

    const valid = validate(instance);
    if (valid) {
      console.log(`  PASS: ${fp}`);
      passed++;
    } else {
      console.error(`  FAIL: ${fp}`);
      console.error(`  ${validate.errors.length} schema violation(s):`);
      for (const err of validate.errors) {
        const path = err.instancePath || '(root)';
        console.error(`    - ${path}: ${err.message}${err.params ? ' ' + JSON.stringify(err.params) : ''}`);
      }
      failed++;
      allValid = false;
    }
  }

  return { allValid, total, passed, failed };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    if (args.length === 0) {
      console.error('Error: No input files provided.\n');
    }
    printHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }

  const { allValid, total, passed, failed } = await validateFiles(args);

  console.log('');
  console.log(`  Results: ${passed}/${total} passed` + (failed > 0 ? `, ${failed} failed` : '') + '.');

  process.exit(allValid ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(2);
});
