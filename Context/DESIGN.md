# Design System — TuEats

## Product Context

- **What this is:** An unofficial guide to off-meal-plan food around Temple University's main campus — map + list, starting with food trucks.
- **Who it's for:** Students (and campus community) deciding where to eat — primarily on a phone between classes, also on laptop/desktop when browsing from a dorm, library, or showing the project.
- **Space/industry:** Campus food discovery / local map utilities (peers: Google Maps place search, Yelp map+list, campus dining maps).
- **Project type:** Responsive web utility — **mobile-first in priority and constraints**, **desktop as a first-class surface** (portfolio-quality, not a stretched phone layout).
- **Responsive posture:** Design and ship for the sidewalk phone first (≤2 taps, Lighthouse mobile ≥90). Desktop must still feel intentional: split composition, hover/keyboard affordances, readable type, and a map that earns the large viewport. Reviewers and hiring managers will open this on a laptop — that experience is part of the product.

## Aesthetic Direction

- **Direction:** Cherry Compass — athletic-campus utility
- **Decoration level:** Intentional (restrained) — crisp SVG pins, muted basemap, no glow stacks or decorative blobs
- **Mood:** “I can decide in 10 seconds.” Confident, local, unofficial — not a sports storefront, not a food blog, not a scraped directory.
- **Reference patterns:** Google Maps–style non-modal bottom sheet (safe); cuisine-label cherry pills on a muted Positron map (deliberate risk)

## Typography

- **Display / Hero / Wordmark / Venue titles:** Cabinet Grotesk (Fontshare) — modern geometric, athletic without Inter
- **Body / UI / Filters:** Satoshi (Fontshare) — clean, slightly rounded; works on phone and desktop
- **Data / Hours / Walking mins:** JetBrains Mono (tabular nums) — status reads like a readout, not marketing
- **Code:** JetBrains Mono
- **Loading:** Self-host woff2 via `next/font` or Fontshare download; latin subset only. Never load Inter / Roboto / system UI / Montserrat / Poppins as primary.
- **Scale (size / line-height):**

| Token | Mobile | Desktop (≥1024) |
|-------|--------|-----------------|
| Display | 32 / 40 | 40 / 48 |
| Title | 22 / 28 | 24 / 32 |
| Body | 16 / 24 | 16 / 24 |
| Small | 13 / 18 | 14 / 20 |
| Micro | 11 / 14 | 12 / 16 |

## Color

- **Approach:** Restrained — cherry is rare and meaningful (brand, selected pin, primary CTA). Status greens/ambers are semantic, never conflated with brand cherry.
- **Temple-adjacent, not official brand:** Cherry from public Owls / PMS 201 references. No Temple wordmark, “T” logo, or owl marks. Site always carries the unaffiliated disclaimer.

```css
:root {
  --color-cherry:        #9D2235; /* brand, selected pin, primary CTA */
  --color-cherry-hover:  #B52A3F;
  --color-cherry-deep:   #6E1826;
  --color-cherry-soft:   #F8ECEF; /* selected chip / ghost fill */

  --color-canvas:        #F5F5F4; /* cool stone — NOT cream #F4F1EA */
  --color-surface:       #FFFFFF;
  --color-surface-raised:#FAFAF9;
  --color-ink:           #1C1917;
  --color-ink-secondary: #57534E;
  --color-ink-muted:     #A8A29E;
  --color-border:        #E7E5E4;

  /* Status — soft; hours are hedged */
  --color-open:          #3F6F5A;
  --color-open-soft:     #E8F2EC;
  --color-closed:        #78716C;
  --color-closed-soft:   #F5F5F4;
  --color-unknown:       #A8A29E;
  --color-warning:       #B45309; /* semester-away, stale verify */
  --color-danger:        #B91C1C; /* form errors only */

  --color-map-land:      #EEEEEA;
  --color-map-water:     #D9E2E8;
}
```

- **Dark mode:** Not in Phase 1. If added later, redesign surfaces (ink canvas + cream type) — do not merely invert.

## Spacing

- **Base unit:** 8px
- **Density:** Comfortable on public surfaces; compact on admin
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout

