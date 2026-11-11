"use client";

import { useEffect, useId, useRef } from "react";

import {
  VENUE_SORT_TITLES,
  type VenueSort,
} from "@/lib/venue-sort";

const OPTIONS: VenueSort[] = ["earliest", "latest", "nearest"];

/**
 * "Sort by" bottom sheet with radio rows. Scrim tap and Escape close it;
 * focus lands on the checked row, stays inside while open, and goes back to
 * whatever opened it.
 */
export function VenueSortSheet({
  open,
  sort,
  hasLocation,
  onSelect,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  sort: VenueSort;
  hasLocation: boolean;
  onSelect: (sort: VenueSort) => void;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hintId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const checked = sheet.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? sheet.querySelector<HTMLElement>("button"))?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = [
        ...sheet.querySelectorAll<HTMLElement>("button:not([disabled])"),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const opener = returnFocusTo;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open, returnFocusTo]);

  if (!open) return null;

  return (
    <div className="sort-layer">
      <button
        aria-label="Close sort menu"
        className="sort-scrim"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="sort-sheet"
        ref={sheetRef}
        role="dialog"
      >
        <div className="sort-sheet-head">
          <h2 id={titleId}>Sort by</h2>
          <button
            aria-label="Close"
            className="sort-close"
            onClick={onClose}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
              viewBox="0 0 16 16"
              width="16"
            >
              <path d="m4 4 8 8" />
              <path d="m12 4-8 8" />
            </svg>
          </button>
        </div>
        <div aria-labelledby={titleId} role="radiogroup">
          {OPTIONS.map((option) => {
            const disabled = option === "nearest" && !hasLocation;
            const checked = sort === option;
            return (
              <button
                aria-checked={checked}
                aria-describedby={disabled ? hintId : undefined}
                aria-disabled={disabled || undefined}
                className="sort-row"
                key={option}
                onClick={() => {
                  if (disabled) return;
                  onSelect(option);
                  onClose();
                }}
                role="radio"
                type="button"
              >
                <span className="sort-radio" aria-hidden="true" />
                <span className="sort-row-text">
                  <span className="sort-row-title">
                    {VENUE_SORT_TITLES[option]}
                  </span>
                  {disabled ? (
                    <span className="sort-row-hint" id={hintId}>
                      Turn on location to sort by distance.
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
