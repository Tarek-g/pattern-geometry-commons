# Pattern Geometry Commons

[![npm version](https://img.shields.io/npm/v/@tarek-g/pattern-geometry-commons)](https://www.npmjs.com/package/@tarek-g/pattern-geometry-commons)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Type](https://img.shields.io/badge/type-ESM-brightgreen)](https://nodejs.org/api/esm.html)

**Pattern Geometry Commons** defines the semantic layer above Maker.js, SVG, and CAD tools. Existing tools know how to draw and export geometry. Pattern Geometry Commons knows what the pattern means before it becomes geometry.

---

## What This Is

Pattern Geometry Commons is a **semantic intermediate representation (IR)** for 2D pattern systems. It is **NOT** a geometry library, **NOT** a drawing engine, and **NOT** a Maker.js replacement.

The IR describes:

- **Motifs** — the semantic building blocks (stars, rosettes, polygons, custom figures)
- **Tilings** — the arrangement system (regular, semi-regular, radial, frieze, lattice, freeform)
- **Symmetry** — wallpaper groups, rotational order, reflection
- **Style** — rendering intent (line, fill, interlace, band)
- **Metadata** — optional provenance, attribution, licensing

It does **NOT** describe:

- Low-level path segments (lines, arcs, beziers)
- Vertex coordinates
- Export format specifics
- Backend optimization hints

---

## Stable Surface

These APIs are guaranteed stable. Breaking changes will be versioned.

| API | Since | Contract |
|-----|-------|----------|
| `validateIr(ir)` | v0.1.0 | Returns `{ valid, errors }` — validates against pg-ir-v0 schema |
| `compileIr(ir, opts)` | v0.1.0 | Returns `{ result, meta }` — compiles IR to backend output |
| `loadSchema()` | v0.1.0 | Returns parsed JSON Schema object |
| `getSchemaPath()` | v0.1.0 | Returns absolute path to `spec/pg-ir.schema.json` |
| `getValidator()` | v0.1.0 | Returns a compiled Ajv validator instance |
| `registerBackend(format, fn)` | v0.1.0 | Registers a custom backend compiler |
| `listFormats()` | v0.1.0 | Returns `['svg', 'makerjs-json', 'makerjs-svg', 'makerjs-dxf']` |
| `listExamples()` | v0.1.0 | Returns array of `{ path, category, name }` |
| `loadExample(path)` | v0.1.0 | Returns parsed JSON example |
| `compileSvg(ir, opts)` | v0.1.0 | Built-in SVG backend |
| `compileMakerJsJson(ir, opts)` | v0.1.0 | Maker.js JSON model backend |
| `compileMakerJsSvg(ir, opts)` | v0.1.0 | Maker.js SVG export backend |
| `compileMakerJsDxf(ir, opts)` | v0.1.0 | Maker.js DXF R12 export backend |

### Stable Formats

| Format | Backend | Status |
|--------|---------|--------|
| `svg` | Built-in SVG backend | ✅ Stable |
| `makerjs-json` | Maker.js JSON model | ✅ Stable |
| `makerjs-svg` | Maker.js SVG export | ✅ Stable |
| `makerjs-dxf` | Maker.js DXF R12 export | ✅ Stable |
| `makerjs-pdf` | Maker.js PDF export | 🔒 Blocked (needs jsPDF) |

### Stable Schema

The `pg-ir-v0` schema at `spec/pg-ir.schema.json` is the current stable version. All examples in `examples/` validate against it. Schema changes will be versioned (`pg-ir-v1`, etc.).

---

## Architecture

```
Application / CLI / Demo
        ↓
Pattern Geometry IR  ← YOU ARE HERE
        ↓
Validator + Semantic Checks
        ↓
Compiler Pipeline
        ↓
Backend Adapters  (Maker.js, SVG, DXF, PDF, ...)
        ↓
Geometry Output
```

**Core owns** the IR semantics, schema, validation, and compiler pipeline. **Backends own** low-level paths, boolean ops, and export formats.

---

## Quick Start

### Install

```bash
npm install @tarek-g/pattern-geometry-commons
```

### Validate a single file

```bash
node scripts/validate.mjs examples/islamic/01-hex-star-field.json
```

### Validate all examples

```bash
npm run test:ir
```

### Compile IR to SVG

```bash
# Via CLI
node scripts/compile.mjs \
  examples/islamic/01-hex-star-field.json \
  --format svg --out output.svg

# Via API
import { compileIr } from '@tarek-g/pattern-geometry-commons';

const { result, meta } = await compileIr(ir, { format: 'svg' });
```

### Compile IR to DXF (for CNC/CAD)

```bash
node scripts/compile.mjs \
  examples/fabrication/01-perforated-screen.json \
  --format makerjs-dxf --out screen.dxf
```

---

## Package Structure

```
pattern-geometry-commons/
├── README.md                     ← This file
├── package.json                  ← npm package definition
├── LICENSE                       ← Apache-2.0
│
├── spec/
│   └── pg-ir.schema.json         ← JSON Schema (draft 2020-12) for pg-ir-v0
│
├── src/
│   ├── index.mjs                 ← Public API barrel
│   ├── schema-loader.mjs         ← Schema loading and caching
│   ├── validator.mjs             ← IR validation (Ajv wrapper)
│   ├── compiler.mjs              ← Compiler pipeline + backend routing
│   ├── example-lister.mjs        ← Example discovery and loading
│   └── backends/
│       ├── svg-backend.mjs       ← Minimal SVG backend
│       └── makerjs-backend.mjs   ← Experimental Maker.js backend
│
├── examples/
│   ├── islamic/                  ← 4 corpus-inspired Islamic patterns
│   ├── abstract/                 ← 3 non-Islamic geometric patterns
│   ├── fabrication/              ← 3 fabrication/perforation patterns
│   └── invalid/                  ← Intentionally invalid samples
│
├── scripts/
│   ├── validate.mjs              ← Single-file validator
│   ├── validate-all.mjs          ← Batch validator (all examples)
│   ├── compile.mjs               ← CLI compiler (IR → SVG/JSON/DXF)
│   └── test-compiler.mjs         ← Compiler test suite
│
└── output/                       ← Generated artifacts (not distributed)
    ├── examples/                 ← Generated SVG files
    ├── makerjs/                  ← Generated Maker.js JSON files
    └── cross-backend/            ← Cross-backend verification reports
```

---

## Schema (pg-ir-v0)

```json
{
  "version": "pg-ir-v0",
  "pattern": {
    "id": "unique-pattern-id",
    "name": "Pattern Name",
    "category": "islamic|abstract|fabrication",
    "classification": "repeating-field|frieze|radial|freeform|lattice"
  },
  "geometry": {
    "tiling": {
      "type": "regular|semi-regular|custom|radial",
      "id": "6.6.6|4.4.4.4|4.8.8|diagonal-grid|...",
      "cellSize": 60
    },
    "motifs": [
      {
        "id": "motif-1",
        "family": "star|rosette|polygon|simple|custom",
        "parameters": {
          "sides": 6,
          "skip": 1,
          "rotation": 0
        },
        "renderMode": "line|fill|interlace|band|none"
      }
    ],
    "symmetry": {
      "type": "wallpaper|rosette|frieze",
      "group": "p6m|p4m|p3m1|..."
    }
  }
}
```

### Classification Types

| Value | Description |
|-------|-------------|
| `repeating-field` | Regular repeating 2D field |
| `frieze` | Linear band / border |
| `radial` | Concentric / circular arrangement |
| `freeform` | Non-periodic, custom layout |
| `lattice` | Structural lattice / space frame |

### Motif Families

| Family | Description |
|--------|-------------|
| `star` | Star polygon (n-pointed) |
| `rosette` | Layered petal/floral motif |
| `polygon` | Regular or inscribed polygon |
| `simple` | Basic filled/stroked shape |
| `custom` | Backend-defined custom figure |
| `irregular` | Irregular/non-standard figure |

### Rendering Modes

| Mode | Description |
|------|-------------|
| `line` | Stroke-only wireframe |
| `fill` | Filled shapes |
| `interlace` | Over/under weave |
| `band` | Ribbon/band rendering |
| `none` | No rendering (metadata-only) |

---

## Examples

### Islamic (corpus-inspired)

- **Hexagon Star Field** — 6-fold star tiling on 6.6.6
- **Octagon-Square Star** — 8-fold star on 4.8.8
- **Decagon-Hexagon Star** — 10-fold star on 10.6.10.6
- **Rosette Hex Field** — Deep rosette on 6.6.6

### Abstract

- **Square Grid** — Minimal inscribed polygon grid
- **Radial Geometric** — Concentric ring arrangement
- **Generative Stripe** — Moiré/interference pattern

### Fabrication (CNC/CAD)

- **Perforated Screen** — CNC mashrabiya screen
- **Laser-Cut Panel** — Interlocking hex panel
- **Architectural Lattice** — Water-jet lattice with infill

---

## Relationship to islamic-pattern-mvp

The [islamic-pattern-mvp](https://github.com/Tarek-g/islamic-pattern-mvp) repository is the proof-of-concept that validated the core approach. Pattern Geometry Commons extracts the semantic IR layer from that work into a standalone, domain-neutral specification.

The islamic-pattern-mvp `scene-v4` / `ornament-ir-v1` remain the internal format of the existing app. PG-IR v0 is the public, generalized IR.

---

## Development

```bash
# Install dependencies
npm install

# Run all tests
npm run test:ir        # Schema validation
npm run test:compiler  # Compiler pipeline
npm run test:cross-backend # Cross-backend verification

# Validate
npm run validate -- file.json

# Compile
npm run compile -- file.json --format svg --out output.svg
```

---

## License

Copyright 2026 [Tarek Alghorani](https://github.com/Tarek-g)

Licensed under the Apache License, Version 2.0.
See [LICENSE](LICENSE) for details.
