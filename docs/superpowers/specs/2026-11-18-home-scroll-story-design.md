# Home page scroll story

**Status:** built on `claude/home-story`, agreed step by step with previews (18 Nov 2026).

## Intent

Bring the scroll-driven animation flow of a reference page (hero that drifts away, sticky counter that
ticks as you scroll, a line that fills, items that slide and blur in, alternating sides on wide
screens) to the Section E home page. Only the motion changes: the site's colours, copy and sections
stay as they are.

## Decisions (the owner's)

- **Where:** the feature tiles become the scroll story (option B). Coming up stays a card; the other
  sections keep their places.
- **Counter:** "01 / 07" plus the tool's name. Labels change with a smooth blur and fade, one at a
  time, never overlapping.
- **Cards:** slide in, fade in and come into focus; once passed they drift up, soften and fade.
- **Card size:** each card fits its text, with bigger type (titles ~30% larger, body ~20px).
- **Scroll length:** each tool takes its card's height plus a short gap (not a fixed slot).
- **Devices:** the same motion on Android and iOS phones and tablets, in browsers and the installed
  web app.
- **Access:** unchanged. The story shows the same descriptions everyone saw before; each page keeps
  its own sign-in.

## Approaches considered

- **A. Coming up as the timeline** (dial counts days to exams): strongest fit for a date dial, but
  makes that card a tall section and only shows exams to visitors. Not chosen.
- **B. Tools as the story** (chosen): dial counts tools; reads as a tour of what the site does.
- **C. Only the hero drift and soft reveals:** smallest, but loses the counter and line.

## How it works

- Every moving part reads a few registered custom properties: `--exit` (hero), `--fill` (line and
  counter bar), `--reveal` / `--past` (each card), `--on` / `--side` (each counter label).
- **New browsers** (Chrome/Edge 115+, Samsung Internet, Safari/iOS 26+, Firefox 159+) drive them with
  scroll-driven CSS animations in `page.module.css`. Each card gets a named view timeline; its counter
  label animates on that timeline with `view-timeline-inset: 55% 45%`, so a label is on while its
  card crosses a line 55% down the screen.
- **Older browsers** (iOS before 26 and older Android browsers) get the same numbers from
  `src/app/ScrollStory.tsx`, which listens to scroll and adds `.storyOn`. Checked against the CSS
  version at 60+ scroll positions: within 0.3%.
- **Neither:** the cards sit in a plain, fully visible list.
- **Reduced motion:** fades only (`--motion: 0`, `--blur: 0`).
- The sticky counter sits under the 53px header plus the safe-area inset (installed web app).

## Non-goals

- No colour or copy changes; no change to who can see what.
- No right-click blocking or other copy-protection tricks.
