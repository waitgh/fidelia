import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import { readFileSync } from 'fs';
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));
// `npm run dev:phone`: HTTPS (Web Crypto needs a secure page) on the local network, for testing on a phone.
const phone = process.env.FIDELIA_PHONE === '1';

// Serve the user guide from our own site (as application/pdf, so browsers show it instead of
// downloading it). The source stays in docs/user-guide/, where make_guide.py writes it.
const GUIDE = 'Fidelia-User-Guide.pdf';
const userGuide = {
  name: 'user-guide',
  generateBundle(this: { emitFile: (f: object) => void }) {
    this.emitFile({ type: 'asset', fileName: GUIDE, source: readFileSync(`docs/user-guide/${GUIDE}`) });
  },
  configureServer(server: { middlewares: { use: (path: string, fn: (req: unknown, res: { setHeader: (k: string, v: string) => void; end: (b: Buffer) => void }) => void) => void } }) {
    server.middlewares.use('/' + GUIDE, (_req, res) => { res.setHeader('Content-Type', 'application/pdf'); res.end(readFileSync(`docs/user-guide/${GUIDE}`)); });
  },
};

export default defineConfig({
  plugins: [react(), userGuide, ...(phone ? [basicSsl()] : [])],
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, 'src/client'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@db': path.resolve(__dirname, 'src/db'),
    },
  },
  server: {
    port: 5173,
    ...(phone ? { host: true, allowedHosts: ['.nip.io'] } : {}),
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // drive-picker.html is a separate page so Google's Picker script never runs next to church data.
      input: { main: path.resolve(__dirname, 'index.html'), picker: path.resolve(__dirname, 'drive-picker.html'),
        // Public About and FAQ pages: plain HTML + CSS, no app code.
        about: path.resolve(__dirname, 'about.html'), faq: path.resolve(__dirname, 'faq.html') },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
