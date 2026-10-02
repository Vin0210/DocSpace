const express = require('express');
const { getUser, userCanAccess } = require('./helpers');

// Comments on a document. Mounted under /api/documents (for collection routes)
// and /api/comments (for item routes) — see app.js.
function documentCommentsRouter(getDb) {
  const router = express.Router({ mergeParams: true });

  // GET /api/documents/:id/comments
  router.get('/:id/comments', (req, res) => {
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
        'SELECT c.*, u.name AS author_name, u.email AS author_email FROM comments c JOIN users u ON u.id = c.user_id WHERE c.document_id = ? ORDER BY c.id ASC'
      ).all(docId);
      res.json(rows.map((c) => ({
        id: c.id,
        document_id: c.document_id,
        content: c.content,
        quote: c.quote || '',
        resolved: !!c.resolved,
        created_at: c.created_at,
        author: { id: c.user_id, name: c.author_name, email: c.author_email },
      })));
    } catch (e) { res.status(500).json({ error: 'Failed to load comments.' }); }
  });

  // POST /api/documents/:id/comments — any role with access (viewer included) may comment.
  router.post('/:id/comments', (req, res) => {
    try {
      const docId = Number(req.params.id);
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      const userId = Number((req.body && req.body.userId) || req.query.userId || req.headers['x-user-id']);
      if (!userId) return res.status(400).json({ error: 'Valid userId is required.' });
      const content = String((req.body || {}).content || '').trim();
      if (!content) return res.status(400).json({ error: 'Comment text is required.' });
      if (content.length > 2000) return res.status(400).json({ error: 'Comments are limited to 2000 characters.' });
      const quote = String((req.body || {}).quote || '').slice(0, 300);
      const db = getDb();
      if (!getUser(db, userId)) return res.status(404).json({ error: 'User not found.' });
      const { doc, role } = userCanAccess(db, docId, userId);
      if (!doc) return res.status(404).json({ error: 'Document not found.' });
      if (!role) return res.status(403).json({ error: 'You do not have access to this document.' });
      const info = db.prepare(
        'INSERT INTO comments (document_id, user_id, content, quote) VALUES (?, ?, ?, ?)'
      ).run(docId, userId, content, quote);
      const author = getUser(db, userId);
      res.status(201).json({
        id: info.lastInsertRowid, document_id: docId, content, quote,
        resolved: false, author,
      });
    } catch (e) { res.status(500).json({ error: 'Failed to add comment.' }); }
  });

  return router;
}

function commentsRouter(getDb) {
  const router = express.Router();

  function load(db, id) {
    return db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
  }

  // PATCH /api/comments/:id — resolve / reopen. Author or owner only.
  router.patch('/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Valid comment id is required.' });
      const userId = Number((req.body && req.body.userId) || req.query.userId || req.headers['x-user-id']);
      if (!userId) return res.status(400).json({ error: 'Valid userId is required.' });
      const db = getDb();
      const comment = load(db, id);
      if (!comment) return res.status(404).json({ error: 'Comment not found.' });
      const { doc, role } = userCanAccess(db, comment.document_id, userId);
      if (!doc || !role) return res.status(403).json({ error: 'You do not have access to this document.' });
      if (comment.user_id !== userId && doc.owner_id !== userId) {
        return res.status(403).json({ error: 'Only the author or document owner can resolve comments.' });
      }
      const resolved = (req.body || {}).resolved === undefined ? !comment.resolved : !!req.body.resolved;
      db.prepare('UPDATE comments SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id);
      res.json({ ok: true, resolved });
    } catch (e) { res.status(500).json({ error: 'Failed to update comment.' }); }
  });

  // DELETE /api/comments/:id — author or owner only.
  router.delete('/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Valid comment id is required.' });
      const userId = Number(req.query.userId || req.headers['x-user-id']);
      if (!userId) return res.status(400).json({ error: 'Valid userId is required.' });
      const db = getDb();
      const comment = load(db, id);
      if (!comment) return res.status(404).json({ error: 'Comment not found.' });
      const { doc, role } = userCanAccess(db, comment.document_id, userId);
      if (!doc || !role) return res.status(403).json({ error: 'You do not have access to this document.' });
      if (comment.user_id !== userId && doc.owner_id !== userId) {
        return res.status(403).json({ error: 'Only the author or document owner can delete comments.' });
      }
      db.prepare('DELETE FROM comments WHERE id = ?').run(id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete comment.' }); }
  });

  return router;
}

module.exports = { documentCommentsRouter, commentsRouter };
