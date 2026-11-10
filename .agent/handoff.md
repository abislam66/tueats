# Handoff

- 2026-11-09 redesign (branch `redesign`, phases 1-4 = 4 commits): Bricolage Grotesque + Figtree type, retro glow/pixel chrome removed, colors unchanged.
- Pins show open / closing-soon / closed / unknown (`getPinStatus` in src/lib/hours.ts); map legend shows those states plus the live campus time.
- List is grouped and sorted by closing time (src/lib/venue-groups.ts); desktop ≥1024 is a persistent list pane + map, phone keeps the bottom sheet; header is 56px.
- /eat/[slug] is public now (status card first); sign-in is only needed to rate, review or upload, still enforced by `requireMember`.
- Open item (still true): `/admin` was not visually checked (needs an admin session); its only shared styles are `.button`, `.back-link`, `.eyebrow`, `.status`.
- Phase 5 (steps 1-6, same branch, still not pushed): rows now select on the map; mini-card and phone preview have Get directions; long names/addresses hardened; phone-native pass (safe areas, 16px input, hover gated); motion audit; tests/e2e/home.spec.ts rewritten (5 tests, read-only, live dev data).
- To run e2e reliably on Windows use `pnpm build` then `pnpm exec next start -p 3100` (Playwright reuses it); `next dev` hung twice after many hot-reloads, and a second dev server on the same `.next` corrupts it.
- Left: look at the map/list with a real device (safe-area insets can't be emulated here); decide whether selecting from the list should keep the zone filter it currently sets; `Context/DESIGN.md` still lists some older sections (Component inventory) that predate this redesign.
