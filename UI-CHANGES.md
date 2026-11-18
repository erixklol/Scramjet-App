# Gurt's Browser customization

Modified November 2026: homepage branding and styling in public/index.html and public/index.css. Original Mercury Workshop copyright notices, LICENSE, credits.html, proxy scripts and server configuration are retained.

The homepage prominently links the original project, Mercury Workshop, this public modified-source repository, and the existing license/credits page. When deploying this modification, keep https://github.com/erixklol/Scramjet-App publicly accessible and ensure it contains the corresponding source for the version actually deployed, including build/install files. This modification remains under the repository's GNU AGPL license.

Validation:

- npm run lint: passed.
- node --test test/homepage.test.mjs: 3 passed (required IDs/dependency paths/attribution, search-query submission, URL submission; mocked worker/controller/transport boundaries).
- Browser inspection: 1366px desktop and 390px mobile; mobile document width matches viewport.
- Real Enter submission created sj-frame with the expected encoded Wikipedia destination. The local proxy subsequently reported an upstream SSL connection error (libcurl error 35); end-to-end remote browsing is not certified.
- No build or TypeScript script exists in this JavaScript repository.
- Existing dependencies installed without changing package.json or pnpm-lock.yaml. npm reported 3 dependency advisories; no dependency upgrade is included.

No service-worker, Wisp, WebSocket, transport, search engine or navigation JavaScript changes. No automatic merge or deployment.
