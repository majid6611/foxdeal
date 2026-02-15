import { Router } from 'express';
import { telegramAuth } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Request, Response } from 'express';

export const uploadRouter = Router();

const UPLOAD_DIR = '/app/uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// POST /api/upload — upload an image (raw body with Content-Type header)
uploadRouter.post('/', telegramAuth, async (req: Request, res: Response) => {
  try {
    const contentType = req.headers['content-type'] ?? '';

    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image files are allowed' });
      return;
    }

    // Get file extension from content type
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    const ext = extMap[contentType] ?? '.jpg';

    // Collect raw body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      res.status(400).json({ error: 'Empty file' });
      return;
    }

    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'File too large (max 5MB)' });
      return;
    }

    // Generate unique filename
    const hash = crypto.randomBytes(16).toString('hex');
    const filename = `${hash}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    fs.writeFileSync(filepath, buffer);

    const url = `/api/upload/${filename}`;
    res.json({ url, filename });
  } catch (err) {
    console.error('[api] Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/upload/:filename — serve uploaded images
uploadRouter.get('/:filename', (req: Request, res: Response) => {
  const rawFilename = req.params.filename;
  const filename = (Array.isArray(rawFilename) ? rawFilename[0] : rawFilename ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  const filepath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const extMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const ext = path.extname(filename).toLowerCase();
  res.setHeader('Content-Type', extMap[ext] ?? 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  fs.createReadStream(filepath).pipe(res);
});
