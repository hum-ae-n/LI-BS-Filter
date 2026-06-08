# LinkedIn Feed Filter

A zero-dependency Chrome extension (Manifest V3) that filters **Promoted** and
**Suggested** posts out of your LinkedIn home feed. You decide what appears —
not LinkedIn's ad engine or recommendation algorithm.

> This is a DOM filter, **not** an ad blocker. It hides feed cards client-side
> with `display:none`. It does not block network requests or tracking pixels.

## Features

- Toggle **Hide Promoted** and **Hide Suggested** independently
- Preferences persist across sessions and devices (`chrome.storage.sync`)
- Live badge count of posts filtered this session
- Handles infinite scroll via a debounced `MutationObserver`
- Resilient detection: matches localized **label text**, not brittle CSS class
  names (English, German, French, Spanish, Portuguese, Italian, Dutch,
  Norwegian, Swedish, Japanese, Simplified Chinese)
- **Zero data collection** — no analytics, no telemetry, no external calls
- No build step, no npm packages, no CDN imports — pure vanilla JS/HTML/CSS

## Install (unpacked, for development)

1. Clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Visit [linkedin.com/feed](https://www.linkedin.com/feed) and scroll.

Click the toolbar icon to open the popup and toggle filters.

## File layout

| File | Role |
|------|------|
| `manifest.json` | Extension config, permissions, CSP |
| `content.js` | DOM observation, label detection, hiding |
| `background.js` | Service worker — badge + session counts |
| `popup.html` / `popup.js` / `popup.css` | Toggle UI and session stats |
| `icons/` | Toolbar icons (16/48/128 px) |
| `tools/gen_icons.py` | Regenerates the icons (stdlib only, optional) |

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

## Regenerating icons

The icons are committed, but you can rebuild them with the standard library
only:

```bash
python3 tools/gen_icons.py
```

## Updating the label map

LinkedIn localizes the "Promoted"/"Suggested" labels. To support a new
language, add the translated strings to the `LABELS` object near the top of
`content.js`. Matching is case-insensitive and whitespace-trimmed.

## License

[MIT](LICENSE) © 2026 Rocky Verma / Kaipability
