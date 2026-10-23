/*
 * Modes supported: "before", "after", "replace"
 * - before/after: just inject and track the inserted node
 * - replace: save original node details so reset can fully restore
 */
(function () {
  var utils = window.optimizely && window.optimizely.get('utils');
  if (!utils) return;

  var sel  = (extension.targetSelector || 'body').trim() || 'body';
  var mode = (extension.insertMode || extension.insertPosition || 'before').toLowerCase();
  if (['before','after','replace'].indexOf(mode) === -1) mode = 'before';

  // Per-instance store
  window.__ovw = window.__ovw || {};
  var key = String(extension.$instance);

  utils.waitForElement(sel).then(function (target) {
    if (!target) return;

    var id = 'optimizely-extension-' + extension.$instance;

    // Remove any previously injected instance
    var existing = document.getElementById(id);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    // Prepare store
    var store = window.__ovw[key] = window.__ovw[key] || {};

    try {
      if (mode === 'before') {
        target.insertAdjacentHTML('beforebegin', extension.$html);
      } else if (mode === 'after') {
        target.insertAdjacentHTML('afterend', extension.$html);
      } else {
        // REPLACE: save original so we can restore on reset
        store.parent = target.parentNode || null;
        store.nextSibling = target.nextSibling || null;
        store.originalHTML = target.outerHTML;

        // Insert our banner right before target, then remove target
        target.insertAdjacentHTML('beforebegin', extension.$html);
        if (target.parentNode) target.parentNode.removeChild(target);
      }

      // Record the inserted node for easy removal on reset
      store.inserted = document.getElementById(id) || null;

    } catch (e) {
      // Last-resort fallback to body
      (document.body || document.documentElement).insertAdjacentHTML('beforeend', extension.$html);
      window.__ovw[key].inserted = document.getElementById(id) || null;
    }
  });
})();
