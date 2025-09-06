import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { defineConfig } from 'vite';

// Get __dirname equivalent in ESM

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@assets', replacement: path.resolve(__dirname, 'src/assets') },
      { find: '@', replacement: path.resolve(__dirname, 'src') }
    ],
  },
  server: {
    host: true,
    port: 3000
  }
})
