# Build Prompt — Creator Content Pipeline (working name)

Build a mobile-first web app that lets solo content creators capture ideas and drag them through a customizable production pipeline (e.g. Idea → Script → Film → Edit → Publish), presented as an open, FigJam-style canvas rather than a rigid spreadsheet. Follow every specification below exactly — colors, type, motion, and interaction logic are deliberate design decisions, not placeholders.

A working interactive mockup already exists (`pipeline-app-mockup.html`) covering the Onboarding and Board screens — treat it as the canonical reference for exact visual style and interaction behavior. This prompt describes what to build in full; the mockup shows how it should look and feel.

---

## 1. What This Is

A zero-setup content pipeline tracker for creators. Capture an idea in seconds, watch it move through production stages you define yourself, and never lose track of where a piece of content actually is. It is deliberately **not** a scheduler, a file host, an analytics dashboard, or a generic project-management tool — it does one job, and does it with no configuration required to get started.

## 2. Why This Exists (context for the builder)

Researched the market before scoping this: brand-deal CRMs, AI repurposing tools, cross-platform analytics dashboards, and unified social inboxes are all already crowded, mature categories. The one structure that showed up more than any other across every search — and that currently only exists as a manual template bolted onto a generic tool (Notion, ClickUp, Trello) rather than a native standalone app — is the idea-to-publish production pipeline. That's the wedge. Simplicity itself is not a moat (we found four competing "simple" brand-deal CRMs), so the differentiation is: a genuinely native, zero-setup, creator-specific pipeline tool, designed so other modules (brand deals, performance data) can attach to the same card object later without a rebuild.

## 3. Target User

- **Primary (v1):** solo, video-first creators (YouTube, TikTok, Reels/Shorts).
- **Secondary (post-v1, same core loop):** podcasters, newsletter/blog writers.
- Not building for agencies or large teams in v1 — no roles/permissions system yet.

## 4. Design Philosophy — non-negotiable principles

1. **Frictionless capture over structured input.** Capturing an idea must take seconds. Never force metadata at the moment of capture.
2. **Opinionated defaults, not configuration.** The app decides a sensible starting structure; the user edits it, they don't build it from a blank canvas.
3. **Progressive disclosure.** A card is just a title until the user taps into it.
4. **Nudge, don't shame.** No streak counters, no "you haven't posted in X days" guilt mechanics. Stalled cards get a soft visual cue at most.
5. **Mobile-first.** Every primary interaction (capture, drag/advance, checking off a task) must work with one thumb.
6. **Open canvas, not a spreadsheet — but not a free-for-all either.** The board should feel like a corkboard you can step back from and scan, not a rigid table. But full freeform x/y card placement with no structure was explicitly considered and rejected: it would destroy the core value of "know where my content is at a glance." The resolution: stages are **regions on one continuous, pannable surface**, not disconnected boxed columns — open in feel, structured in function.

## 5. Visual Design System

### Typography
- Headings, labels, stage names, wordmark: **Space Grotesk** (weights 500/600/700)
- Body and UI text: **Inter** (weights 400/500/600)
- Load both via Google Fonts.

### Color tokens
```
--ink:          #1A1B20   /* primary text, dark UI elements */
--paper:        #F1EEE6   /* app background */
--paper-raised: #FAF8F2   /* card / surface background */
--accent:       #E0932C   /* primary interactive accent (capture button, etc.) */
--accent-ink:   #7A4E10   /* accent text on light backgrounds */
--success:      #3B7D6E   /* completed / published state */
--line:         #DDD6C6   /* borders, dividers */
--muted:        #6B6558   /* secondary text */
```

### Stage color palette (assigned by position, cycling for custom stages beyond 5)
```
1. #948C79  (neutral — Backlog / unstarted)
2. #7C6BAE  (violet)
3. #B4512E  (rust)
4. #C99A2E  (gold)
5. #3B7D6E  (teal — Publish / done)
```
Extended palette offered when a user creates a **custom** stage, in addition to the above:
```
#4A7FBF (blue), #C25B8E (pink), #5E9E4A (green)
```
Each stage color also has a low-opacity "wash" version (~12–15% alpha) used as the background tint for its zone on the canvas. Compute via `rgba(r,g,b,0.13)` from the hex.

