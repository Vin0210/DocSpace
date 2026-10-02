const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const { getUser, getDocument, docJson, markdownToHtml, plainToHtml } = require('./helpers');

function uploadRouter(getDb) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1 * 1024 * 1024 },
  });

  // Validate extension BEFORE multer processes, so unsupported types get a clean 400
  // regardless of how the multipart body names the file.
  router.post('/', (req, res, next) => {
    const ctype = req.headers['content-type'] || '';
    if (!/multipart\/form-data/i.test(ctype)) {
      return res.status(400).json({ error: 'Upload failed. Please try again.' });
    }
    next();
  });

  router.post('/', (req, res) => {
    upload.any()(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File is too large. Maximum size is 1 MB.' });
        }
        return res.status(400).json({ error: 'Upload failed. Please try again.' });
      }
      try {
        const userId = Number((req.body && req.body.userId) || req.headers['x-user-id']);
        if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Valid userId is required.' });
        const file = (req.files && req.files[0]) || null;
        if (!file) return res.status(400).json({ error: 'No file was uploaded. Please choose a .txt, .md, or .docx file.' });
        if (!/\.(txt|md|docx)$/i.test(file.originalname || '')) {
          return res.status(400).json({ error: 'Unsupported file type. Please upload a .txt, .md, or .docx file.' });
        }
        const db = getDb();
        if (!getUser(db, userId)) return res.status(404).json({ error: 'User not found.' });
        const original = file.originalname || 'Imported Document';
        const title = (original.replace(/\.(txt|md|docx)$/i, '').trim() || 'Imported Document').slice(0, 200);
        let content;
        if (/\.docx$/i.test(original)) {
          let value;
          try {
            const result = await mammoth.convertToHtml({ buffer: file.buffer });
            value = String(result.value || '').trim();
          } catch (e) {
            return res.status(400).json({ error: 'Could not read that .docx file. It may be corrupted.' });
          }
          if (!value.replace(/<[^>]*>/g, '').trim()) {
            return res.status(400).json({ error: 'The uploaded file is empty.' });
          }
          content = value;
        } else {
          const text = (file.buffer || Buffer.alloc(0)).toString('utf8').trim();
          if (!text) return res.status(400).json({ error: 'The uploaded file is empty.' });
          content = /\.md$/i.test(original) ? markdownToHtml(text) : plainToHtml(text);
        }
        const info = db.prepare('INSERT INTO documents (title, content, owner_id) VALUES (?, ?, ?)').run(title, content, userId);
        res.status(201).json(docJson(db, getDocument(db, info.lastInsertRowid)));
      } catch (e) { res.status(500).json({ error: 'Failed to import file.' }); }
    });
  });

  return router;
}

module.exports = { uploadRouter };
