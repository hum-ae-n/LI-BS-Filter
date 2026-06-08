/*
 * LinkedIn Feed Filter — popup UI logic
 *
 * Reads/writes preferences via chrome.storage.sync and reads live session
 * counts from the service worker. Toggling a filter only writes to storage;
 * the content script reacts to storage.onChanged and re-scans. This keeps the
 * extension within the "storage" permission only (no "tabs" needed).
 */
'use strict';

var DEFAULTS = { filterPromoted: true, filterSuggested: true };

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
      $('count-promoted').textContent = String(resp.promoted | 0);
      $('count-suggested').textContent = String(resp.suggested | 0);
    });
  } catch (e) {
    // Service worker unavailable — leave the placeholder zeros.
  }
}

function init() {
  showVersion();

  chrome.storage.sync.get(DEFAULTS, function (prefs) {
    if (chrome.runtime.lastError || !prefs) prefs = DEFAULTS;
    $('toggle-promoted').checked = !!prefs.filterPromoted;
    $('toggle-suggested').checked = !!prefs.filterSuggested;
  });

  $('toggle-promoted').addEventListener('change', function (e) {
    chrome.storage.sync.set({ filterPromoted: e.target.checked });
  });
  $('toggle-suggested').addEventListener('change', function (e) {
    chrome.storage.sync.set({ filterSuggested: e.target.checked });
  });

  refreshCounts();
}

document.addEventListener('DOMContentLoaded', init);
