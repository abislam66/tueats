"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { formatCampusNow } from "@/lib/hours";
import { useMinuteClock } from "@/lib/use-minute-clock";
import {
  UserAvatar,
  type HeaderSession,
} from "@/components/layout/user-avatar";

type ViewMode = "map" | "places";

/**
 * A nav item that degrades gracefully: from the homepage (where VenueExplorer
 * owns view-mode state) a click intercepts and calls the local handler with
 * no navigation; from any other page (/about, /account, admin) it's a plain
 * link to "/" with the right query param, since there's no local state to
 * call back into there.
 */
function NavAction({
  href,
  onClick,
  active,
  children,
}: {
  href: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const onHomePage = pathname === "/";

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (onHomePage && onClick) {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className="header-action"
      href={href}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}

export function HeaderNav({
  session = null,
  viewMode = "map",
  onHome,
  onPlaces,
}: {
  session?: HeaderSession | null;
  viewMode?: ViewMode;
  onHome?: () => void;
  onPlaces?: () => void;
}) {
  const now = useMinuteClock();
  return (
    <nav aria-label="Primary navigation">
      <time className="header-clock tabular" suppressHydrationWarning>
        {formatCampusNow(now)}
      </time>
      {/* Top rated toggles: from the board, it returns to the map. */}
      <NavAction
        active={viewMode === "places"}
        href={viewMode === "places" ? "/" : "/?view=places"}
        onClick={viewMode === "places" ? onHome : onPlaces}
      >
        Top rated
      </NavAction>
      <Link className="header-action" href="/about">
        About
      </Link>
      <UserAvatar session={session} />
    </nav>
  );
}
