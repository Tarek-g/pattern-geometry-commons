import Ajv from 'ajv/dist/2020.js';
import { loadSchema } from './schema-loader.mjs';

let _validateFn = null;

/**
 * Return a compiled Ajv validation function for the PG-IR schema.
 * The function is cached after first compilation.
 */
export async function getValidator() {
  if (_validateFn) return _validateFn;
  const schema = await loadSchema();
  const ajv = new Ajv({ allErrors: true, strict: true });
  _validateFn = ajv.compile(schema);
  return _validateFn;
}

/**
 * Validate an IR instance object against the PG-IR schema.
 *
 * @param {object} ir - Parsed IR instance
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> | null }}
 */
export async function validateIr(ir) {
  const validate = await getValidator();
  const valid = validate(ir);
  if (valid) {
    return { valid: true, errors: null };
  }
  const errors = validate.errors.map((err) => ({
    path: err.instancePath || '(root)',
    message: err.message + (err.params ? ' ' + JSON.stringify(err.params) : ''),
  }));
  return { valid: false, errors };
}
