import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, 'src/client'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@db': path.resolve(__dirname, 'src/db'),
    },
  },
  server: {
    port: 5173,
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // drive-picker.html is a separate page so Google's Picker script never runs next to church data.
      input: { main: path.resolve(__dirname, 'index.html'), picker: path.resolve(__dirname, 'drive-picker.html') },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
