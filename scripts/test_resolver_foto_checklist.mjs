#!/usr/bin/env node
/** Testes do resolver de URL de fotos do checklist (JS espelho do backend). */
'use strict';

function resolverUrlFotoChecklist(foto) {
  const raw = String(foto || '').trim();
  if (!raw) return { url: '', valid: false, raw, erro: 'vazio' };
  if (raw.startsWith('data:image')) return { url: raw, valid: true, raw, erro: '' };
  const low = raw.toLowerCase();
  if (low.startsWith('file://')) return { url: '', valid: false, raw, erro: 'uri_local_dispositivo' };
  if (low.startsWith('http://') || low.startsWith('https://')) return { url: raw, valid: true, raw, erro: '' };
  if (raw.startsWith('/static/')) return { url: raw, valid: true, raw, erro: '' };
  if (raw.startsWith('/uploads/')) return { url: '/static' + raw, valid: true, raw, erro: '' };
  return { url: '/static/' + raw.replace(/^\/+/, ''), valid: true, raw, erro: '' };
}

const casos = [
  ['/static/uploads/checklist/x/a.jpg', true, '/static/uploads/checklist/x/a.jpg'],
  ['data:image/jpeg;base64,abc', true, 'data:image/jpeg;base64,abc'],
  ['file:///tmp/foto.jpg', false, ''],
  ['https://exemplo.com/f.jpg', true, 'https://exemplo.com/f.jpg'],
  ['/uploads/checklist/a.jpg', true, '/static/uploads/checklist/a.jpg'],
];

let ok = 0;
for (const [input, esperadoValid, esperadoUrl] of casos) {
  const r = resolverUrlFotoChecklist(input);
  const pass = r.valid === esperadoValid && (esperadoValid ? r.url === esperadoUrl : true);
  console.log(pass ? 'OK' : 'FAIL', JSON.stringify(input.slice(0, 40)), '=>', r.valid, r.url.slice(0, 50));
  if (pass) ok++;
}
console.log(`\n${ok}/${casos.length} casos OK`);
process.exit(ok === casos.length ? 0 : 1);
