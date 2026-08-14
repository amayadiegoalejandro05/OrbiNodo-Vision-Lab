import { defineConfig } from 'vite';

// Solo desarrollo local: el navegador usa /api en el mismo origen y Vite lo
// reenvía a Fastify. Esta configuración no despliega ni modifica Vercel.
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: process.env.ORBINODO_API_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
});
