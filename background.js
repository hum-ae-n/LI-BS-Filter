/*
 * LinkedIn Feed Filter — service worker (background)
 *
 * Event-driven only. Responsibilities (PRD §6.5):
 *  - maintain the in-memory session count reported by the content script
 *  - reflect the total on the toolbar badge
 *  - serve the current counts to the popup
 *  - seed default preferences on install
 *
 * No network calls, no tabs/cookies access.
 */
'use strict';

var BADGE_COLOR = '#6B7280'; // muted, non-alarming grey

// Filter preference keys and their defaults (kept in sync with content.js /
// popup.js). The two newer categories are opt-in (off by default).
var DEFAULT_PREFS = {
  filterPromoted: true,
  filterSuggested: true,
  filterRecommend: false,
  filterNews: false
};

// Live per-category session counts, reported by the content script.
var counts = {};

function total() {
  var n = 0;
  for (var k in counts) if (counts.hasOwnProperty(k)) n += counts[k] | 0;
  return n;
}

function updateBadge() {
  var t = total();
  chrome.action.setBadgeText({ text: t > 0 ? String(t) : '' });
}

// Badge colour is set on every worker wake (cheap, idempotent).
chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });

chrome.runtime.onInstalled.addListener(function () {
  var keys = Object.keys(DEFAULT_PREFS);
  chrome.storage.sync.get(keys, function (cur) {
    var toSet = {};
    keys.forEach(function (k) {
      if (cur[k] === undefined) toSet[k] = DEFAULT_PREFS[k];
    });
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
  });
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === 'LFF_COUNTS') {
    // The content script owns the per-page tally; a fresh page load reports
    // from zero, which naturally resets the session count on navigation.
    counts = msg.counts || {};
    updateBadge();
    return; // no response needed
  }

  if (msg.type === 'LFF_GET_COUNTS') {
    sendResponse({ counts: counts, total: total() });
    return true; // keep the message channel open for the async response
  }
});
