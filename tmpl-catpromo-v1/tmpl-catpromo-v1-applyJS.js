/*
 * Category Promo v1 — product-card analytics attributes.
 *
 * No markup is injected (the html part is intentionally empty). The CSS part
 * supplies the 2-column mobile grid. This script stamps an analytics attribute
 * (default "data-cat-promo") onto each product card and its interactive zones:
 *
 *   article.m-prodCard                      -> "card"
 *   .m-prodCard__tag                        -> "stamp"
 *   .m-prodCard__media                      -> "image"
 *   .m-prodCard__title                      -> "title"
 *   .m-prodCard__shop                       -> "shop-options"
 *   .melaleuca-card-btn.-details            -> "details"
 *   .m-prodCard__save                       -> "save"
 *   .-shelfToggle button                    -> "select"
 *
 * Optional zones (stamp, shop-options, save) are only stamped when present.
 *
 * The card element also gets product data in companion attributes:
 *
 *   <attr>-sku    product ID, from the dataLayer "impressions" event
 *                 (matched to the card by product name; blank if not found)
 *   <attr>-name   product name, from the card title
 *   <attr>-price  member price as a plain number (e.g. "17.99"), from the card
 *
 * Data that is not available yet (e.g. the impressions event has not been
 * pushed, or the price has not rendered) is filled in on a later pass.
 * A MutationObserver re-stamps cards added later (Load More, filter, sort).
 * Reset removes the observer and every attribute this script added.
 */
(function () {
  var utils = window.optimizely && window.optimizely.get('utils');
  if (!utils) return;

  var gridSel = (extension.gridSelector || '.p-catListing__grid').trim() || '.p-catListing__grid';
  var attr    = (extension.attributeName || 'data-cat-promo').trim() || 'data-cat-promo';
  var marker  = attr + '-init';
  var skuAttr   = attr + '-sku';
  var nameAttr  = attr + '-name';
  var priceAttr = attr + '-price';
  var ALL_ATTRS = [attr, marker, skuAttr, nameAttr, priceAttr];

  var ZONES = {
    '.m-prodCard__tag':             'stamp',
    '.m-prodCard__media':           'image',
    '.m-prodCard__title':           'title',
    '.m-prodCard__shop':            'shop-options',
    '.melaleuca-card-btn.-details': 'details',
    '.m-prodCard__save':            'save',
    '.-shelfToggle button':         'select'
  };

  // Per-instance store (shared with reset)
  window.__ovw = window.__ovw || {};
  var key = String(extension.$instance);
  var store = window.__ovw[key] = window.__ovw[key] || {};

  // Clean up a previous run of this instance
  if (store.observer) store.observer.disconnect();
  if (store.mq && store.onMq) {
    if (store.mq.removeEventListener) store.mq.removeEventListener('change', store.onMq);
    else store.mq.removeListener(store.onMq);
  }

  // Optional width gate: only stamp at or below maxWidth px (blank = always)
  var maxW = parseInt(extension.maxWidth, 10);
  var mq = maxW > 0 && window.matchMedia ? window.matchMedia('(max-width: ' + maxW + 'px)') : null;
  function active() { return !mq || mq.matches; }

  function unstamp() {
    var sel = ALL_ATTRS.map(function (a) { return '[' + a + ']'; }).join(',');
    var stamped = document.querySelectorAll(sel);
    for (var i = 0; i < stamped.length; i++) {
      for (var j = 0; j < ALL_ATTRS.length; j++) stamped[i].removeAttribute(ALL_ATTRS[j]);
    }
  }

  // name -> id, built from every dataLayer "impressions" event pushed so far
  function buildSkuMap() {
    var map = {};
    var dl = window.dataLayer || [];
    for (var i = 0; i < dl.length; i++) {
      var list = dl[i] && dl[i].ecommerce && dl[i].ecommerce.impressions;
      if (!list || !list.length) continue;
      for (var j = 0; j < list.length; j++) {
        var p = list[j];
        if (p && p.name && p.id !== undefined && p.id !== '' && !(p.name in map)) map[p.name] = String(p.id);
      }
    }
    return map;
  }

  function text(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

  // "$1,017.99" -> "1017.99"
  function parsePrice(s) {
    var m = (s || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
    return m ? m[0] : '';
  }

  // Fill in any product data this card is still missing
  function fillData(card, skuMap) {
    var name = card.getAttribute(nameAttr);
    if (!name) {
      name = text(card.querySelector('.m-prodCard__title'));
      if (name) card.setAttribute(nameAttr, name);
    }
    if (!card.getAttribute(priceAttr)) {
      var price = parsePrice(text(card.querySelector('[data-testid^="span-productCardMemberPrice"]')));
      if (price) card.setAttribute(priceAttr, price);
    }
    if (!card.getAttribute(skuAttr) && name && skuMap[name]) {
      card.setAttribute(skuAttr, skuMap[name]);
    }
  }

  function stamp(root) {
    var skuMap = buildSkuMap();
    var cards = root.querySelectorAll('.m-prodCard');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!card.hasAttribute(marker)) {
        card.setAttribute(marker, '');
        card.setAttribute(attr, 'card');
        for (var sel in ZONES) {
          if (!Object.prototype.hasOwnProperty.call(ZONES, sel)) continue;
          var el = card.querySelector(sel);
          if (el) el.setAttribute(attr, ZONES[sel]);
        }
      }
      fillData(card, skuMap);
    }
  }

  utils.waitForElement(gridSel).then(function (grid) {
    if (!grid) return;

    if (active()) stamp(grid);

    // Observe a stable ancestor so a full grid replacement (filter/sort) is also caught
    var watchRoot = document.getElementById('mainContent') || document.body;
    store.attrs = ALL_ATTRS;
    store.observer = new MutationObserver(function () {
      if (!active()) return;
      var current = document.querySelector(gridSel);
      if (current) stamp(current);
    });
    store.observer.observe(watchRoot, { childList: true, subtree: true });

    // Crossing the breakpoint (resize / rotate) adds or removes the attributes
    if (mq) {
      store.mq = mq;
      store.onMq = function () {
        if (active()) {
          var current = document.querySelector(gridSel);
          if (current) stamp(current);
        } else {
          unstamp();
        }
      };
      if (mq.addEventListener) mq.addEventListener('change', store.onMq);
      else mq.addListener(store.onMq);
    }
  });
})();
