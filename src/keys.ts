import type { KeyboardEvent } from "react";

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * The radio pattern the role promises: an arrow moves the choice and the focus with it, Home and End
 * jump to the ends. The caller keeps one radio tabbable, so the whole group is one stop through the page.
 */
export function radioKeys(i: number, n: number, pick: (j: number) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const d = STEP[e.key];
    const j = d ? (i + d + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    pick(j);
    e.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus();
  };
}
