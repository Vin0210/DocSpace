# AI Workflow — DocSpace

I led the DocSpace build from end to end, including the scope, data model, access rules, versioning approach, deployment, testing, and final verification.

I used **ChatGPT, Cursor, and Claude** as development assistants throughout the project. I used them mainly for brainstorming, boilerplate, debugging, explaining unfamiliar issues, and reviewing possible approaches. I still made the final decisions, tested the implementation myself, and changed or rejected AI-generated suggestions when they didn't fit the requirements.

The rejected ideas and fixes below are examples of where I didn't simply accept AI output without checking it.

## AI tools used

* **ChatGPT** — planning, debugging, technical explanations, and reviewing implementation approaches.
* **Cursor** — coding assistance, refactoring, boilerplate, and working through changes directly in the codebase.
* **Claude** — alternative implementation ideas, debugging, and reviewing parts of the architecture and documentation.

## What I decided and designed

* **Scope:** I focused on the complete document lifecycle: create, edit, import, share, comment, version history, and export. I intentionally left out real-time collaboration, CRDTs, WebSockets, threaded replies, and server-side PDF generation because they would add too much complexity for a 4–6 hour assessment.
* **Access rules:** Viewers can read and comment, editors can edit and restore versions, and only owners can rename, delete, share, or manage roles. I made sure these permissions were enforced on the server instead of relying only on disabled UI controls.
* **Storage:** I chose HTML as the persisted document format because it works well with TipTap and keeps the editor content easy to restore. I used SQLite with `better-sqlite3` to keep the application simple and zero-config.
* **Versioning:** I started with a simple snapshot approach but changed it after testing showed that saving every autosave request would create unnecessary versions. I ended up using an initial version plus throttled editor snapshots, with a handoff snapshot when another collaborator saves.
* **Export:** I kept Markdown and HTML export on the client side and used a print stylesheet rather than adding a server-side PDF generation system.
* **Deployment:** I deployed the application as a single Express service with a persistent disk for the SQLite database, pinned Node 20, and upgraded `better-sqlite3` after investigating a native-module crash on Render.

## Where AI helped

AI tools helped me move faster, especially with the repetitive parts of the implementation.

I used them for things like:

* Initial Express routes and SQLite schema.
* TipTap editor setup and frontend components.
* Axios/mock authentication handling.
* First drafts of the Markdown/HTML converters.
* `.docx` import using Mammoth.
* Initial comments and version-history route structures.
* README, architecture, and submission documentation.

I treated these as starting points rather than final solutions. I reviewed the code, ran it, tested the edge cases, and changed the implementation when something didn't behave as expected.

## Things I caught, changed, or rejected

A few issues were particularly useful because they required more than simply accepting the first implementation.

* **File upload validation:** An initial Multer `fileFilter` approach rejected unsupported extensions too early and resulted in a confusing error path. I changed this to validate the file after parsing so the API could return a clear `400 Unsupported file type` response.

* **Sharing bug:** An `actorId()` helper was reading `body.userId`, but the same field was also being used as the target user when sharing a document. This caused valid sharing requests to fail with `403`. I changed the actor identification to use the request header and handled the actor explicitly in each relevant route.

* **Editor save issue:** Editors initially couldn't save correctly because the autosave request included the document title, and the API interpreted the presence of a title as a rename operation. I changed the client to send content-only autosave requests and also made the backend tolerate unchanged titles. I added a regression test for this.

* **Version ownership:** The first version-throttling approach could hide a collaborator's edit if it happened within the same throttle window. I added handoff snapshots so that when a different user saves, their change is still represented in the version history.

* **Snapshot-every-PUT:** I rejected the simpler approach of creating a version for every autosave because it would create unnecessary database writes and a noisy history.

* **Server-side PDF:** I decided against generating PDFs on the server because it would introduce additional dependencies and font/environment issues without adding much value for this assessment.

* **Testing libraries:** I considered Vitest and Supertest but decided to use Node's built-in test runner instead. It covered the required behavior without adding more dependencies.

* **Production debugging:** During deployment, I encountered an old process still serving previous code and a `better-sqlite3` native-module crash on Render. I investigated the route responses and stack trace, restarted the stale process, and upgraded `better-sqlite3` from v11 to v12 to resolve the native compatibility issue.

## How I verified the application

I didn't rely only on the happy path. I tested the important permission and error cases as well.

* `cd server && npm test` — all three test suites pass.
* Tested sharing and role permissions.
* Tested viewer edit attempts returning `403`.
* Tested viewer comments returning `201`.
* Tested non-owner role changes returning `403`.
* Tested editor rename restrictions.
* Tested viewer restore restrictions.
* Tested access after unsharing.
* Tested invalid, empty, oversized, and unsupported file uploads.
* Tested `.docx` imports, including corrupt files.
* Tested the live deployment and database persistence after redeployment.
* `cd client && npm run build` succeeds.

I also manually tested the main flow from creating a document through sharing it, opening it as another user, editing it, uploading a document, and checking the resulting version history.

## UX verification

I also spent time checking the actual interface instead of only testing the API.

I reviewed:

* Empty states, including the case where everyone already has access.
* Save-state feedback.
* Read-only viewer mode.
* Mobile layouts and breakpoints.
* Error messages and validation states.
* Confirmation flows for destructive actions.

I replaced the default `window.confirm()` dialogs with styled confirmation dialogs and added success toasts so important actions give the user clear feedback.

Overall, AI helped me move faster, but I treated it as a development tool rather than the decision-maker. I still had to understand the code, verify the behavior, debug the failures, and decide which suggestions actually made sense for the product and the assessment.
