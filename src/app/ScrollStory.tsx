'use client';

import { useEffect } from 'react';

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3; // matches cubic-bezier(0.33, 1, 0.68, 1)
const easeIn = (x: number) => x * x; // matches cubic-bezier(0.11, 0, 0.5, 0)

/** Where the counter hands over: a line this far down the screen (matches view-timeline-inset: 55% 45%). */
export const LINE = 0.55;

/** One counter label while its card crosses the line (x from 0 to 1): the same curve as the dialLabel keyframes. */
export function labelState(x: number, first: boolean, last: boolean): [on: number, side: number] {
  if (first && x <= 0.85) return [1, -1];
  if (last && x >= 0.15) return [1, 1];
  if (x < 0.15) return [x / 0.15, 1];
  if (x <= 0.85) return [1, 1 - (2 * (x - 0.15)) / 0.7];
  return [clamp(1 - (x - 0.85) / 0.15), -1];
}

/**
 * The home page's scroll story on browsers without scroll-driven CSS animations (iPhones and iPads
 * before iOS 26, older Android browsers). It writes the same numbers the CSS animations would
 * (--exit, --fill, --reveal, --past, --on, --side), so the motion looks the same everywhere.
 * Browsers that can run it in CSS skip this entirely.
 */
export function ScrollStory({ storyOnClass }: { storyOnClass: string }) {
  useEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()')) return;
    const tools = document.querySelector<HTMLElement>('[data-story="tools"]');
    if (!tools) return;
    const hero = document.querySelector<HTMLElement>('[data-story="hero"]');
    const list = tools.querySelector<HTMLElement>('[data-story="list"]');
    const items = [...tools.querySelectorAll<HTMLElement>('[data-story="item"]')];
    const labels = [...tools.querySelectorAll<HTMLElement>('[data-story="label"]')];
    tools.classList.add(storyOnClass);

    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      if (hero) {
        // "exit": from the hero's bottom at the bottom of the screen to its bottom at the top.
        const r = hero.getBoundingClientRect();
        const d = Math.min(r.height, vh) || 1;
        hero.style.setProperty('--exit', String(clamp((d - r.bottom) / d)));
      }
      if (list) {
        // "cover 50vh to cover 100% - 50vh" of the list.
        const r = list.getBoundingClientRect();
        tools.style.setProperty('--fill', String(clamp((vh * 0.5 - r.top) / (r.height || 1))));
      }
      items.forEach((item, i) => {
        const r = item.getBoundingClientRect();
        const s = vh - r.top; // distance into the card's cover range
        item.style.setProperty('--reveal', String(easeOut(clamp((s - vh * 0.12) / (vh * 0.4)))));
        item.style.setProperty('--past', String(easeIn(clamp((s - vh * 0.62) / (vh + r.height - vh * 0.62)))));
        const label = labels[i];
        if (label) {
          const x = clamp((vh * LINE - r.top) / (r.height || 1));
          const [on, side] = labelState(x, i === 0, i === items.length - 1);
          label.style.setProperty('--on', String(on));
          label.style.setProperty('--side', String(side));
        }
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
      tools.classList.remove(storyOnClass);
    };
  }, [storyOnClass]);

  return null;
}
