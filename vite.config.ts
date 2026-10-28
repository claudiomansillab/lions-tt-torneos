import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: funciona en GitHub Pages (usuario.github.io/repo/) y en cualquier hosting estático.
export default defineConfig({
  base: './',
  plugins: [react()],
});
