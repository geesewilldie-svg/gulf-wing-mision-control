<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Nexus interface consistency

For Nexus UI changes, follow `docs/nexus-layout-spacing.md` and reuse `app/nexus-spacing.css` tokens and `.nexus-actions`. The owner requires consistent spacing across tabs, cards, fields and controls throughout every architecture phase. Verify changed screens on desktop and phone, including expanded/populated states; keep visual canvas/star geometry separate from document-flow spacing.
