import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid PORT');
  const { default: app } = await import('./src/serverApp.ts');

  // Explicit route to serve baky one.png in case URL encoding or paths vary
  app.get(['/baky%20one.png', '/baky one.png', '/baky-one.png', '/logo.png', '/favicon.png'], (req, res) => {
    const candidatePaths = [
      path.join(process.cwd(), 'baky one.png'),
      path.join(process.cwd(), 'public', 'baky one.png'),
      path.join(process.cwd(), 'public', 'baky-one.png'),
      path.join(process.cwd(), 'baky-one.png'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.sendFile(p);
      }
    }
    res.status(404).send('Logo not found');
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BakyOne Search Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(() => { console.error('Server failed to start.'); process.exitCode = 1; });