- **Approach:** Hybrid — full-bleed map on home; strict grid on detail/admin. **Two composed layouts**, not one layout that “kind of works” everywhere.
- **Breakpoints:**
  - **Mobile (&lt;768):** Map + bottom sheet (primary product path)
  - **Tablet (768–1023):** Prefer sheet or a narrower split; don’t leave awkward half-states — pick the composition that keeps map + list simultaneously useful
  - **Desktop (≥1024):** Persistent **split explorer** — list/filters left (~38–42%), map right (~58–62%). No bottom sheet.
  - **Wide (≥1280):** Same split; optional max width on the list column (~420–480px) so rows stay scannable while the map keeps growing
- **Max content width:** Detail/about prose ~40rem (centered or left-aligned in a calm column); home explorer is **viewport-bound** on all sizes
- **Border radius:** sm 4px · md 8px · lg 12px · sheet top 16px · full 9999px (chips sparingly — prefer md on filter chips)

### Home (`/`) — mobile

Map is the first viewport. Wordmark top-left (“Tu” ink, “Eats” cherry). Compact search/filter strip. Non-modal bottom sheet with **three** browse snaps: collapsed (handle only — full map), peek (~33% — map + search/filters), and full (~87.5% — the list). Selecting a venue on the phone **swaps** that drawer for a venue preview sheet (same facts as the desktop mini-card, plus a View details button to `/eat/[slug]`). No floating map popup on phone. Dismissing it restores the search/list (or map-only) snap you were on. No half-and-half mid stop. Tapping a zone keeps the current browse snap. No marketing hero. No second map HUD bar. Zoom +/- stay off the phone control row.

### Home (`/`) — desktop (portfolio surface)

- **Split composition from first paint:** list + filters + search on the left; MapLibre on the right filling remaining height (under a slim top bar with wordmark + about/account). On desktop (≥1024) the map HUD bar is the same 4.75rem marquee as the list header (3px cherry edge) so the two top bars read as one band. On mobile the HUD is omitted — zone names live on the map plates; after a zone is selected a thin name-only label floats on the map. Phone also hides +/- zoom (pinch is enough); reset-view and locate stay.
- **Shared state:** Same URL searchParams and payload as mobile — filter/search/selection stay in sync across panes. Hovering or focusing a list row highlights the matching cuisine pill on the map; selecting a pin scrolls/focuses the list row.
- **Rows select, never navigate:** Clicking a list row (desktop pane or mobile sheet) selects the venue on the map. Desktop: fly-to plus anchored mini-card. Phone: the results sheet swaps to a venue preview (name, tags, status, price, View details). The mini-card / preview CTA is the only path from the explorer to `/eat/[slug]`. The map is the primary surface — list rows feed it.
- **Staged arrival:** The mini-card never pops while the camera is still traveling. Selection sequences like a user would move: fly into the host zone (or ease a zone-less venue to street zoom ~16), and only on arrival does the popup appear over the pill. No movement needed → instant pop.
- **List density:** Comfortable rows with name, cuisine tags, zone, open-status badge, payment icons, and a compact student-rating readout when one exists — designed for mouse scan, not thumb-only.
- **Map:** Larger campus view earns the desktop width; cuisine pills remain legible; controls sit bottom-right of the map pane, stacked above the attribution line (not floating over the list).
- **No mobile chrome on desktop:** No grab-handle sheet, no collapsed/peek/full detents, no “tap to expand list.” If it looks like a phone UI scaled up, it’s wrong.
- **Empty / filtered states:** Friendly empty copy in the list pane; map still shows campus (pins filtered). Never a blank white half-screen.

### Venue detail (`/eat/[slug]`)

- **Content order (all breakpoints):** name → hedged open-status (mono) → cuisine / zone / payment → photos (only when a venue has them) → student rating + reviews → description → hours → last-verified → report. Student rating is primary; Google snapshots (not in this slice) stay secondary and never merged.
- **Photos:** horizontal snap-scroll strip of 4:3 frames (`radius-lg`, border, `surface-raised` letterbox), no heading, no lightbox. Venues without photos get **nothing** — no placeholder frame (cards only when they contain content). Source is published `venue_photos` only (DB + Vercel Blob). Member submissions stay out of this strip until an admin approves them. An “Add a photo” control can sit under the strip; it is not a second gallery.
- **Mobile:** Single column, back returns to explorer with preserved filters/map position.
- **Desktop:** Typography-led reading column (~40rem) with generous vertical rhythm; optional sticky mini context (open status + primary cuisine) as the user scrolls. Not a cramped phone article stretched to 1200px. Back / “View on map” restores the split explorer state.

