# AGENTS.md

## Cursor Cloud specific instructions

This repo is **Nylene Canada LPS**, a browser-based Label Printing System. It is a
static, no-build vanilla-JS (ES modules) frontend backed by a **live Firebase**
project (`nylene-lps`): Firebase Auth + Realtime Database. There is no bundler and
no root `package.json`.

### Services / how to run

- **Frontend (the app)**: static files served from the repo root. Paths are absolute
  (e.g. `/modules/main.js`, `/screens/...`), so the server root MUST be the repo root.
  Run any static server, e.g. `python3 -m http.server 5501` from `/workspace`
  (port `5501` matches the VS Code Live Server config in `.vscode/settings.json`),
  then open `http://localhost:5501/index.html`.
- **Backend**: Firebase config is **hardcoded to the live production project**
  `nylene-lps` in `firebase.js` and `modules/firebase-db.js` (Auth + RTDB
  `https://nylene-lps-default-rtdb.firebaseio.com`). There is **no emulator wired up**
  and no `emulators` block in `firebase.json`. Consequences:
  - The app requires internet access and a **real Firebase account** to log in.
  - A full login → print flow writes to the **live production database** (print
    records and atomic daily label sequences). Do NOT print test labels against
    production; it corrupts real manufacturing data. Use a throwaway/test account and
    avoid the print step unless you intend to write real data.
- **Cloud Functions (`functions/`)**: OPTIONAL. Powers only the "Export to Excel"
  button (`exportLabelsToExcel`). Deps are installed by the update script. Running it
  locally needs the Firebase CLI (`firebase-tools`, not installed by default):
  `cd functions && npm run serve`.

### Tests

- Run the unit suite from the repo root with the **glob form**:
  `node --test tests/*.test.mjs` (54 tests, no services/deps required).
- Gotcha: the directory form `node --test tests/` does NOT collect these tests
  correctly — always use the `tests/*.test.mjs` glob.

### Lint / build

- There is **no build step** (static files) and **no product-level linter**. The
  ESLint config under `nylene-lps/` belongs to unused scaffolding.

### Unused scaffolding (ignore)

- `dataconnect/` (default Firebase Data Connect "Movie Review" example) and
  `nylene-lps/` (empty Firebase Functions boilerplate) are not part of the product.
