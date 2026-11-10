import type { ReactNode } from "react";

import { HeaderNav } from "@/components/layout/header-nav";
import type { HeaderSession } from "@/components/layout/user-avatar";
import { Wordmark } from "@/components/ui/primitives";

type ViewMode = "map" | "places";

export function SiteHeader({
  session = null,
  viewMode,
  onHome,
  onPlaces,
  phoneSlot,
}: {
  session?: HeaderSession | null;
  viewMode?: ViewMode;
  onHome?: () => void;
  onPlaces?: () => void;
  /** Phone-only extra (the short campus clock); desktop passes nothing. */
  phoneSlot?: ReactNode;
} = {}) {
  return (
    <header className="site-header">
      <Wordmark />
      {phoneSlot}
      <HeaderNav
        onHome={onHome}
        onPlaces={onPlaces}
        session={session}
        viewMode={viewMode}
      />
    </header>
  );
}
