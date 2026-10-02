# Submission — DocSpace

- Project name: DocSpace
- Live URL: https://<pending-deploy>/
- Repository/source location: ./ (ajaia-docs — client/ + server/)
- Test command: `cd server && npm test` (sharing + roles/comments/versions + upload suites)
- Test accounts:
  - Elvin Ramos — elvin@example.com
  - Sarah Smith — sarah@example.com
  - Alex Chen — alex@example.com
  (Mock login: pick an account on the login screen, no password.)
- Supported file types: .txt, .md, .docx (1 MB max)
- Main implemented features:
  - Mock login persisted in localStorage + switch user
  - Dashboard: My Documents + Shared With Me (badged Owner/Viewer/Editor), empty states
  - + New Document with default "Untitled Document" title
  - TipTap rich-text editing (bold, italic, underline, headings, paragraphs, bullet/numbered lists)
  - HTML persistence across refresh; debounced autosave + Save button + save state
  - Editable title (owner only); owner delete
  - Role-based sharing: Viewer vs Editor grant, role change, unshare; server-enforced access control
  - Viewer read-only editor (toolbar hidden); editor content-only; owner full control
  - Comments with selection quotes, resolve/reopen, author-or-owner delete
  - Version history with preview + one-click restore (non-destructive)
  - Export: Markdown / HTML download, Print-to-PDF stylesheet
  - .txt/.md/.docx import creating a filename-titled document
  - Friendly error handling; three automated test suites
  - Confirmation dialogs + success toasts for destructive and key actions
- Known limitations:
  - No real-time collaboration (last write wins)
  - Single-level comments (no threaded replies, @mentions, notifications)
  - Version snapshots throttled (~2 min, last 30) — not per-keystroke
  - Export is client-side Markdown/HTML + print; no server `.pdf`/`.docx`
  - Markdown import covers a common subset only; .docx import drops tables/images/footnotes
  - Mock auth — anyone can act as either seeded user
  - SQLite file lives on the API host (ephemeral on some free tiers — see README)
  - Client bundle ~730KB (TipTap, no code-splitting yet)
- What I would build next with another 2–4 hours:
  1. Threaded comment replies + @mentions/notifications.
  2. Production deployment (API + static frontend) with persistent disk and
     `VITE_API_URL` wiring, then verify the live share/import flows.
  3. Client code-splitting for the editor bundle + document search.
- Walkthrough video URL: https://<pending-video>/
