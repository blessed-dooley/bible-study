/* Daily Bible Study notification controls.
   Records opt-in only after browser permission, Firebase registration and the
   Firestore write all succeed. Public functions are always defined so the
   reader menu and Privacy page work in every state. */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: 'AIzaSyCkxvPgrgtVOVFhE3iprkZsM9iQT_xf-do',
    authDomain: 'blessed-content-bible-study.firebaseapp.com',
    projectId: 'blessed-content-bible-study',
    storageBucket: 'blessed-content-bible-study.firebasestorage.app',
    messagingSenderId: '707607010200',
    appId: '1:707607010200:web:7f15b6b0fd3d662ab469ed',
    measurementId: 'G-BY2BM5HTX4'
  };
  var vapidKey = 'BNBrwPnK6OvDZ-QdVztthcprC77oHv2NY3tD1NKa2Fu4ls1yWbtQ_SC9DL1WhMkj0DC_YfFzHAgRJiidhiN96HI';
  var supported = 'Notification' in window &&
    'serviceWorker' in navigator && 'PushManager' in window;

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  function setCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) +
      ';path=/bible-study/;max-age=31536000;SameSite=Lax;Secure';
  }
  function notifyChange() {
    window.dispatchEvent(new Event('dbs-notification-change'));
  }
  function banner() { return document.getElementById('notifBanner'); }
  function hideBanner() {
    var node = banner();
    if (!node) return;
    node.classList.add('hidden');
    node.setAttribute('aria-hidden', 'true');
  }
  function showBanner() {
    var node = banner();
    if (!node) return;
    node.classList.remove('hidden');
    node.setAttribute('aria-hidden', 'false');
  }
  function setFailure() {
    setCookie('dbs_notif_registered', 'no');
    setCookie('dbs_notif_error', 'yes');
    notifyChange();
  }
  function messagingServices() {
    if (!window.firebase) throw new Error('Firebase is unavailable');
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    return { messaging: firebase.messaging(), db: firebase.firestore() };
  }

  function register(askPermission) {
    if (!supported) return Promise.reject(new Error('Notifications are unsupported'));
    var permission = Promise.resolve(Notification.permission);
    if (askPermission && Notification.permission === 'default') {
      permission = Notification.requestPermission();
    }
    return permission.then(function (result) {
      if (result !== 'granted') throw new Error('Notification permission was not granted');
      var services = messagingServices();
      return navigator.serviceWorker.ready.then(function (swReg) {
        return services.messaging.getToken({
          vapidKey: vapidKey,
          serviceWorkerRegistration: swReg
        });
      }).then(function (token) {
        if (!token) throw new Error('Firebase did not return a notification token');
        return services.db.collection('fcm_tokens').doc(token.substring(0, 32)).set({
          token: token,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          userAgent: navigator.userAgent.substring(0, 100)
        }, { merge: true });
      }).then(function () {
        setCookie('dbs_notif', 'yes');
        setCookie('dbs_notif_registered', 'yes');
        setCookie('dbs_notif_error', 'no');
        notifyChange();
      });
    });
  }

  window.dbsNotifOptIn = function () {
    hideBanner();
    return register(true).then(function () {
      return true;
    }).catch(function (error) {
      setFailure();
      console.log('Notification setup error:', error);
      return false;
    });
  };

  window.dbsNotifDismiss = function () {
    hideBanner();
    setCookie('dbs_notif', 'no');
    setCookie('dbs_notif_error', 'no');
    notifyChange();
    return true;
  };

  window.dbsNotifDisable = function () {
    hideBanner();
    if (!supported || Notification.permission !== 'granted') {
      setCookie('dbs_notif', 'no');
      setCookie('dbs_notif_registered', 'no');
      setCookie('dbs_notif_error', 'no');
      notifyChange();
      return Promise.resolve(true);
    }
    try {
      var services = messagingServices();
      return navigator.serviceWorker.ready.then(function (swReg) {
        return services.messaging.getToken({
          vapidKey: vapidKey,
          serviceWorkerRegistration: swReg
        });
      }).then(function (token) {
        var removeRecord = Promise.resolve();
        if (token) {
          removeRecord = services.db.collection('fcm_tokens')
            .doc(token.substring(0, 32)).delete();
        }
        return removeRecord.then(function () {
          return services.messaging.deleteToken();
        });
      }).then(function () {
        setCookie('dbs_notif', 'no');
        setCookie('dbs_notif_registered', 'no');
        setCookie('dbs_notif_error', 'no');
        notifyChange();
        return true;
      }).catch(function (error) {
        setFailure();
        console.log('Notification removal error:', error);
        return false;
      });
    } catch (error) {
      setFailure();
      console.log('Notification removal error:', error);
      return Promise.resolve(false);
    }
  };

  if (!supported || Notification.permission === 'denied' ||
      getCookie('dbs_notif') === 'no') return;
  if (Notification.permission === 'granted' &&
      getCookie('dbs_notif_registered') === 'yes') {
    register(false).catch(function (error) {
      setFailure();
      console.log('Notification refresh error:', error);
    });
    return;
  }
  window.setTimeout(showBanner, 2000);
})();
