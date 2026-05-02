# Pattern Geometry Commons

> Pattern Geometry Commons defines the semantic layer above Maker.js, SVG, and CAD tools. Existing tools know how to draw and export geometry. Pattern Geometry Commons knows what the pattern means before it becomes geometry.

## What This Is

Pattern Geometry Commons is a **semantic intermediate representation (IR)** for 2D pattern systems. It is NOT a geometry library, NOT a drawing engine, and NOT a Maker.js replacement.

The IR describes:
- **Motifs** — the semantic building blocks (stars, rosettes, polygons, custom figures)
- **Tilings** — the arrangement system (regular, semi-regular, radial, frieze, lattice, freeform)
- **Symmetry** — wallpaper groups, rotational order, reflection
- **Style** — rendering intent (line, fill, interlace, band)
- **Metadata** — optional provenance, attribution, licensing

It does NOT describe:
- Low-level path segments (lines, arcs, beziers)
- Vertex coordinates
- Export format specifics
- Backend optimization hints

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
| `compileMakerJsDxf(ir, opts)` | v0.1.0 | Maker.js DXF export backend |

### Stable Formats

| Format | Backend | Status |
|--------|---------|--------|
| `svg` | Built-in SVG backend | Stable |
| `makerjs-json` | Maker.js JSON model | Stable |
| `makerjs-svg` | Maker.js SVG export | Stable |
| `makerjs-dxf` | Maker.js DXF R12 export | Stable |

### Stable Schema

The `pg-ir-v0` schema at `spec/pg-ir.schema.json` is the current stable version. All examples in `examples/` validate against it. Schema changes will be versioned (`pg-ir-v1`, etc.).

## Experimental Surface

These features exist in the package but may change without a version bump.

| Feature | Since | Notes |
|---------|-------|-------|
| Maker.js PDF export (`makerjs-pdf`) | — | Blocked on jsPDF dependency. Backend not registered. |
| CLI `--cell-size` parameter | v0.1.0 | May move to per-backend options in future |
| `compileIr(ir, { validate: false })` | v0.1.0 | Bypass flag for trusted IR — semantics may change |
| Maker.js model structure | v0.1.0 | Internal model shape not yet stable across versions |

## Out of Scope

These are explicitly NOT part of Pattern Geometry Commons. Do not depend on them appearing.

### Not an Editable Archive

`pg-ir-v0` is a **semantic exchange format** — not a lossless project file. Do not use it as your application's save format. The round-trip bridge (`pg-ir-v0` → `scene-v4`) is intentionally **reconstructive** (107/107 cases bridge but 0/107 are lossless). The following are not preserved across round-trips:

- Style maps and per-layer overrides
- Workspace layers, overlays, viewport state
- TAP source contracts and source-cell details
- Shape-First authoring state
- Interlace/band parameters and debug flags

### No Browser Import

Browser import of `pg-ir-v0` is **intentionally blocked** in the islamic-pattern-mvp app. PG-IR import is CLI-only. The app will reject PG-IR files with an explicit message. Use the CLI compiler or programmatic API instead.

### No Renderer Changes

Pattern Geometry Commons does not change the default renderer in the main application. The built-in SVG backend and the Maker.js backends are independent compilation targets.

### Research Tracks Not Included

- OpenCV / image-to-IR
- Calligraphy / glyph pipelines
- UI editor or visual authoring tools
- 3D / STL / JSCAD export (not yet)
- Full historical atlas metadata

## Architecture

```text
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

**Core owns** the IR semantics, schema, validation, and compiler pipeline.
**Backends own** low-level paths, boolean ops, and export formats.

## Package Structure

```
packages/pattern-geometry-commons/
  README.md                     ← This file
  spec/
    pg-ir.schema.json           ← JSON Schema (draft 2020-12) for pg-ir-v0
  src/
    index.mjs                   ← Public API barrel
    schema-loader.mjs           ← Schema loading and caching
    validator.mjs               ← IR validation (Ajv wrapper)
    compiler.mjs                ← Compiler pipeline + backend routing
    example-lister.mjs          ← Example discovery and loading
    backends/
      svg-backend.mjs           ← Minimal SVG backend
      makerjs-backend.mjs       ← Experimental Maker.js JSON backend
  examples/
    islamic/                    ← 4 corpus-inspired Islamic patterns
    abstract/                   ← 3 non-Islamic geometric patterns
    fabrication/                ← 3 fabrication/perforation patterns
    invalid/                    ← Intentionally invalid samples
  scripts/
    validate.mjs                ← Single-file validator
    validate-all.mjs            ← Batch validator (all examples)
    compile.mjs                 ← CLI compiler (IR → SVG)
    test-compiler.mjs           ← Compiler test suite
  output/
    examples/                   ← Generated SVG artifacts (local/test output)
    makerjs/                    ← Generated Maker.js JSON artifacts (local/test output)
    cross-backend/              ← Generated verification artifacts (local/test output)