### Canvas background
A subtle dot grid — `radial-gradient(circle, rgba(26,27,32,0.14) 1px, transparent 1.4px)` at `16px 16px` background-size — behind the whole board. This is the single visual cue that signals "canvas," borrowed deliberately from FigJam/Miro.

### Cards
- Rounded rectangle (14px radius), `--paper-raised` background, soft shadow (`0 3px 8px rgba(30,25,10,.10), 0 1px 2px rgba(30,25,10,.08)`) — like a sticky note lifted slightly off the surface.
- Alternate cards get a slight organic rotation (±0.4° to ±1.3°, alternating via position in the list) and occasional horizontal offset, so the board doesn't look machine-perfect.
- A small colored dot on the card title matches its current stage's color.
- No heavy borders, no identical drop-shadow-on-every-card SaaS-kit look.

### Zones (stages)
- Irregular, asymmetric border-radius (e.g. `32px 24px 36px 26px`) — not a perfect rounded rectangle — to feel hand-placed rather than templated.
- No hard dividers between zones; separation comes from the wash color and whitespace only.
- Zone header shows: color dot, editable name, card count, and small reorder (‹ ›) and delete (×) controls.
- An "+ Add stage" tile sits at the end of the row — dashed border, matches zone height.

## 6. Screens & Flows

### 6.1 Onboarding
One question: **"What do you make?"** — three options, each a tappable card with an icon, name, and one-line description:
- **Video** — YouTube, TikTok, Reels & Shorts → generates stages: Backlog, Script, Film, Edit, Publish
- **Podcast** — Audio & video episodes → generates stages: Backlog, Outline, Record, Edit, Publish
- **Written** — Newsletter, blog, articles → generates stages: Backlog, Draft, Edit, Design, Publish

Selecting one immediately builds the board — no further setup screens. Copy should make clear this choice isn't permanent ("You can fully customize the stages after").

Default checklist seeded per stage (attached to a card at creation time, then persists with that card regardless of later stage moves or renames):
```
Backlog: Flesh out the idea
Script:  Outline the beats / Write the hook / Draft full script
Outline: List talking points / Write intro line
Draft:   Write first pass / Note open questions
Film:    Set up gear / Record A-roll / Record B-roll
Record:  Check audio levels / Record full take / Record pickups
Edit:    Rough cut / Captions / Thumbnail
Design:  Cover image / Format for email
Publish: Write caption / Schedule post
```
For any custom stage a user creates, default the checklist to a single generic item ("Add a step").

