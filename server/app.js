const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./database');
const { usersRouter } = require('./routes/users');
const { documentsRouter } = require('./routes/documents');
const { shareRouter, sharedRouter } = require('./routes/sharing');
const { uploadRouter } = require('./routes/upload');
const { documentCommentsRouter, commentsRouter } = require('./routes/comments');
const { versionsRouter } = require('./routes/versions');

function createApp(dbOverride) {
  const getDatabase = dbOverride ? () => dbOverride : getDb;
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/users', usersRouter(getDatabase));
  app.use('/api/documents', documentsRouter(getDatabase));
  app.use('/api/documents', shareRouter(getDatabase));
  app.use('/api/documents', documentCommentsRouter(getDatabase));
  app.use('/api/documents', versionsRouter(getDatabase));
  app.use('/api/comments', commentsRouter(getDatabase));
  app.use('/api/shared-documents', sharedRouter(getDatabase));
  app.use('/api/upload', uploadRouter(getDatabase));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Single-service deployment: serve the Vite build if present.
  // Local dev keeps using `vite dev` + proxy; production (Render/Railway/etc.)
  // serves client/dist from this same process so one URL covers UI + API.
  const distDir = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && (err.code === 'UNSUPPORTED_TYPE' || err.code === 'LIMIT_UNEXPECTED_FILE')) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a .txt or .md file.' });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large. Maximum size is 1 MB.' });
    }
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}

module.exports = { createApp };
