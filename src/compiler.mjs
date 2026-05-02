import { validateIr } from './validator.mjs';
import { compileSvg } from './backends/svg-backend.mjs';
import {
  compileMakerJsJson,
  compileMakerJsSvg,
  compileMakerJsDxf,
} from './backends/makerjs-backend.mjs';

/**
 * Backend registry — maps format identifiers to compile functions.
 * Each backend receives (ir, options) and returns { svg|model|dxf, meta }.
 */
const BACKENDS = {
  svg: compileSvg,
  'makerjs-json': compileMakerJsJson,
  'makerjs-svg': compileMakerJsSvg,
  'makerjs-dxf': compileMakerJsDxf,
};

/** Formats whose result is a plain string (text output). */
const TEXT_FORMATS = new Set(['svg', 'makerjs-svg', 'makerjs-dxf']);

/**
 * Register a backend adapter.
 *
 * @param {string} format - Format identifier (e.g. 'svg', 'dxf', 'makerjs')
 * @param {Function} compileFn - (ir, options) → compiled output
 */
export function registerBackend(format, compileFn) {
  BACKENDS[format] = compileFn;
}

/**
 * Compile a validated (or to-be-validated) IR into the requested format.
 *
 * @param {object} ir - PG-IR instance object
 * @param {object} options - { format?: string, validate?: boolean, ...backendOptions }
 * @returns {Promise<{ result: object, meta: object }>}
 */
export async function compileIr(ir, options = {}) {
  const format = options.format || 'svg';
  const shouldValidate = options.validate !== false;

  if (shouldValidate) {
    const { valid, errors } = await validateIr(ir);
    if (!valid) {
      const err = new Error(
        `IR validation failed: ${errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`
      );
      err.code = 'IR_VALIDATION_FAILED';
      err.validationErrors = errors;
      throw err;
    }
  }

  const backend = BACKENDS[format];
  if (!backend) {
    const err = new Error(
      `Unknown output format: "${format}". Supported: ${Object.keys(BACKENDS).join(', ')}`
    );
    err.code = 'UNKNOWN_FORMAT';
    throw err;
  }

  const result = backend(ir, options);
  const resultValue = TEXT_FORMATS.has(format)
    ? (result.svg ?? result.dxf ?? result)
    : (result.model ?? result);
  return {
    result: resultValue,
    meta: result.meta || {},
  };
}

/**
 * List available output formats.
 */
export function listFormats() {
  return Object.keys(BACKENDS);
}
