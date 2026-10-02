const express = require('express');
const { getUser, getDocument, userCanAccess, docJson } = require('./helpers');

function versionsRouter(getDb) {
  // Mounted under /api/documents.
  const router = express.Router({ mergeParams: true });

  // GET /api/documents/:id/versions — any role with access may read history.
  router.get('/:id/versions', (req, res) => {
    try {
      const docId = Number(req.params.id);
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      const userId = Number(req.query.userId || req.headers['x-user-id']);
      if (!userId) return res.status(400).json({ error: 'Valid userId is required.' });
      const db = getDb();
      const { doc, role } = userCanAccess(db, docId, userId);
      if (!doc) return res.status(404).json({ error: 'Document not found.' });
      if (!role) return res.status(403).json({ error: 'You do not have access to this document.' });
      const rows = db.prepare(
        'SELECT v.*, u.name AS author_name FROM document_versions v LEFT JOIN users u ON u.id = v.user_id WHERE v.document_id = ? ORDER BY v.id DESC LIMIT 30'
      ).all(docId);
      res.json(rows.map((v) => ({
        id: v.id,
        title: v.title,
        created_at: v.created_at,
        author: v.user_id ? { id: v.user_id, name: v.author_name } : null,
        preview: String(v.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140),
      })));
    } catch (e) { res.status(500).json({ error: 'Failed to load version history.' }); }
  });

  // POST /api/documents/:id/versions/:versionId/restore — owner + editor only.
  router.post('/:id/versions/:versionId/restore', (req, res) => {
    try {
      const docId = Number(req.params.id);
      const versionId = Number(req.params.versionId);
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      if (!Number.isInteger(versionId) || versionId <= 0) return res.status(400).json({ error: 'Valid version id is required.' });
      const userId = Number((req.body && req.body.userId) || req.query.userId || req.headers['x-user-id']);
      if (!userId) return res.status(400).json({ error: 'Valid userId is required.' });
      const db = getDb();
      if (!getUser(db, userId)) return res.status(404).json({ error: 'User not found.' });
      const { doc, role } = userCanAccess(db, docId, userId);
      if (!doc) return res.status(404).json({ error: 'Document not found.' });
      if (role !== 'owner' && role !== 'editor') {
        return res.status(403).json({ error: 'Viewers cannot restore versions.' });
      }
      const version = db.prepare(
        'SELECT * FROM document_versions WHERE id = ? AND document_id = ?'
      ).get(versionId, docId);
      if (!version) return res.status(404).json({ error: 'Version not found.' });
      // Preserve current state before restoring so restore is never destructive.
      db.prepare(
        'INSERT INTO document_versions (document_id, title, content, user_id) VALUES (?, ?, ?, ?)'
      ).run(docId, doc.title, doc.content, userId);
      db.prepare("UPDATE documents SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?")
        .run(version.title, version.content, docId);
      res.json(docJson(db, getDocument(db, docId), userId));
    } catch (e) { res.status(500).json({ error: 'Failed to restore version.' }); }
  });

  return router;
}

module.exports = { versionsRouter };
