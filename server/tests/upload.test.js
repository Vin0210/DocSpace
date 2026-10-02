const test = require('node:test');
const assert = require('node:assert/strict');
const { initDb } = require('../database');
const { createApp } = require('../app');

const db = initDb(':memory:');
const app = createApp(db);
const server = app.listen(0);
const base = () => 'http://127.0.0.1:' + server.address().port;

test.after(() => { server.close(); db.close(); });

// Minimal CRC32 + stored (uncompressed) ZIP writer so the test can build a
// real .docx without extra dependencies.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    for (const o of [30, 32, 34, 36, 38]) cen.writeUInt16LE(0, o);
    cen.writeUInt32LE(0, 40);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  offset += centralBuf.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

function minimalDocx() {
  const types = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const doc = '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Project Plan</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Hello docx</w:t></w:r></w:p></w:body></w:document>';
  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(types) },
    { name: '_rels/.rels', data: Buffer.from(rels) },
    { name: 'word/document.xml', data: Buffer.from(doc) },
  ]);
}

async function upload(filename, buffer, mime, userId) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);
  const res = await fetch(base() + '/api/upload', {
    method: 'POST',
    headers: { 'x-user-id': String(userId) },
    body: form,
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

test('.docx import creates an editable document, rejects garbage', async () => {
  const users = await (await fetch(base() + '/api/users')).json();
  const elvin = users.find((u) => u.email === 'elvin@example.com');
  assert.ok(elvin);

  const good = await upload('plan.docx', minimalDocx(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', elvin.id);
  assert.equal(good.status, 201);
  assert.equal(good.json.title, 'plan');
  assert.ok(good.json.content.includes('Project Plan'), 'heading converted, got: ' + good.json.content.slice(0, 120));
  assert.ok(good.json.content.includes('Hello docx'), 'paragraph converted');

  // Imported doc reopens like any other document
  const reopen = await fetch(base() + '/api/documents/' + good.json.id + '?userId=' + elvin.id);
  assert.equal(reopen.status, 200);

  // Corrupt .docx gets a clean 400, not a 500
  const bad = await upload('broken.docx', Buffer.from('not a zip at all'), 'application/octet-stream', elvin.id);
  assert.equal(bad.status, 400);

  // Other types still rejected
  const pdf = await upload('x.pdf', Buffer.from('%PDF-1.4'), 'application/pdf', elvin.id);
  assert.equal(pdf.status, 400);
});
