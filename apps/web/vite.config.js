import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	// En desarrollo, Vite reenvía la API y el panel de PocketBase al servidor local.
	const pbTarget = env.PB_DEV_URL || 'http://127.0.0.1:8090';
	// `vite build --mode demo`: versión de prueba para un artefacto de claude.ai,
	// sin servidor (los datos van a la base de datos del artefacto).
	const demo = mode === 'demo';
	const src = path.resolve(__dirname, './src');

	return {
		plugins: [react()],
		server: {
			port: 3000,
			proxy: {
				'/api': { target: pbTarget, changeOrigin: true, ws: true },
				'/_': { target: pbTarget, changeOrigin: true },
			},
		},
		resolve: {
			extensions: ['.jsx', '.js', '.json'],
			alias: [
				...(demo ? [
					{ find: /^@\/lib\/pocketbaseClient$/, replacement: `${src}/lib/demo/pocketbaseDemo.js` },
					{ find: /^@\/lib\/appRouter$/, replacement: `${src}/lib/demo/appRouter.jsx` },
				] : []),
				{ find: '@', replacement: src },
			],
		},
		...(demo ? { base: './', build: { outDir: 'dist-demo', emptyOutDir: true } } : {}),
	};
});
