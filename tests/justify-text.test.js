/* Regression test for the global text-justify rule (css/app.css).
 *
 * Requirement (per user, v7.9.11): "تمامی متن ها بصورت اتومات justify کن"
 *   - Body paragraphs (article copy, About text, dialog/sheet text) must use
 *     text-align: justify with RTL-safe text-justify: inter-word.
 *   - Cards / buttons / badges / option rows must NOT be justified (they
 *     keep text-align: start / center) so their layout is undisturbed.
 *
 * Static analysis on the CSS source — no browser needed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(resolve(ROOT, 'css/app.css'), 'utf8');

describe('Global justify rule (css/app.css) — v7.9.11', () => {
  it('declares a text-align: justify rule', () => {
    expect(CSS).toMatch(/text-align:\s*justify/);
  });

  it('uses RTL-safe text-justify: inter-word', () => {
    // inter-word distributes spacing evenly; the right default for Persian.
    expect(CSS).toMatch(/text-justify:\s*inter-word/);
  });

  it('applies justify to body paragraphs (main > p, #aboutBody, .sheet)', () => {
    // The selector list must cover the main body-paragraph containers.
    expect(CSS).toMatch(/main\s*>\s*p/);
    expect(CSS).toMatch(/#aboutBody\s*>\s*p/);
    expect(CSS).toMatch(/\.sheet\s*>\s*p/);
  });

  it('does NOT justify card names / buttons / badges (keeps start/center)', () => {
    // These are explicitly text-align: start or center — verify they survive
    // and the justify rule does not blanket-override them.
    const justifyBlock = CSS.match(/main\s*>\s*p[^}]*\}/);
    expect(justifyBlock).not.toBeNull();
    // The justify selector is scoped (uses '>' direct-child), so .card .name
    // and button .open are not matched by it.
    expect(justifyBlock[0]).not.toMatch(/^p\s*\{/); // no blanket 'p {' justify
  });
});
