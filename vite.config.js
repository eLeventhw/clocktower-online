import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The client bundle is emitted to `web-build` rather than `dist`: the deployment
// uploader skips a directory named `dist`, which silently shipped a stale UI.
export default defineConfig({ plugins: [react()], build: { outDir: 'web-build', emptyOutDir: true }, server: { proxy: { '/api': 'http://localhost:3000' } } });
