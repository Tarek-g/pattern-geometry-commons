#!/usr/bin/env node

/**
 * Publish Target Check — WP-21.2
 *
 * Prints the expected publish target and auth requirements.
 * Does NOT publish. Use before npm publish to verify configuration.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG = JSON.parse(
  await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

console.log('=== PGC Publish Target ===\n');

console.log(`Package:        ${PKG.name}`);
console.log(`Version:        ${PKG.version}`);
console.log(`Private:        ${PKG.private}`);

const registry = PKG.publishConfig?.registry || 'https://registry.npmjs.org';
console.log(`Target:         ${registry}`);

if (registry.includes('pkg.github.com')) {
  console.log('Auth method:    GITHUB_TOKEN (environment variable)');
  console.log('Auth scope:     read:packages, write:packages');
  console.log('Login:          export GITHUB_TOKEN=ghp_...');
  console.log('               npm config set //npm.pkg.github.com/:_authToken $GITHUB_TOKEN');
} else if (registry.includes('registry.npmjs.org')) {
  console.log('Auth method:    npm login (or npm token)');
  console.log('Login:          npm login --registry=https://registry.npmjs.org');
} else {
  console.log('Auth method:    See registry documentation');
}

console.log(`\nRepository:     ${typeof PKG.repository === 'object' ? PKG.repository.url : PKG.repository || 'NOT SET'}`);
console.log(`Homepage:       ${PKG.homepage || 'NOT SET'}`);
console.log(`Bugs:           ${typeof PKG.bugs === 'object' ? PKG.bugs.url || PKG.bugs.email : PKG.bugs || 'NOT SET'}`);
console.log(`Author:         ${typeof PKG.author === 'object' ? PKG.author.name : PKG.author || 'NOT SET'}`);

console.log('\n=== Ready to publish ===');
console.log(`  cd packages/pattern-geometry-commons`);
console.log(`  npm publish`);
console.log();