```

## Quick Start

### Validate a single file

```bash
node packages/pattern-geometry-commons/scripts/validate.mjs \
  packages/pattern-geometry-commons/examples/islamic/01-hex-star-field.json
```

### Validate all examples

```bash
npm run test:pgc-ir
```

Or directly:

```bash
node packages/pattern-geometry-commons/scripts/validate-all.mjs
```

### Validate specific files

```bash
npm run validate:pgc-ir -- file1.json file2.json
```

### Compile IR to SVG

```bash
# Via CLI
node packages/pattern-geometry-commons/scripts/compile.mjs \
  packages/pattern-geometry-commons/examples/islamic/01-hex-star-field.json \
  --format svg --out output.svg

# Via API
import { compileIr } from 'pattern-geometry-commons';
const { result, meta } = await compileIr(ir, { format: 'svg' });
```

### Compile IR to Maker.js JSON

```bash
node packages/pattern-geometry-commons/scripts/compile.mjs \
  packages/pattern-geometry-commons/examples/islamic/01-hex-star-field.json \
  --format makerjs-json --out hex-star.makerjs.json
```

### Run all PG-IR tests

```bash
npm run test:pgc-ir        # Schema validation
npm run test:pgc-compiler   # Compiler pipeline
```

## Compiler Pipeline

The compiler pipeline transforms semantic IR into concrete output via backend adapters.

```text
IR (validated) → Compiler → Backend Adapter → Output
                   │              │
                   │              ├── SVG Backend (minimal, built-in)
                   │              ├── Maker.js JSON Backend (experimental)
                   │              └── Custom Backend (registerBackend)
                   │
                   └── Validates IR semantics before compile
                       (skip with { validate: false })
```

### Backend Contract

The boundary between core and backends is explicit:

| Layer | Owns | Does NOT own |
|-------|------|-------------|
| **Core** (compiler + validator) | IR semantics, schema, validation, backend routing, adapter contracts | Vertex coordinates, path segments, export formats |
| **Backend** (SVG, Maker.js, etc.) | Low-level paths, tile placement, shape construction, export optimization | Motif meaning, tiling semantics, pattern classification |

Each backend receives a validated IR object and returns compiled output plus metadata:

```js
// Backend contract signature
function compile(ir, options) → { svg|model, meta: { tileCount, tiling, renderMode, ... } }
```

Backends are registered by format identifier:

```js
import { registerBackend } from 'pattern-geometry-commons';
registerBackend('dxf', myDxfCompiler);
```

### SVG Backend

The built-in SVG backend interprets the semantic IR and produces deterministic SVG output. It handles:

- **Regular tilings:** 6.6.6 (hexagonal grid), 4.4.4.4 (square grid)
- **Semi-regular tilings:** 4.8.2 (octagon-square), 10.6.10.6 (artistic approximation)
- **Custom grids:** diagonal-grid (staggered)
- **Lattice:** diagonal-lattice (staggered structural grid)
- **Radial layouts:** concentric ring placement
- **Freeform:** none tiling (parallel-lines variant)

Motif rendering by family:

| Family | SVG Output |
|--------|-----------|
| `star` | n-pointed star polygon (outer + inner vertices) |
| `polygon` | Regular n-sided polygon (optionally rotated, scaled) |
| `rosette` | Concentric layered polygons |
| `simple` | Circles, basic shapes |
| `custom` | Diamond markers (backend-specific) |

Parameters like `skip`, `delta`, `sides`, `rotation`, `scale` control geometry dimensions. The SVG backend owns all low-level geometric interpretation — only the motif family and intent are IR-level concepts.

### Maker.js JSON Backend (Experimental)

Maker.js is now wired as an experimental backend target through `makerjs-json`.
It proves that the same semantic IR can compile to a CAD-oriented model without
changing the IR schema.

```js
const { result, meta } = await compileIr(ir, { format: 'makerjs-json' });
```

The backend returns a Maker.js model JSON payload:

```json
{
  "units": "mm",
  "models": {
    "motif-0000": { "paths": { "edge-00": { "type": "line" } } }
  }
}
```

Current scope:

- Uses Maker.js `Line` and `Circle` paths for deterministic model JSON.
- Supports the same tilings as the SVG backend.
- Emits Maker.js JSON, SVG, and DXF through the `makerjs-json`, `makerjs-svg`, and `makerjs-dxf` backends.
- Keeps Maker.js as a backend target, not the conceptual model.

Generated artifacts are written locally when tests or compile commands run:

```text
packages/pattern-geometry-commons/output/makerjs/
```

### Maker.js SVG Export Backend

Uses Maker.js's built-in SVG exporter to render a Maker.js model as an SVG string.
The backend builds the same Maker.js model as `makerjs-json`, then calls
`makerjs.exporter.toSVG()` for output.

```js
const { result, meta } = await compileIr(ir, { format: 'makerjs-svg' });
// result is an SVG string (no XML declaration by default)
```

```bash
node packages/pattern-geometry-commons/scripts/compile.mjs \
  example.json --format makerjs-svg --out output.svg
