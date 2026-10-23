/* Optimizely Product Carousel with Product Recs v3 — Undo */
(function () {
  "use strict";

  var INSTANCE_ID = "{{ extension.$instance }}";
  var CARD_SEL    = ".m-prodCard";
  var HEADING_SEL = "h3.o-productCarouselVue__title";
  var mgr         = window.__optCarouselManager;

  function removeAttrSafe(el, name) {
    if (el && el.removeAttribute) el.removeAttribute(name);
  }

  function restoreHeading(inst) {
    if (!inst || !inst.targetCarousel) return;
    var heading = inst.targetCarousel.querySelector(HEADING_SEL);
    if (!heading) return;
    if (heading.hasAttribute("data-opt-orig-heading")) {
      heading.textContent = heading.getAttribute("data-opt-orig-heading") || "";
    }
    removeAttrSafe(heading, "data-opt-orig-heading");
    removeAttrSafe(heading, "data-opt-instance");
  }

  function cleanupCard(card) {
    if (!card) return;
    var origPid = card.getAttribute("data-opt-orig-pid");
    if (origPid) card.setAttribute("data-productid", origPid);
    removeAttrSafe(card, "data-opt-locked");
    removeAttrSafe(card, "data-opt-opid");
    removeAttrSafe(card, "data-opt-orig-pid");
    removeAttrSafe(card, "data-opt-sku");
    removeAttrSafe(card, "data-opt-id");
    removeAttrSafe(card, "data-opt-familyid");
    removeAttrSafe(card, "data-opt-instance");
  }

  function cleanupInstance(inst) {
    if (!inst) return;
    if (inst._observer) {
      try { inst._observer.disconnect(); } catch (_) {}
      inst._observer = null;
    }
    restoreHeading(inst);
    if (inst.targetCarousel) {
      var cards = inst.targetCarousel.querySelectorAll(CARD_SEL);
      for (var i = 0; i < cards.length; i++) cleanupCard(cards[i]);
      removeAttrSafe(inst.targetCarousel, "data-opt-target-" + INSTANCE_ID);
      inst.targetCarousel.setAttribute("data-opt-ready", "true");
    }
  }

  function clearPendingOpsForInstance() {
    if (!mgr || !mgr.pendingOps) return;
    var toDelete = [];
    mgr.pendingOps.forEach(function (op, opId) {
      if (op && op.instanceId === INSTANCE_ID) toDelete.push(opId);
    });
    for (var i = 0; i < toDelete.length; i++) {
      if (typeof mgr.clearOp === "function") mgr.clearOp(toDelete[i]);
      else mgr.pendingOps.delete(toDelete[i]);
    }
  }

  if (mgr && mgr.instances && mgr.instances[INSTANCE_ID]) {
    cleanupInstance(mgr.instances[INSTANCE_ID]);
    clearPendingOpsForInstance();
    delete mgr.instances[INSTANCE_ID];
  }

  // Matches the style element ID written by v3's injectAntiFlicker().
  var afStyle = document.getElementById("optv3-af-" + INSTANCE_ID);
  if (afStyle && afStyle.parentNode) afStyle.parentNode.removeChild(afStyle);

  if (mgr && mgr.instances && Object.keys(mgr.instances).length === 0) {
    delete window.__optCarouselManager;
  }
})();
