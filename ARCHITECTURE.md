# Architecture — DocSpace

## What was prioritized and why

I prioritized the complete document lifecycle — creation, rich-text editing,
persistence, file import, and sharing — rather than real-time collaboration.
That is the full end-to-end product slice the assessment asks for, and it fits
the 4–6 hour timebox. Everything else (comments, history, folders, OAuth,
WebSockets) was deliberately excluded.

## Frontend architecture

- `client/src/App.jsx` — routes only (`/login`, `/`, `/docs/:id`) with auth guards.
- `auth/AuthContext.jsx` — mock session: seeded user list from `GET /api/users`,
  selected user in state + `localStorage`.
- `services/api.js` — single Axios instance. Base URL is `VITE_API_URL` or `/api`
  (dev proxy). An interceptor attaches the current user id as `x-user-id` header
  and `userId` param/body so the backend can authorize without real auth.
- `pages/DashboardPage.jsx` + `DashboardLists.jsx` — loads owned + shared docs in
  parallel, `+ New Document`, `.txt/.md` import, owner delete.
- `pages/EditorPage.jsx` — loads one doc, debounced autosave (~900ms) plus manual
  Save, visible save state, owner-only title editing and Share button, plus
  role-aware read-only mode, Comments/History side panels, and Export menu.
- `components/TipTapEditor.jsx` — TipTap with StarterKit + Underline; emits HTML
  on every update; parent debounces persistence. Supports `editable=false` for
  viewers and reports the current text selection for comment quotes.
- `components/ShareModal.jsx` — user dropdown (excludes self/owner/already-shared),
  role picker, POST share, per-collaborator role change + Remove (unshare).

No global state library; component state + React Router is enough at this size.

## Backend architecture

- `server/server.js` — boots `createApp()` on `$PORT`.
- `server/app.js` — Express factory (also used by tests with an in-memory DB):
  CORS, `express.json`, route mounting, 404 + error middleware that maps Multer
  errors to clean 400/413 and never leaks stack traces.
- `server/routes/users.js` — `GET /api/users`.
- `server/routes/documents.js` — owned-doc CRUD (`GET/POST /`, `GET/PUT/DELETE /:id`).
- `server/routes/sharing.js` — `POST /:id/share` (grant with role), `PUT /:id/share/:userId`
  (change role), `DELETE /:id/share/:userId` (unshare), and `GET /api/shared-documents`.
- `server/routes/comments.js` — `GET/POST /api/documents/:id/comments`, `PATCH/DELETE
  /api/comments/:id` (resolve/reopen, delete; author-or-owner only).
- `server/routes/versions.js` — `GET /api/documents/:id/versions`, `POST
  /:id/versions/:versionId/restore` (owner+editor; snapshots current state first).
- `server/routes/upload.js` — `POST /api/upload`, Multer memory storage, 1 MB cap.
- `server/routes/helpers.js` — `actorId`, `getUser/getDocument/userCanAccess`,
  `docJson` (doc + owner + `shared_with`), `markdownToHtml`/`plainToHtml`.

## Database design

SQLite via better-sqlite3, WAL mode, `foreign_keys = ON`.

- `users(id, name, email UNIQUE, created_at)` — seeded with the three demo accounts.
- `documents(id, title, content, owner_id → users, created_at, updated_at)`.
- `document_shares(id, document_id → documents ON DELETE CASCADE, user_id → users
  ON DELETE CASCADE, role TEXT `viewer`|`editor` DEFAULT `editor`,
  created_at, UNIQUE(document_id, user_id))`.
  Older DB files are migrated on boot (`ALTER TABLE … ADD COLUMN role`).
- `comments(id, document_id → documents ON DELETE CASCADE, user_id → users
  ON DELETE CASCADE, content, quote, resolved, created_at)`.
- `document_versions(id, document_id → documents ON DELETE CASCADE, title,
  content, user_id → users ON DELETE SET NULL, created_at)`.
- Indexes on `documents(owner_id)`, `document_shares(document_id/user_id)`,
  `comments(document_id)`, `document_versions(document_id)`.

