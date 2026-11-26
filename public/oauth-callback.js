// Hands the OAuth result (query or hash) back to the app window that opened this popup.
// The opener link is often cut when the popup passes through the provider's sign-in pages
// (Cross-Origin-Opener-Policy), so the result also goes out on a same-origin BroadcastChannel.
(function () {
  var data = { type: 'fidelia-oauth', search: location.search, hash: location.hash };
  var sent = false;
  try {
    if ('BroadcastChannel' in window) {
      var ch = new BroadcastChannel('fidelia-oauth');
      ch.postMessage(data);
      ch.close();
      sent = true;
    }
  } catch (e) { /* fall through to the opener */ }
  try {
    if (window.opener && window.opener.location.origin === location.origin) {
      window.opener.postMessage(data, location.origin);
      sent = true;
    }
  } catch (e) { /* opener gone or cross-origin */ }
  // Remove the code from this window's address bar either way.
  history.replaceState(null, '', location.pathname);
  if (sent) setTimeout(function () { window.close(); }, 300);
})();
