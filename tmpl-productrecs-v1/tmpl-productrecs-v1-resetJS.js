(() => {
  var ATTR_INSTANCE = "data-opt-instance";
  var ATTR_ORIG_HEAD = "data-opt-orig-heading";
  var INSTANCE_ID = "{{ extension.$instance }}";

  // Remove carousel wrappers
  document.querySelectorAll("[data-opt-carousel-group='" + INSTANCE_ID + "']").forEach(function(w) {
    var s = w.querySelector("script[id^='ProductCarousel-']");
    var p = w.querySelector(".preComponentLoader");
    if (s && p && w.parentNode) {
      w.parentNode.insertBefore(s, w);
      w.parentNode.insertBefore(p, w);
      w.remove();
    }
  });

  // Remove tracking attributes
  document.querySelectorAll("[" + ATTR_INSTANCE + "='" + INSTANCE_ID + "']").forEach(function(el) {
    el.removeAttribute(ATTR_INSTANCE);
    el.removeAttribute("data-opt-sku");
    el.removeAttribute("data-opt-id");
    
    // Restore heading if present
    if (el.hasAttribute(ATTR_ORIG_HEAD)) {
      el.textContent = el.getAttribute(ATTR_ORIG_HEAD);
      el.removeAttribute(ATTR_ORIG_HEAD);
    }
  });

  // Clean up global tracker
  if (window.__optmCartTracker && window.__optmCartTracker.instances) {
    delete window.__optmCartTracker.instances[INSTANCE_ID];
  }
})();
