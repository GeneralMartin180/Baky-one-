import { build as buildVite } from 'vite';
import { build as buildServer } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
await buildVite();
await cp(path.join(root, 'LICENSE'), path.join(root, 'dist', 'LICENSE'));
if (!process.argv.includes('--vercel')) {
  await buildServer({ entryPoints: ['server.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node24', outfile: 'dist/server.cjs', sourcemap: true });
} else {
  // Build Output API: one fully bundled Node function, no runtime TypeScript resolution.
  const output = path.join(root, '.vercel', 'output');
  if (!path.resolve(output).startsWith(path.resolve(root) + path.sep)) throw new Error('Build output must stay inside the project');
  await rm(output, { recursive: true, force: true });
  const fn = path.join(output, 'functions', 'api', 'index.func');
  await mkdir(fn, { recursive: true });
  await cp(path.join(root, 'dist'), path.join(output, 'static'), { recursive: true });
  await buildServer({
    entryPoints: ['scripts/vercel-entry.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24',
    outfile: path.join(fn, 'index.cjs'), sourcemap: true,
    footer: { js: 'module.exports = module.exports.default;' },
  });
  await writeFile(path.join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs24.x', handler: 'index.cjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }));
  await writeFile(path.join(output, 'config.json'), JSON.stringify({
    version: 3,
    routes: [
      { src: '/api(?:/.*)?', dest: '/api/index' },
      { src: '/(.*)', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }, continue: true },
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html', headers: { 'Cache-Control': 'no-store' } },
    ],
  }, null, 2));
  console.log('Built self-contained Vercel API and static frontend.');
}
