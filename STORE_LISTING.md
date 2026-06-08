# Chrome Web Store listing — LinkedOut

Copy-paste fields for the Web Store Developer Dashboard.

## Name (max 45 chars)

```
LinkedOut - Hide LinkedIn Promoted & Slop
```

> Matches `manifest.json` "name". "LinkedOut" leads (memorable + avoids a
> trademark-leading name); "LinkedIn / Promoted" follow for search discovery.

## Summary / short description (max 132 chars)

```
Hide Promoted, Suggested, AI slop & 'People you may know' from your LinkedIn feed. On-page toggles. Zero tracking, no ads.
```

## Category

Productivity

## Detailed description

```
LinkedOut gives you back control of your LinkedIn home feed.

LinkedIn mixes paid "Promoted" ads and algorithmic "Suggested" posts in with
content from the people you actually chose to follow. LinkedOut hides the noise
so your feed is just your network again.

WHAT IT HIDES (each is an independent toggle)
• Promoted — paid ads (on by default)
• Suggested — algorithmic posts from outside your network (on by default)
• Recommendations — "People you may know", "Add to your feed", follow
  suggestions (opt-in)
• News & trending — "Suggested News for You" and trending cards (opt-in)
• Job recommendations — "Jobs recommended for you" panels (on by default)

ON-PAGE CONTROLS
A small panel sits at the bottom-left of your feed. Flip any filter, watch the
live count of what's been hidden, or click "Show hidden posts" to peek at what
was filtered — without leaving the page.

WORKS WITH INFINITE SCROLL
New Promoted/Suggested posts are caught as you scroll. Detection matches the
visible label text in 11 languages (English, German, French, Spanish,
Portuguese, Italian, Dutch, Norwegian, Swedish, Japanese, Simplified Chinese),
so it keeps working when LinkedIn reshuffles its page structure.

PRIVACY FIRST — THIS IS NOT AN AD BLOCKER
LinkedOut is a DOM filter: it simply hides cards already on the page. It does
NOT block network requests or tracking pixels, and it does NOT collect data.
• No analytics, no telemetry, no cookies
• No external network requests of any kind
• The only permission requested is "storage" (to remember your toggles) plus
  access to linkedin.com
• 100% open source and human-auditable

Your feed, the way you actually wanted it.
```

## Permission justifications (for the review form)

- **storage** — Persist the user's four filter on/off preferences so they survive
  restarts and sync across the user's own Chrome instances. No other data is
  stored.
- **Host permission `https://www.linkedin.com/*`** — The content script must run
  on LinkedIn feed pages to detect and hide Promoted/Suggested/recommendation
  cards. The extension runs nowhere else.

## Single purpose (required statement)

```
LinkedOut has a single purpose: to hide unwanted promoted, suggested, and
recommendation posts from the user's LinkedIn home feed.
```

## Data usage disclosures (Privacy practices tab)

- Does the item collect or use user data? **No.**
- Sold to third parties? **No.** Used for unrelated purposes? **No.** Used to
  determine creditworthiness / lending? **No.**
- Privacy policy URL: link to `PRIVACY.md` (or a hosted copy).

## Assets still needed before submission

- [ ] Screenshots: 1280×800 or 640×400 (at least one; show the on-page panel)
- [ ] Optional promo tile: 440×280
- [ ] Demo video (optional but recommended) — YouTube link
