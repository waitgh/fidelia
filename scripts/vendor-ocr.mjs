#!/usr/bin/env node
// Copies tesseract.js worker, WASM core and English data from node_modules into
// public/ocr so OCR never loads code or data from a CDN. Runs before dev/build.
import { cpSync, mkdirSync, readdirSync, existsSync } from 'fs';

const out = 'public/ocr';
mkdirSync(`${out}/core`, { recursive: true });
mkdirSync(`${out}/lang`, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of readdirSync('node_modules/tesseract.js-core')) {
  if (/^tesseract-core.*lstm\.wasm(\.js)?$/.test(f)) cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
const lang = 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
if (!existsSync(lang)) throw new Error('Missing @tesseract.js-data/eng; run npm install');
cpSync(lang, `${out}/lang/eng.traineddata.gz`);
console.log('OCR assets copied to public/ocr');
