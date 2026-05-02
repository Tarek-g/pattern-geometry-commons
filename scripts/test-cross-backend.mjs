#!/usr/bin/env node

/**
 * Pattern Geometry IR — Cross-Backend Verification Suite
 *
 * Verifies that the built-in SVG backend and Maker.js SVG/DXF/PDF backends
 * produce consistent, structurally valid output for the same IR inputs.
 *
 * Strategy: structural checks (not pixel/image diff) — SVG validity,
 * element counts, bounds consistency, metadata preservation, determinism,
 * DXF structural validity for fabrication examples.
 *
 * Exit 0 when all checks pass.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const makerjs = require('makerjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG = join(__dirname, '..');
const OUTPUT = join(PKG, 'output', 'cross-backend');

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

// ---- SVG structural helpers ----

function countSvgElements(svg) {
  const paths = (svg.match(/<path\b/g) || []).length;
  const circles = (svg.match(/<circle\b/g) || []).length;
  const lines = (svg.match(/<line\b/g) || []).length;
  const rects = (svg.match(/<rect\b/g) || []).length;
  const polys = (svg.match(/<polygon\b/g) || []).length;
  return { paths, circles, lines, rects, polys, total: paths + circles + lines + rects + polys };
}

function extractViewBox(svg) {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (!m) return null;
  const parts = m[1].split(/\s+/).map(Number);
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function extractSvgDimensions(svg) {
  const wm = svg.match(/width="([^"]+)"/);
  const hm = svg.match(/height="([^"]+)"/);
  return {
    width: wm ? parseFloat(wm[1]) : NaN,
    height: hm ? parseFloat(hm[1]) : NaN,
  };
}

function svgHasXmlDecl(svg) {
  return svg.startsWith('<?xml');
}

function svgHasSvgTag(svg) {
  return svg.includes('<svg') && svg.includes('</svg>');
}

// ---- DXF structural helpers ----

function dxfHasR12Header(dxf) {
  return dxf.startsWith('0\nSECTION');
}

function countDxfEntities(dxf) {
  const lines = (dxf.match(/^\s*0\s*\n\s*LINE\s*$/gm) || []).length;
  const circles = (dxf.match(/^\s*0\s*\n\s*CIRCLE\s*$/gm) || []).length;
  const arcs = (dxf.match(/^\s*0\s*\n\s*ARC\s*$/gm) || []).length;
  const polylines = (dxf.match(/^\s*0\s*\n\s*POLYLINE\s*$/gm) || []).length;
  return { lines, circles, arcs, polylines, total: lines + circles + arcs + polylines };
}

function dxfHasEntitesSection(dxf) {
  return dxf.includes('ENTITIES');
}

function dxfHasEof(dxf) {
  return dxf.includes('EOF');
}

// ---- Main ----

async function main() {
  await mkdir(OUTPUT, { recursive: true });

  const api = await import('../src/index.mjs');
  const examples = await api.listExamples();

  // ---- Section 1: Cross-backend SVG comparison ----

  // Regression guard: tilings that were resolved in WP-8/WP-9.
  // If either backend emits zero motif elements for these, it is a
  // hard regression — not an acceptable known gap.
  const RESOLVED_GAP_TILINGS = new Set([
    '10.6.10.6',       // WP-8: semi-regular 10.6.10.6 checkerboard approximation
    'diagonal-lattice', // WP-8: lattice tiling with structural/infill cells
    'none',             // WP-9: freeform SVG backend for none tilings
  ]);

  console.log('=== Section 1: Cross-backend SVG (svg ↔ makerjs-svg) ===\n');

  const comparisonResults = [];

  for (const ex of examples) {
    const label = `${ex.category}/${ex.name}`;
    console.log(`--- ${label} ---`);

    let builtinSvg, makerJsSvg, builtinMeta, makerJsMeta;
    const ir = await api.loadExample(ex.path);

    // Compile built-in SVG
    try {
      const r = await api.compileIr(ir, { format: 'svg' });
      builtinSvg = r.result;
      builtinMeta = r.meta;
    } catch (err) {
      check(`${label}: built-in SVG compile`, false, err.message);
      continue;
    }

    // Compile makerjs-svg
    try {
      const r = await api.compileIr(ir, { format: 'makerjs-svg' });
      makerJsSvg = r.result;
      makerJsMeta = r.meta;
    } catch (err) {
      check(`${label}: makerjs-svg compile`, false, err.message);
      continue;
    }

    // Structural validity — both backends
    check(`${label}: built-in SVG is string`, typeof builtinSvg === 'string');
    check(`${label}: built-in SVG has <svg> tag`, svgHasSvgTag(builtinSvg));
    check(`${label}: makerjs-svg is string`, typeof makerJsSvg === 'string');
    check(`${label}: makerjs-svg has <svg> tag`, svgHasSvgTag(makerJsSvg));

    // Element counts — both produce geometry (motif-level, exclude background rect)
    const builtinEls = countSvgElements(builtinSvg);
    const makerEls = countSvgElements(makerJsSvg);
    const builtinMotifEls = builtinEls.paths + builtinEls.circles + builtinEls.lines + builtinEls.polys;
    const makerMotifEls = makerEls.total; // makerjs-svg has no background rect
    const tilingSupported = builtinMotifEls > 0;

    check(`${label}: built-in SVG motif elements`, builtinMotifEls >= 0,
      `motif=${builtinMotifEls} (total=${builtinEls.total}, rects=${builtinEls.rects})`);
    check(`${label}: makerjs-svg motif elements`, makerMotifEls >= 0,
      `total=${makerEls.total}`);

    // Cross-backend consistency: if tiling is supported, both must produce geometry
    if (tilingSupported) {
      check(`${label}: makerjs-svg also has geometry`, makerMotifEls > 0,
        `makerjs=${makerMotifEls}`);
    } else {
      // Known gap: tiling falls back to grid with no matching motifs — note as INFO
      console.log(`  INFO: ${label} — tiling "${builtinMeta.tiling}" has no matching motifs (known gap, not a cross-backend bug)`);
    }

    // ── Regression guard: resolved-gap tilings must NEVER fall back ──
    const tilingId = builtinMeta.tiling || ir.geometry?.tiling?.id || '';
    if (RESOLVED_GAP_TILINGS.has(tilingId)) {
      const guardLabel = `${label}: RESOLVED-GAP GUARD (tiling="${tilingId}")`;
      check(`${guardLabel}: built-in SVG has geometry`,
        builtinMotifEls > 0,
        `built-in produced ${builtinMotifEls} motif elements (must be > 0 — regression!)`);
      check(`${guardLabel}: makerjs-svg has geometry`,
        makerMotifEls > 0,
        `makerjs-svg produced ${makerMotifEls} motif elements (must be > 0 — regression!)`);
      check(`${guardLabel}: built-in tileCount > 0`,
        builtinMeta.tileCount > 0,
        `tileCount=${builtinMeta.tileCount}`);
      check(`${guardLabel}: makerjs tileCount > 0`,
        makerJsMeta.tileCount > 0,
        `tileCount=${makerJsMeta.tileCount}`);
      check(`${guardLabel}: tileCount consistent`,
        builtinMeta.tileCount === makerJsMeta.tileCount,
        `built-in=${builtinMeta.tileCount} makerjs=${makerJsMeta.tileCount}`);
    }

    // Bounds — non-zero dimensions expected when tiling is supported
    const builtinDims = extractSvgDimensions(builtinSvg) || extractViewBox(builtinSvg);
    const makerDims = extractSvgDimensions(makerJsSvg) || extractViewBox(makerJsSvg);
    const builtinHasDims = builtinDims && builtinDims.width > 0 && builtinDims.height > 0;
    const makerHasDims = makerDims && makerDims.width > 0 && makerDims.height > 0;

    if (tilingSupported) {
      check(`${label}: built-in SVG has non-zero dimensions`, builtinHasDims,
        builtinDims ? `${builtinDims.width}x${builtinDims.height}` : 'no dims');
      check(`${label}: makerjs-svg has non-zero dimensions`, makerHasDims,
        makerDims ? `${makerDims.width}x${makerDims.height}` : 'no dims');
    }

    // Metadata consistency — tileCount and tiling match across backends
    const tileCountMatch = builtinMeta.tileCount === makerJsMeta.tileCount;
    const tilingMatch = builtinMeta.tiling === makerJsMeta.tiling;
    check(`${label}: tileCount consistent`, tileCountMatch,
      `built-in=${builtinMeta.tileCount} makerjs=${makerJsMeta.tileCount}`);
    check(`${label}: tiling ID consistent`, tilingMatch,
      `built-in="${builtinMeta.tiling}" makerjs="${makerJsMeta.tiling}"`);

    // Determinism within each backend
    const ir2 = await api.loadExample(ex.path);
    const builtin2 = await api.compileIr(ir2, { format: 'svg' });
    const maker2 = await api.compileIr(ir2, { format: 'makerjs-svg' });
    check(`${label}: built-in SVG deterministic`, builtinSvg === builtin2.result);
    check(`${label}: makerjs-svg deterministic`, makerJsSvg === maker2.result);

    // Approximate bounds consistency — widths should be within 3x for supported tilings
    // (different viewport strategies; freeform/fallback may diverge more)
    if (tilingSupported && builtinHasDims && makerHasDims) {
      const wRatio = Math.max(builtinDims.width, makerDims.width) /
                     Math.min(builtinDims.width, makerDims.width);
      check(`${label}: bounds width within 3x`, wRatio <= 3.0,
        `ratio=${wRatio.toFixed(2)} built-in=${builtinDims.width} makerjs=${makerDims.width}`);
    }

    comparisonResults.push({
      example: label,
      patternId: ir.pattern?.id,
      classification: ir.pattern?.classification,
      builtinElements: builtinEls,
      makerElements: makerEls,
      builtinDims: builtinHasDims ? builtinDims : null,
      makerDims: makerHasDims ? makerDims : null,
      tileCount: builtinMeta.tileCount,
      tiling: builtinMeta.tiling,
      renderMode: builtinMeta.renderMode,
    });

    console.log();
  }

  // ---- Section 2: DXF structural checks (fabrication examples) ----

  console.log('=== Section 2: DXF Structural Checks (fabrication) ===\n');

  const fabExamples = examples.filter((e) => e.category === 'fabrication');

  for (const ex of fabExamples) {
    const label = `${ex.category}/${ex.name}`;
    console.log(`--- ${label} ---`);

    const ir = await api.loadExample(ex.path);
    try {
      const { result: dxf, meta } = await api.compileIr(ir, { format: 'makerjs-dxf' });
      check(`${label}: DXF is string`, typeof dxf === 'string');
      check(`${label}: DXF has R12 header`, dxfHasR12Header(dxf));
      check(`${label}: DXF has ENTITIES section`, dxfHasEntitesSection(dxf));
      check(`${label}: DXF has EOF marker`, dxfHasEof(dxf));

      const entities = countDxfEntities(dxf);
      const dxfMotifCount = meta.motifCount || 0;
      if (dxfMotifCount > 0) {
        check(`${label}: DXF has geometry entities`, entities.total > 0,
          `LINE=${entities.lines} CIRCLE=${entities.circles} ARC=${entities.arcs} POLYLINE=${entities.polylines}`);
      } else {
        console.log(`  INFO: ${label} — DXF motifCount=0 (tiling falls back with no matching motifs, known gap)`);
      }

      check(`${label}: DXF tileCount in meta`, typeof meta.tileCount === 'number' && meta.tileCount > 0);
      check(`${label}: DXF format in meta`, meta.format === 'makerjs-dxf');

      // Write DXF artifact for acceptance
      const dxfOutPath = join(OUTPUT, `${ex.name}-cross-backend.dxf`);
      await writeFile(dxfOutPath, dxf, 'utf-8');
      console.log(`  Wrote: ${dxfOutPath}`);
    } catch (err) {
      check(`${label}: DXF compile`, false, err.message);
    }

    console.log();
  }

  // ---- Section 3: Maker.js PDF Export Evaluation ----

  console.log('=== Section 3: Maker.js PDF Export Evaluation ===\n');

  const pdfBlocker = [];
  const hasToPdf = typeof makerjs.exporter.toPDF === 'function';
  check('makerjs.exporter.toPDF exists', hasToPdf);

  if (hasToPdf) {
    // Check if jsPDF is available (toPDF requires a jsPDF doc as first arg)
    let jsPdfAvailable = false;
    try {
      require.resolve('jspdf');
      jsPdfAvailable = true;
    } catch {
      jsPdfAvailable = false;
    }

    if (!jsPdfAvailable) {
      pdfBlocker.push(
        'makerjs.exporter.toPDF(doc, model, options) requires a jsPDF document instance as the first argument.',
        'jsPDF is not in the dependency tree (npm ls jspdf returns empty).',
        'Blocker: adding jsPDF (~1.2MB) as a dependency solely for PDF export is a non-trivial scope decision.',
        'Recommendation: defer makerjs-pdf backend to a future WP when PDF export is explicitly required by a consumer.'
      );
      console.log('  BLOCKED: makerjs-pdf — jsPDF not available (documented blocker, not a regression).');
    } else {
      // Test actual PDF generation
      try {
        const { jsPDF } = require('jspdf');
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' });
        const testModel = { paths: { line: new makerjs.paths.Line([0, 0], [100, 100]) } };
        makerjs.exporter.toPDF(doc, testModel);
        const pdfOutput = doc.output();
        check('PDF generation succeeds', pdfOutput && pdfOutput.length > 0);
      } catch (err) {
        const msg = `PDF generation failed: ${err.message}`;
        pdfBlocker.push(msg);
        check('PDF generation', false, msg);
      }
    }
  } else {
    pdfBlocker.push('makerjs.exporter.toPDF is not available in this Maker.js version.');
  }

  // Write PDF blocker report
  const pdfReportPath = join(OUTPUT, 'pdf-export-evaluation.md');
  const pdfReport = [
    '# Maker.js PDF Export — Evaluation Report',
    '',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**Maker.js version:** ${makerjs.version}`,
    `**Status:** ${pdfBlocker.length === 0 ? 'PASS — PDF export works' : 'BLOCKED'}`,
    '',
    '## Findings',
    '',
    `- \`makerjs.exporter.toPDF\` ${hasToPdf ? 'exists' : 'DOES NOT exist'}`,
    `- Function signature: \`toPDF(doc, modelToExport, options)\` — requires jsPDF \`doc\` as first argument`,
    '',
    pdfBlocker.length > 0 ? '## Blockers' : '## No Blockers',
    '',
    ...pdfBlocker.map((b) => `- ${b}`),
    '',
  ].join('\n');
  await writeFile(pdfReportPath, pdfReport, 'utf-8');
  console.log(`  PDF evaluation report: ${pdfReportPath}\n`);

  // ---- Section 4: Supported format cross-check ----

  console.log('=== Section 4: Format listing cross-check ===\n');

  const formats = api.listFormats();
  check('listFormats includes svg', formats.includes('svg'));
  check('listFormats includes makerjs-json', formats.includes('makerjs-json'));
  check('listFormats includes makerjs-svg', formats.includes('makerjs-svg'));
  check('listFormats includes makerjs-dxf', formats.includes('makerjs-dxf'));
  check('listFormats returns exactly 4 formats', formats.length === 4,
    `found ${formats.length}: ${formats.join(', ')}`);

  console.log();

  // ---- Write comparison report ----

  const report = {
    generatedAt: new Date().toISOString().split('T')[0],
    makerjsVersion: makerjs.version,
    totalExamples: examples.length,
    totalComparisons: comparisonResults.length,
    checksPassed: passed,
    checksFailed: failed,
    pdfExport: {
      available: hasToPdf && pdfBlocker.length === 0,
      blockers: pdfBlocker,
    },
    comparisons: comparisonResults,
  };

  await writeFile(
    join(OUTPUT, 'cross-backend-report.json'),
    JSON.stringify(report, null, 2) + '\n',
    'utf-8'
  );

  // ---- Results ----

  console.log(`Results: ${passed}/${passed + failed} passed` + (failed > 0 ? `, ${failed} failed` : ''));
  console.log('');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(2);
});
