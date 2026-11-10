"use client";

/**
 * Live height of the phone home's bottom stack (chips + cards + "See
 * all"), or null when it isn't on screen. Map camera padding uses it so
 * a flown-to venue lands above the cards instead of under them.
 */
export function measurePhoneStackPx(): number | null {
  if (typeof document === "undefined") return null;
  const stack = document.querySelector(".phone-stack");
  if (!(stack instanceof HTMLElement)) return null;
  const height = stack.getBoundingClientRect().height;
  return height > 0 ? height : null;
}
