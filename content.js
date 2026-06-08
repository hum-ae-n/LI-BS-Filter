/*
 * LinkedOut — content script
 *
 * Detects unwanted feed cards by their visible label text and hides them with
 * display:none. Designed to survive LinkedIn DOM churn: it matches on localized
 * text content, never on class names or data attributes for *detection* (those
 * are only used as hints when walking up to the card container).
 *
 * Filtering is data-driven: each entry in CATEGORIES is an independently
 * toggleable filter, so a new LinkedIn "junk" label is a one-line addition.
 *
 * It also injects a small on-page control panel so the user can toggle filters
 * and peek at hidden posts without opening the toolbar popup.
 *
 * Security model (see PRD §7): no HTML-string writes, no dynamic code
 * execution, no network calls. Reads use textContent only; all UI is built with
 * createElement + textContent + element.style (no innerHTML, CSP-safe).
 */
(function () {
  'use strict';

  // ---- Filter categories (PRD §6.3, extended). Matching is .toLowerCase().trim().
  // `exact` strings are compared for full-string equality against short spans /
  // module headings, so they survive class-name churn and resist false matches.
  var CATEGORIES = [
    {
      id: 'promoted',
      key: 'filterPromoted',
      label: 'Promoted',
      defaultOn: true,
      exact: [
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
      ]
    },
    {
      id: 'suggested',
      key: 'filterSuggested',
      label: 'Suggested',
      defaultOn: true,
      exact: [
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
    },
    {
      // Follow / connection recommendation modules. Opt-in (off by default)
      // because it is more aggressive than the ad/suggested filters.
      id: 'recommend',
      key: 'filterRecommend',
      label: 'Recommendations',
      defaultOn: false,
      exact: [
        'people you may know',
        'people you may know in',
        'add to your feed',
        'recommended for you',
        'suggested for you',
        'more suggestions for you',
        'people you may want to follow',
        'pages for you',
        'groups you may be interested in'
      ]
    },
    {
      // "Suggested News", trending and editorial cards injected into the feed.
      id: 'news',
      key: 'filterNews',
      label: 'News & trending',
      defaultOn: false,
      exact: [
        'suggested news for you',
        'news for you',
        'linkedin news',
        'trending now',
        'top news',
        'in the news'
      ]
    },
    {
      // Job-recommendation modules injected into the feed.
      id: 'jobs',
      key: 'filterJobs',
      label: 'Job recommendations',
      defaultOn: true,
      exact: [
        'jobs recommended for you',
        'recommended jobs',
        'jobs for you',
        'job picks for you',
        'top job picks for you',
        'more jobs for you',
        'jobs you may be interested in',
        'based on your profile and search history'
      ]
    }
  ];

  var CAT_IDS = CATEGORIES.map(function (c) { return c.id; });

  // text (lowercased) -> category id, for O(1) classification.
  var LABEL_INDEX = (function () {
    var idx = Object.create(null);
    CATEGORIES.forEach(function (cat) {
      cat.exact.forEach(function (s) { idx[s.toLowerCase().trim()] = cat.id; });
    });
    return idx;
  })();

  // Longest label we expect, used as a cheap upper bound so we never scan long
  // body-text spans (perf + false-positive guard).
  var MAX_LABEL_LEN = 48;

  var ATTR = 'data-lff-hidden';

  // ---- State ----
  var filters = {};
  var counts = {};
  CATEGORIES.forEach(function (c) { filters[c.id] = c.defaultOn; counts[c.id] = 0; });

  // When peeking, hidden cards are temporarily revealed (their data-lff-hidden
  // tag and counts are kept) so the user can see what was filtered.
  var peeking = false;

  var observer = null;
  var pending = [];
  var flushTimer = null;
  var pushTimer = null;

  function defaultPrefs() {
    var p = {};
    CATEGORIES.forEach(function (c) { p[c.key] = c.defaultOn; });
    return p;
  }

  function totalHidden() {
    var n = 0;
    for (var i = 0; i < CAT_IDS.length; i++) n += counts[CAT_IDS[i]];
    return n;
  }

  // ---- Detection helpers ----

  function classify(text) {
    if (!text) return null;
    // Trim whitespace plus any bullet / pipe / dash separators LinkedIn
    // sometimes places around the label (e.g. "• Promoted", "Promoted ·").
    var t = text.replace(/^[\s•·|–—\-]+/, '')
                .replace(/[\s•·|–—\-]+$/, '')
                .toLowerCase();
    if (!t || t.length > MAX_LABEL_LEN) return null;
    return LABEL_INDEX[t] || null;
  }

  // Selectors that (today) identify a whole feed-card wrapper. Detection itself
  // is text-based; these only choose which ancestor to hide. The list is broad
  // on purpose so we keep working as LinkedIn renames things.
  var CARD_SELECTOR = [
    'div.feed-shared-update-v2',
    '[data-urn^="urn:li:activity"]',
    '[data-id^="urn:li:activity"]',
    '[data-urn^="urn:li:aggregate"]',
    'li.scaffold-finite-scroll__list-item',
    'div.fie-impression-container',
    'div.occludable-update'
  ].join(', ');

  var LIST_SELECTOR =
    '.scaffold-finite-scroll__content, .scaffold-finite-scroll, main [role="list"]';

  function getFeedRoot() {
    return document.querySelector('.scaffold-finite-scroll__content') ||
           document.querySelector('main') ||
           document.body;
  }

  // The control panel should show on the feed itself, not on messaging/profile/
  // settings pages. Match on the URL so it does not depend on feed class names.
  function onFeedPage() {
    var p = location.pathname;
    return p === '/' || p === '/feed/' || p.indexOf('/feed') === 0;
  }

  // From a matched label, find the element representing the whole post so we can
  // hide it cleanly. Strategy: take the nearest known card wrapper, then climb to
  // the outermost slot sitting directly in the feed list (so we remove the whole
  // card, not an inner fragment). Falls back gracefully if the list container has
  // been renamed.
  function findCard(start) {
    if (!start || !start.closest) return null;

    var card = start.closest(CARD_SELECTOR);
    var list = (card || start).closest(LIST_SELECTOR);

    if (list) {
      var el = card || start;
      while (el && el.parentElement && el.parentElement !== list) {
        el = el.parentElement;
      }
      if (el && el.parentElement === list) return el;
    }

    return card; // best effort if the list container could not be located
  }

  function paintCard(card) {
    card.style.display = peeking ? '' : 'none';
  }

  function hideCard(card, kind) {
    if (!card || card.getAttribute(ATTR)) return; // already hidden — no double count
    card.setAttribute(ATTR, kind);
    counts[kind]++;
    paintCard(card);
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

  // Re-apply display to every hidden card (used when toggling peek mode).
  function repaintAll() {
    var hidden = document.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < hidden.length; i++) paintCard(hidden[i]);
  }

  // Scan a subtree for label spans and hide the matching cards.
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
    UI.renderCounts();
    if (pushTimer !== null) return;
    pushTimer = setTimeout(function () {
      pushTimer = null;
      try {
        chrome.runtime.sendMessage({ type: 'LFF_COUNTS', counts: counts }, function () {
          void chrome.runtime.lastError; // swallow (worker may be asleep)
        });
      } catch (e) {
        // Extension context invalidated (e.g. update/disable) — ignore.
      }
    }, 150);
  }

  // ---- On-page control panel (PRD §11 "collapsed" / on-page control) ----
  // Built entirely with DOM APIs + element.style so it is CSP-safe and never
  // touches innerHTML.

  var UI = (function () {
    var BLUE = '#0a66c2', GREY = '#6b7280', BORDER = '#e5e7eb';
    var root = null, body = null, badge = null, countLine = null,
        peekBtn = null, toggles = {}, built = false;

    function css(el, styles) {
      for (var k in styles) if (styles.hasOwnProperty(k)) el.style[k] = styles[k];
      return el;
    }

    function makeToggle(on, onChange) {
      var track = document.createElement('span');
      track.setAttribute('role', 'switch');
      track.setAttribute('tabindex', '0');
      track.setAttribute('aria-checked', on ? 'true' : 'false');
      css(track, {
        position: 'relative', display: 'inline-block', width: '36px',
        height: '20px', borderRadius: '20px', cursor: 'pointer',
        flex: '0 0 auto', transition: 'background-color .2s ease',
        background: on ? BLUE : '#cbd5e1'
      });
      var knob = document.createElement('span');
      css(knob, {
        position: 'absolute', top: '2px', left: '2px', width: '16px',
        height: '16px', borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.25)', transition: 'transform .2s ease',
        transform: on ? 'translateX(16px)' : 'translateX(0)'
      });
      track.appendChild(knob);
      function set(v) {
        track.setAttribute('aria-checked', v ? 'true' : 'false');
        track.style.background = v ? BLUE : '#cbd5e1';
        knob.style.transform = v ? 'translateX(16px)' : 'translateX(0)';
      }
      function fire() {
        var v = track.getAttribute('aria-checked') !== 'true';
        set(v);
        onChange(v);
      }
      track.addEventListener('click', fire);
      track.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          fire();
        }
      });
      return { el: track, set: set };
    }

    function row(cat) {
      var r = document.createElement('div');
      css(r, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' });

      var left = document.createElement('span');
      css(left, { display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: '0' });
      var name = document.createElement('span');
      name.textContent = 'Hide ' + cat.label;
      css(name, { fontWeight: '500' });
      var cnt = document.createElement('span');
      cnt.textContent = '0';
      css(cnt, { color: GREY, fontSize: '11px' });
      left.appendChild(name);
      left.appendChild(cnt);

      var t = makeToggle(filters[cat.id], function (v) {
        var patch = {};
        patch[cat.key] = v;
        try { chrome.storage.sync.set(patch); } catch (e) { /* ignore */ }
      });
      r.appendChild(left);
      r.appendChild(t.el);
      toggles[cat.id] = { toggle: t, count: cnt };
      return r;
    }

    function build() {
      if (built) return;
      built = true;

      root = document.createElement('div');
      root.id = 'lff-panel';
      root.setAttribute('aria-label', 'LinkedOut feed filter controls');
      css(root, {
        position: 'fixed', left: '20px', bottom: '20px', zIndex: '2147483000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '13px', color: '#1f2328'
      });

      // Collapsed badge button.
      badge = document.createElement('button');
      badge.type = 'button';
      badge.setAttribute('aria-label', 'Open LinkedOut');
      css(badge, {
        display: 'none', alignItems: 'center', gap: '6px', border: 'none',
        cursor: 'pointer', color: '#fff', background: BLUE, borderRadius: '20px',
        padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.18)',
        font: 'inherit', fontWeight: '600'
      });
      var shield = document.createElement('span');
      shield.textContent = '🛡';
      badge.appendChild(shield);
      badge.appendChild(document.createTextNode(' '));
      badge.appendChild((function () { var s = document.createElement('span'); s.id = 'lff-badge-count'; s.textContent = '0 hidden'; return s; })());
      badge.addEventListener('click', function () { setCollapsed(false); });

      // Expanded card.
      body = document.createElement('div');
      css(body, {
        width: '232px', background: '#fff', border: '1px solid ' + BORDER,
        borderRadius: '12px', boxShadow: '0 6px 24px rgba(0,0,0,.16)',
        padding: '12px 14px'
      });

      var head = document.createElement('div');
      css(head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' });
      var title = document.createElement('span');
      title.textContent = '🛡 LinkedOut';
      css(title, { fontWeight: '700', color: BLUE });
      var min = document.createElement('button');
      min.type = 'button';
      min.textContent = '–';
      min.setAttribute('aria-label', 'Minimize');
      css(min, { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', lineHeight: '1', color: GREY, padding: '0 4px' });
      min.addEventListener('click', function () { setCollapsed(true); });
      head.appendChild(title);
      head.appendChild(min);
      body.appendChild(head);

      CATEGORIES.forEach(function (cat) { body.appendChild(row(cat)); });

      var sep = document.createElement('div');
      css(sep, { borderTop: '1px solid ' + BORDER, margin: '8px 0' });
      body.appendChild(sep);

      countLine = document.createElement('div');
      css(countLine, { color: GREY, fontSize: '12px', marginBottom: '8px', textAlign: 'center' });
      countLine.textContent = 'Nothing filtered yet';
      body.appendChild(countLine);

      peekBtn = document.createElement('button');
      peekBtn.type = 'button';
      css(peekBtn, {
        width: '100%', border: '1px solid ' + BORDER, background: '#f3f4f6',
        cursor: 'pointer', borderRadius: '8px', padding: '7px 0', font: 'inherit',
        fontWeight: '600', color: '#1f2328'
      });
      peekBtn.textContent = '👁 Show hidden posts';
      peekBtn.addEventListener('click', function () {
        peeking = !peeking;
        repaintAll();
        renderPeek();
      });
      body.appendChild(peekBtn);

      root.appendChild(badge);
      root.appendChild(body);
      (document.body || document.documentElement).appendChild(root);
      renderPeek();
    }

    function setCollapsed(c) {
      if (!built) return;
      body.style.display = c ? 'none' : 'block';
      badge.style.display = c ? 'inline-flex' : 'none';
    }

    function renderPeek() {
      if (!peekBtn) return;
      peekBtn.textContent = peeking ? '🙈 Hide them again' : '👁 Show hidden posts';
      peekBtn.style.background = peeking ? '#fde9c8' : '#f3f4f6';
    }

    return {
      ensure: function () {
        if (!built && onFeedPage()) build();
        if (built) root.style.display = onFeedPage() ? 'block' : 'none';
      },
      renderCounts: function () {
        if (!built) return;
        CATEGORIES.forEach(function (cat) {
          var ref = toggles[cat.id];
          if (ref) ref.count.textContent = String(counts[cat.id]);
        });
        var total = totalHidden();
        var bc = document.getElementById('lff-badge-count');
        if (bc) bc.textContent = total + ' hidden';
        if (countLine) {
          countLine.textContent = total === 0
            ? 'Nothing filtered yet'
            : total + (total === 1 ? ' post hidden this session' : ' posts hidden this session');
        }
      },
      syncToggles: function () {
        if (!built) return;
        CATEGORIES.forEach(function (cat) {
          var ref = toggles[cat.id];
          if (ref) ref.toggle.set(filters[cat.id]);
        });
      }
    };
  })();

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
    UI.ensure();
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
    CATEGORIES.forEach(function (c) { if (!filters[c.id]) restore(c.id); });
    scanSubtree(getFeedRoot());
    UI.syncToggles();
    pushCounts();
  }

  // ---- Lifecycle ----

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      disconnectObserver();
    } else {
      connectObserver();
      scanSubtree(getFeedRoot()); // catch up on anything added while hidden
      UI.ensure();
      pushCounts();
    }
  }

  function start(prefs) {
    CATEGORIES.forEach(function (c) {
      if (typeof prefs[c.key] === 'boolean') filters[c.id] = prefs[c.key];
    });

    scanSubtree(getFeedRoot());
    UI.ensure();
    pushCounts();
    connectObserver();

    document.addEventListener('visibilitychange', onVisibilityChange);

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      var changed = false;
      CATEGORIES.forEach(function (c) {
        if (changes[c.key]) {
          filters[c.id] = !!changes[c.key].newValue;
          changed = true;
        }
      });
      if (changed) applyFilterState();
    });
  }

  // Read persisted preferences, then begin. Defaults mirror the storage schema.
  try {
    chrome.storage.sync.get(defaultPrefs(), function (prefs) {
      if (chrome.runtime.lastError || !prefs) prefs = defaultPrefs();
      start(prefs);
    });
  } catch (e) {
    // If storage is unavailable, run with defaults so the feed still gets filtered.
    start(defaultPrefs());
  }
})();
