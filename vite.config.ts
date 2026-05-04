import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import { defineConfig, loadEnv } from 'vite';

// Get __dirname equivalent in ESM

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const projectId = env.VITE_FIREBASE_PROJECTID || 'serrasemar';
  const presenceProxyTarget =
    env.VITE_PRESENCE_API_PROXY_TARGET || `https://us-east1-${projectId}.cloudfunctions.net`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@assets', replacement: path.resolve(__dirname, 'src/assets') },
        { find: '@', replacement: path.resolve(__dirname, 'src') }
      ],
    },
    server: {
      host: true,
      port: 3000,
      proxy: {
        '/api': {
          target: presenceProxyTarget,
          changeOrigin: true,
          secure: presenceProxyTarget.startsWith('https://'),
        },
      },
    }
  };
});
