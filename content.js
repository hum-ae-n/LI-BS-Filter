/*
 * LinkedIn Feed Filter — content script
 *
 * Detects "Promoted" and "Suggested" feed cards by their visible label text
 * and hides them with display:none. Designed to survive LinkedIn DOM churn:
 * it matches on localized text content, never on class names or data
 * attributes for *detection* (those are only used as hints when walking up to
 * the card container).
 *
 * Security model (see PRD §7): no HTML-string writes, no dynamic code
 * execution, no network calls. Reads use textContent only; writes use the
 * DOM style/attribute APIs only.
 */
(function () {
  'use strict';

  // ---- Localized label map (PRD §6.3). Matching is .toLowerCase().trim(). ----
  const LABELS = {
    promoted: [
      'promoted',        // English
      'gesponsert',      // German
      'sponsorisé',      // French
      'promocionado',    // Spanish
      'promovido',       // Portuguese
      'sponsorizzato',   // Italian
      'gepromoot',       // Dutch
      'sponset',         // Norwegian
      'sponsrad',        // Swedish
      'プロモーション',    // Japanese
      '推广'             // Mandarin (Simplified)
    ],
    suggested: [
      'suggested',       // English
      'vorgeschlagen',   // German
      'suggéré',         // French
      'sugerido',        // Spanish / Portuguese
      'consigliato',     // Italian
      'voorgesteld',     // Dutch
      'foreslått',       // Norwegian
      'föreslagen',      // Swedish
      'おすすめ',         // Japanese
      '推荐'             // Mandarin (Simplified)
    ]
  };

  const PROMOTED = new Set(LABELS.promoted.map(function (s) { return s.toLowerCase(); }));
  const SUGGESTED = new Set(LABELS.suggested.map(function (s) { return s.toLowerCase(); }));

  // Longest label we expect, used as a cheap upper bound so we never scan long
  // body-text spans (perf + false-positive guard).
  const MAX_LABEL_LEN = 24;

  const ATTR = 'data-lff-hidden';

  // ---- State ----
  var filters = { promoted: true, suggested: true };
  // counts = posts *currently* hidden, per kind (PRD §6.2 increments on hide,
  // decrements on restore).
  var counts = { promoted: 0, suggested: 0 };
  var observer = null;
  var pending = [];
  var flushTimer = null;
  var pushTimer = null;

  // ---- Detection helpers ----

  function classify(text) {
    if (!text) return null;
    var t = text.trim().toLowerCase();
    if (!t || t.length > MAX_LABEL_LEN) return null;
    if (PROMOTED.has(t)) return 'promoted';
    if (SUGGESTED.has(t)) return 'suggested';
    return null;
  }

  // Is this element the top-level container for a feed card? These attribute /
  // class hints are only used to *stop* the upward walk — detection itself is
  // text-based, so if LinkedIn renames them we degrade to the fallback below.
  function isFeedItem(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hasAttribute('data-urn')) return true;
    if (el.hasAttribute('data-id')) return true;
    var c = el.className;
    if (typeof c === 'string' && c.indexOf('feed-shared-update-v2') !== -1) return true;
    return false;
  }

  function getFeedRoot() {
    return document.querySelector('.scaffold-finite-scroll__content') ||
           document.querySelector('main') ||
           document.body;
  }

  // Walk up from a matched label span to the element that represents the whole
  // card. Prefer a recognized feed-item ancestor; otherwise fall back to the
  // direct child of the feed scroll container.
  function findCard(start) {
    var el = start;
    var i;
    for (i = 0; i < 12 && el && el !== document.body; i++) {
      if (isFeedItem(el)) return el;
      el = el.parentElement;
    }
    el = start;
    for (i = 0; i < 14 && el && el.parentElement; i++) {
      var p = el.parentElement;
      if (p.classList && p.classList.contains('scaffold-finite-scroll__content')) {
        return el;
      }
      el = p;
    }
    return null;
  }

  function hideCard(card, kind) {
    if (!card || card.getAttribute(ATTR)) return; // already hidden — no double count
    card.style.display = 'none';
    card.setAttribute(ATTR, kind);
    counts[kind]++;
  }

  function restore(kind) {
    var hidden = document.querySelectorAll('[' + ATTR + '="' + kind + '"]');
    for (var i = 0; i < hidden.length; i++) {
      var el = hidden[i];
      el.style.display = '';
      el.removeAttribute(ATTR);
      if (counts[kind] > 0) counts[kind]--;
    }
  }

  // Scan a subtree for label spans and hide the matching cards. Returns the
  // number of milliseconds spent (caller enforces the time budget).
  function scanSubtree(root) {
    if (!root || root.nodeType !== 1) return;
    var spans;
    if (root.tagName === 'SPAN') {
      spans = [root];
    } else if (root.querySelectorAll) {
      spans = root.querySelectorAll('span');
    } else {
      return;
    }
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      var kind = classify(span.textContent);
      if (!kind || !filters[kind]) continue;
      var card = findCard(span);
      if (card) hideCard(card, kind);
    }
  }

  // ---- Service-worker reporting ----

  function pushCounts() {
    if (pushTimer !== null) return;
    pushTimer = setTimeout(function () {
      pushTimer = null;
      try {
        chrome.runtime.sendMessage({
          type: 'LFF_COUNTS',
          promoted: counts.promoted,
          suggested: counts.suggested
        }, function () {
          // Swallow lastError (service worker may be asleep / context gone).
          void chrome.runtime.lastError;
        });
      } catch (e) {
        // Extension context invalidated (e.g. update/disable) — ignore.
      }
    }, 150);
  }

  // ---- Mutation handling (debounced, PRD §6.2) ----

  function flush() {
    flushTimer = null;
    var nodes = pending;
    pending = [];
    var t0 = (performance && performance.now) ? performance.now() : Date.now();
    for (var i = 0; i < nodes.length; i++) {
      scanSubtree(nodes[i]);
      var now = (performance && performance.now) ? performance.now() : Date.now();
      if (now - t0 > 100) break; // bail out of scans over 100ms
    }
    pushCounts();
  }

  function onMutations(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        if (added[j].nodeType === 1) pending.push(added[j]);
      }
    }
    if (pending.length && flushTimer === null) {
      flushTimer = setTimeout(flush, 100);
    }
  }

  function connectObserver() {
    if (observer) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function disconnectObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    pending = [];
  }

  // ---- Filter-state application (driven by storage changes) ----

  function applyFilterState() {
    if (!filters.promoted) restore('promoted');
    if (!filters.suggested) restore('suggested');
    if (filters.promoted || filters.suggested) scanSubtree(getFeedRoot());
    pushCounts();
  }

  // ---- Lifecycle ----

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      disconnectObserver();
    } else {
      connectObserver();
      scanSubtree(getFeedRoot()); // catch up on anything added while hidden
      pushCounts();
    }
  }

  function start(prefs) {
    if (typeof prefs.filterPromoted === 'boolean') filters.promoted = prefs.filterPromoted;
    if (typeof prefs.filterSuggested === 'boolean') filters.suggested = prefs.filterSuggested;

    scanSubtree(getFeedRoot());
    pushCounts();
    connectObserver();

    document.addEventListener('visibilitychange', onVisibilityChange);

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      var changed = false;
      if (changes.filterPromoted) {
        filters.promoted = !!changes.filterPromoted.newValue;
        changed = true;
      }
      if (changes.filterSuggested) {
        filters.suggested = !!changes.filterSuggested.newValue;
        changed = true;
      }
      if (changed) applyFilterState();
    });
  }

  // Read persisted preferences, then begin. Defaults mirror the storage schema.
  try {
    chrome.storage.sync.get(
      { filterPromoted: true, filterSuggested: true },
      function (prefs) {
        if (chrome.runtime.lastError || !prefs) prefs = { filterPromoted: true, filterSuggested: true };
        start(prefs);
      }
    );
  } catch (e) {
    // If storage is unavailable, run with defaults so the feed still gets filtered.
    start({ filterPromoted: true, filterSuggested: true });
  }
})();
