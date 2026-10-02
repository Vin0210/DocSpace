# AI Workflow — DocSpace

I led this build end to end — scope, data model, access rules, versioning
policy, deployment, and every verification pass. I used Muse Spark as a
pair-programmer to move faster on boilerplate and first drafts, then reviewed,
tested, and reworked its output wherever judgment mattered. Nothing below was
accepted on faith; the rejections list is the proof.

## AI tool used

- Muse Spark (this pair-programming session) for scaffolding, debugging, and docs.

## What I decided and designed (human-led)

- **Scope:** full document lifecycle (create, edit, import, share, comment,
  history, export) instead of real-time collaboration — the strongest slice for
  a 4–6 hour box. Kept cutting there: no CRDTs/WebSockets, no threaded
  replies, no server-side PDF.
- **Access matrix:** viewers read + comment, editors edit content and restore
  versions, only owners rename/delete/share/manage roles — my call, enforced
  server-side in every route, never trusting disabled inputs alone.
- **Storage:** HTML round-trip through TipTap (simplest faithful persistence),
  SQLite via better-sqlite3, zero-config.
- **Versioning policy:** bootstrap-v1 + per-editor throttle with handoff
  snapshots and non-destructive restore — designed after rejecting the naive
  snapshot-every-PUT draft (see below).
- **Export:** client-side Markdown/HTML + print stylesheet instead of a
  server-side PDF pipeline (no new deps, no host fonts).
- **Deployment:** single-service Express + persistent disk for `DB_PATH`,
  Node 20 pin, better-sqlite3 v12 upgrade after diagnosing the Render crash
  loop from its native stack trace.

## Where AI helped (execution speed)

- Route/table/component boilerplate from a short brief (Express routes, SQLite
  schema, TipTap wiring, Axios mock-auth interceptor).
- First drafts of the Markdown→HTML and HTML→Markdown converters,
  the Mammoth `.docx` wiring, and the comments/versions route shapes.
- Doc drafts (README/ARCHITECTURE/SUBMISSION) written from the implemented
  code, which I then corrected and completed.

## What I caught, changed, or rejected

- **Rejected:** Multer `fileFilter` extension rejection — it silently dropped
  uploads and produced a confusing error path; replaced with post-parse
  validation returning a clear "Unsupported file type" 400.
- **Fixed:** an `actorId()` helper that read `body.userId` collided with the
  share *target* id and broke sharing (403 on valid requests); made the header
  the actor channel with explicit per-route extraction.
- **Fixed (my own debugging):** editors couldn't save because autosave echoed
  the title and the API treated any title field as a rename — fixed client to
  send content-only plus backend tolerance for unchanged titles, with a
  regression test.
- **Fixed:** version throttle swallowed a collaborator's edits within the
  window — added handoff snapshots so a different saver's edit always records.
- **Rejected:** snapshot-every-PUT (autosave write amplification) and
  server-side PDF generation (deps/host fonts for zero gain).
- **Rejected:** Vitest/Supertest — Node's built-in test runner covers the
  required behavior with zero installs.
- **Diagnosed in production:** stale Render process serving old code (probed
  routes, restarted it), and the better-sqlite3/Node native crash loop
  (upgraded v11 → v12 from the stack trace evidence).

## How I verified correctness

- `cd server && npm test` — all three suites pass (sharing, roles/comments/
  versions incl. handoff authorship, `.docx` import incl. corrupt-file 400).
- Full API matrices by hand: invalid role 400, viewer edit 403, viewer comment
  201, non-owner role change 403, editor rename 403, viewer restore 403,
  unshare → 403, `.pdf`/empty/oversized upload rejections.
- Live deployment verified: health, seeded users, UI serving, create → share →
  open-as-editor, upload 201, redeploy persistence.
- `cd client && npm run build` succeeds; new components lint-clean.

## How I verified UX quality

- Reviewed rendered pages during dev: restrained palette, empty states
  (including the "everyone already has access" share state), save-state
  visibility, read-only viewer mode, mobile breakpoint.
- Error paths show friendly sentences, never raw errors or stack traces.
- Replaced all `window.confirm` calls with styled confirmation dialogs and
  added success toasts so destructive and key actions acknowledge clearly.
