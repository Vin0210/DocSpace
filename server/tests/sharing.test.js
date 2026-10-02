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

test('owner can share a document and the shared user can retrieve it', async () => {
  const usersRes = await fetch(base() + '/api/users');
  const users = await usersRes.json();
  assert.ok(users.length >= 2, 'seeded users exist');
  const elvin = users.find(u => u.email === 'elvin@example.com');
  const sarah = users.find(u => u.email === 'sarah@example.com');
  assert.ok(elvin && sarah);

  // Elvin creates a document
  const created = await api('POST', '/api/documents', { title: 'Project Proposal', content: '<p>Hello</p>' }, elvin.id);
  assert.equal(created.status, 201);
  const docId = created.json.id;

  // Elvin shares with Sarah
  const shared = await api('POST', '/api/documents/' + docId + '/share', { userId: sarah.id }, elvin.id);
  assert.equal(shared.status, 201);

  // Duplicate share is rejected
  const dup = await api('POST', '/api/documents/' + docId + '/share', { userId: sarah.id }, elvin.id);
  assert.equal(dup.status, 409);

  // Sarah sees it under shared documents
  const listRes = await fetch(base() + '/api/shared-documents?userId=' + sarah.id);
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.ok(list.some(d => d.id === docId), 'shared doc visible to Sarah');

  // Sarah can open it
  const openRes = await fetch(base() + '/api/documents/' + docId + '?userId=' + sarah.id);
  assert.equal(openRes.status, 200);

  // Non-owner cannot delete
  const del = await api('DELETE', '/api/documents/' + docId + '?userId=' + sarah.id, null);
  assert.equal(del.status, 403);

  // Shared user can edit content but not rename
  const edit = await api('PUT', '/api/documents/' + docId, { content: '<p>Edited by Sarah</p>' }, sarah.id);
  assert.equal(edit.status, 200);
  const rename = await api('PUT', '/api/documents/' + docId, { title: 'Hijacked' }, sarah.id);
  assert.equal(rename.status, 403);
});
