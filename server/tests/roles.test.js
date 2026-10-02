const test = require('node:test');
const assert = require('node:assert/strict');
const { initDb } = require('../database');
const { createApp } = require('../app');

const db = initDb(':memory:');
const app = createApp(db);
const server = app.listen(0);
const base = () => 'http://127.0.0.1:' + server.address().port;

test.after(() => { server.close(); db.close(); });

async function api(method, path, body, userId) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-user-id'] = String(userId);
  const res = await fetch(base() + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

test('viewer/editor roles, unshare, comments, and version restore', async () => {
  const users = await (await fetch(base() + '/api/users')).json();
  const elvin = users.find(u => u.email === 'elvin@example.com');
  const sarah = users.find(u => u.email === 'sarah@example.com');
  assert.ok(elvin && sarah);

  const created = await api('POST', '/api/documents', { title: 'Roles Doc', content: '<p>original</p>' }, elvin.id);
  assert.equal(created.status, 201);
  const docId = created.json.id;

  // Invalid role rejected
  const badRole = await api('POST', '/api/documents/' + docId + '/share', { userId: sarah.id, role: 'admin' }, elvin.id);
  assert.equal(badRole.status, 400);

  // Share as viewer
  assert.equal((await api('POST', '/api/documents/' + docId + '/share', { userId: sarah.id, role: 'viewer' }, elvin.id)).status, 201);

  // Viewer is blocked from editing but can read
  assert.equal((await api('PUT', '/api/documents/' + docId, { content: '<p>hack</p>' }, sarah.id)).status, 403);
  const open = await api('GET', '/api/documents/' + docId + '?userId=' + sarah.id, null, sarah.id);
  assert.equal(open.status, 200);
  assert.equal(open.json.my_role, 'viewer');

  // Viewer can comment; non-author non-owner cannot delete it
  const comment = await api('POST', '/api/documents/' + docId + '/comments', { content: 'Looks good', quote: 'original' }, sarah.id);
  assert.equal(comment.status, 201);
  const list = await api('GET', '/api/documents/' + docId + '/comments?userId=' + elvin.id, null, elvin.id);
  assert.equal(list.status, 200);
  assert.ok(list.json.some((c) => c.id === comment.json.id && c.quote === 'original'));
  const resolve = await api('PATCH', '/api/comments/' + comment.json.id, { resolved: true }, elvin.id);
  assert.equal(resolve.status, 200);
  assert.equal(resolve.json.resolved, true);

  // Non-owner cannot change roles
  assert.equal((await api('PUT', '/api/documents/' + docId + '/share/' + sarah.id, { role: 'editor' }, sarah.id)).status, 403);

  // Promote to editor: can edit content, still cannot rename/share/restore-as-viewer
  assert.equal((await api('PUT', '/api/documents/' + docId + '/share/' + sarah.id, { role: 'editor' }, elvin.id)).status, 200);
  assert.equal((await api('PUT', '/api/documents/' + docId, { content: '<p>edited</p>' }, sarah.id)).status, 200);
  assert.equal((await api('PUT', '/api/documents/' + docId, { title: 'Hijack' }, sarah.id)).status, 403);
  // Regression: editor autosave echoes the unchanged title — must not 403.
  const echo = await api('PUT', '/api/documents/' + docId, { title: 'Roles Doc', content: '<p>echo save</p>' }, sarah.id);
  assert.equal(echo.status, 200);
  assert.equal(echo.json.title, 'Roles Doc');
  assert.ok(echo.json.content.includes('echo save'));

  // Version history exists and restore works for editor
  const versions = await api('GET', '/api/documents/' + docId + '/versions?userId=' + elvin.id, null, elvin.id);
  assert.equal(versions.status, 200);
  assert.ok(versions.json.length >= 1);
  // Handoff: sarah's edit was seconds after elvin's, but a different
  // collaborator always gets a version — newest entry is hers.
  assert.equal(versions.json[0].author.name, 'Sarah Smith');
  const first = versions.json[versions.json.length - 1];
  const restored = await api('POST', '/api/documents/' + docId + '/versions/' + first.id + '/restore', {}, sarah.id);
  assert.equal(restored.status, 200);

  // Demote back to viewer: restore is now forbidden
  await api('PUT', '/api/documents/' + docId + '/share/' + sarah.id, { role: 'viewer' }, elvin.id);
  const versions2 = await api('GET', '/api/documents/' + docId + '/versions?userId=' + elvin.id, null, elvin.id);
  assert.equal((await api('POST', '/api/documents/' + docId + '/versions/' + versions2.json[0].id + '/restore', {}, sarah.id)).status, 403);

  // Unshare removes access entirely
  assert.equal((await api('DELETE', '/api/documents/' + docId + '/share/' + sarah.id, null, elvin.id)).status, 200);
  assert.equal((await api('GET', '/api/documents/' + docId + '?userId=' + sarah.id, null, sarah.id)).status, 403);
  const shared = await (await fetch(base() + '/api/shared-documents?userId=' + sarah.id)).json();
  assert.ok(!shared.some((d) => d.id === docId));
});
