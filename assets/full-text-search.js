/* ============================================================================
   full-text-search.js — lazily-loaded body-text search for the archive.

   Approved 2026-09-01 (option B).  Drop-in companion to archive-search.js:
   it does not replace metadata search, it extends it.

   Behaviour
     · Nothing is fetched on page load.  The archive is exactly as fast as before.
     · The index is fetched on the reader's FIRST keystroke, once, then held in
       memory and left to the service worker to cache.
     · While it is in flight, metadata results show immediately and a quiet line
       reads "Also searching study text..."  Results widen when it lands.
     · A study matches if EVERY query term appears in its metadata OR its body.
     · Ordering never changes: reverse-chronological, always.  A body match does
       not outrank a title match; it is simply included.
     · A body-only match renders a snippet with the terms highlighted, so the
       reader can see WHY it matched.
     · If the index fails to load, search silently falls back to metadata only
       and says so.  Nothing breaks.

   Integration — three edits to archive-search.js
   ---------------------------------------------------------------------------
   1. Load this file BEFORE archive-search.js:
          <script src="/bible-study/assets/full-text-search.js" defer></script>
          <script src="/bible-study/assets/archive-search.js" defer></script>

   2. In archive-search.js, inside the input handler, kick off the fetch:
          inputEl.addEventListener('input', function () {
            clearTimeout(timer);
            var v = inputEl.value;
            if (v) DBSFullText.prime(function () { render(inputEl.value); });
            timer = setTimeout(function () { render(v); }, DEBOUNCE);
          });

   3. In render(), replace the filter and add the snippet.  Where it currently
      reads:

          var rows = !filtering ? STUDIES : STUDIES.filter(function (s) {
            return terms.every(function (t) { return s.hay.indexOf(t) !== -1; });
          });

      use:

          var rows = !filtering ? STUDIES : STUDIES.filter(function (s) {
            return DBSFullText.matches(s, terms);
          });

      and when building each card, after the meta line:

          var snip = DBSFullText.snippet(s, terms);
          if (snip) html += '<span class="card-snippet">' + snip + '</span>';

      Finally, append DBSFullText.statusSuffix() to the status line text.

   Requires .card-snippet and .search-note styles — see the CSS block at the
   bottom of this file's comment, added to study-v5_0.css.
   ==========================================================================*/
(function (global) {
  'use strict';

  var INDEX_URL = 'search-index.json';   // same-origin, resolved from the archive page
  var SNIPPET_RADIUS = 90;               // characters either side of the first hit

  var state = 'idle';        // idle | loading | ready | failed
  var DOCS = null;           // { url: originalText }
  var FOLDED = null;         // { url: foldedText }  — folded once, not per search
  var waiting = [];

  function fold(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------------------------------------------------------- load -- */
  function prime(onReady) {
    if (state === 'ready' || state === 'failed') { return; }
    if (typeof onReady === 'function') { waiting.push(onReady); }
    if (state === 'loading') { return; }
    state = 'loading';

    fetch(INDEX_URL, { cache: 'force-cache' })
      .then(function (r) {
        if (!r.ok) { throw new Error('index unavailable'); }
        return r.json();
      })
      .then(function (data) {
        DOCS = (data && data.docs) || {};
        FOLDED = {};
        for (var url in DOCS) {
          if (Object.prototype.hasOwnProperty.call(DOCS, url)) {
            FOLDED[url] = fold(DOCS[url]);
          }
        }
        state = 'ready';
      })
      .catch(function () {
        state = 'failed';
        DOCS = null;
        FOLDED = null;
      })
      .then(function () {
        var q = waiting.slice();
        waiting.length = 0;
        q.forEach(function (fn) { try { fn(); } catch (e) {} });
      });
  }

  /* -------------------------------------------------------------- match --- */
  /* A study matches when every term is found in its metadata haystack OR,
     once the index is loaded, in its body text. */
  function matches(study, terms) {
    if (!terms.length) { return true; }
    var body = (state === 'ready' && FOLDED) ? FOLDED[study.file] : null;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (study.hay.indexOf(t) !== -1) { continue; }
      if (body && body.indexOf(t) !== -1) { continue; }
      return false;
    }
    return true;
  }

  /* Did this study match on metadata alone?  Used to decide whether a snippet
     adds anything — a title match needs no explanation. */
  function matchedMetadataOnly(study, terms) {
    for (var i = 0; i < terms.length; i++) {
      if (study.hay.indexOf(terms[i]) === -1) { return false; }
    }
    return true;
  }

  /* ------------------------------------------------------------ snippet --- */
  function snippet(study, terms) {
    if (state !== 'ready' || !DOCS || !terms.length) { return ''; }
    if (matchedMetadataOnly(study, terms)) { return ''; }

    var original = DOCS[study.file];
    var folded = FOLDED[study.file];
    if (!original || !folded) { return ''; }

    /* Anchor on the earliest term that actually appears in the body. */
    var at = -1;
    for (var i = 0; i < terms.length; i++) {
      var p = folded.indexOf(terms[i]);
      if (p !== -1 && (at === -1 || p < at)) { at = p; }
    }
    if (at === -1) { return ''; }

    var start = Math.max(0, at - SNIPPET_RADIUS);
    var end = Math.min(original.length, at + SNIPPET_RADIUS);

    /* Trim to word boundaries so the snippet never starts mid-word. */
    if (start > 0) {
      var sp = original.indexOf(' ', start);
      if (sp !== -1 && sp < at) { start = sp + 1; }
    }
    if (end < original.length) {
      var ep = original.lastIndexOf(' ', end);
      if (ep > at) { end = ep; }
    }

    var text = original.slice(start, end);
    var out = esc(text);
    terms.forEach(function (t) {
      if (!t) { return; }
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark class="hit">$1</mark>');
    });

    return (start > 0 ? '&hellip;' : '') + out + (end < original.length ? '&hellip;' : '');
  }

  /* -------------------------------------------------------------- status -- */
  function statusSuffix() {
    if (state === 'loading') { return ' \u00b7 also searching study text\u2026'; }
    if (state === 'failed')  { return ' \u00b7 study text unavailable, searching titles only'; }
    return '';
  }

  function isReady() { return state === 'ready'; }

  global.DBSFullText = {
    prime: prime,
    matches: matches,
    snippet: snippet,
    statusSuffix: statusSuffix,
    isReady: isReady
  };
})(window);
