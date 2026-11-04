# MockMateAI repository

The active project is **Reelkar** in `story-film/`: an AI creator studio for Indian and Gulf creators.
- Web app and API: Next.js.
- Worker that makes reels: BullMQ.
- Database: Postgres with Drizzle.
- Mobile app: Expo, in `story-film/mobile/`.

- **Run it on this computer:** use the `run-local` skill (`.claude/skills/run-local/SKILL.md`).
- **Plan and decisions:** `story-film/docs/PLAN.md`.
- **AI connector (MCP):** `story-film/docs/CONNECTORS.md`.
- **Design system:** `story-film/design/` (v3.0 "Masala Pop" is current).
- **Checks before committing**, in `story-film/`:
  - `npm run typecheck && npm test`
  - In `mobile/`: `npx tsc --noEmit && npx expo lint`
- **Database changes:** edit `src/lib/db/app-schema.ts`, then `npm run db:generate`. Never edit migrations that are already committed.
- `src/lib/edit/moments.ts` and `mobile/src/lib/moments.ts` must stay identical; a test checks this.
- Never commit `.env` files or keys.