`server/database.js` exposes `initDb(path)` (creates schema + seeds) and `getDb()`
singleton. Tests call `initDb(':memory:')`.

## API design

All responses are JSON; errors are `{ error: "<human message>" }` with correct
status codes (400 validation, 403 forbidden, 404 missing, 409 duplicate share,
413 oversized upload, 500 generic).

- `GET /api/users`
- `GET /api/documents?userId=` — owned docs, newest first.
- `POST /api/documents` — `{ title?, content? }`, defaults to "Untitled Document".
- `GET /api/documents/:id` — optional `userId` enforcement (403 for outsiders).
- `PUT /api/documents/:id` — owner may change title+content; editor may
  change content only (title → 403); viewer edits → 403. Successful edits
  record version snapshots (throttled, best-effort).
- `DELETE /api/documents/:id` — owner only.
- `POST /api/documents/:id/share` — owner only; body `{ userId, role? }`.
- `PUT /api/documents/:id/share/:userId` — owner only; body `{ role }`.
- `DELETE /api/documents/:id/share/:userId` — owner only (unshare).
- `GET /api/shared-documents?userId=` — docs shared with caller + `shared_by` + `my_role`.
- `GET/POST /api/documents/:id/comments` — any role with access.
- `PATCH /api/comments/:id` (`{ resolved }`) and `DELETE /api/comments/:id` — author or owner.
- `GET /api/documents/:id/versions` — any role with access (id, title, author, time, text preview).
- `POST /api/documents/:id/versions/:versionId/restore` — owner + editor.
- `POST /api/upload` — multipart `file` + `userId`; validates extension, size,
  emptiness; creates + returns a document.

## Document persistence strategy

Content is stored as an HTML string in `documents.content`. TipTap serializes to
HTML (`editor.getHTML()`), the API stores it verbatim, and the editor rehydrates
with `setContent(html)`. This round-trips bold/italic/underline/headings/lists
without a custom schema, and refreshing the page reopens identical formatting.
Autosave is debounced (900ms) to avoid a request per keystroke; a Save button
forces immediate persistence, and failures surface a "Save failed" state.

## Sharing model

Role-based, Google-Docs-inspired: `owner` (from `documents.owner_id`), `editor`
and `viewer` (from `document_shares.role`). Viewers get a read-only TipTap
instance server-enforced (any content PUT → 403); editors may change content but
not title; only owners rename/delete/share/manage roles. `docJson()` includes
`my_role` for the requesting user so the UI can adapt (toolbar, Save button,
title input, restore buttons). Documented in README and enforced server-side
(never trust the disabled inputs alone).

## Comments, versions, export

- Comments are document-scoped rows with an optional selected-text `quote`
  captured from the editor selection. Any role with access may add; only the
  author or owner may resolve/reopen or delete.
- Versions snapshot on PUT: the pre-edit state is bootstrapped as v1 on the
  first edit, then new states are stored at most every ~2 minutes per editor
  (identical content skipped, last 30 kept) — except a handoff always snapshots,
  so when a different collaborator saves, their edit appears in history
  immediately with their name. Restore inserts the current state first, so
  restoring is never destructive.
- Export is client-side only (no new deps): HTML→Markdown converter in
  `client/src/services/export.js`, file download via Blob, and a print
  stylesheet so browser Print / Save-as-PDF outputs just the document.

## File upload approach

Multer memory storage → validate actor, file presence, `.txt`/`.md`/`.docx`
extension, 1 MB limit, non-empty → convert to HTML (Markdown subset, plain
paragraphs, or Mammoth for `.docx`) → `INSERT INTO documents` with
filename-derived title → return doc so the client can open it directly.
Corrupt `.docx` files get a clean 400 (never a 500/stack trace). No files are
kept on disk (`server/uploads/` is unused reserve).

## Important scope decisions

- Mock auth over real auth (spec explicitly allows it).
- No WebSockets/CRDTs: last-write-wins is acceptable for a 2-user demo.
- HTML over Markdown/JSON storage: simplest faithful TipTap round-trip.
- better-sqlite3 over an ORM: single file, zero config, synchronous and fast.
- Node test runner over Vitest/Jest: zero new deps, runs with `npm test`.
