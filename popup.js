/*
 * LinkedIn Feed Filter — popup UI logic
 *
 * Reads/writes preferences via chrome.storage.sync and reads live session
 * counts from the service worker. Toggling a filter only writes to storage;
 * the content script reacts to storage.onChanged and re-scans. This keeps the
 * extension within the "storage" permission only (no "tabs" needed).
 */
'use strict';

// id = category id (matches content.js / background.js); key = storage key.
var CATEGORIES = [
  { id: 'promoted',  key: 'filterPromoted',  defaultOn: true },
  { id: 'suggested', key: 'filterSuggested', defaultOn: true },
  { id: 'recommend', key: 'filterRecommend', defaultOn: false },
  { id: 'news',      key: 'filterNews',      defaultOn: false }
];

function defaults() {
  var d = {};
  CATEGORIES.forEach(function (c) { d[c.key] = c.defaultOn; });
  return d;
}

function $(id) {
  return document.getElementById(id);
}

function showVersion() {
  var v = 'v' + chrome.runtime.getManifest().version;
  $('header-version').textContent = v;
  $('footer-version').textContent = v;
}

function refreshCounts() {
  try {
    chrome.runtime.sendMessage({ type: 'LFF_GET_COUNTS' }, function (resp) {
      if (chrome.runtime.lastError || !resp) return;
      var counts = resp.counts || {};
      var total = 0;
      CATEGORIES.forEach(function (c) {
        var n = counts[c.id] | 0;
        total += n;
        var el = $('count-' + c.id);
        if (el) el.textContent = String(n);
      });
      $('count-total').textContent = String(resp.total != null ? resp.total : total);
    });
  } catch (e) {
    // Service worker unavailable — leave the placeholder zeros.
  }
}

function init() {
  showVersion();

  chrome.storage.sync.get(defaults(), function (prefs) {
    if (chrome.runtime.lastError || !prefs) prefs = defaults();
    CATEGORIES.forEach(function (c) {
      var input = $('toggle-' + c.id);
      if (input) input.checked = !!prefs[c.key];
    });
  });

  CATEGORIES.forEach(function (c) {
    var input = $('toggle-' + c.id);
    if (!input) return;
    input.addEventListener('change', function (e) {
      var patch = {};
      patch[c.key] = e.target.checked;
      chrome.storage.sync.set(patch);
    });
  });

  refreshCounts();
}

document.addEventListener('DOMContentLoaded', init);
