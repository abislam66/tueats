# Handoff

- 2026-11-09 redesign (branch `redesign`, 4 commits, not pushed): Bricolage Grotesque + Figtree type, retro glow/pixel chrome removed, colors unchanged.
- Pins show open / closing-soon / closed / unknown (`getPinStatus` in src/lib/hours.ts); map legend shows those states plus the live campus time.
- List is grouped and sorted by closing time (src/lib/venue-groups.ts); desktop ≥1024 is a persistent list pane + map, phone keeps the bottom sheet; header is 56px.
- /eat/[slug] is public now (status card first); sign-in is only needed to rate, review or upload, still enforced by `requireMember`.
- Left to do: visual QA with a real DB (no .env.local here, so no screenshots); decide whether rows should select on the map or keep linking to the page; tests/e2e/home.spec.ts was already out of date.
