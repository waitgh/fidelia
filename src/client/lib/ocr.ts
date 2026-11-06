// Self-hosted OCR (see scripts/vendor-ocr.mjs). Screenshots are processed locally.
import { createWorker, OEM } from 'tesseract.js';

export function createOcrWorker() {
  return createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/core',
    langPath: '/ocr/lang',
    workerBlobURL: false,
  });
}
