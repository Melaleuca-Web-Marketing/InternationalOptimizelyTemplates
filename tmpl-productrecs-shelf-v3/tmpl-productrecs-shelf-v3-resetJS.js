/* Optimizely Shelf Product Carousel with Product Recs v3 — Undo */
(function () {
  "use strict";

  var INSTANCE_ID = "{{ extension.$instance }}";
  var CARD_SEL = ".m-prodCard";
  var HEADING_SEL = "h3.o-productCarouselVue__title";

  var mgr = window.__optShelfManager;

  if (mgr && mgr.instances && mgr.instances[INSTANCE_ID]) {
    var inst = mgr.instances[INSTANCE_ID];

    // 1. Disconnect re-render observer
    if (inst._reRenderObserver) {
      inst._reRenderObserver.disconnect();
      inst._reRenderObserver = null;
    }

    // 2. Restore heading and cards if shelf is currently open
    if (inst.shelfCarousel) {
      var heading = inst.shelfCarousel.querySelector(HEADING_SEL);
      if (heading && heading.hasAttribute("data-opt-orig-heading")) {
        heading.textContent = heading.getAttribute("data-opt-orig-heading");
        heading.removeAttribute("data-opt-orig-heading");
        heading.removeAttribute("data-opt-instance");
      }

      // 3. Restore each swapped card
      var cards = inst.shelfCarousel.querySelectorAll(CARD_SEL);
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var origPid = card.getAttribute("data-opt-orig-pid");
        if (origPid) card.setAttribute("data-productid", origPid);

        card.removeAttribute("data-opt-locked");
        card.removeAttribute("data-opt-opid");
        card.removeAttribute("data-opt-orig-pid");
        card.removeAttribute("data-opt-sku");
        card.removeAttribute("data-opt-id");
        card.removeAttribute("data-opt-familyid");
        card.removeAttribute("data-opt-instance");
        card.removeAttribute("data-opt-href");
      }

      // 4. Remove target marker and reveal carousel
      inst.shelfCarousel.removeAttribute("data-opt-target-" + INSTANCE_ID);
      inst.shelfCarousel.setAttribute("data-opt-ready", "true");
    }

    // 5. Clear any pending operations for this instance
    if (mgr.pendingOps) {
      var toDelete = [];
      mgr.pendingOps.forEach(function (op, opId) {
        if (op.instanceId === INSTANCE_ID) toDelete.push(opId);
      });
      toDelete.forEach(function (opId) { mgr.clearOp(opId); });
    }

    // 6. Deregister instance
    delete mgr.instances[INSTANCE_ID];
  }

  // 7. Remove anti-flicker style for this instance
  var afStyle = document.getElementById("optshelf-af-" + INSTANCE_ID);
  if (afStyle) afStyle.remove();

  // 8. Tear down global manager if no instances remain
  if (mgr && mgr.instances && Object.keys(mgr.instances).length === 0) {
    if (mgr._shelfWatcher) {
      mgr._shelfWatcher.disconnect();
      mgr._shelfWatcher = null;
    }
    delete window.__optShelfManager;
  }
})();
