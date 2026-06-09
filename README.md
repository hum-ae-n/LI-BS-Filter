# LinkedOut

> **LinkedOut** — hide Promoted, Suggested, AI slop & "People you may know" from
> your LinkedIn feed. (Formerly "LinkedIn Feed Filter".)

<p align="center">
  <img src="assets/banner.png" alt="LinkedOut — the LinkedIn feed, minus the slop" width="900">
</p>

A free Chrome extension that hides **Promoted** (ads) and **Suggested** posts
from your LinkedIn home feed, so you only see content from the people you
actually chose to follow.

> It hides posts that are *already on the page* (by setting them to "invisible").
> It is **not** an ad blocker — it doesn't touch your network traffic, cookies,
> or anything outside the LinkedIn feed.

## Is this safe? Can I trust it? (read this first)

Short answer: **yes**, and you don't have to take our word for it — you can see
everything it does.

- **It can't see anything except LinkedIn.** Chrome only lets it run on
  `linkedin.com`. It is completely blind to your email, your banking, every
  other tab, and the rest of the web.
- **It never sends data anywhere.** There is no "phone home." The code contains
  no `fetch`, no network calls, no analytics, no telemetry, no tracking — by
  design. Your data never leaves your computer because the extension never
  transmits anything, full stop.
- **It collects nothing about you.** The only thing it remembers is your two
  on/off switches. No account, no sign-up, no profile, no history.
- **The only permission it asks for is "storage"** — that's just so it can
  remember whether your switches are on or off. It does **not** ask to read your
  tabs, your cookies, your passwords, or your browsing history. (Chrome shows
  you the exact permissions before you install.)
- **It's small and readable.** The whole thing is about 740 lines of plain
  JavaScript with no hidden packages, no "build step," and no outside code
  pulled from the internet — readable end to end in one sitting.
- **You can verify it yourself.** Run `bash tools/audit.sh` and it
  automatically checks that none of the dangerous patterns (hidden network
  calls, code injection, extra permissions) are present. It currently passes
  every check.

In plain terms: the worst this extension can do is hide a LinkedIn post you
wanted to see. If that ever happens, just flip the switch back off.

---

## Install it in 5 minutes (no coding required)

> 🛍️ **Chrome Web Store listing: coming soon.** Once it's live you'll get a
> one-click **"Add to Chrome"** button with automatic updates. Until then,
> install from source using the steps below — it works exactly the same.

You do **not** need to know how to code, and you don't need any developer tools.

### Step 1 — Download the files

1. Go to the top of this GitHub page.
2. Click the green **`< > Code`** button.
3. Click **Download ZIP**.
4. Find the downloaded file (usually in your **Downloads** folder) and
   **unzip it** (double-click it on Mac, or right-click → *Extract All* on
   Windows). You'll get a folder named something like `LI-BS-Filter-main`.
5. Remember where that folder is. Inside it you should see a file called
   `manifest.json` — that's the one Chrome needs.

### Step 2 — Turn on Chrome's "Developer mode"

1. Open Chrome.
2. In the address bar, type **`chrome://extensions`** and press Enter.
3. In the **top-right corner**, flip on the **Developer mode** switch.

> "Developer mode" sounds scary but just means "let me install an extension from
> a folder instead of the Chrome Web Store." Nothing else changes.

### Step 3 — Load the extension

1. Click the **Load unpacked** button (top-left).
2. Select the folder you unzipped in Step 1 (the one containing
   `manifest.json`).
3. Done — "LinkedOut" now appears in your list, and a small icon
   appears in your Chrome toolbar.

### Step 4 — Use it

