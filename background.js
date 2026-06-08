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
var counts = { promoted: 0, suggested: 0 };

function updateBadge() {
  var total = counts.promoted + counts.suggested;
  chrome.action.setBadgeText({ text: total > 0 ? String(total) : '' });
}

// Badge colour is set on every worker wake (cheap, idempotent).
chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get(['filterPromoted', 'filterSuggested'], function (cur) {
    var toSet = {};
    if (cur.filterPromoted === undefined) toSet.filterPromoted = true;
    if (cur.filterSuggested === undefined) toSet.filterSuggested = true;
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
  });
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === 'LFF_COUNTS') {
    // The content script owns the per-page tally; a fresh page load reports
    // from zero, which naturally resets the session count on navigation.
    counts.promoted = msg.promoted | 0;
    counts.suggested = msg.suggested | 0;
    updateBadge();
    return; // no response needed
  }

  if (msg.type === 'LFF_GET_COUNTS') {
    sendResponse({ promoted: counts.promoted, suggested: counts.suggested });
    return true; // keep the message channel open for the async response
  }
});
