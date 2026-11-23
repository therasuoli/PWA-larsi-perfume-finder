/* Larsi Perfume Finder — catalogue preparation Web Worker (v7.2).
   Parses and prepares fetched records off the main thread so large catalogues never block first paint.
   Protocol: postMessage({ id, items: [rawPayload...] }) → { id, items: [prepared...] } or { id, error }. */
'use strict';
self.window = self; // lang-fa.js and algo.js attach to the LPF namespace via `window`
importScripts('js/lang-fa.js', 'js/algo.js');

self.onmessage = function (event) {
  const data = event.data || {};
  const id = data.id;
  try {
    const raw = Array.isArray(data.items) ? data.items : [];
    const prepared = [];
    for (let i = 0; i < raw.length; i++) prepared.push(self.LPF.algo.prepare(raw[i], self.LPF.fa));
    self.postMessage({ id, items: prepared });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
