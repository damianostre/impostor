#!/usr/bin/env node
// Narzędzie do puli haseł (words.dat).
// Hasła są zakodowane, żeby nie dało się ich przeczytać przypadkiem.
// Domyślnie skrypt NIE wypisuje haseł. Dodaj --pokaz tylko wtedy,
// gdy hasła może zobaczyć ktoś, kto nie gra.
//
//   node tools/words.mjs stats
//   node tools/words.mjs check plik.json [--pokaz]
//   node tools/words.mjs add plik.json [--pokaz]
//   node tools/words.mjs update poprawki.json [--pokaz]   ([{ "id", "w", "h" }], ID zostaje)
//   node tools/words.mjs remove ID [ID...]
//   node tools/words.mjs export wyjscie.json      (nie commituj wyniku!)
//
// plik.json: [{ "w": "Hasło", "h": "podpowiedź" }, ...]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAT = path.join(ROOT, 'words.dat');
const EXCLUDED = path.join(ROOT, 'tools', 'wykluczone.txt');
const KEY = Buffer.from('imp0st0r!', 'utf8');

function xor(buf) {
  for (let i = 0; i < buf.length; i++) buf[i] ^= KEY[i % KEY.length];
  return buf;
}
function encode(obj) {
  return xor(Buffer.from(JSON.stringify(obj), 'utf8')).toString('base64');
}
function decode(text) {
  return JSON.parse(xor(Buffer.from(text.trim(), 'base64')).toString('utf8'));
}
function load() {
  if (!fs.existsSync(DAT)) return { v: 1, items: [] };
  return decode(fs.readFileSync(DAT, 'utf8'));
}
function save(data) {
  fs.writeFileSync(DAT, encode(data) + '\n');
}

const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();

const PREP = new Set(['w', 'we', 'na', 'z', 'ze', 'do', 'pod', 'nad', 'przy', 'bez', 'dla', 'od', 'po', 'za', 'u', 'o', 'przed', 'i', 'się']);

function excludedSet() {
  if (!fs.existsSync(EXCLUDED)) return new Set();
  return new Set(
    fs.readFileSync(EXCLUDED, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(norm)
  );
}

function validate(list, existing) {
  const errors = [];
  const warnings = [];
  const seen = new Set(existing.map((it) => norm(it[1])));
  const excluded = excludedSet();
  const hintCount = new Map();
  for (const it of existing) hintCount.set(norm(it[2]), (hintCount.get(norm(it[2])) || 0) + 1);

  list.forEach((e, i) => {
    const tag = `#${i + 1}`;
    const w = (e.w || '').trim();
    const h = (e.h || '').trim();
    if (!w) { errors.push([tag, 'brak hasła', e]); return; }
    if (!h) { errors.push([tag, 'brak podpowiedzi', e]); return; }
    if (w.length > 24) errors.push([tag, 'hasło za długie (>24 znaki)', e]);
    const tokens = h.split(/\s+/);
    const content = tokens.filter((t) => !PREP.has(t.toLowerCase()));
    if (content.length > 2 || tokens.length > 3) errors.push([tag, 'podpowiedź ma więcej niż 2 słowa', e]);
    if (h !== h.toLowerCase()) warnings.push([tag, 'podpowiedź ma wielkie litery', e]);
    if (w[0] !== w[0].toUpperCase()) warnings.push([tag, 'hasło nie zaczyna się wielką literą', e]);
    const nw = norm(w);
    if (seen.has(nw)) errors.push([tag, 'duplikat hasła', e]);
    if (excluded.has(nw)) errors.push([tag, 'hasło z listy wykluczonych', e]);
    seen.add(nw);
    const stem = nw.slice(0, Math.min(5, nw.length));
    if (stem.length >= 4 && norm(h).split(/\s+/).some((t) => t.startsWith(stem))) {
      errors.push([tag, 'podpowiedź zawiera hasło', e]);
    }
    const nh = norm(h);
    hintCount.set(nh, (hintCount.get(nh) || 0) + 1);
  });
  for (const [hint, n] of hintCount) {
    if (n > 2) warnings.push(['-', `ta sama podpowiedź użyta ${n} razy`, { w: '?', h: hint }]);
  }
  return { errors, warnings };
}

function report({ errors, warnings }, show) {
  const fmt = ([tag, msg, e]) => (show ? `${tag} ${msg}: ${e.w} / ${e.h}` : `${tag} ${msg}`);
  if (errors.length) console.log('BŁĘDY:\n' + errors.map(fmt).join('\n'));
  if (warnings.length) console.log('UWAGI:\n' + warnings.map(fmt).join('\n'));
  if (!errors.length && !warnings.length) console.log('OK, bez uwag.');
}

const [cmd, ...args] = process.argv.slice(2);
const show = args.includes('--pokaz');
const files = args.filter((a) => !a.startsWith('--'));

if (cmd === 'stats') {
  const d = load();
  const maxId = d.items.reduce((m, it) => Math.max(m, it[0]), 0);
  console.log(`Haseł w puli: ${d.items.length}, najwyższe ID: ${maxId}`);
} else if (cmd === 'check' || cmd === 'add') {
  const list = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  const d = load();
  const res = validate(list, d.items);
  report(res, show);
  if (cmd === 'add') {
    if (res.errors.length) {
      console.log('Nic nie dodano — popraw błędy.');
      process.exit(1);
    }
    let id = d.items.reduce((m, it) => Math.max(m, it[0]), 0);
    for (const e of list) d.items.push([++id, e.w.trim(), e.h.trim()]);
    save(d);
    console.log(`Dodano ${list.length}. Haseł w puli: ${d.items.length}.`);
  }
} else if (cmd === 'update') {
  // Poprawia istniejące hasła, zachowując ich ID: [{ "id": 5, "w": "...", "h": "..." }]
  const list = JSON.parse(fs.readFileSync(files[0], 'utf8'));
  const d = load();
  const byId = new Map(d.items.map((it) => [it[0], it]));
  const missing = list.filter((e) => !byId.has(e.id));
  if (missing.length) {
    console.log(`Brak ID w puli: ${missing.map((e) => e.id).join(', ')}. Nic nie zmieniono.`);
    process.exit(1);
  }
  const others = d.items.filter((it) => !list.some((e) => e.id === it[0]));
  const res = validate(list, others);
  report(res, show);
  if (res.errors.length) {
    console.log('Nic nie zmieniono — popraw błędy.');
    process.exit(1);
  }
  for (const e of list) {
    const it = byId.get(e.id);
    it[1] = e.w.trim();
    it[2] = e.h.trim();
  }
  save(d);
  console.log(`Poprawiono ${list.length}. Haseł w puli: ${d.items.length}.`);
} else if (cmd === 'remove') {
  const ids = new Set(files.map(Number));
  const d = load();
  const before = d.items.length;
  d.items = d.items.filter((it) => !ids.has(it[0]));
  save(d);
  console.log(`Usunięto ${before - d.items.length}. Haseł w puli: ${d.items.length}.`);
} else if (cmd === 'export') {
  const d = load();
  fs.writeFileSync(files[0], JSON.stringify(d.items.map(([id, w, h]) => ({ id, w, h })), null, 1));
  console.log(`Zapisano ${d.items.length} haseł do ${files[0]}. Nie commituj tego pliku.`);
} else {
  console.log('Użycie: stats | check plik.json | add plik.json | update plik.json | remove ID... | export plik.json');
}