1. Go to [linkedin.com/feed](https://www.linkedin.com/feed).
2. Promoted and Suggested posts are hidden automatically.
3. A small **control panel appears at the bottom-left of the page** — flip any
   filter on/off, see live counts, or click **👁 Show hidden posts** to peek at
   what was filtered. (You can also click the toolbar icon for the same
   controls.)

> **Tip:** if you don't see the icon, click the puzzle-piece 🧩 icon in Chrome's
> toolbar and pin "LinkedOut" so it's always visible.

### Keeping it updated

Because you installed it from a folder, it won't auto-update. To get a newer
version, download the ZIP again, unzip it over the old folder, then click the
🔄 **refresh** icon on the extension's card at `chrome://extensions`.

---

## Frequently asked

**Will LinkedIn know I'm using this or ban me?**
The risk is low. LinkedOut only changes what *you* see — it hides cards that are
already on your screen, the same as scrolling past them. It doesn't log in,
click, scrape, or talk to LinkedIn's servers, so there's nothing on their end to
detect. That said, LinkedIn's User Agreement broadly discourages software that
modifies the service, and no extension can *guarantee* immunity — use it because
it improves your own experience, not on a promise from us. (The MIT license is
provided without warranty.)

**Does it work with uBlock Origin / other extensions?**
Yes. It only touches the feed's visible posts and doesn't interfere with other
extensions.

**It hid a post I wanted to see — what do I do?**
Open the popup and turn off "Hide Promoted" or "Hide Suggested." The post comes
right back.

**My LinkedIn isn't in English.**
Already handled — it recognizes the labels in English, German, French, Spanish,
Portuguese, Italian, Dutch, Norwegian, Swedish, Japanese, and Simplified
Chinese. (Adding more is easy — see *Updating the label map* below.)

---

## Features

- Four independent filters, each its own toggle:
  - **Promoted** — paid ads (on by default)
  - **Suggested** — algorithmic posts from outside your network (on by default)
  - **Recommendations** — "People you may know", "Add to your feed", follow
    suggestions (off by default — opt in)
  - **News & trending** — "Suggested News for You" and trending cards (off by
    default — opt in)
  - **Job recommendations** — "Jobs recommended for you" and similar job panels
    (on by default)
- **On-page control panel** — a small floating widget at the bottom-left of your
  feed lets you flip any filter and **peek at hidden posts** ("👁 Show hidden")
  without opening the toolbar menu
- Preferences persist across sessions and devices (`chrome.storage.sync`)
- Live badge count of posts filtered this session
- Handles infinite scroll via a debounced `MutationObserver`
- Resilient detection: matches localized **label text**, not brittle CSS class
  names
- Data-driven categories — supporting a new LinkedIn "junk" label is a one-line
  addition
- **Zero data collection** — no analytics, no telemetry, no external calls
- No build step, no npm packages, no CDN imports — pure vanilla JS/HTML/CSS

## File layout

| File | Role |
|------|------|
| `manifest.json` | Extension config, permissions, CSP |
| `content.js` | DOM observation, label detection, hiding |
| `background.js` | Service worker — badge + session counts |
| `popup.html` / `popup.js` / `popup.css` | Toggle UI and session stats |
| `icons/` | Toolbar icons (16/48/128 px) |
| `tools/gen_icons.py` | Regenerates the icons (stdlib only, optional) |
| `tools/audit.sh` | Automated security/compliance audit |

## How detection works

For each feed card added to the DOM, the content script inspects `<span>`
elements and compares their trimmed, lowercased text against a localized label
map. On a match it walks up to the enclosing feed-card container and sets
`display:none`, tagging it with `data-lff-hidden` so it can be restored if you
toggle the filter off. Detection is intentionally text-based so it survives
LinkedIn's frequent DOM/class-name changes.

## Privacy & security

- Requests only the `storage` permission and the `linkedin.com` host
  permission — nothing else.
- Strict CSP (`script-src 'self'; object-src 'none'`).
- No `eval`, no `innerHTML` writes, no dynamic script creation, no `fetch` /
  `XMLHttpRequest` / `WebSocket` / `sendBeacon`.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

Run the automated security/compliance audit (PRD §8.2) any time:

```bash
bash tools/audit.sh
```

## Regenerating icons

The icons are committed, but you can rebuild them with the standard library
only:

```bash
python3 tools/gen_icons.py
```

## Adding labels or whole new filters

Detection is data-driven. Near the top of `content.js` is a `CATEGORIES` array;
each entry is one independently toggleable filter with an `exact` list of label
strings. To support a new language, add the translated string to the relevant
category's `exact` list. To add a brand-new filter, append a new category object
(give it an `id`, `key`, `label`, `defaultOn`, and `exact` list) and add a
matching toggle in `popup.html` plus its key in `background.js`'s
`DEFAULT_PREFS`. Matching is case-insensitive and whitespace-trimmed.

The Promoted and Suggested categories are fully localized (English, German,
French, Spanish, Portuguese, Italian, Dutch, Norwegian, Swedish, Japanese,
Simplified Chinese). The opt-in Recommendations and News categories ship with
English labels and are easy to extend the same way.

## License

[MIT](LICENSE) © 2026 Rocky Verma / Kaipability