```

Differences from the built-in `svg` backend:
- Uses Maker.js geometry primitives (Line, Circle) instead of raw SVG path data.
- SVG output includes Maker.js-specific attributes (`stroke-linecap`, `fill-rule`, `font-size`).
- No XML declaration — ready for embedding.
- The built-in `svg` backend is the recommended default; `makerjs-svg` is for CAD-oriented workflows.

### Maker.js DXF Export Backend

Uses Maker.js's built-in DXF exporter to render a Maker.js model as a DXF R12 string.

```js
const { result, meta } = await compileIr(ir, { format: 'makerjs-dxf' });
// result is a DXF text string
```

```bash
node packages/pattern-geometry-commons/scripts/compile.mjs \
  example.json --format makerjs-dxf --out output.dxf
```

The DXF output can be opened in AutoCAD, LibreCAD, QCAD, and other DXF-compatible tools.
Layer/color properties are controlled by Maker.js defaults.

Cross-backend comparison and fabrication DXF acceptance are complete (WP-7). Next Maker.js work: `makerjs-pdf` backend (blocked on jsPDF dependency).

## Schema (pg-ir-v0)

The schema is defined in `spec/pg-ir.schema.json` using JSON Schema draft 2020-12.

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | `"pg-ir-v0"` | Schema version constant |
| `pattern.id` | `string` | Unique machine-readable identifier |
| `pattern` | `object` | Pattern identity block |
| `geometry` | `object` | Semantic geometry block |

### Pattern classification

| Value | Description |
|-------|-------------|
| `repeating-field` | Regular repeating 2D field |
| `frieze` | Linear band / border |
| `radial` | Concentric / circular arrangement |
| `freeform` | Non-periodic, custom layout |
| `lattice` | Structural lattice / space frame |

### Motif families

| Family | Description |
|--------|-------------|
| `star` | Star polygon (n-pointed) |
| `rosette` | Layered petal/floral motif |
| `polygon` | Regular or inscribed polygon |
| `simple` | Basic filled/stroked shape |
| `custom` | Backend-defined custom figure |
| `irregular` | Irregular/non-standard figure |

### Rendering modes

| Mode | Description |
|------|-------------|
| `line` | Stroke-only wireframe |
| `fill` | Filled shapes |
| `interlace` | Over/under weave |
| `band` | Ribbon/band rendering |
| `none` | No rendering (metadata-only) |

## Examples

### Islamic (corpus-inspired)

1. **Hexagon Star Field** — 6-fold star tiling on 6.6.6
2. **Octagon-Square Star** — 8-fold star on 4.8.2
3. **Decagon-Hexagon Star** — 10-fold star on 10.6.10.6
4. **Rosette Hex Field** — Deep rosette on 6.6.6

### Abstract

1. **Square Grid** — Minimal inscribed polygon grid
2. **Radial Geometric** — Concentric ring arrangement
3. **Generative Stripe** — Moiré/interference pattern

### Fabrication

1. **Perforated Screen** — CNC mashrabiya screen
2. **Laser-Cut Panel** — Interlocking hex panel
3. **Architectural Lattice** — Water-jet lattice with infill

## Package Manifest

Pattern Geometry Commons is defined as a standalone package with its own `package.json` at the package root. The manifest declares:

- **name:** `pattern-geometry-commons`
- **type:** `module` (ESM)
- **main / exports:** `./src/index.mjs`
- **dependencies:** `makerjs` (only; no `jspdf`, no `ajv` at the package level — `ajv` is hoisted from the root)

This allows other projects to depend on PGC directly:

```bash
npm install ./packages/pattern-geometry-commons
```

```js
import { validateIr, compileIr, listFormats } from 'pattern-geometry-commons';
```

### Distribution Contract

The PGC tarball (`npm pack`) includes:

| Path | Purpose |
|------|---------|
| `src/` | Public API (13 functions) |
| `spec/` | JSON Schema for `pg-ir-v0` |
| `examples/` | 11 example IR files across islamic, abstract, fabrication, and invalid categories |
| `scripts/` | CLI tools (`validate.mjs`, `validate-all.mjs`, `compile.mjs`) |
| `README.md` | This documentation |

The CLI scripts are part of the package distribution contract. Consumers who install PGC from a tarball can run:

```bash
node node_modules/pattern-geometry-commons/scripts/validate.mjs input.json
node node_modules/pattern-geometry-commons/scripts/compile.mjs input.json --format svg
```

No `bin` entries are declared — CLI tools are invoked with `node` directly. The `output/` directory is excluded from distribution (build artifacts, not source).

## NPM Scripts

| Script | Description |
|--------|-------------|
| `validate:pgc-ir` | Validate one or more IR files |
| `test:pgc-ir` | Run all PG-IR validation tests |
| `compile:pgc` | Compile IR to output format via CLI |
| `test:pgc-compiler` | Run compiler pipeline test suite |
| `test:pgc-makerjs` | Run compiler suite including Maker.js JSON backend checks |
| `test:pgc-cross-backend` | Cross-backend verification (svg ↔ makerjs-svg structural comparison) |
| `test:pgc-boundary` | Package boundary guard — asserts public API, blocks coupling to app internals |
| `test:pgc-standalone` | External consumer smoke test — proves package works from outside the repo |
| `test:pgc-pack-contract` | Pack contract test — verifies `npm pack` produces correct tarball contents |
| `test:pgc-installed-tarball` | Installed tarball consumer test — proves package works when installed from tarball |

## CLI Reference

### `compile:pgc` — Compile IR to output format

```bash
npm run compile:pgc -- <file.json> [--format svg] [--out output.svg] [--no-validate] [--cell-size 60]
```

Options:

| Flag | Description | Default |
|------|-------------|---------|
| `--format`, `-f` | Output format (`svg`, `makerjs-json`, `makerjs-svg`, `makerjs-dxf`) | `svg` |
| `--out`, `-o` | Output file path | stdout |
| `--no-validate` | Skip IR validation before compile | (validates) |
| `--cell-size` | Tile cell size in SVG units | `60` |
| `--list` | List available output formats | — |

### `validate:pgc-ir` — Validate IR files

```bash
npm run validate:pgc-ir -- <file.json> [file2.json ...]
```

## Generated Artifacts

Generated SVG artifacts from the example corpus are written to `output/examples/`:

| File | Source | Tiles | Description |
|------|--------|-------|-------------|
| `01-hex-star-field.svg` | islamic/01-hex-star-field | 49 | 6-fold star field on 6.6.6 hex grid |
| `02-octagon-square-star.svg` | islamic/02-octagon-square-star | 29 | 8-fold star on 4.8.2 semi-regular tiling |
| `01-square-grid.svg` | abstract/01-square-grid | 25 | Rotated inscribed squares on 4.4.4.4 |
| `01-perforated-screen.svg` | fabrication/01-perforated-screen | 150 | CNC perforation pattern on staggered grid |

Generated Maker.js JSON artifacts are written to `output/makerjs/`:

| File | Source | Purpose |
|------|--------|---------|
| `01-hex-star-field.makerjs.json` | islamic/01-hex-star-field | Star-field model using Maker.js line paths |
| `03-generative-stripe.makerjs.json` | abstract/03-generative-stripe | Freeform parallel-line systems |
| `01-perforated-screen.makerjs.json` | fabrication/01-perforated-screen | CNC-oriented circular perforation model |

Generated Maker.js SVG and DXF export artifacts are written to `output/makerjs-export/`:

| File | Source | Format | Purpose |
|------|--------|--------|---------|
| `01-hex-star-field.makerjs.svg` | islamic/01-hex-star-field | makerjs-svg | Star-field via Maker.js SVG exporter |
| `01-square-grid.makerjs.svg` | abstract/01-square-grid | makerjs-svg | Polygon grid via Maker.js SVG exporter |
| `01-perforated-screen.makerjs.svg` | fabrication/01-perforated-screen | makerjs-svg | CNC screen via Maker.js SVG exporter |
| `01-hex-star-field.makerjs.dxf` | islamic/01-hex-star-field | makerjs-dxf | Star-field via Maker.js DXF exporter |
| `01-square-grid.makerjs.dxf` | abstract/01-square-grid | makerjs-dxf | Polygon grid via Maker.js DXF exporter |
| `01-perforated-screen.makerjs.dxf` | fabrication/01-perforated-screen | makerjs-dxf | CNC screen via Maker.js DXF exporter |

Generated cross-backend verification artifacts are written to `output/cross-backend/`:

| File | Source | Purpose |
|------|--------|---------|
| `cross-backend-report.json` | All 10 examples | Machine-readable comparison (element counts, dimensions, metadata) |
| `pdf-export-evaluation.md` | — | makerjs-pdf blocker documentation (jsPDF dependency gating) |
| `01-perforated-screen-cross-backend.dxf` | fabrication/01-perforated-screen | DXF acceptance artifact |
| `02-laser-cut-panel-cross-backend.dxf` | fabrication/02-laser-cut-panel | DXF acceptance artifact |
| `03-architectural-lattice-cross-backend.dxf` | fabrication/03-architectural-lattice | DXF acceptance artifact (832 LINE entities) |

### Maker.js PDF Export

`makerjs.exporter.toPDF(doc, model, options)` exists in Maker.js 0.19.2 but
requires a jsPDF document instance as the first argument. jsPDF is not in the
dependency tree. The `makerjs-pdf` backend is deferred to a future WP when
PDF export is explicitly required by a consumer.

After running `npm run test:pgc-cross-backend`, see `output/cross-backend/pdf-export-evaluation.md` for the full blocker report.

## Cross-Backend Verification

Run structural comparison between the built-in SVG backend and Maker.js SVG/DXF:

```bash
npm run test:pgc-cross-backend
```

Verifies across all 10 valid examples:
- Both backends produce valid SVG strings
- Motif-level geometry is consistent (same tilings produce elements in both)
- Metadata preservation (tileCount, tiling ID) matches
- Deterministic output within each backend
- Approximate bounds consistency (within 3x tolerance)
- DXF structural validity for fabrication examples (R12 header, ENTITIES, geometry)

Remaining notes (all 3 tiling gaps from WP-7 resolved: 10.6.10.6, lattice, and none/freeform all emit real geometry in both backends):
- `10.6.10.6` is hyperbolic (vertex sum 528° > 360°); the checkerboard layout is an artistic approximation of a non-Euclidean tiling. Motif counts differ from IR metadata counts.
- `lattice` tile type distribution: the 3-way alternating pattern produces ~32 tiles/type on an 8×12 grid. IR metadata specifies 96+48+48 per type, which would require a denser multi-layer layout.
- `makerjs-pdf` backend: blocked on jsPDF dependency. Run `npm run test:pgc-cross-backend` to regenerate `output/cross-backend/pdf-export-evaluation.md`.

Regenerate all artifacts:

```bash
for f in packages/pattern-geometry-commons/examples/islamic/*.json \
         packages/pattern-geometry-commons/examples/abstract/*.json \
         packages/pattern-geometry-commons/examples/fabrication/*.json; do
  name=$(basename "$f" .json)
  node packages/pattern-geometry-commons/scripts/compile.mjs "$f" --no-validate \
    --out "packages/pattern-geometry-commons/output/examples/${name}.svg"
done
```

## Relationship to islamic-pattern-mvp

The `islamic-pattern-mvp` repository is the proof-of-concept that validated the core approach. Pattern Geometry Commons extracts the semantic IR layer from that work into a standalone, domain-neutral specification.

The islamic-pattern-mvp `scene-v4` / `ornament-ir-v1` remain the internal format of the existing app. PG-IR v0 is the public, generalized IR.

## License

CC-BY-4.0 (for the IR spec and examples).
