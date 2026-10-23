/*
 * Strip Banner v2 — targets the main content container (hybrid/app-friendly).
 *
 * v1 anchored to the top-navigation carousel (.o-topNavigationCarousel). In a
 * hybrid mobile-app webview that whole band (between the suppressed nav and the
 * main content) is hidden/collapsed, so the banner injected fine but never
 * showed. v2 defaults to #mainContent, which renders in both web and app, and
 * adds "inside" insert positions so the banner lands within that container.
 *
 * Insert positions supported:
 *   - "prepend": insert as the FIRST child INSIDE the target  (afterbegin)
 *   - "append":  insert as the LAST child INSIDE the target   (beforeend)
 *   - "before":  insert immediately BEFORE the target         (beforebegin)
 *   - "after":   insert immediately AFTER the target          (afterend)
 *   - "replace": swap the target out (original saved for reset)
 */
(function () {
  var utils = window.optimizely && window.optimizely.get('utils');
  if (!utils) return;

  var sel  = (extension.targetSelector || 'body').trim() || 'body';
  var mode = (extension.insertMode || extension.insertPosition || 'prepend').toLowerCase();

  // Map friendly mode -> insertAdjacentHTML position
  var POS = { before: 'beforebegin', after: 'afterend', prepend: 'afterbegin', append: 'beforeend' };
  if (mode !== 'replace' && !POS[mode]) mode = 'prepend';

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
      if (mode === 'replace') {
        // REPLACE: save original so we can restore on reset
        store.parent = target.parentNode || null;
        store.nextSibling = target.nextSibling || null;
        store.originalHTML = target.outerHTML;

        // Insert our banner right before target, then remove target
        target.insertAdjacentHTML('beforebegin', extension.$html);
        if (target.parentNode) target.parentNode.removeChild(target);
      } else {
        // before / after / prepend / append
        target.insertAdjacentHTML(POS[mode], extension.$html);
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
