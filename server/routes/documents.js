const express = require('express');
const { getUser, getDocument, userCanAccess, docJson, actorId } = require('./helpers');

const VERSION_MIN_INTERVAL_MS = 120 * 1000;
const VERSION_KEEP = 30;

function maybeSnapshot(db, docId, title, content, userId) {
  try {
    const latest = db.prepare(
      'SELECT id, content, user_id, created_at FROM document_versions WHERE document_id = ? ORDER BY id DESC LIMIT 1'
    ).get(docId);
    if (latest) {
      if (latest.content === content) return;
      // Throttle rapid autosaves from the SAME editor, but always record a
      // handoff: when a different collaborator saves, their edit gets its own
      // version so shared users show up in history immediately.
      if (latest.user_id === userId) {
        const ts = Date.parse(String(latest.created_at).replace(' ', 'T') + 'Z');
        if (!Number.isNaN(ts) && Date.now() - ts < VERSION_MIN_INTERVAL_MS) return;
      }
    }
    db.prepare(
      'INSERT INTO document_versions (document_id, title, content, user_id) VALUES (?, ?, ?, ?)'
    ).run(docId, title, content, userId);
    db.prepare(
      "DELETE FROM document_versions WHERE document_id = ? AND id NOT IN (SELECT id FROM document_versions WHERE document_id = ? ORDER BY id DESC LIMIT ?)"
    ).run(docId, docId, VERSION_KEEP);
  } catch (e) { /* versions are best-effort; never break a save */ }
}

function documentsRouter(getDb) {
  const router = express.Router();

  router.get('/', (req, res) => {
    try {
      const userId = Number(req.query.userId);
      if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Valid userId query param is required.' });
      const db = getDb();
      if (!getUser(db, userId)) return res.status(404).json({ error: 'User not found.' });
      const docs = db.prepare('SELECT * FROM documents WHERE owner_id = ? ORDER BY updated_at DESC').all(userId);
      res.json(docs.map(d => docJson(db, d)));
    } catch (e) { res.status(500).json({ error: 'Failed to load documents.' }); }
  });

  router.post('/', (req, res) => {
    try {
      const userId = Number((req.body && req.body.userId) || req.query.userId || req.headers['x-user-id']);
      if (!userId) return res.status(400).json({ error: 'Valid userId is required.' });
      const title = String((req.body || {}).title || '').trim() || 'Untitled Document';
      const content = String((req.body || {}).content ?? '');
      if ((req.body || {}).title !== undefined && !String(req.body.title).trim()) {
        return res.status(400).json({ error: 'Document title is required.' });
      }
      const db = getDb();
      if (!getUser(db, userId)) return res.status(404).json({ error: 'User not found.' });
      const info = db.prepare('INSERT INTO documents (title, content, owner_id) VALUES (?, ?, ?)').run(title, content, userId);
      res.status(201).json(docJson(db, getDocument(db, info.lastInsertRowid)));
    } catch (e) { res.status(500).json({ error: 'Failed to create document.' }); }
  });

  router.get('/:id', (req, res) => {
    try {
      const docId = Number(req.params.id);
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      const db = getDb();
      const doc = getDocument(db, docId);
      if (!doc) return res.status(404).json({ error: 'Document not found.' });
      const qUser = Number(req.query.userId || req.headers['x-user-id']);
      if (qUser && getUser(db, qUser)) {
        const { role } = userCanAccess(db, docId, qUser);
        if (!role) return res.status(403).json({ error: 'You do not have access to this document.' });
        return res.json(docJson(db, doc, qUser));
      }
      res.json(docJson(db, doc));
    } catch (e) { res.status(500).json({ error: 'Failed to load document.' }); }
  });

  router.put('/:id', (req, res) => {
    try {
      const docId = Number(req.params.id);
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      const userId = Number((req.body && req.body.userId) || req.query.userId || req.headers['x-user-id']);
      if (!userId) return res.status(400).json({ error: 'Valid userId is required.' });
      const db = getDb();
      if (!getUser(db, userId)) return res.status(404).json({ error: 'User not found.' });
      const found = userCanAccess(db, docId, userId);
      if (!found.doc) return res.status(404).json({ error: 'Document not found.' });
      if (!found.role) return res.status(403).json({ error: 'Only the owner or shared collaborators can edit this document.' });
      if (found.role === 'viewer') return res.status(403).json({ error: 'Viewers cannot edit this document.' });
      const { title, content } = req.body || {};
      // Editors autosave content with the title echoed back; only treat it as
      // a rename when it actually differs, so editors are never blocked by
      // merely including the unchanged title.
      let nextTitle = found.doc.title;
      if (title !== undefined) {
        const trimmed = String(title).trim();
        if (trimmed !== found.doc.title) {
          if (found.role !== 'owner') return res.status(403).json({ error: 'Only the owner can rename this document.' });
          if (!trimmed) return res.status(400).json({ error: 'Document title is required.' });
          nextTitle = trimmed;
        }
      }
      const nextContent = content !== undefined ? String(content) : found.doc.content;
      // Bootstrap: preserve the original state as v1 on the first-ever edit.
      const hasVersion = db.prepare('SELECT id FROM document_versions WHERE document_id = ? LIMIT 1').get(docId);
      if (!hasVersion) {
        try {
          db.prepare(
            'INSERT INTO document_versions (document_id, title, content, user_id) VALUES (?, ?, ?, ?)'
          ).run(docId, found.doc.title, found.doc.content, found.doc.owner_id);
        } catch (e) { /* best-effort */ }
      }
      db.prepare("UPDATE documents SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?").run(nextTitle, nextContent, docId);
      maybeSnapshot(db, docId, nextTitle, nextContent, userId);
      res.json(docJson(db, getDocument(db, docId), userId));
    } catch (e) { res.status(500).json({ error: 'Unable to save your changes. Please try again.' }); }
  });

  router.delete('/:id', (req, res) => {
    try {
      const docId = Number(req.params.id);
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      const userId = Number(req.query.userId || req.headers['x-user-id']);
      if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Valid userId is required.' });
      const db = getDb();
      const doc = getDocument(db, docId);
      if (!doc) return res.status(404).json({ error: 'Document not found.' });
      if (doc.owner_id !== userId) return res.status(403).json({ error: 'Only the owner can delete this document.' });
      db.prepare('DELETE FROM documents WHERE id = ?').run(docId);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete document.' }); }
  });

  return router;
}

module.exports = { documentsRouter };
