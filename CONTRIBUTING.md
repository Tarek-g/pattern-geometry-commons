# Contributing

Pattern Geometry Commons is an open semantic IR and compiler layer for 2D
pattern systems. Contributions should preserve that boundary: the core package
owns pattern meaning, validation, compiler routing, and backend contracts;
backends own low-level geometry and export details.

## Good First Contributions

- Improve README clarity, examples, or tutorials.
- Add valid or intentionally invalid `pg-ir-v0` examples.
- Improve validator messages without changing schema semantics.
- Add backend documentation or test coverage.
- Report confusing API or CLI behavior with a reproducible command.

## Scope

In scope:

- IR schema and field semantics.
- Validator CLI and error model.
- Compiler API and backend adapter contracts.
- SVG, Maker.js JSON, Maker.js SVG, and DXF backend behavior.
- Domain-diverse examples across Islamic, abstract, and fabrication patterns.

Out of scope for the current v0.x track:

- A full visual editor.
- Image-to-IR reconstruction.
- 3D/STL export.
- Lossless project archive behavior.
- Application-specific state from the originating pattern app.

## Development

Run the focused checks before proposing a change:

```bash
npm run test:ir
npm run test:compiler
npm run test:cross-backend
```

For package boundary changes, also run:

```bash
npm run test:boundary
npm run test:pack-contract
```

## Reporting Issues

When reporting a bug, include:

- The IR file or the smallest reproducible JSON snippet.
- The command or API call used.
- The expected output format.
- The actual error or output.
- Node.js version.

For feature requests, describe the pattern semantics you need to preserve before
describing the desired output format.
