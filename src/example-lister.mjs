import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXAMPLES_ROOT = join(__dirname, '..', 'examples');

/**
 * List all valid (non-invalid) example IR files.
 *
 * @returns {Promise<Array<{ path: string, category: string, name: string }>>}
 */
export async function listExamples() {
  const results = [];
  const categories = ['islamic', 'abstract', 'fabrication'];
  for (const cat of categories) {
    const dir = join(EXAMPLES_ROOT, cat);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        results.push({
          path: join(dir, entry.name),
          category: cat,
          name: basename(entry.name, '.json'),
        });
      }
    }
  }
  results.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return results;
}

/**
 * Load and parse an example by path.
 *
 * @param {string} filePath
 * @returns {Promise<object>}
 */
export async function loadExample(filePath) {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}
