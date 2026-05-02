/**
 * Pattern Geometry Commons — Public API
 *
 * Semantic intermediate representation (IR) for 2D pattern systems.
 * Core owns IR semantics, validation, and compiler pipeline.
 * Backends own low-level geometry and export formats.
 *
 * @packageDocumentation
 */

export { loadSchema, getSchemaPath } from './schema-loader.mjs';
export { validateIr, getValidator } from './validator.mjs';
export { compileIr, registerBackend, listFormats } from './compiler.mjs';
export { listExamples, loadExample } from './example-lister.mjs';

// Re-export backend contract types for documentation/extension
export { compileSvg } from './backends/svg-backend.mjs';
export {
  compileMakerJsJson,
  compileMakerJsSvg,
  compileMakerJsDxf,
} from './backends/makerjs-backend.mjs';
