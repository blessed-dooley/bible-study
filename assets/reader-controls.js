/* reader-controls.js — menu, theme + red-letter switches, reading progress,
   section-jump bar.  No dependencies.  Safe to defer. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;

  /* ---------- menu ------------------------------------------------------ */
  var menuBtn = d.querySelector('[data-menu-toggle]');
  var menu = d.getElementById('reader-menu');
  if (menuBtn && menu) {
    function closeMenu(restoreFocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      if (restoreFocus) menuBtn.focus();
    }
    menuBtn.addEventListener('click', function (event) {
      var open = menu.hidden;
      menu.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      /* Pointer users keep focus on the sticky trigger. Moving focus into an
         absolutely positioned descendant makes some mobile browsers scroll
         back toward the app bar's original document position. Keyboard
         activation has event.detail === 0 and still receives menu focus. */
      if (open && event.detail === 0) {
        var f = menu.querySelector('button, a, input');
        if (f) {
          try { f.focus({ preventScroll: true }); }
          catch (error) { f.focus(); }
        }
      }
    });
    d.addEventListener('pointerdown', function (event) {
      if (!menu.hidden && !menu.contains(event.target) && !menuBtn.contains(event.target)) {
        closeMenu(false);
      }
    });
    window.addEventListener('scroll', function () { closeMenu(false); }, { passive: true });
    d.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) {
        closeMenu(true);
      }
    });
  }

  /* ---------- share ----------------------------------------------------- */
  var shareBtn = d.querySelector('[data-share]');
  var shareStatus = d.getElementById('share-status');
  function announceShare(message) {
    if (shareStatus) shareStatus.textContent = message;
  }
  function copyLink() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(window.location.href).then(function () {
        announceShare('Link copied.');
      });
    }
    return Promise.reject(new Error('Clipboard unavailable'));
  }
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var data = { title: d.title, url: window.location.href };
      var action = navigator.share ? navigator.share(data) : copyLink();
      Promise.resolve(action).then(function () {
        if (navigator.share) announceShare('Sharing options opened.');
      }).catch(function (error) {
        if (error && error.name === 'AbortError') return;
        copyLink().catch(function () {
          announceShare('Copy the page address from your browser to share this page.');
        });
      });
    });
  }

  /* ---------- theme ----------------------------------------------------- */
  /* persist === false on initial sync, so loading a page never overwrites the
     reader's stored preference with the markup default. */
  function setTheme(name, persist) {
    root.setAttribute('data-theme', name);
    var themeMeta = d.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', name === 'dark' ? '#1a1a1a' :
        (name === 'paper' ? '#e9e0cc' : '#efece5'));
    }
    if (persist !== false) { try { localStorage.setItem('dbs_theme', name); } catch (e) {} }
    d.querySelectorAll('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === name));
    });
    /* Paper and light drop the cross's width reservation (R40), so switching
       theme can change line wrapping and therefore document height. The
       reading-progress fill is derived from scrollHeight, so without this it
       stays stale until the reader's next scroll event.
       Only on a real switch: the initial call passes persist === false and
       runs before `sections`/`fill` are assigned, so calling onScroll there
       throws on sections.length. */
    if (persist !== false && typeof onScroll === 'function') onScroll();
  }
  d.querySelectorAll('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme-set')); });
  });
  setTheme(root.getAttribute('data-theme') || 'dark', false);

  /* ---------- red letter ------------------------------------------------ */
  var redBtns = [].slice.call(d.querySelectorAll('[data-toggle="red"]'));
  if (redBtns.length) {
    var syncRed = function () {
      redBtns.forEach(function (button) {
        button.setAttribute('aria-checked', String(root.getAttribute('data-red') !== 'off'));
      });
    };
    redBtns.forEach(function (button) {
      button.addEventListener('click', function () {
        var off = root.getAttribute('data-red') !== 'off';
        root.setAttribute('data-red', off ? 'off' : 'on');
        try { localStorage.setItem('dbs_red_letter', off ? 'off' : 'on'); } catch (e) {}
        syncRed();
      });
    });
    syncRed();
  }

  /* ---------- notifications ------------------------------------------- */
  var notifyBtns = [].slice.call(d.querySelectorAll('[data-toggle="notify"]'));
  var notifyActions = [].slice.call(d.querySelectorAll('[data-notif]'));
  function getCookie(name) {
    var match = d.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  function notificationState() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (getCookie('dbs_notif_error') === 'push-service') return 'push-service';
    if (getCookie('dbs_notif_error') === 'yes') return 'failed';
    if (Notification.permission === 'granted' && getCookie('dbs_notif_registered') === 'yes') return 'on';
    return 'off';
  }
  function syncNotifications() {
    var state = notificationState();
    notifyBtns.forEach(function (button) {
      var canToggle = state === 'on' || state === 'off' || state === 'failed' || state === 'push-service';
      var label = button.children.length ? button.children[0] : null;
      var visibleLabel = state === 'denied' ? 'Morning reminder · browser blocked' :
        (state === 'unsupported' ? 'Morning reminder · unavailable' :
        (state === 'push-service' ? 'Morning reminder · enable browser push' :
        (state === 'failed' ? 'Morning reminder · retry setup' : 'Morning reminder')));
      if (label) label.textContent = visibleLabel;
      button.setAttribute('role', canToggle ? 'switch' : 'button');
      if (canToggle) button.setAttribute('aria-checked', String(state === 'on'));
      else button.removeAttribute('aria-checked');
      button.removeAttribute('aria-disabled');
      button.removeAttribute('aria-busy');
      button.setAttribute('data-notification-state', state);
      button.setAttribute('aria-label', state === 'on' ? 'Morning reminder, on' :
        (state === 'push-service' ? 'Morning reminder needs browser push messaging; enable it in browser privacy settings, then retry' :
        (state === 'failed' ? 'Morning reminder setup failed; activate to retry' :
        (state === 'denied' ? 'Morning reminder blocked for this site; allow notifications in the site controls beside the address bar, then reload' :
        (state === 'unsupported' ? 'Morning reminder unavailable in this browser' :
        'Morning reminder, off')))));
      var noteId = 'notification-menu-note';
      var note = button.parentNode ? button.parentNode.querySelector('#' + noteId) : null;
      var noteText = state === 'denied' ?
        'This site is blocked. Use the site controls beside the address bar to allow notifications, then reload.' :
        (state === 'push-service' ?
        ((navigator.brave ? 'In Brave, turn on Settings → Privacy and security → Use Google services for push messaging, then reload and retry.' :
        'Turn on push messaging in your browser’s privacy settings, then reload and retry.')) :
        (state === 'unsupported' ? 'Website notifications are unavailable in this browser.' : ''));
      if (noteText && button.parentNode) {
        if (!note) {
          note = d.createElement('p');
          note.id = noteId;
          note.className = 'menu-notification-note';
          note.setAttribute('role', 'status');
          button.insertAdjacentElement('afterend', note);
        }
        note.textContent = noteText;
        button.setAttribute('aria-describedby', noteId);
      } else {
        button.removeAttribute('aria-describedby');
        if (note) note.remove();
      }
    });
    var status = d.getElementById('notification-status');
    var card = d.querySelector('.notif-card');
    var message = state === 'denied' ?
      'Notifications are blocked in this browser. Open the site permissions beside the address bar, allow Notifications, then reload this page.' :
      (state === 'unsupported' ?
      'This browser does not offer website notifications. You can use another current browser or install the site as an app on a supported device.' :
      (state === 'push-service' ?
      ((navigator.brave ? 'Brave allows notifications for this site, but its push service is off. Turn on Settings → Privacy and security → Use Google services for push messaging, reload, then try again.' :
      'Your browser allows notifications, but its push service did not register. Turn on push messaging in browser privacy settings, reload, then try again.')) :
      (state === 'failed' ?
      'Notification setup did not finish. Check this site’s browser permission and connection, then try again.' :
      (state === 'on' ? 'Morning reminders are on for this browser.' : ''))));
    if (card && message) {
      if (!status) {
        status = d.createElement('p');
        status.id = 'notification-status';
        status.className = 'form-note';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        card.appendChild(status);
      }
      status.textContent = message;
    } else if (status) {
      status.textContent = '';
    }
  }
  function setNotificationBusy(busy) {
    notifyBtns.forEach(function (button) {
      if (busy) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    });
  }
  function openNotificationHelp() { window.location.href = '/bible-study/privacy.html#notifications'; }
  function enableNotifications() {
    if (typeof window.dbsNotifOptIn !== 'function') { openNotificationHelp(); return Promise.resolve(false); }
    setNotificationBusy(true);
    return Promise.resolve(window.dbsNotifOptIn()).then(function (enabled) {
      syncNotifications();
      return enabled;
    });
  }
  function disableNotifications() {
    if (typeof window.dbsNotifDisable !== 'function') { openNotificationHelp(); return Promise.resolve(false); }
    setNotificationBusy(true);
    return Promise.resolve(window.dbsNotifDisable()).then(function (disabled) {
      syncNotifications();
      return disabled;
    });
  }
  notifyBtns.forEach(function (button) {
    button.addEventListener('click', function () {
      var state = notificationState();
      if (state === 'unsupported' || state === 'denied') { syncNotifications(); return; }
      if (state === 'on') {
        disableNotifications();
        return;
      }
      enableNotifications();
    });
  });
  notifyActions.forEach(function (button) {
    button.addEventListener('click', function () {
      var action = button.getAttribute('data-notif');
      var state = notificationState();
      if (action === 'enable' && (state === 'denied' || state === 'unsupported')) {
        syncNotifications();
        return;
      }
      if (action === 'enable') { enableNotifications(); return; }
      if (action === 'dismiss' && typeof window.dbsNotifDismiss === 'function') {
        window.dbsNotifDismiss();
        syncNotifications();
        return;
      }
      if (action === 'disable') { disableNotifications(); return; }
    });
  });
  window.addEventListener('dbs-notification-change', syncNotifications);
  window.addEventListener('focus', syncNotifications);
  syncNotifications();

  /* ---------- reading progress ----------------------------------------- */
  var fill = d.querySelector('.progress-fill');
  var sections = [].slice.call(d.querySelectorAll('.study-body .section[id]'));
  var current = d.querySelector('.jumpbar-current');
  var chips = [].slice.call(d.querySelectorAll('.chip[data-jump]'));

  function onScroll() {
    if (fill) {
      var max = d.documentElement.scrollHeight - window.innerHeight;
      fill.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + '%';
    }
    var activeId = null;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= 140) activeId = sections[i].id;
    }
    chips.forEach(function (c) {
      c.setAttribute('aria-current', String(c.getAttribute('data-jump') === activeId));
    });
    if (current && activeId) {
      var lbl = d.getElementById(activeId).querySelector('.section-label');
      if (lbl) current.textContent = lbl.textContent.trim();
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- section jump --------------------------------------------- */
  var jumpToggle = d.querySelector('[data-toggle="jumplist"]');
  var jumplist = d.getElementById('jumplist');
  if (jumpToggle && jumplist) {
    jumpToggle.addEventListener('click', function () {
      var open = jumplist.hidden;
      jumplist.hidden = !open;
      jumpToggle.setAttribute('aria-expanded', String(open));
    });
  }
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      var el = d.getElementById(c.getAttribute('data-jump'));
      if (!el) return;
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      /* v5.0.1 — COLLAPSE FIRST, THEN MEASURE. The panel sits above the
         target in document flow, so closing it after computing y shifted the
         section up by the panel's own height and the reader landed short by
         exactly that much (~150px as chips, ~458px as rows). Reading
         getBoundingClientRect after setting hidden forces a synchronous
         reflow, so the measurement reflects the collapsed layout.
         Same collapse behaviour at every width, per Drew. */
      if (jumplist) {
        jumplist.hidden = true;
        if (jumpToggle) jumpToggle.setAttribute('aria-expanded', 'false');
      }

      var y = el.getBoundingClientRect().top + window.scrollY -
              parseInt(getComputedStyle(root).getPropertyValue('--scroll-offset'), 10);
      window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    });
  });
})();