### About / account / admin

- **About:** Readable prose column on desktop; quiet disclaimer and credits.
- **Account (`/account`):** Same prose column as About. Signed-in only. Header: name, `@username`, “Class of {year}”. Then a compact profile form (name, username, class year) in a bordered `surface-raised` card matching the review composer, then the member's full rating/review list (venue name → stars → relative date → text → edit/delete). Class year is a decade-grid picker (trigger styled like `.input`, 5-column year chips, selected = cherry fill, data typeface) — never a native 50-row `<select>`. **Sign out** is a full-width white secondary button at the very bottom of this page — never in the site header. No avatar. No public `/u/[username]` route.
- **Site header nav:** Dark marquee. Wordmark left; **About** + circular person-in-circle **profile icon** (`/account`, always shown — signed-out hits the sign-in gate). Profile icon is ~44px, cream stroke, cherry ring when current or hovered. No Sign out, no display-name link.
- **Admin:** Same tokens, denser spacing, table-first — desktop-primary tooling is fine here.

### Desktop interaction bar

- Hover styles on list rows, chips, pins, and buttons (subtle — no glow stacks).
- Visible focus rings (cherry) for keyboard users.
- Pin/list selection works with click and keyboard; map remains pannable/zoomable with mouse and trackpad.

## Motion

- **Approach:** Intentional, performance-budgeted (Lighthouse mobile ≥90; MapLibre is already heavy). Desktop can afford slightly richer hover/selection feedback; don’t add weight to the mobile critical path.
- **Libraries:**
  - **Framer Motion** — sheet snap (mobile), list filter crossfade, selected pin spring, list↔pin highlight, detail page enter, chip press. Client chunks for explorer + detail only.
  - **GSAP** — one-shot pin stagger after `map.on('load')` (≤40 pins, 20–30ms stagger, `power2.out`, total &lt;800ms). Dynamic import only; never on critical path.
  - **CSS** — badges, hover, focus rings, reduced-motion fallbacks
- **Easing:** enter ease-out · exit ease-in · move ease-in-out
- **Duration:** micro 100ms · short 200ms · medium 350ms · long ≤700ms
- **Rules:** Honor `prefers-reduced-motion: reduce` (instant state, no stagger). No scroll-jacking. No perpetual GSAP timelines on home. Desktop hover transitions stay in the micro/short range.

## Map

