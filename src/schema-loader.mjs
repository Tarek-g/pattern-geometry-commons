import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '..', 'spec', 'pg-ir.schema.json');

let _schemaCache = null;

/**
 * Load and parse the PG-IR JSON Schema.
 * Result is cached after first call.
 */
export async function loadSchema() {
  if (_schemaCache) return _schemaCache;
  const raw = await readFile(SCHEMA_PATH, 'utf-8');
  _schemaCache = JSON.parse(raw);
  return _schemaCache;
}

/**
 * Resolve the schema file path (for tools that need it directly).
 */
export function getSchemaPath() {
  return SCHEMA_PATH;
}
