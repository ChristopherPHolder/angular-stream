import { readFileSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';

const file = process.argv[2];
const h = readFileSync(file, 'utf8');
const buf = Buffer.from(h, 'utf8');

const br = (s) =>
  brotliCompressSync(Buffer.from(s, 'utf8'), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

const needles = [
  ['</head>', '</head>', 7],
  ['<body', '<body', 0],
  ['<app-root', '<app-root', 0],
  ['<ui-side-drawer', '<ui-side-drawer', 0],
  ['</ui-side-drawer> (end of drawer)', '</ui-side-drawer>', 17],
  ['content-wrapper', 'content-wrapper', 0],
  ['ui-toolbar', 'ui-toolbar', 0],
  ['class="content"', 'class="content"', 0],
  ['<ui-movie-list', '<ui-movie-list', 0],
  ['fast-svg sprite div', 'id="movies-logo"', 0],
  ['<script id="ng-state"', '<script id="ng-state"', 0],
];

console.log(`file: ${file}`);
console.log(`raw total      : ${buf.length}`);
console.log(`brotli -q11    : ${br(h)}`);
console.log('');
console.log('offset   brotli(prefix)  landmark');
for (const [label, needle, add] of needles) {
  const i = h.indexOf(needle);
  if (i < 0) {
    console.log(`  (not found)             ${label}`);
    continue;
  }
  const off = i + add;
  console.log(`${String(off).padStart(7)}  ${String(br(h.slice(0, off))).padStart(13)}  ${label}`);
}

// block sizes
const blocks = [
  ['<head>…</head>', h.indexOf('<head'), h.indexOf('</head>') + 7],
  [
    '<ui-side-drawer>…</ui-side-drawer>',
    h.indexOf('<ui-side-drawer'),
    h.indexOf('</ui-side-drawer>') + 17,
  ],
  ['inline <style ng-app-id>', h.indexOf('<style ng-app-id'), h.lastIndexOf('</style>') + 8],
  ['ng-state script', h.indexOf('<script id="ng-state"'), h.indexOf('</script></body>') + 9],
];
console.log('');
console.log('   bytes  raw-%  block');
for (const [label, a, b] of blocks) {
  if (a < 0 || b < 0) {
    console.log(`  (n/a)         ${label}`);
    continue;
  }
  const n = b - a;
  console.log(
    `${String(n).padStart(8)}  ${((n / buf.length) * 100).toFixed(1).padStart(5)}  ${label}`,
  );
}
