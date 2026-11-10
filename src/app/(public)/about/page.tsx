import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";

export default async function AboutPage() {
  return (
    <div className="public-page">
      <SiteHeader />
      <main className="about-page">
        <p className="eyebrow">About the guide</p>
        <h1>Campus food, without the guesswork.</h1>
        <p className="about-lede">
          TuEats is a small, community-built guide to food trucks and other
          off-meal-plan food around Temple University&apos;s main campus.
        </p>

        <section>
          <h2>Why it exists</h2>
          <p>
            Campus food changes quickly. A familiar cart moves, posted hours
            drift, and a great lunch can hide one block away. TuEats puts the
            useful details in one place: where to go, what kind of food is
            there, and whether it is usually open.
          </p>
        </section>
        <section>
          <h2>How the information works</h2>
          <p>
            Listings are curated and periodically checked. Hours are always a
            guide, not a promise. If something looks wrong, use the report link
            on the venue page so it can be checked.
          </p>
        </section>
        <section>
          <h2>Signing in</h2>
          <p>
            Browsing the map, search, filters, and place pages never requires
            an account. Rating, reviewing, or adding a photo does, using Google
            sign-in through Supabase. We only ever see your name and email from
            Google to create your account &mdash; your email is never shown to
            anyone or stored outside of authentication, and your Google password
            is never seen by TuEats at all. Once you&apos;re signed in, tap the
            profile icon in the header to open your account: change your name,
            username, and class year, and see every rating you&apos;ve posted.
          </p>
        </section>
        <section>
          <h2>Cookies &amp; analytics</h2>
          <p>
            We use a cookie only to keep you signed in &mdash; neither analytics
            tool we use sets one. Vercel Web Analytics just counts page views.
            PostHog counts page views too, and also records clicks and a handful
            of specific actions &mdash; which filters you use, when you view or
            select a place, and if you rate a place, add a photo, or report a
            problem &mdash; to help us see what&rsquo;s actually useful. It
            never records what you type: a masked session replay may capture how
            you move through the site, but every typed value (search, reviews,
            report notes) is replaced with a placeholder before it ever leaves
            your browser. None of this runs on our internal admin tools. Both
            analytics tools stay fully anonymous &mdash; no account id, display
            name, or email ever reaches either &mdash; and PostHog is further
            configured to discard IP addresses and skip location lookups. There
            are no advertising trackers on TuEats.
          </p>
        </section>
        <section>
          <h2>Map data</h2>
          <p>
            &copy; OpenStreetMap contributors &middot; OpenFreeMap &middot;
            OpenMapTiles
          </p>
        </section>
        <aside className="about-note">
          <strong>Independent and unofficial.</strong>
          <p>
            TuEats is not affiliated with, endorsed by, or operated by Temple
            University.
          </p>
        </aside>
        <Link className="button button-primary about-cta" href="/">
          Explore places to eat
        </Link>
      </main>
    </div>
  );
}
