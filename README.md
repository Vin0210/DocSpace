# DocSpace — lightweight collaborative document editor (assessment MVP)

DocSpace is a small Google-Docs-inspired app: create rich-text documents, autosave them,
import `.txt`/`.md` files, and share documents with one other user.

**Authentication is intentionally mocked for this assessment.** There is no password
system. The login screen lists three seeded users; picking one stores that user in
`localStorage` and sends their id to the API (`x-user-id` header + `userId` param).
See "Seeded accounts" below.

## Features

- Mock login as a seeded user (persisted in `localStorage`), switch user from header
- Dashboard with **My Documents** and **Shared With Me** sections, empty states
- `+ New Document` creates an "Untitled Document" and opens the editor
- Rich-text editing with TipTap: bold, italic, underline, headings, paragraphs, bullet + numbered lists
- HTML persistence: Editor → API → SQLite → API → Editor (formatting survives refresh)
- Debounced autosave (~900ms) + explicit Save button + visible save state (Saving… / Saved / Unsaved changes / Save failed)
- Editable document title (owner only)
- Role-based sharing modal: owner grants Viewer or Editor, changes roles, removes collaborators
- Access control: viewers read + comment only (editor is read-only, toolbar hidden); editors edit content; only owner can rename, delete, share, or manage roles
- Comment threads with text-quote anchors, resolve/reopen, author-or-owner delete
- Version history: automatic snapshots while editing, preview list, one-click restore (current state kept as a version)
- Export: download Markdown (.md) or HTML (.html), Print / Save as PDF (print stylesheet)
- Import `.txt` / `.md` / `.docx` files → new document titled from filename, opened in editor
- Friendly error messages, no stack traces or raw DB errors exposed
- Confirmation dialogs for destructive actions (delete document, remove collaborator,
  delete comment, restore version) plus success toasts for create/share/comment/version/export actions

## Tech stack

- Frontend: React + Vite, React Router, Axios, TipTap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`)
- Backend: Node.js + Express, Multer (memory storage), better-sqlite3
- Tests: Node built-in test runner (`node --test`), no extra test deps

## Local setup

Requirements: Node.js 20+.

```bash
# 1. Backend
cd server
npm install
npm start        # API on http://localhost:4000

# 2. Frontend (new terminal)
cd client
npm install
npm run dev      # app on http://localhost:5173 (proxies /api to :4000)
```

Open http://localhost:5173, pick a user, and create a document.

## Environment variables

| Variable      | Default                | Purpose                              |
|---------------|------------------------|--------------------------------------|
| `PORT`        | `4000`                 | Backend listen port                  |
| `DB_PATH`     | `server/docspace.db`   | SQLite file location                 |
| `VITE_API_URL`| `/api` (dev via proxy) | Frontend API base URL (production)   |

For production, set `VITE_API_URL=https://<your-api>/api` when building the client,
and serve the Express API separately.

## Database setup

No manual setup needed. On first start the server creates `server/docspace.db`
(or `$DB_PATH`) with tables `users`, `documents`, `document_shares` (foreign keys,
unique share constraint, indexes) and seeds the three users below.
Delete the `.db` file to reset.

## How to run frontend

```bash
cd client
npm install
npm run dev      # dev server :5173
npm run build    # production build -> client/dist
```

## How to run backend

```bash
cd server
npm install
npm start        # node server.js, port 4000
```

## Test instructions

```bash
cd server
npm test         # node --test tests/sharing.test.js (in-memory SQLite)
```

The test covers the core sharing flow: owner creates a document, shares it,
duplicate share is rejected (409), shared user lists/opens it, non-owner delete
is forbidden (403), shared user can edit content but cannot rename.

```bash
cd server
npm test         # node --test tests/ (sharing + roles/comments/versions)
```

`tests/roles.test.js` covers the access-control matrix: invalid role 400,
viewer edit 403, viewer comment allowed, non-owner role change 403,
editor edit 200 / rename 403, version list + editor restore 200,
viewer restore 403, unshare removes all access.

