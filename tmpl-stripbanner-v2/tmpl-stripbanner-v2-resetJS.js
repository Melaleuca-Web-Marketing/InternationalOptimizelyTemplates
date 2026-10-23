/*
 * Reset behavior:
 * - Always remove the injected node if present.
 * - If we previously REPLACED, restore the original node from saved HTML.
 */
(function () {
  var key = String(extension.$instance);
  var store = window.__ovw && window.__ovw[key];
  if (!store) return;

  // 1) Remove injected content
  if (store.inserted && store.inserted.parentNode) {
    store.inserted.parentNode.removeChild(store.inserted);
  }

  // 2) If we replaced something, restore it
  if (store.parent && store.originalHTML) {
    var t = document.createElement('template');
    t.innerHTML = store.originalHTML.trim();
    var originalNode = t.content.firstElementChild;
    if (originalNode) {
      if (store.nextSibling && store.nextSibling.parentNode === store.parent) {
        store.parent.insertBefore(originalNode, store.nextSibling);
      } else {
        store.parent.appendChild(originalNode);
      }
    }
  }

  // 3) Cleanup
  delete window.__ovw[key];
})();
