function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineMd(t) {
  return escapeHtml(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

// Minimal markdown -> HTML for .md import: headings, bold, italic, lists, paragraphs.
function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inUl = false, inOl = false;
  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { closeLists(); continue; }
    const h = t.match(/^(#{1,3})\s+(.*)/);
    if (h) { closeLists(); html += '<h' + h[1].length + '>' + inlineMd(h[2]) + '</h' + h[1].length + '>'; continue; }
    const ul = t.match(/^[-*]\s+(.*)/);
    if (ul) { if (!inUl) { closeLists(); html += '<ul>'; inUl = true; } html += '<li>' + inlineMd(ul[1]) + '</li>'; continue; }
    const ol = t.match(/^\d+\.\s+(.*)/);
    if (ol) { if (!inOl) { closeLists(); html += '<ol>'; inOl = true; } html += '<li>' + inlineMd(ol[1]) + '</li>'; continue; }
    closeLists();
    html += '<p>' + inlineMd(t) + '</p>';
  }
  closeLists();
  return html || '<p></p>';
}

function plainToHtml(text) {
  const paras = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (!paras.length) return '<p></p>';
  return paras.map(p => '<p>' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>').join('');
}

function getUser(db, id) {
  return db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id);
}

function getDocument(db, id) {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
}

function userCanAccess(db, docId, userId) {
  const doc = getDocument(db, docId);
  if (!doc) return { doc: null, role: null };
  if (doc.owner_id === userId) return { doc, role: 'owner' };
  const share = db.prepare('SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?').get(docId, userId);
  if (share) return { doc, role: share.role === 'viewer' ? 'viewer' : 'editor' };
  return { doc, role: null };
}

function docJson(db, doc, forUserId) {
  const owner = getUser(db, doc.owner_id);
  const shares = db.prepare(
    'SELECT u.id, u.name, u.email, s.role FROM document_shares s JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name'
  ).all(doc.id);
  const out = { ...doc, owner, shared_with: shares };
  if (forUserId) {
    if (doc.owner_id === forUserId) out.my_role = 'owner';
    else {
      const mine = shares.find((s) => s.id === forUserId);
      out.my_role = mine ? mine.role : null;
    }
  }
  return out;
}

function isValidShareRole(r) {
  return r === 'viewer' || r === 'editor';
}

function actorId(req) {
  // Header is the explicit actor channel. Body `userId` means the share
  // *target* on the share route, so it must be checked last.
  const raw = req.headers['x-user-id'] || (req.query && req.query.userId) || (req.body && req.body.ownerId);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = { escapeHtml, markdownToHtml, plainToHtml, getUser, getDocument, userCanAccess, docJson, actorId, isValidShareRole };