| Decision | Choice |
|----------|--------|
| Basemap | OpenFreeMap **Positron** — `https://tiles.openfreemap.org/styles/positron` |
| Config | `NEXT_PUBLIC_MAP_STYLE_URL` (swappable) |
| Viewport | Campus bbox only (~lat 39.971–39.984, lng −75.161–−75.150) — includes west-of-Broad athletics and the Girard sports complex; never Philly-wide |
| Chrome | Custom zoom + locate; Satoshi labels; cherry focus ring; quiet OSM/OpenFreeMap attribution |
| Desktop map pane | Fills the right split full height; controls inset in the map pane; list hover ↔ pin highlight |
| Locate me | Client-only blue-dot; never sent to server |
| Zones | Campus overview uses two marks together: `streetLine` corridors (Student Center, W Montgomery, SERC trucks, Tyler trucks) and `buildingFill` washes (Vantage & The View buildings; The Wall plaza immediately west of Anderson Hall, not Anderson itself; Richie's Cafe footprint only, not Facilities; Liacouras Walk 1926–1938 building only, not 1940 Residence Hall). Zone names sit on a light cherry plate (`#F3E6E9`) with a thin cherry outline. Click a zone to zoom in and show pins. List-filter `zone_key` is a separate model. |
| Campus buildings | Curated GeoJSON overlay — per-building 2D fill/stroke/label; mute stock Positron footprints ([docs/design/campus-buildings.md](docs/design/campus-buildings.md)) |
| Optional later | Faint dashed campus outline; Maputnik fork to strip base POI clutter / align land+water to tokens |

See [docs/design/map-and-pins.md](docs/design/map-and-pins.md) and [public/pins/](public/pins/).

## Pins

- **Job:** Answer “what's here?” at a glance so a hungry student can scan the corridor.
- **Shape:** Cherry **name plate** matching zone-label chrome — square corners, hard ink outline, flat offset shadow, leader-line-and-dot stem. The stem-dot tip is the map coordinate.
- **Info on pin:** **Venue name** baked into the sprite (overlapping plates occlude cleanly). Clustered coinciding spots share one "N spots" plate.
- **Not on pin:** Open/closed, ratings, cash — those live on list rows, mini-card, and detail.
- **Selected:** Same plate, thicker ink outline + soft cherry halo.
- **Rendering:** One canvas sprite per venue × state, registered as a MapLibre image. Symbol layer or HTML markers OK at ~40 venues.
- **Density:** Collision fade / light cluster at overview; every plate tappable at street zoom (~16+).
- **Phase 3 types:** Same plate; name still primary. Optional tiny type mark later — not required for trucks.
- **Meal-plan dining info pins:** The Student Center food court, J&H dining hall, and Morgan Hall food court are meal-plan dining — out of product scope, never venues, never in the DB. Each building gets **one** neutral info pin that just names what's there (`src/config/campus-dining.ts`). Treatment: same square plate + line-and-dot stem at **2/3 the venue-plate size**, with **white surface fill, stone `#B8B4AA` border, ink-secondary regular-weight text, whole layer dimmed to 65% opacity** — deliberately not cherry, small, and visibly faded, so it can't be mistaken for a tappable venue. Non-interactive (no hover, no click, no mini-card). Zoom-gated: hidden at the campus overview (`minzoom` 16 vs. overview zoom 14.6), appearing only once the user zooms to building scale (overlap allowed, placement ignored — like zone label plates); once a zone is selected the whole layer hides so venue plates take over. Don't add more of these casually — cherry venue plates stay the dominant map layer.

## Component inventory

Maps to `Specs/architecture-planning.md`:

- `components/map/` — `VenueMap`, `CampusBuildingLayer`, `VenuePinLayer`, `LocateControl`, `MapAttribution`
- `components/venues/` — `VenueExplorer`, `VenueList`, `VenueListRow`, `VenueMiniCard`, `VenuePreview`, `FilterBar`, `OpenStatusBadge`, `PaymentIcons`, `CuisineTags`
- `components/reviews/` — `VenueReviews`, `StarRating`
- `components/account/` — `AccountProfileForm`, `AccountReviewList`
- `components/ui/` — Button, Chip, Sheet, Input, EmptyState, Wordmark, YearPicker
- Tokens in `globals.css` + Tailwind 4 `@theme`

**Copy voice (Feature 4):** “Open · usually until {close}”, “Closed · opens {next}”, “Hours unknown” — never treat unknown as Closed; never promise a truck is open.

## Anti-patterns (do not ship)

- Temple trademarks, “T” logo, owl marks, or official brand assets
- Warm cream (#F4F1EA-ish) + high-contrast serif + terracotta (AI-default editorial)
- Purple/indigo SaaS gradients, photo-feed home, 3-column icon grids
- Inter / Roboto / system / Montserrat / Poppins as primary type
- Numbered pins or status-colored pin forests (name plates only; open status stays off the pin)
- Empty/decorative pins with no decision-useful info
- Merging or visually conflating student ratings with Google snapshots (Phase 2+)
- Marketing hero on `/` — the map *is* the first viewport
- Cards as decoration; cards only when they contain an interaction
- **Desktop as stretched mobile:** bottom sheet, grab handles, or single-column phone chrome on ≥1024 viewports
- **Desktop as map-only or list-only:** the split explorer is the product; hiding one pane by default fails the portfolio bar
- Detail pages that are a single narrow column floating in a sea of empty canvas with no typographic hierarchy

## Decisions Log

| 2026-11-09 | Open status goes ON the pin (reverses "status stays off the pin") | The product question is "what's open near campus right now, especially late?" Hiding status on the map forced a list round-trip. Four sprite states from `getPinStatus` (hours.ts): open = cherry plate/white text; closing within 60 min = white plate, 2px cherry border, cherry text; closed = canvas plate, ink-secondary text, thin border, faded; unknown = white plate, dashed border, ink-secondary text (never styled as closed). Selected keeps thicker ink outline + halo. Top-left legend: Open / Closing soon / Closed. |
| 2026-09-10 | Fluid mobile type: Display + Title tokens are `clamp()` | On ~360–400px phones (iPhone 17 Pro) the fixed 32/22px Display/Title felt oversized. `--text-display` / `--text-title` now `clamp()` from a smaller phone floor up to the current value by ~600px; the `min-width:64rem` block still hard-sets the desktop scale, so tablet + desktop are unchanged. `--text-body` (16px, iOS input-zoom), `--text-small` (13px), `--text-micro` (11px) stay fixed — already at readable minimums. Also clamped: `.wordmark`, `.detail-hero/​.about-page h1` (floor 2.25→1.9rem), `.sign-in-gate h1`, `.about-lede`; `.empty-state h2` pinned to `--text-title`; detail/about section padding trims one step under `max-width:40rem`. Y2K display hierarchy unchanged — same fonts, weights, tracking, just scaled. |
| 2026-09-04 | Phone venue preview hugs its content | A 40% viewport min-height left empty white under View details. Preview height is the card, not a snap fraction. |
| 2026-09-04 | Phone venue preview lives in the sheet, not a map popup | The pin-anchored mini-card covered the map and made the whole card a link. On phones the same facts (name, tags, status, $12) open in the bottom sheet with an explicit View details button. Desktop keeps the floating card. |
| 2026-09-04 | Zone taps keep the current sheet snap | Forcing peek on a zone tap yanked map-only back to search. Zone taps leave the browse drawer where it is. |
| 2026-09-04 | Mobile sheet: collapsed + peek + full (no mid) | Pull the drawer down past peek for a full-map view (handle only). Peek is map + search; full is the list. The 50/50 mid stop had no job and stays gone. Tap toggles peek ↔ full; map-only is a drag-down. |
| 2026-09-04 | Mobile: drop map HUD + +/- zoom; thin in-zone name label | The zone status bar stacked under the site header and squeezed the map. Zone plates already name places; a slim name-only label appears after a zone is selected. Reset-view still returns to campus. Pinch zoom replaces +/-. |
| 2026-09-04 | Desktop map HUD matches list-header height (4.75rem, 3px cherry edge) | The thinner map bar sat above the list header’s bottom edge and looked like two different chrome systems. |
| 2026-09-04 | Sign out lives only at the bottom of `/account` (full-width white button) | Header stays About + profile icon on every viewport. Signing out is an account action, not chrome. |
| 2026-09-04 | Header profile icon (always) + decade-grid class-year picker | Native 50-row year `<select>` was ugly on mobile. Decade chips match filter pills (cherry selected, data typeface, inline expand). Profile icon sits beside About so `/account` is one tap from every page; signed-out still hits the existing gate. Display name is no longer a header link. |
| 2026-09-01 | No search overlay on the map — search/filters live only in the left pane (desktop) and the mobile sheet | The floating SEARCH window duplicated FilterBar and covered pins. DESIGN already places search on the list side; the map keeps HUD, legend, and controls. |
| 2026-09-01 | Student ratings after the photo strip; pending member photos never on the public strip | TUE-12: aggregate + composer + review list belong with the venue facts, not mixed into the gallery. Member uploads wait in admin queue so the 10-photo strip stays curated. |
| 2026-07-17 | Cherry Compass design system created | Design consultation from specs + competitive research; cream+serif indie alternative rejected as AI-default |
| 2026-07-17 | OpenFreeMap Positron basemap | Muted land so cherry pins dominate; $0, keyless, swappable |
| 2026-07-17 | Cuisine-label pill pins (not status beacons) | Pin must help decide what to eat; open status lives on list/mini-card |
| 2026-07-17 | Framer Motion + deferred GSAP pin stagger | Motion personality without wrecking Lighthouse ≥90 |
| 2026-07-20 | Curated GeoJSON campus buildings (2D), not basemap fork alone | OpenMapTiles buildings have no names; per-building design needs our footprints + paint tokens |
| 2026-07-17 | Cabinet Grotesk + Satoshi + JetBrains Mono | Modern athletic utility; blacklist of overused UI fonts honored |
| 2026-07-17 | Desktop is first-class (split explorer), not stretched mobile | Portfolio / hiring-manager viewport; mobile-first priority unchanged |
| 2026-08-25 | Neutral info pins for meal-plan dining halls (SC food court, J&H, Morgan) | Meal-plan places are out of scope, not venues; one white/stone non-interactive pill per building names what's there without competing with cherry venue pills |
| 2026-08-25 | Dining info pins dimmed (65% opacity), shrunk to 2/3 pill size, zoom-gated to ≥16 | Static, unclickable pins dominated the campus overview at full pill size; they now recede into map furniture and only appear at building-scale zoom |
| 2026-08-25 | Map controls (zoom/reset/locate) moved to bottom-right, above attribution | Keeps the top edge clear for the campus/zone chip and puts controls in thumb reach on mobile |
| 2026-08-25 | Mini-card anchors above the selected pin, popup-style | The fixed corner card read as detached chrome; anchoring to the pin ties the preview to the tapped venue — the whole card remains a link to the detail page |
| 2026-08-25 | Detail photo strip (frontend-only registry, no backend) | Photos slot between the hero and description as a snap-scroll strip; venues without photos render nothing — restrained, no placeholder chrome |
| 2026-08-25 | Mini-card never shows address/zone | Location lines made cards inconsistent (present only when zone/building data existed) and wrapped to two lines; the popup is name + tags + status + View details — address lives on the detail page |
| 2026-08-25 | Venue pill names baked into opaque sprites (like zone labels) | Overlapping pills may overlap but must occlude cleanly; live text-fields paint above neighboring pills' icons, bleeding one name across another |
| 2026-08-25 | Mobile map controls: horizontal row riding above the sheet | The vertical column sank behind the bottom sheet's peek; on <64rem the row tracks the sheet's snap height (via `data-sheet` on `<html>`), desktop keeps the corner column |
| 2026-08-25 | Tucked (peek) sheet is inert — expand to interact | At peek the sheet is a preview of the list, not a surface: content can't scroll, tap, or take focus; tapping the tucked body expands to mid. Prevents accidental list scrolls/taps while the map is the subject |
| 2026-08-25 | List rows select on the map instead of navigating | Map-heavy UI: a row click flies to the venue and opens its mini-card (mobile sheet tucks to peek); detail pages open only via the mini-card's View details. The ↗ row arrow was dropped with the navigation |
| 2026-08-25 | Mini-card waits for camera arrival | Popping the card at the overview while the map was still flying read as disjointed; the sequence now mirrors manual use — zone in, land on the truck, then pop. Zone-less venues ease to street zoom (16) before popping |
| 2026-08-25 | Mini-card: arrow disc replaces "View details"; price range added | Wordless → in a cherry-soft disc (fills cherry on hover/focus) signals the card navigates; price sits beside it in data mono. Price is a hardcoded "$12" placeholder until venues carry real price data |
| 2026-08-25 | Filter menus expand inline (drawer), not as floating popovers | Cuisine/Zone options open in-flow below the chip row on a raised panel, pushing results down — one menu at a time, animated 0fr→1fr, chip shows aria-expanded state. Floating overlays over the list are out |
| 2026-08-25 | Drawer options are horizontal tap-toggle pills, not checkboxes | Options wrap as small pills; selected = solid cherry fill with white text (`aria-pressed`), unselected = white with border. Vertical checkbox lists are out |
| 2026-08-25 | Multi-zone selection shows pills for all selected zones | Zone mode is a set, not a single key: the camera fits the union of selected zone bounds, pills render for every venue in them, chip reads "N zones". Zoom-out-to-exit applies only to a single zone (a multi-zone fit legitimately sits below the overview threshold) |
