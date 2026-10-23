/*
 * Reset behavior:
 * - Stop the MutationObserver and the width-gate listener.
 * - Remove every analytics attribute (zone, init marker, sku, name, price)
 *   this instance stamped.
 */
(function () {
  var key = String(extension.$instance);
  var store = window.__ovw && window.__ovw[key];
  if (!store) return;

  if (store.observer) store.observer.disconnect();
  if (store.mq && store.onMq) {
    if (store.mq.removeEventListener) store.mq.removeEventListener('change', store.onMq);
    else store.mq.removeListener(store.onMq);
  }

  if (store.attrs) {
    var sel = store.attrs.map(function (a) { return '[' + a + ']'; }).join(',');
    var stamped = document.querySelectorAll(sel);
    for (var i = 0; i < stamped.length; i++) {
      for (var j = 0; j < store.attrs.length; j++) stamped[i].removeAttribute(store.attrs[j]);
    }
  }

  delete window.__ovw[key];
})();