### 6.2 Board / Canvas (main screen)
- Top bar: wordmark, a **zoom-to-fit toggle button**, avatar/account icon.
- Horizontally scrollable canvas containing one zone per stage, in order, plus the "+ Add stage" tile at the end.
- Within each zone, cards for that stage, organically arranged as described above.
- Bottom **capture bar**: a text input ("Drop an idea…") plus a mic button for voice capture. Either input method creates a new card directly in the Backlog (or the user's first stage) with no further required fields.

**Quick actions on every (collapsed) card:**
- **✎ Customize** — opens the card's expanded detail view (see 6.3).
- **→ Advance** — moves the card to the next stage in sequence, without opening anything. On tap: the card briefly fades and shrinks, then the board re-renders with the card in its new zone, that zone scrolls into view, and the card does a short "landing pulse" (scale up then settle) so the eye catches where it went. If the card just landed in the **final** stage, trigger a small celebratory burst (see 6.4). A toast appears ("Moved to [Stage]") with an **Undo** button, auto-dismissing after ~3 seconds.
- If a card is already in the final stage, show a small done-badge (✓) instead of an advance button.

**Zoom-to-fit (FigJam-style overview):** Tapping the zoom button scales the entire canvas down (compute scale = available viewport width ÷ full content width, clamped between ~0.42 and 0.85) so every stage is visible at once without horizontal scrolling — like stepping back from a physical corkboard. While zoomed out, individual cards and zone controls become non-interactive; tapping anywhere on a zone zooms back in and scrolls that zone into view. Tap the zoom button again (or tap a zone) to return to normal scale.

### 6.3 Card detail — opens **in place**, not as a separate screen or bottom sheet
This is a deliberate interaction choice: the tapped card visually grows from its exact position on the canvas into an expanded view, rather than a sheet sliding up from the screen edge or a full navigation to a new page. Implement via a FLIP-style transition:
1. Capture the card's current bounding box.
2. Render the expanded content into an overlay element positioned/sized to exactly match the card.
3. On the next animation frame, animate top/left/width/height/border-radius to the expanded target size (roughly full-width within the frame, most of the vertical space).
4. On close, reverse the animation back to the original card's bounding box before removing the overlay.
5. Dim the rest of the canvas behind it while expanded; tapping the dimmed area closes it.

**Contents of the expanded card:**
- Close control (top corner).
- Stage pill (color dot + stage name).
- Title — editable in place (tap to edit, e.g. `contenteditable`).
- Checklist — each item has a checkbox and label; tapping toggles done/not-done (done items get a strikethrough). A "+ Add step" affordance appends a new (editable) checklist item. This is what "customize" actually means functionally — not just a button that opens a static view.
- Footage & files — a single link field (paste a Drive/Dropbox URL). The app does **not** host files, only links to them.
- Tags — small chip row with a "+ tag" affordance to add more.
- Primary action button, full width: **"Move to [Next Stage] →"**, or **"Published ✓"** (disabled state) if this is already the final stage.

### 6.4 Custom stages
Stages are never hard-coded — they're just an ordered, user-owned list attached to the creator's board.
- **Add:** tapping the "+ Add stage" tile opens a small form: a text input for the stage name and a row of color swatches to choose from (the extended palette above). Confirming appends the new stage to the end of the sequence.
- **Rename:** tap directly on a zone's name to edit it in place. Renaming a stage must update every card currently assigned to it (stage identity, not just display label).
- **Reorder:** small ‹ › controls on the zone header swap it with its immediate neighbor.
- **Delete:** a small × control on the zone header. Only allowed if the stage currently has zero cards in it (show a toast — "Move cards out first" — if not) and only if it isn't the user's last remaining stage.

### 6.5 Celebration on publish
When a card advances into the final stage, spawn a small burst of ~10 colored dots (drawn from the stage palette) radiating outward from the zone's corner and fading over ~700ms. Keep this restrained — a quiet flourish, not confetti-cannon spam. This is the one deliberately delightful "orchestrated moment" in the product; don't add more without a specific reason, per the "frictionless, not decorated" design principle.

## 7. Feature Requirements — v1 / MVP

| Feature | Requirement | Priority |
|---|---|---|
| Quick capture | Text or voice input → new card in first stage, no required fields | P0 |
| Onboarding | Single question, generates a working board in under 30 seconds | P0 |
| Canvas board | Dot-grid background, organic card placement, horizontal scroll | P0 |
| Custom stages | Add / rename / reorder / delete (per rules in 6.4) | P0 |
| Quick actions | Advance (→) and Customize (✎) directly on collapsed cards | P0 |
| In-place card expansion | FLIP-animated, not a modal sheet or new screen | P0 |
| Checklist per card | Pre-filled defaults by stage, editable, add-step supported | P0 |
| Undo toast | On every stage advance, ~3s window | P0 |
| Zoom-to-fit | Whole-board overview toggle | P1 |
| Footage/file link field | URL only, no hosting | P1 |
| Tags | Freeform, lightweight, addable inline | P1 |
| Publish celebration | Small particle burst on reaching final stage | P2 |

## 8. Explicitly Out of Scope for v1

- Native scheduling or auto-publishing to platforms (owned by Buffer/Later/Planoly — not the wedge)
- File hosting or in-app video/audio editing
- Analytics dashboards (the `performance` field exists on a card for future use, but no dashboard ships in v1)
- A general-purpose custom-field/database builder (defeats the "no setup" premise — stage customization is the one configurable dimension, not a full schema builder)
- Team roles or permissions
- Streak counters, "days since last post," or any guilt-based nudge
- **Ads of any kind** — see Section 10 for the reasoning; this product is positioned against ad-supported tools, not toward them.

## 9. Data Model

```
Board
 - id
 - user_id
 - creator_type        (video | podcast | written — only determines initial template)
 - stages[]             (ordered array, user-mutable)
     - key/name
     - color
     - wash (derived)
     - order

Card
 - id
 - board_id
 - title
 - stage                (references a stage key on the same board)
 - checklist[]           [{ text, done }]
 - tags[]
 - links[]
 - created_at
 - published_at
 - performance            (nullable — manual entry now, automatic later)
 - brand_deal_ref         (nullable — reserved for a future module)
```

The **card is the durable object**. Every future feature (brand-deal linkage, performance data, repurposing status) should attach to this same card record rather than requiring a data-model rebuild — this is a deliberate architectural constraint, not an afterthought.

## 10. Monetization

Freemium, usage-gated — matching the closest comparable products (Trello, Notion, ClickUp), none of which run ads:
- **Free tier:** one active board, a capped number of cards.
- **Paid tier:** unlimited cards, additional creator-type starting templates, and (later) the brand-deal/performance modules once built.
- **No ads.** Reasoning: the target audience makes their living from ads and is unusually sensitive to bad ad experiences; this app gets short, task-oriented sessions rather than the scroll-and-dwell behavior ad revenue needs; ads directly contradict the frictionless/focus-protecting design philosophy; and no comparable product in this space monetizes that way. The one ad-adjacent revenue idea worth revisiting later: contextual sponsor/affiliate tool suggestions shown only inside a future brand-deal module, where relevance to the user's actual job is high — not for v1.

## 11. Future Roadmap (explicitly post-v1, but the data model and UI should not preclude these)

1. **Repurposing status tracking** — a parent content card with linked derivative cards (Shorts, threads, newsletter blurb), each with its own status per platform.
2. **Brand-deal object** linked to a card and to the calendar — a deliverable due date that actually blocks a calendar slot, not a standalone tracker.
3. **Performance feedback loop** — real analytics data flowing back into the `performance` field on the card that spawned it, closing the idea-to-performance loop.
4. **Proactive idea nudges** — surfacing "content like this has worked for you before" at the moment of capture, not just in a retrospective report.
5. Validated templates for podcast and written creators (currently untested assumptions).
6. Team roles/collaborator permissions, once the solo product is proven.
7. True drag-to-reposition cards between zones (current v1 uses the → quick action instead).
8. Pinch/gesture-based pan and zoom on the canvas, beyond the button-triggered zoom-to-fit.
9. Long-press multi-select for batch-moving or batch-tagging cards.
10. "Dim by pillar" filtering — tap a tag and everything else fades instead of being hidden.
11. A soft, barely-there visual cue for cards that have stalled in a stage — explicitly not a red badge or notification, per the "nudge don't shame" principle.

## 12. Competitive Positioning (for reference / marketing copy)
- **vs. Trello:** complete out of the box — pre-filled checklists, footage links, creator-specific stages — not a blank board you configure yourself.
- **vs. Notion / ClickUp:** zero setup vs. building your own database from scratch.
- **vs. Buffer / Later / Planoly:** this owns production, not distribution — it is not a scheduler and should not become one.

## 13. Recommended Tech Stack (for a fast, solo/small-team MVP)
- **Frontend:** React (or Next.js), Tailwind CSS configured with the exact design tokens in Section 5, mobile-first responsive layout, PWA-capable so it installs to a phone home screen without an app-store submission for v1.
- **Backend/data:** Supabase or Firebase for auth + Postgres/Firestore + realtime sync — minimizes backend build time for an MVP at this scope.
- **State:** client-side optimistic updates for card moves/checklist toggles (matching the instant, no-lag feel demonstrated in the mockup), synced to the backend in the background.
- Native mobile (React Native/Expo) is a reasonable v2 step once the web MVP validates the core loop, not a v1 requirement.

## 14. Reference
Treat `pipeline-app-mockup.html` as the ground truth for exact CSS values, animation timing, and interaction logic not fully spelled out above — copy its token values, transition curves, and JS interaction patterns (FLIP expand, zoom-to-fit scale calculation, advance/undo flow, stage CRUD) directly rather than re-deriving them.
