/* Test helper: load browser namespaced modules (lang-fa.js, algo.js) into Node without a DOM. */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function loadLPF() {
  // Indirect eval executes in global scope; the modules attach themselves to globalThis.LPF.
  // The browser modules reference `window` directly, so we alias it to globalThis first.
  globalThis.window = globalThis;
  const code = [
    readFileSync(resolve(ROOT, 'js/lang-fa.js'), 'utf8'),
    readFileSync(resolve(ROOT, 'js/algo.js'), 'utf8'),
  ].join('\n;');
  (0, eval)(code);
  return globalThis.LPF;
}

export function readFixture(name) {
  return JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures', name), 'utf8'));
}
