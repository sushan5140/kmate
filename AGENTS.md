# This is NOT the Next.js you know

This project pins Next.js 16.2.9 — APIs, conventions, and file structure differ from older
training data. Read `node_modules/next/dist/docs/` before writing routing/proxy code if unsure.

Known breaking change already accounted for in this codebase: `middleware.ts` is renamed to
`proxy.ts`, exporting `async function proxy(request)` (not `middleware()`).