`tests/upload.test.js` builds a real minimal `.docx` in-memory (hand-rolled ZIP,
no extra deps) and asserts Mammoth converts its heading + paragraph into the new
document; corrupt `.docx` and `.pdf` uploads return clean 400s.

## Seeded accounts

- Elvin Ramos — elvin@example.com
- Sarah Smith — sarah@example.com
- Alex Chen — alex@example.com

## Supported file types

- `.txt` — plain paragraphs preserved (double newlines → paragraphs, single → line breaks)
- `.md` — simple conversion to HTML: `#`–`###` headings, `**bold**`, `*italic*`,
  `` `code` ``, `-`/`*` bullet lists, `1.` numbered lists. Anything else is kept as
  readable paragraphs; raw Markdown is not preserved verbatim.
- `.docx` — converted with Mammoth: headings, bold/italic, lists, and paragraphs
  carry over as editable HTML. Complex Word features (tables, images, footnotes,
  tracked changes, embedded objects) are dropped — text content is preserved.

Limits: 1 MB max, empty files rejected, other extensions rejected with a clear message.

## Sharing behavior

- Roles: **Owner** (full control) · **Editor** (edit content, comment, restore versions)
  · **Viewer** (read + comment only — the editor is read-only and the toolbar is hidden).
- Only the **owner** can rename, delete, share, change roles, or remove collaborators (403 otherwise).
- A document cannot be shared with its owner (400) or a nonexistent user (404);
  duplicate shares return 409; invalid roles return 400.
- The owner sees "Who has access" in the Share modal with role dropdowns and Remove buttons;
  recipients see docs under "Shared With Me" badged Viewer/Editor.
- Comments: anyone with access can comment (viewers included); only the comment
  author or the owner can resolve/reopen or delete a comment.
- Versions: anyone with access can view history; only owners and editors can restore
  (restore preserves the current state as a new version first).

## Deployment

- Live app: `https://docspace-amw5.onrender.com/` (single service serves UI + API)
- API: same origin, under `/api` (e.g. `https://docspace-amw5.onrender.com/api/health`)

### Deploy on Render (free, single service)

The backend serves `client/dist` when it exists (see `server/app.js`),
so one Node service covers the whole product — no separate static host needed.

1. Push this folder to a GitHub repo (include `client/` + `server/`).
2. Render → New → Web Service → select the repo.
   - Build command: `cd client && npm install && npm run build && cd ../server && npm install`
   - Start command: `node server.js` (Root Directory: `server`, or run from repo root
     with `node server/server.js` and `DB_PATH` set accordingly)
   - Environment: `DB_PATH=/var/data/docspace.db`
3. Add a persistent disk mounted at `/var/data` (1 GB, free tier allows this)
   so SQLite survives redeploys. Without a disk, documents reset on each deploy.
4. Open the service URL, pick a seeded user, and verify create → share → import.

> SQLite note: the DB file lives on the API server's filesystem. On ephemeral
> hosts (e.g. free-tier Render/Heroku) uploads/documents reset on redeploy unless
> a persistent disk is attached. For a durable free deployment, attach a disk for
> `DB_PATH` or swap better-sqlite3 for a hosted DB (e.g. Turso/Postgres) — the
> SQL here is portable enough to migrate.

## Known limitations

- No real-time collaboration (deliberately out of scope); last write wins.
- No per-comment replies/threads (single-level comments with quotes); no @mentions or notifications.
- Version snapshots throttle rapid autosaves from the same editor (~2 min, last 30 kept),
  but a different collaborator's save is always recorded — not per-keystroke.
- Export is Markdown/HTML download + browser print-to-PDF; no server-side `.pdf`/`.docx` generation.
- Markdown import is a simple subset (see above); `.docx` import drops tables/images/footnotes.
- Mock auth: anyone can pick either account; do not use for real data.
- Frontend bundle is large (~730KB) due to TipTap; code-splitting not yet applied.
