/* Local reader-preference controls for the privacy page. */
(function () {
  'use strict';
  var clear = document.querySelector('[data-clear-local]');
  if (!clear) return;
  var status = document.createElement('p');
  status.className = 'form-note';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  clear.parentNode.appendChild(status);
  clear.addEventListener('click', function () {
    try {
      localStorage.removeItem('dbs_theme');
      localStorage.removeItem('dbs_red_letter');
    } catch (error) {}
    document.cookie = 'dbs_notif=;path=/;max-age=0;SameSite=Lax';
    status.textContent = 'Local theme, red-letter and notification-choice preferences were cleared. Browser notification permission and any existing Firebase token are separate and were not changed.';
  });
})();
