import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets from built dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// SPA Fallback: Serve index.html for any frontend client routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Frontend] Vite production app serving on http://0.0.0.0:${PORT}`);
});
