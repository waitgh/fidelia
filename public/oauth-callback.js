// Hands the OAuth result (query or hash) back to the app window that opened this popup.
(function () {
  var data = { type: 'fidelia-oauth', search: location.search, hash: location.hash };
  if (window.opener && window.opener.location.origin === location.origin) {
    window.opener.postMessage(data, location.origin);
    window.close();
  }
})();
