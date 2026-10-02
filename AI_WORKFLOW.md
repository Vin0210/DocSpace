# AI Workflow — DocSpace

## AI tools used

- Muse Spark (this pair-programming session) for scaffolding, debugging, and docs.

## How AI accelerated development

- Generated the Express route skeletons, SQLite schema, and TipTap wiring from a
  short brief instead of hand-writing boilerplate.
- Produced the Markdown→HTML import converter and share-permission checks in one pass.
- Drafted README/ARCHITECTURE/SUBMISSION docs from the implemented code.

## Examples of AI-generated code/ideas

- `server/routes/helpers.js`: `docJson()` enrichment, `userCanAccess()` role check.
- `server/routes/upload.js`: `upload.any()` + extension check after Multer parsing
  (chosen after the `fileFilter` variant silently dropped `.pdf` test uploads in curl).
- `client/src/pages/EditorPage.jsx`: 900ms debounced autosave with save-state machine.
- `client/src/services/api.js`: Axios interceptor attaching mock user id.

## What was modified or rejected

- **Rejected:** Multer `fileFilter` extension rejection — it caused the request to
  arrive with no file and a confusing error path, so it was replaced with
  post-parse extension validation returning a clear "Unsupported file type" 400.
- **Modified:** `actorId()` helper initially read `body.userId`, which collided
  with the share *target* id and broke the share route (403 on valid requests).
  Fixed by making the header the primary actor channel and using explicit
  per-route actor extraction.
- **Rejected:** Vitest/Supertest — would have added deps and config time; the Node
  built-in test runner covers the required behavior with zero installs.

## How AI accelerated development (round 2: Google-Docs features)

- Generated the comments/versions route skeletons, role-migration SQL, and the
  HTML→Markdown export converter from the existing code patterns.
- Drafted the ShareModal role UI and EditorPage side panels from a short brief.

## What was modified or rejected (round 2)

- **Modified:** AI's first versions draft snapshotted on every PUT — rejected for
  autosave write amplification; replaced with bootstrap-v1 + ~2 min throttle +
  30-version cap, keeping restore non-destructive.
- **Modified:** AI suggested server-side PDF generation — rejected (new deps,
  host fonts); client-side print stylesheet covers "Save as PDF" for free.
- **Kept human:** access-matrix decisions (viewers comment but never edit/
  restore; editors restore but never rename/share) and all scope cuts.
- **Round 3 (.docx):** AI suggested `mammoth` over hand-rolled OOXML parsing —
  accepted (pure JS, no native builds). AI's first upload handler was sync;
  fixed to async for the Mammoth promise. The `.docx` test fixture (minimal ZIP
  writer + CRC32, zero new deps) was human-designed so the suite stays lean.

## How correctness was verified (round 2)

- `cd server && npm test` — both suites pass (sharing + roles/comments/versions).
- Manual API matrix: invalid role 400, viewer edit 403, viewer comment 201,
  non-owner role change 403, editor rename 403, viewer restore 403, unshare → 403.
- `cd client && npm run build` succeeds; migration verified against the
  pre-existing `server/docspace.db` (role column added, old shares default editor).

## How correctness was verified (round 1, still valid)

- `cd server && node tests/sharing.test.js` — passes.
- Manual curl checks against the running API: create, list, share, duplicate-share
  409, outsider 403 read, collaborator content-edit allowed / rename 403,
  `.txt`/`.md` import → HTML, `.pdf` → 400, empty file → 400, oversized → 413.
- `cd client && vite build` succeeds; dashboard + editor flows exercised via dev proxy.

## How UX quality was verified

- Checked the restrained productivity-app styling (neutral palette, no gradients/
  heavy shadows), empty states, save-state visibility, and mobile breakpoint by
  reviewing rendered pages during dev.
- Error paths show friendly sentences (e.g. "Unable to save your changes."),
  never raw errors or stack traces.

## Where human judgment was required

- Scope cuts: no real-time collab, no DOCX, no threaded replies — per timebox rules.
  Version history was added in round 2 as throttled snapshots (not per-keystroke).
- Access model choice (round 2): viewers read+comment, editors edit content and
  restore versions, only owners rename/delete/share/manage roles.
- Markdown import subset: convert common constructs, keep the rest as paragraphs,
  and document the behavior honestly instead of claiming full fidelity.
- Deployment call: SQLite file persistence flagged with disk/hosted-DB guidance.
