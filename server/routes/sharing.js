const express = require('express');
const { getUser, getDocument, docJson, isValidShareRole } = require('./helpers');

function shareRouter(getDb) {
  // Mounted under /api/documents.
  const router = express.Router({ mergeParams: true });

  function ownerOnly(db, docId, ownerId) {
    const doc = getDocument(db, docId);
    if (!doc) return { error: 404, message: 'Document not found.' };
    if (doc.owner_id !== ownerId) return { error: 403, message: 'Only the owner can manage sharing for this document.' };
    return { doc };
  }

  // POST /api/documents/:id/share — grant access with a role (default editor).
  router.post('/:id/share', (req, res) => {
    try {
      const docId = Number(req.params.id);
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      const ownerId = Number(req.headers['x-user-id'] || (req.body || {}).ownerId || req.query.userId);
      const targetId = Number((req.body || {}).userId);
      const role = String((req.body || {}).role || 'editor').toLowerCase();
      if (!ownerId) return res.status(400).json({ error: 'Valid userId (owner) is required.' });
      if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Valid userId to share with is required.' });
      if (!isValidShareRole(role)) return res.status(400).json({ error: 'Role must be viewer or editor.' });
      const db = getDb();
      const checked = ownerOnly(db, docId, ownerId);
      if (checked.error) return res.status(checked.error).json({ error: checked.message });
      const target = getUser(db, targetId);
      if (!target) return res.status(404).json({ error: 'User to share with was not found.' });
      if (targetId === checked.doc.owner_id) return res.status(400).json({ error: 'A document cannot be shared with its owner.' });
      const existing = db.prepare('SELECT id FROM document_shares WHERE document_id = ? AND user_id = ?').get(docId, targetId);
      if (existing) return res.status(409).json({ error: 'This document is already shared with that user.' });
      db.prepare('INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)').run(docId, targetId, role);
      res.status(201).json({ ok: true, shared_with: docJson(db, checked.doc).shared_with });
    } catch (e) { res.status(500).json({ error: 'Failed to share document.' }); }
  });

  // PUT /api/documents/:id/share/:userId — change a collaborator's role.
  router.put('/:id/share/:userId', (req, res) => {
    try {
      const docId = Number(req.params.id);
      const targetId = Number(req.params.userId);
      const role = String((req.body || {}).role || '').toLowerCase();
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Valid user id is required.' });
      if (!isValidShareRole(role)) return res.status(400).json({ error: 'Role must be viewer or editor.' });
      const ownerId = Number(req.headers['x-user-id'] || (req.body || {}).ownerId || req.query.userId);
      if (!ownerId) return res.status(400).json({ error: 'Valid userId (owner) is required.' });
      const db = getDb();
      const checked = ownerOnly(db, docId, ownerId);
      if (checked.error) return res.status(checked.error).json({ error: checked.message });
      const existing = db.prepare('SELECT id FROM document_shares WHERE document_id = ? AND user_id = ?').get(docId, targetId);
      if (!existing) return res.status(404).json({ error: 'That user does not have access to this document.' });
      db.prepare('UPDATE document_shares SET role = ? WHERE document_id = ? AND user_id = ?').run(role, docId, targetId);
      res.json({ ok: true, shared_with: docJson(db, checked.doc).shared_with });
    } catch (e) { res.status(500).json({ error: 'Failed to update sharing role.' }); }
  });

  // DELETE /api/documents/:id/share/:userId — remove a collaborator (unshare).
  router.delete('/:id/share/:userId', (req, res) => {
    try {
      const docId = Number(req.params.id);
      const targetId = Number(req.params.userId);
      if (!Number.isInteger(docId) || docId <= 0) return res.status(400).json({ error: 'Valid document id is required.' });
      if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Valid user id is required.' });
      const ownerId = Number(req.headers['x-user-id'] || req.query.userId);
      if (!ownerId) return res.status(400).json({ error: 'Valid userId (owner) is required.' });
      const db = getDb();
      const checked = ownerOnly(db, docId, ownerId);
      if (checked.error) return res.status(checked.error).json({ error: checked.message });
      db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?').run(docId, targetId);
      res.json({ ok: true, shared_with: docJson(db, checked.doc).shared_with });
    } catch (e) { res.status(500).json({ error: 'Failed to remove collaborator.' }); }
  });

  return router;
}

function sharedRouter(getDb) {
  const router = express.Router();
  router.get('/', (req, res) => {
    try {
      const userId = Number(req.query.userId);
      if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Valid userId query param is required.' });
      const db = getDb();
      if (!getUser(db, userId)) return res.status(404).json({ error: 'User not found.' });
      const docs = db.prepare(
        'SELECT d.*, s.role AS my_role FROM document_shares s JOIN documents d ON d.id = s.document_id WHERE s.user_id = ? ORDER BY d.updated_at DESC'
      ).all(userId);
      res.json(docs.map(d => {
        const full = docJson(db, d, userId);
        full.shared_by = full.owner;
        return full;
      }));
    } catch (e) { res.status(500).json({ error: 'Failed to load shared documents.' }); }
  });
  return router;
}

module.exports = { shareRouter, sharedRouter };
