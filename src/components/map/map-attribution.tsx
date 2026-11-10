"use client";

import { useEffect, useId, useRef, useState } from "react";

function Credits() {
  return (
    <>
      ©{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        rel="noreferrer"
        target="_blank"
      >
        OpenStreetMap
      </a>{" "}
      ·{" "}
      <a href="https://openfreemap.org/" rel="noreferrer" target="_blank">
        OpenFreeMap
      </a>
    </>
  );
}

/**
 * Desktop: the text line. Phone (CSS swaps them): a 44px info button at
 * the top-left that toggles a popover with the same credits.
 */
export function MapAttribution() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <p className="map-attribution">
        <Credits />
      </p>
      <div className="map-attribution-compact" ref={rootRef}>
        <button
          aria-controls={popoverId}
          aria-expanded={open}
          aria-label="Map credits"
          className="map-attribution-button"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
            viewBox="0 0 20 20"
            width="20"
          >
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 9v5" />
            <circle cx="10" cy="6.3" fill="currentColor" r="0.6" />
          </svg>
        </button>
        {open ? (
          <p className="map-attribution-popover" id={popoverId}>
            <Credits />
          </p>
        ) : null}
      </div>
    </>
  );
}
