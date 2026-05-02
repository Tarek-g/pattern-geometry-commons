#!/usr/bin/env node

/**
 * Pattern Geometry IR Compiler CLI
 *
 * Compiles a PG-IR JSON file into the requested output format.
 *
 * Usage:
 *   node compile.mjs <file.json> [--format svg] [--out output.svg]
 *   node compile.mjs --help
 *   node compile.mjs --list
 *
 * Exit codes:
 *   0 — compiled successfully
 *   1 — validation or compile error
 *   2 — usage error (missing file, file not found, parse error)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function printHelp() {
  console.log(`Pattern Geometry IR Compiler CLI — pg-ir-v0

Usage:
  node compile.mjs <file.json> [options]

Compiles a Pattern Geometry IR JSON file to the requested output format.

Options:
  --format, -f   Output format                              [default: svg]
                 One of: svg, makerjs-json, makerjs-svg, makerjs-dxf
  --out, -o      Output file path                           [default: stdout]
  --no-validate  Skip IR validation before compile
  --cell-size    Tile cell size in SVG units                [default: 60]
  --list         List available output formats
  --help, -h     Show this help message

Exit Codes:
  0   Compiled successfully
  1   Validation or compile error
  2   Usage error (missing file, file not found, parse error)

Examples:
  # Compile to SVG and print to stdout
  node compile.mjs examples/islamic/01-hex-star-field.json

  # Compile to SVG file
  node compile.mjs examples/islamic/01-hex-star-field.json --out output.svg

  # Compile to Maker.js JSON model
  node compile.mjs examples/islamic/01-hex-star-field.json --format makerjs-json -o model.json

  # Compile to DXF for fabrication
  node compile.mjs examples/fabrication/01-perforated-screen.json --format makerjs-dxf -o panel.dxf

  # Skip validation (trusted IR only)
  node compile.mjs trusted.json --no-validate --out output.svg

  # List all available formats
  node compile.mjs --list

Schema: spec/pg-ir.schema.json (JSON Schema draft 2020-12)`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--list')) {
    const { listFormats } = await import('../src/compiler.mjs');
    console.log('Available output formats:');
    for (const fmt of listFormats()) {
      console.log(`  - ${fmt}`);
    }
    process.exit(0);
  }

  // Parse arguments
  let inputPath = null;
  let format = 'svg';
  let outPath = null;
  let validate = true;
  let cellSize = 60;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--format' || arg === '-f') {
      format = args[++i];
    } else if (arg === '--out' || arg === '-o') {
      outPath = args[++i];
    } else if (arg === '--no-validate') {
      validate = false;
    } else if (arg === '--cell-size') {
      cellSize = parseInt(args[++i], 10);
    } else if (!arg.startsWith('-')) {
      inputPath = arg;
    }
  }

  if (!inputPath) {
    console.error('Error: No input file provided.\n');
    printHelp();
    process.exit(2);
  }

  // Resolve path
  const resolvedPath = inputPath.startsWith('/') ? inputPath : join(process.cwd(), inputPath);

  // Read input
  let ir;
  try {
    const raw = await readFile(resolvedPath, 'utf-8');
    ir = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`ERROR: File not found: ${resolvedPath}`);
    } else {
      console.error(`ERROR: Cannot read or parse input file: ${resolvedPath}`);
      console.error(`  ${err.message}`);
    }
    process.exit(2);
  }

  // Compile
  const { compileIr } = await import('../src/compiler.mjs');
  try {
    const { result, meta } = await compileIr(ir, { format, validate, cellSize });
    const metaStr = `<!-- PG-IR: ${ir.pattern?.id || 'unknown'} | tiles: ${meta.tileCount || '?'} | tiling: ${meta.tiling || '?'} | render: ${meta.renderMode || '?'} -->`;

    if (outPath) {
      const resolvedOut = outPath.startsWith('/') ? outPath : join(process.cwd(), outPath);
      let content;
      if (typeof result === 'string') {
        if (format === 'svg') {
          content = result.replace('<?xml', `${metaStr}\n<?xml`);
        } else if (format === 'makerjs-svg') {
          content = metaStr + '\n' + result;
        } else {
          content = result;
        }
      } else {
        content = JSON.stringify({ meta, result }, null, 2) + '\n';
      }
      await writeFile(resolvedOut, content, 'utf-8');
      console.log(`Compiled: ${resolvedPath} → ${resolvedOut}`);
      console.log(`  Format: ${format} | Tiles: ${meta.tileCount} | Tiling: ${meta.tiling}`);
    } else {
      if (typeof result === 'string') {
        if (format === 'svg') {
          console.log(metaStr);
          console.log(result);
        } else {
          console.log(result);
        }
      } else {
        console.log(JSON.stringify({ meta, result }, null, 2));
      }
    }
  } catch (err) {
    if (err.code === 'IR_VALIDATION_FAILED') {
      console.error('VALIDATION FAILED:');
      for (const e of err.validationErrors) {
        console.error(`  ${e.path}: ${e.message}`);
      }
      process.exit(1);
    }
    if (err.message && err.message.includes('Unknown output format')) {
      console.error(`FORMAT ERROR: ${err.message}`);
      console.error('Run `node compile.mjs --list` to see available formats.');
      process.exit(1);
    }
    console.error(`COMPILE ERROR: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(2);
});
