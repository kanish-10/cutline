# Product Requirements Document
## Creator Content Pipeline (working name)

---

## 1. Overview

A zero-setup content pipeline tracker for creators. Capture an idea and drag it through **Idea → Script → Film → Edit → Publish** without first having to configure a database in Notion, ClickUp, or Trello. The product is deliberately narrow at launch — one job, done well — with a data model designed to extend into a fuller creator workspace later.

## 2. Problem Statement

Creators currently manage their content pipeline one of three ways, and all three fail:
- **Generic PM tools (Notion, ClickUp, Airtable):** powerful but require building your own system before you can use it.
- **Simple tools (Trello):** easy to start, but incomplete — no native publishing, no analytics, breaks down once workflows get more complex.
- **Templates sold on top of generic tools:** proof that people want "simple," but still requires owning and learning the underlying tool.

Nobody has shipped a clean, standalone, opinionated app for this specific job.

## 3. Target User

- **Primary (v1):** solo, video-first creators (YouTube, TikTok, Reels/Shorts).
- **Secondary (post-v1):** podcasters and written/newsletter creators — same core loop, different stage labels.
- Explicitly not targeting agencies or large teams at launch.

## 4. Goals & What to Track

- Time from signup to first card created (target: under 30 seconds — no setup screens in the way).
- Share of captured ideas that reach "Published" (the core habit loop — most idea trackers fail because ideas die in the backlog).
- Weekly active usage (cards created/moved), as the primary engagement signal instead of session length.
- Free-to-paid conversion rate off the card/board cap (validates the monetization model below).

## 5. Core User Flow

1. **Onboarding:** one question — "What do you make?" (video / podcast / written) — generates a pre-built board. No blank canvas, no manual setup.
2. **Capture:** voice memo, quick text, or a pasted link lands in the Backlog column. Nothing else required at this step.
3. **Board:** drag a card through stages. Tapping a card reveals checklist, tags, and links (progressive disclosure — not shown by default).
4. **Publish:** card moves to Published; a "performance" field is available (manual entry for now) for future use.

## 6. Feature Requirements — v1 / MVP

| Feature | Description | Priority |
|---|---|---|
| Quick capture | Voice memo, text, or link → Backlog | P0 |
| Kanban board | Pre-built per creator type at onboarding | P0 |
| Stage checklists | Pre-filled, not blank (e.g. Edit = rough cut + captions + thumbnail) | P0 |
| Card detail view | Progressive disclosure on tap | P0 |
| One-question onboarding | Working board in under 30 seconds | P0 |
| Mobile-first drag/drop | One-thumb interactions | P0 |
| File/footage link field | Points to Drive/Dropbox, doesn't host | P1 |
| Pillar/topic tags | Lightweight, freeform | P1 |
| Stalled-card nudge | Gentle reminder, not a guilt streak | P2 |

## 7. Explicitly Out of Scope (v1)

- Native scheduling/publishing (owned by Buffer, Later, Planoly — not worth fighting for)
- File hosting or editing
- Analytics dashboard (field exists on the card; no dashboard yet)
- Custom field / database builder (defeats the "no setup" premise)
- Team roles/permissions
- Streak counters or "you haven't posted in X days" shaming
- Ads (see Section 10)

## 8. Data Model (lightweight, extensible)

```
Card
 - id
 - title
 - type            (video | podcast | written)
 - stage           (ordered, per template)
 - checklist[]
 - tags[]
 - links[]
 - created_at
 - published_at
 - performance      (nullable — populated manually now, automatically later)
 - brand_deal_ref   (nullable — reserved for future linking)

Board
 - user_id
 - creator_type
 - stages[]         (ordered, editable but pre-filled)
```

The card is the durable object. Every future module (brand deals, performance, repurposing status) attaches to it rather than requiring a redesign.

## 9. Design Principles

- **Frictionless capture over structured input.** Speed of capture determines whether the habit sticks.
- **Opinionated defaults, not configuration.** The product decides the starting structure; the user edits, doesn't build from scratch.
- **Progressive disclosure.** A new card is just a title until you tap in.
- **Nudge, don't shame.** Surface stalled cards gently.
- **Mobile-first.** Idea capture happens away from a desk.

## 10. Monetization

Freemium, usage-gated — matches the closest comparable products (Trello, Notion, ClickUp), none of which run ads:
- **Free:** one active board, capped number of cards.
- **Paid:** unlimited cards, additional creator-type templates, and (later) the brand-deal/performance modules.
- **Ads:** deliberately excluded — poor fit for a low-frequency, task-oriented tool, and undercuts the "protects your focus" positioning. The one exception worth revisiting later: contextual sponsor/affiliate tool suggestions inside the future brand-deal module specifically, where relevance is high.

## 11. Future Roadmap (Post-v1)

1. Repurposing status tracking — parent content with linked derivative cards (Shorts, threads, newsletter blurb), status per platform.
2. Brand-deal object linked to a card and the calendar — deliverable due dates that actually block a slot.
3. Performance data flowing back to the originating idea card (closes the idea → performance loop).
4. Proactive idea nudges — surface "content like this has worked before" at capture time.
5. Podcast/written creator templates, validated with real users.
6. Team roles, once the solo product is proven.

## 12. Competitive Positioning

- **vs. Trello:** more complete out of the box (checklists, footage links, creator-specific stages pre-built), not just a blank board.
- **vs. Notion/ClickUp:** zero setup vs. DIY database configuration.
- **vs. Buffer/Later/Planoly:** not a scheduler — this owns production, not distribution.

## 13. Open Risks

- Whether "opinionated" defaults feel restrictive to creators with unusual workflows — needs early user testing.
- Podcast/written templates are untested assumptions, not validated the way the video-creator flow is.
- Free tier limits need tuning — too generous kills conversion, too stingy kills adoption.
