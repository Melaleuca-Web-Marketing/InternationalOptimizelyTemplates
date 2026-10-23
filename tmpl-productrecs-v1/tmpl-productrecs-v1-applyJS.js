/* Enhanced Product Carousel with Product Recs - Production Version */
(function () {
  "use strict";

  // ======= CONSTANTS / SELECTORS =======
  var CARD_SELECTOR = ".m-prodCard";
  var HEADING_SELECTOR = "h3.o-productCarouselVue__title";
  var ATTR_ORIG_HTML = "data-opt-orig-html";
  var ATTR_ORIG_HEAD = "data-opt-orig-heading";
  var ATTR_INSTANCE = "data-opt-instance";

  // ======= INSTANCE ID =======
  var INSTANCE_ID;
  if (typeof extension !== "undefined" && extension.$instance) {
    INSTANCE_ID = extension.$instance;
  } else if (
    typeof window.extension !== "undefined" &&
    window.extension.$instance
  ) {
    INSTANCE_ID = window.extension.$instance;
  } else {
    if (!window.__optmInstanceCounter) window.__optmInstanceCounter = 0;
    INSTANCE_ID =
      "inst-" +
      ++window.__optmInstanceCounter +
      "-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2);
  }

  // ======= CONFIGURATION =======
  function getConfig(name, fallback) {
    if (
      typeof extension !== "undefined" &&
      extension &&
      extension[name] !== undefined
    ) {
      return extension[name];
    } else if (
      typeof window.extension !== "undefined" &&
      window.extension &&
      window.extension[name] !== undefined
    ) {
      return window.extension[name];
    } else if (typeof window[name] !== "undefined") {
      return window[name];
    }
    return fallback;
  }

  var CAROUSEL_SELECTOR = String(getConfig("carousel_selector", "")).trim();
  var TARGET_HEADING = String(getConfig("target_heading", "")).trim();
  var OTHER_TARGET_HEADING = String(
    getConfig("other_target_heading", "")
  ).trim();
  var POSITION_NAME = String(
    getConfig("recs_position_name", "homeWidget")
  ).trim();
  var REPLACE_COUNT = parseInt(getConfig("replace_count", "8"), 10);
  var POSITION_TARGET = String(getConfig("position_target", "")).trim();
  var POSITION_TYPE = String(getConfig("position_type", "none")).trim();

  // ======= IMMEDIATE CSS INJECTION (Anti-Flicker) =======
  (function injectAntiFlickerCSS() {
    if (!CAROUSEL_SELECTOR) return;

    var styleId = "optm-antiflicker-" + INSTANCE_ID;
    if (document.getElementById(styleId)) return;

    var style = document.createElement("style");
    style.id = styleId;
    style.textContent =
      CAROUSEL_SELECTOR +
      " { opacity: 0 !important; visibility: hidden !important; }\n" +
      CAROUSEL_SELECTOR +
      '[data-opt-ready="true"] { opacity: 1 !important; visibility: visible !important; transition: opacity 0.3s ease-in; }';

    var head = document.head || document.getElementsByTagName("head")[0];
    if (head) {
      if (head.firstChild) {
        head.insertBefore(style, head.firstChild);
      } else {
        head.appendChild(style);
      }
    }
  })();

  // ======= STATE MANAGEMENT =======
  var _state = {
    carouselReady: false,
    recsDataReady: false,
    productsApplied: false,
    targetCarousel: null,
    carouselSearchComplete: false,
    recsData: null,
    fallbackTimerFired: false,
  };

  // ======= DYNAMIC CULTURE DETECTION =======
  function getCurrentCulture() {
    var htmlLang = (document.documentElement.lang || "").toLowerCase();
    var hostname = window.location.hostname.toLowerCase();

    // Check for explicit es-mx first
    if (htmlLang.indexOf("es-mx") === 0 || htmlLang.indexOf("es_mx") === 0) {
      return "esmx";
    }

    // For generic "es" lang, check domain to distinguish Mexico vs US
    if (htmlLang === "es") {
      if (hostname.indexOf(".mx") > -1 || hostname.indexOf("mx.") > -1 || hostname.indexOf("-mx") > -1 || hostname.indexOf("uatmx") > -1) {
        return "esmx";
      }
      return "esus";
    }

    // Explicit es-us
    if (htmlLang.indexOf("es-us") === 0 || htmlLang.indexOf("es_us") === 0) {
      return "esus";
    }

    if (
      htmlLang.indexOf("fr-ca") === 0 ||
      htmlLang.indexOf("fr_ca") === 0 ||
      htmlLang === "fr"
    ) {
      return "frca";
    }

    if (htmlLang.indexOf("en-ca") === 0 || htmlLang.indexOf("en_ca") === 0) {
      return "enca";
    }
    if (htmlLang.indexOf("en-us") === 0 || htmlLang.indexOf("en_us") === 0) {
      return "enus";
    }

    if (htmlLang === "en") {
      var hostname = window.location.hostname.toLowerCase();
      if (hostname.indexOf(".mx") > -1) {
        return "esmx";
      }
      if (hostname.indexOf(".ca") > -1) {
        return "enca";
      }

      var path = window.location.pathname.toLowerCase();
      if (
        path.indexOf("/ca/") > -1 ||
        path.indexOf("/en-ca/") > -1 ||
        path.indexOf("/enca/") > -1
      ) {
        return "enca";
      }

      try {
        if (window.dataLayer && window.dataLayer.uiCulture) {
          var uiCulture = String(window.dataLayer.uiCulture).toLowerCase();
          if (
            uiCulture.indexOf("en-ca") === 0 ||
            uiCulture.indexOf("fr-ca") === 0
          ) {
            return "enca";
          }
          if (uiCulture.indexOf("en-us") === 0) {
            return "enus";
          }
        }
      } catch (e) {}

      try {
        var envEl = document.getElementById("environment-variables");
        if (envEl && envEl.innerHTML) {
          var env = JSON.parse(envEl.innerHTML);
          var currencyCode = String(env.CurrencyCode || "").toUpperCase();
          if (currencyCode === "CAD") {
            return "enca";
          }
          if (currencyCode === "USD") {
            return "enus";
          }
        }
      } catch (e) {}

      try {
        if (window.customerData) {
          var customerCulture = String(
            window.customerData.culture || window.customerData.country || ""
          ).toLowerCase();

          if (
            customerCulture.indexOf("ca") > -1 ||
            customerCulture.indexOf("canada") > -1
          ) {
            return "enca";
          }
          if (
            customerCulture.indexOf("us") > -1 ||
            customerCulture.indexOf("usa") > -1
          ) {
            return "enus";
          }
        }
      } catch (e) {}

      return "enus";
    }

    var path = window.location.pathname.toLowerCase();
    if (path.indexOf("/es-us/") > -1 || path.indexOf("/esus/") > -1)
      return "esus";
    if (path.indexOf("/es-mx/") > -1 || path.indexOf("/esmx/") > -1)
      return "esmx";
    if (path.indexOf("/es/") > -1) return "esus";
    if (path.indexOf("/en-ca/") > -1 || path.indexOf("/enca/") > -1)
      return "enca";
    if (path.indexOf("/fr-ca/") > -1 || path.indexOf("/frca/") > -1)
      return "frca";
    if (path.indexOf("/en-us/") > -1 || path.indexOf("/enus/") > -1)
      return "enus";
    if (path.indexOf("/en/") > -1) return "enus";

    return "enus";
  }

  function getTargetHeadingForCulture() {
    var culture = getCurrentCulture();

    if (culture === "enus" || culture === "enca") {
      return TARGET_HEADING;
    }

    if (culture === "esus" || culture === "frca" || culture === "esmx") {
      if (OTHER_TARGET_HEADING) {
        return OTHER_TARGET_HEADING;
      } else {
        return TARGET_HEADING;
      }
    }

    return TARGET_HEADING;
  }

  function getStampText(culture) {
    var translations = {
      enus: "SAVINGS PACK",
      esus: "CONJUNTO DE AHORROS",
      esmx: "CONJUNTO DE AHORROS",
      enca: "SAVINGS PACK",
      frca: "ENSEMBLE D'ÉCONOMIES",
    };
    return translations[culture] || "SAVINGS PACK";
  }

  // ======= VALIDATION =======
  function validateConfig() {
    if (!CAROUSEL_SELECTOR) {
      return false;
    }

    var allCarousels = document.querySelectorAll(CAROUSEL_SELECTOR);
    if (allCarousels.length === 0) {
      return false;
    }

    return true;
  }

  // ======= CAROUSEL TARGETING =======
  function findAndCacheTargetCarousel() {
    if (_state.carouselSearchComplete) {
      return _state.targetCarousel;
    }

    var allCarousels = document.querySelectorAll(CAROUSEL_SELECTOR);

    if (allCarousels.length === 0) {
      return null;
    }

    var targetCarousel = null;
    var actualTargetHeading = getTargetHeadingForCulture();
    var hasTargetHeading = TARGET_HEADING || OTHER_TARGET_HEADING;

    if (hasTargetHeading) {
      var targetHeadingLower = actualTargetHeading.toLowerCase();

      for (var i = 0; i < allCarousels.length; i++) {
        var heading = allCarousels[i].querySelector(HEADING_SELECTOR);
        if (heading) {
          var headingText = heading.textContent.trim();
          var headingTextLower = headingText.toLowerCase();

          if (headingTextLower.indexOf(targetHeadingLower) > -1) {
            targetCarousel = allCarousels[i];
            break;
          }
        }
      }

      if (!targetCarousel) {
        return null;
      }
    } else {
      targetCarousel = allCarousels[0];
    }

    for (var j = 0; j < allCarousels.length; j++) {
      if (allCarousels[j] !== targetCarousel) {
        allCarousels[j].setAttribute("data-opt-ready", "true");
      }
    }

    _state.targetCarousel = targetCarousel;
    _state.carouselSearchComplete = true;
    targetCarousel.setAttribute("data-opt-target-" + INSTANCE_ID, "true");

    return targetCarousel;
  }

  function getTargetCarousel() {
    return _state.targetCarousel;
  }

  function cards() {
    var carousel = getTargetCarousel();
    return carousel
      ? Array.prototype.slice.call(carousel.querySelectorAll(CARD_SELECTOR))
      : [];
  }

  // ======= CAROUSEL POSITIONING =======
  function positionCarousel() {
    if (!POSITION_TARGET || POSITION_TYPE === "none") {
      return true;
    }

    var carousel = getTargetCarousel();
    var target = document.querySelector(POSITION_TARGET);

    if (!carousel || !target) {
      return false;
    }

    var preComponentLoader = carousel.closest(".preComponentLoader");
    var carouselScript = null;
    var isValidScript = false;

    if (preComponentLoader && preComponentLoader.previousElementSibling) {
      carouselScript = preComponentLoader.previousElementSibling;
      isValidScript =
        carouselScript.tagName === "SCRIPT" &&
        carouselScript.id &&
        carouselScript.id.indexOf("ProductCarousel-") === 0;
    }

    var elementToMove;

    if (isValidScript && carouselScript.parentNode) {
      elementToMove = carouselScript.parentNode;
    } else {
      elementToMove = carousel;
    }

    try {
      if (POSITION_TYPE === "before") {
        target.parentNode.insertBefore(elementToMove, target);
      } else if (POSITION_TYPE === "after") {
        target.parentNode.insertBefore(
          elementToMove,
          target.nextSibling || null
        );
      } else if (POSITION_TYPE === "replace") {
        target.parentNode.replaceChild(elementToMove, target);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // ======= UTILS =======
  function abs(href) {
    try {
      return href ? new URL(href, location.origin).toString() : "";
    } catch (_) {
      return href || "";
    }
  }

  function normText(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function num(v) {
    if (v == null) return null;
    var n = Number(String(v).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? null : n;
  }

  // ======= PRODUCT FEED =======
  var FEEDN = [];
  var byTitle = Object.create(null);

  function rebuildLookups() {
    byTitle = Object.create(null);
    FEEDN.forEach(function (p) {
      if (p && p.title) byTitle[normText(p.title)] = p;
    });
  }

  // ======= PRODUCT RECS NORMALIZATION =======
  function formatPrice(amount, culture) {
    if (amount === null || amount === undefined) return null;

    if (culture === "frca") {
      return amount.toFixed(2).replace(".", ",") + " $";
    } else {
      return "$" + amount.toFixed(2);
    }
  }

  function normRecsProduct(p, culture) {
    if (!p) return null;

    var a = (p && p.attributes) || {};

    var priceCurrency;
    var attrSuffix;

    if (culture === "enus" || culture === "esus") {
      priceCurrency = "USD";
      attrSuffix = "_us";
    } else if (culture === "enca" || culture === "frca") {
      priceCurrency = "CAD";
      attrSuffix = "_ca";
    } else if (culture === "esmx") {
      priceCurrency = "MXN";
      attrSuffix = "_mx";
    } else {
      priceCurrency = "USD";
      attrSuffix = "_us";
    }

    var prices = (p && p.prices && p.prices[priceCurrency]) || {};
    var apiSalePrice = prices.salePrice;
    var apiUnitPrice = prices.unitPrice;

    var attrPreferredPrice = num(a["preferredprice" + attrSuffix]);
    var attrRegularPrice = num(a["regularprice" + attrSuffix]);

    var salePrice =
      apiSalePrice !== null && apiSalePrice !== undefined
        ? apiSalePrice
        : attrPreferredPrice;
    var unitPrice =
      apiUnitPrice !== null && apiUnitPrice !== undefined
        ? apiUnitPrice
        : attrRegularPrice;

    var priceStr = "";
    if (salePrice !== null && unitPrice !== null && salePrice < unitPrice) {
      var salePriceFormatted = formatPrice(salePrice, culture);
      var unitPriceFormatted = formatPrice(unitPrice, culture);

      if (culture === "frca") {
        priceStr = salePriceFormatted + " (était " + unitPriceFormatted + ")";
      } else {
        priceStr = salePriceFormatted + " (was " + unitPriceFormatted + ")";
      }
    } else if (unitPrice !== null) {
      priceStr = formatPrice(unitPrice, culture);
    } else if (salePrice !== null) {
      priceStr = formatPrice(salePrice, culture);
    }

    var hasPack = false;
    var hasPackSavingsValue = a["haspacksavings" + attrSuffix];
    if (hasPackSavingsValue !== null && hasPackSavingsValue !== undefined) {
      if (hasPackSavingsValue === true || hasPackSavingsValue === 1) {
        hasPack = true;
      } else if (typeof hasPackSavingsValue === "string") {
        var v = hasPackSavingsValue.toLowerCase();
        hasPack = v === "true" || v === "yes" || v === "1";
      }
    }

    var familyId = String(a["familyid" + attrSuffix] || "").trim();

    var imageAltText = a["imagealttext_" + culture];
    var title = p.title || imageAltText || "Untitled Product";

    var href = "#";
    if (a.pdplink || a.PdpLink || a.pdpLink) {
      href = abs(a.pdplink || a.PdpLink || a.pdpLink);
    } else if (p.url) {
      href = abs(p.url);
    }
    var img = p.img || "";

    var pointsValue = a["points" + attrSuffix] || "";

    var pointsStr = "";
    if (pointsValue) {
      var pointsNum = parseFloat(pointsValue);
      if (!isNaN(pointsNum)) {
        var pointsLabel = "";

        if (pointsNum === 1) {
          if (culture === "esus" || culture === "esmx") {
            pointsLabel = "punto";
          } else if (culture === "frca") {
            pointsLabel = "Point";
          }
        } else {
          if (culture === "esus" || culture === "esmx") {
            pointsLabel = "puntos";
          }
        }

        pointsStr = pointsNum.toString() + " " + pointsLabel;
      }
    }

    return {
      id: String((p.id != null ? p.id : p.refCode) || "").trim(),
      sku: String(p.refCode || "").trim(),
      familyId: familyId,
      title: title,
      price: priceStr,
      points: pointsStr,
      img: img,
      href: href,
      HasPackSavings: hasPack,
      culture: culture,
    };
  }

  // ======= DOM MUTATORS =======
  function setIds(card, p) {
    if (!p || !p.id) return;
    card.setAttribute("data-productid", p.id);
    if (p.sku) card.setAttribute("data-sku", p.sku);

    card
      .querySelectorAll(
        "[data-productid],[data-product-id],[data-productId],[data-gtm-product-id]," +
          "[data-sku],[data-sku-id]," +
          "input[name='productid'],input[name='productId'],input[name='sku'],input[name='skuId']"
      )
      .forEach(function (el) {
        if (el.tagName === "INPUT") {
          var n = (el.name || "").toLowerCase();
          if (n.indexOf("sku") > -1 && p.sku) {
            el.value = p.sku;
          }
        } else {
          if (el.hasAttribute("data-productid"))
            el.setAttribute("data-productid", p.id);
          if (el.hasAttribute("data-product-id"))
            el.setAttribute("data-product-id", p.id);
          if (el.hasAttribute("data-productId"))
            el.setAttribute("data-productId", p.id);
          if (el.hasAttribute("data-gtm-product-id"))
            el.setAttribute("data-gtm-product-id", p.id);
          if (p.sku) {
            if (el.hasAttribute("data-sku")) el.setAttribute("data-sku", p.sku);
            if (el.hasAttribute("data-sku-id"))
              el.setAttribute("data-sku-id", p.sku);
          }
        }
      });
  }

  function ensurePackStamp(card, p) {
    if (!card) return;

    var hasPack =
      p &&
      (p.HasPackSavings === true ||
        p.HasPackSavings === 1 ||
        (typeof p.HasPackSavings === "string" &&
          /^(true|1|yes)$/i.test(p.HasPackSavings)));

    var header = card.querySelector(".m-prodCard__header");
    if (!header) return;

    var host = header.querySelector(".m-prodCard__tag");

    if (!host) {
      host = document.createElement("div");
      host.className = "m-prodCard__tag";

      if (header.firstChild) {
        header.insertBefore(host, header.firstChild);
      } else {
        header.appendChild(host);
      }
    }

    host.querySelectorAll(".a-stamp").forEach(function (el, idx) {
      if (idx > 0) el.remove();
    });

    var existing = host.querySelector(".a-stamp");

    if (!hasPack) {
      if (existing) existing.remove();
      if (host.children.length === 0) {
        host.remove();
      }
      return;
    }

    var culture = p.culture || getCurrentCulture();
    var stampText = getStampText(culture);
    var style = "-grayOutlined";

    if (!existing) {
      var outer = document.createElement("div");
      var em = document.createElement("em");
      em.className = "a-stamp " + style;
      em.textContent = stampText;
      outer.appendChild(em);
      host.appendChild(outer);
    } else {
      existing.className = "a-stamp " + style;
      existing.textContent = stampText;
    }
  }

  function swapVisuals(card, p) {
    if (!card || !p) return;

    if (card.getAttribute("data-opt-locked") === "true") {
      return;
    }
    var currentSku = card.getAttribute("data-opt-sku");
    if (currentSku === p.sku) {
      return;
    }

    card.setAttribute(ATTR_INSTANCE, INSTANCE_ID);

    var t = card.querySelector(
      "h2, h3, h4, .m-prodCard_title, .m-prodCard-title, .m-prodCard__title, em.m-prodCard__title, [class*='title']"
    );
    if (t && p.title) t.textContent = p.title;

    var price = card.querySelector(
      "[class*='price'], [data-price], .price, .m-prodCard_price, .m-prodCard__price, .c-price"
    );
    if (price && p.price) price.textContent = p.price;

    var pts = card.querySelector(
      "[class*='point'], [data-points], .points, .m-prodCard_points, .m-prodCard__points"
    );
    if (pts && p.points) pts.textContent = p.points;

    var img = card.querySelector("img");
    if (img && p.img) {
      if (img.src !== p.img) img.src = p.img;
      img.removeAttribute("srcset");
      if (p.title) img.alt = p.title;
    }

    card.querySelectorAll("a[href]").forEach(function (a) {
      if (p.href) a.href = p.href;
    });

    setIds(card, p);

    var addButton = card.querySelector('button[aria-label*="Add"]');
    if (addButton && p.title) {
      addButton.setAttribute("aria-label", "Add " + p.title + " to cart");
    }

    ensurePackStamp(card, p);

    if (p.sku) card.setAttribute("data-opt-sku", p.sku);
    if (p.id) card.setAttribute("data-opt-id", p.id);

    var mainLink = card.querySelector("a.m-prodCard__row.-content");
    if (mainLink && p.href) {
      mainLink.setAttribute("data-correct-href", p.href);

      var newLink = mainLink.cloneNode(true);
      mainLink.parentNode.replaceChild(newLink, mainLink);

      newLink.addEventListener(
        "click",
        function (e) {
          var correctHref = this.getAttribute("data-correct-href");
          if (correctHref) {
            e.preventDefault();
            e.stopPropagation();

            if (e.ctrlKey || e.metaKey || e.button === 1) {
              window.open(correctHref, "_blank");
            } else {
              window.location.href = correctHref;
            }
          }
        },
        true
      );
    }
  }

  // ======= HEADING =======
  function getHeadingText() {
    return String(getConfig("titleCopy", "")).trim();
  }

  function applyHeading() {
    var newText = getHeadingText();

    if (!newText) {
      return;
    }

    var carousel = getTargetCarousel();
    if (!carousel) return;

    var h = carousel.querySelector(HEADING_SELECTOR);
    if (!h) return;

    if (!h.hasAttribute(ATTR_ORIG_HEAD)) {
      h.setAttribute(ATTR_ORIG_HEAD, (h.textContent || "").trim());
    }
    h.setAttribute(ATTR_INSTANCE, INSTANCE_ID);

    if (h.textContent.trim() !== newText) {
      h.textContent = newText;
    }
  }

  // ======= APPLY =======
  var _lastCount = 0;

  function applyProducts(limitOverride) {
    var c = cards();
    if (c.length === 0) {
      return false;
    }

    if (FEEDN.length === 0) {
      return false;
    }

    var limit =
      limitOverride || Math.min(c.length, FEEDN.length, REPLACE_COUNT);
    _lastCount = limit;

    for (var i = 0; i < limit; i++) {
      swapVisuals(c[i], FEEDN[i]);
    }

    _state.productsApplied = true;

    var carousel = getTargetCarousel();
    if (carousel) {
      carousel.setAttribute("data-opt-ready", "true");
    }

    return true;
  }

  function apply() {
    applyHeading();
    return applyProducts();
  }

  // ======= SYNCHRONIZATION LOGIC =======
  function tryApplyProductRecs() {
    if (_state.productsApplied) {
      return;
    }

    if (!_state.carouselReady || !_state.recsDataReady) {
      return;
    }

    apply();
  }

  // ======= PRODUCT RECS INTEGRATION =======
  function handleSmartRecs(json) {
    try {
      if (_state.recsDataReady && _state.productsApplied) {
        return;
      }

      var currentCulture = getCurrentCulture();

      var cultureSuffix = "";
      if (currentCulture === "enus" || currentCulture === "esus") {
        cultureSuffix = "US";
      } else if (currentCulture === "enca" || currentCulture === "frca") {
        cultureSuffix = "CA";
      } else if (currentCulture === "esmx") {
        cultureSuffix = "MX";
      }

      var widgetsForPosition = (json || []).filter(function (w) {
        return (w.position || w.widget) === POSITION_NAME;
      });

      if (widgetsForPosition.length === 0) {
        return;
      }

      var widget = null;
      var expectedWidgetName = POSITION_NAME + cultureSuffix;

      widget = widgetsForPosition.find(function (w) {
        return w.widget === expectedWidgetName;
      });

      if (!widget && widgetsForPosition.length === 1) {
        widget = widgetsForPosition[0];
      }

      if (!widget) {
        return;
      }

      if (!Array.isArray(widget.recs) || widget.recs.length === 0) {
        return;
      }

      FEEDN = widget.recs
        .map(function (p) {
          return normRecsProduct(p, currentCulture);
        })
        .filter(function (p) {
          return p !== null;
        });
      rebuildLookups();

      _state.recsDataReady = true;
      _state.recsData = widget;

      if (window.__optmCartTracker && window.__optmCartTracker.instances) {
        window.__optmCartTracker.instances[INSTANCE_ID].feedn = FEEDN;
        window.__optmCartTracker.instances[INSTANCE_ID].byTitle = byTitle;
        window.__optmCartTracker.instances[INSTANCE_ID].swappedCount =
          FEEDN.length;
      }

      tryApplyProductRecs();
    } catch (e) {}
  }

  // ======= INSTALL CALLBACK =======
  function installCallback() {
    var old =
      window.PeeriusCallbacks && window.PeeriusCallbacks.smartRecs
        ? window.PeeriusCallbacks.smartRecs
        : null;

    window.PeeriusCallbacks = window.PeeriusCallbacks || {};

    window.PeeriusCallbacks.smartRecs = function (json) {
      handleSmartRecs(json);

      if (typeof old === "function") {
        try {
          old(json);
        } catch (e) {}
      }
    };
  }

  installCallback();

  // ======= ADD-TO-CART SAFETY =======
  if (!window.__optmCartTracker) {
    window.__optmCartTracker = {
      activeOperations: new Map(),
      instances: {},
    };
  }

  window.__optmCartTracker.instances[INSTANCE_ID] = {
    instanceId: INSTANCE_ID,
    feedn: FEEDN,
    byTitle: byTitle,
    swappedCount: 0,
  };

  var handlerKey = "_clickHandlerInstalled_" + INSTANCE_ID;

  if (!window.__optmCartTracker[handlerKey]) {
    window.__optmCartTracker[handlerKey] = true;
    window.__optmCartTracker._clickHandlerInstalled = true;

    document.addEventListener(
      "click",
      function (e) {
        var el =
          e.target &&
          e.target.closest &&
          e.target.closest("button,[role='button'],a");

        if (!el) return;

        var card = el.closest(CARD_SELECTOR);
        if (!card) return;

        var label = (
          (el.getAttribute("aria-label") || "") +
          " " +
          (el.textContent || "")
        ).toLowerCase();

        if (
          label.indexOf("select") === -1 &&
          label.indexOf("add") === -1 &&
          label.indexOf("shopping") === -1 &&
          !el.classList.contains("-shelfToggle")
        ) {
          return;
        }

        var tracker = window.__optmCartTracker;
        var existingOperation = tracker.activeOperations.get(card);

        if (existingOperation && Date.now() <= existingOperation.until) {
          var timeSinceClick = Date.now() - existingOperation.startTime;

          if (timeSinceClick > 500) {
            tracker.activeOperations.delete(card);
            card.removeAttribute("data-opt-locked");
          } else {
            return;
          }
        }

        var instanceData = null;
        var cardIndex = -1;

        Object.keys(tracker.instances).forEach(function (id) {
          var inst = tracker.instances[id];
          var selector = "[data-opt-target-" + id.toLowerCase() + "='true']";
          var carousel = document.querySelector(selector);

          if (carousel && carousel.contains(card)) {
            var allCards = Array.prototype.slice.call(
              carousel.querySelectorAll(CARD_SELECTOR)
            );
            cardIndex = allCards.indexOf(card);

            if (cardIndex >= 0 && cardIndex < inst.swappedCount) {
              instanceData = inst;
            }
          }
        });

        if (!instanceData) return;

        var p = null;
        var stampedSku = card.getAttribute("data-opt-sku");
        if (stampedSku) {
          p = instanceData.feedn.find(function (x) {
            return x && x.sku === stampedSku;
          });
        }
        if (!p) {
          var tEl = card.querySelector(
            "h2, h3, h4, .m-prodCard_title, .m-prodCard-title, .m-prodCard__title, [class*='title']"
          );
          var t = tEl ? normText(tEl.textContent) : "";
          if (t && instanceData.byTitle[t]) p = instanceData.byTitle[t];
        }
        if (!p && cardIndex >= 0 && instanceData.feedn[cardIndex]) {
          p = instanceData.feedn[cardIndex];
        }

        if (!p || !p.sku) return;

        card.setAttribute("data-opt-locked", "true");

        var hasVariants =
          p.familyId && p.familyId !== p.sku && p.familyId !== p.id;

        var timeout = 12000;

        tracker.activeOperations.set(card, {
          sku: p.sku,
          id: p.id,
          familyId: p.familyId,
          useFamily: hasVariants,
          until: Date.now() + timeout,
          startTime: Date.now(),
          card: card,
        });

        card.setAttribute("data-productid", p.id);
        if (p.sku) card.setAttribute("data-sku", p.sku);
        if (p.familyId) card.setAttribute("data-familyid", p.familyId);

        el.setAttribute("data-sku", p.sku);
        el.setAttribute("data-productid", p.id);
        if (p.familyId) el.setAttribute("data-familyid", p.familyId);

        setTimeout(function () {
          if (tracker.activeOperations.has(card)) {
            card.removeAttribute("data-opt-locked");
            tracker.activeOperations.delete(card);
          }
        }, timeout);
      },
      true
    );
  }

  function isTargetApi(u) {
    try {
      var url = new URL(u, location.origin);
      return /\/api\//i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function rewriteUrl(u, operation) {
    if (!operation || Date.now() > operation.until) return u;

    try {
      var url = new URL(u, location.origin);
      if (!isTargetApi(url)) return u;

      if (url.searchParams.has("sc_itemid"))
        url.searchParams.delete("sc_itemid");

      var isListApi =
        url.pathname.toLowerCase().indexOf("shoppinglist") > -1 ||
        url.pathname.toLowerCase().indexOf("wishlist") > -1 ||
        url.pathname.toLowerCase().indexOf("favorite") > -1;

      if (isListApi) {
        ["sku", "Sku", "SKU", "selectedSku", "SelectedSku"].forEach(function (
          k
        ) {
          if (url.searchParams.has(k)) url.searchParams.set(k, operation.sku);
        });

        if (operation.familyId) {
          if (url.searchParams.has("FamilyId"))
            url.searchParams.set("FamilyId", operation.familyId);
          if (url.searchParams.has("familyId"))
            url.searchParams.set("familyId", operation.familyId);
        }
      } else if (operation.useFamily && operation.familyId) {
        if (url.searchParams.has("FamilyId")) {
          url.searchParams.set("FamilyId", operation.familyId);
        }
        if (url.searchParams.has("familyId")) {
          url.searchParams.set("familyId", operation.familyId);
        }
        if (url.searchParams.has("productId")) {
          url.searchParams.set("productId", operation.id);
        }
      } else {
        ["sku", "Sku", "SKU", "selectedSku", "SelectedSku"].forEach(function (
          k
        ) {
          if (url.searchParams.has(k)) url.searchParams.set(k, operation.sku);
        });
        if (operation.familyId && url.searchParams.has("FamilyId")) {
          url.searchParams.set("FamilyId", operation.familyId);
        }
      }

      return url.toString();
    } catch (_) {
      return u;
    }
  }

  function deepReplace(obj, operation) {
    if (!operation || !obj || typeof obj !== "object") return obj;

    Object.keys(obj).forEach(function (k) {
      var v = obj[k];

      if (operation.useFamily) {
        if (/^(familyId|FamilyId|family_id)$/i.test(k) && operation.familyId) {
          obj[k] = operation.familyId;
        }
        if (/^(productId|product_id)$/i.test(k) && operation.id) {
          obj[k] = operation.id;
        }
      } else {
        if (/^(sku|Sku|SKU|selectedSku|SelectedSku)$/i.test(k))
          obj[k] = operation.sku;
        else if (v && typeof v === "object") deepReplace(v, operation);
      }
    });
    return obj;
  }

  function rewriteBody(body, headers, operation) {
    if (!operation || Date.now() > operation.until || !body) return body;

    var ct = "";
    try {
      if (headers && headers.get)
        ct = (headers.get("content-type") || "").toLowerCase();
      else if (headers)
        ct = (
          headers["content-type"] ||
          headers["Content-Type"] ||
          ""
        ).toLowerCase();
    } catch (_) {}

    try {
      if (typeof body === "string") {
        var s = body.trim();
        if (
          ct.indexOf("application/json") > -1 ||
          (/^[{\[]/.test(s) && s.indexOf(":") > -1)
        ) {
          var obj = JSON.parse(s);
          deepReplace(obj, operation);
          return JSON.stringify(obj);
        }
        if (ct.indexOf("application/x-www-form-urlencoded") > -1) {
          var usp = new URLSearchParams(body);

          if (!operation.useFamily) {
            ["sku", "Sku", "SKU", "selectedSku", "SelectedSku"].forEach(
              function (k) {
                if (usp.has(k)) usp.set(k, operation.sku);
              }
            );
          } else {
            if (operation.familyId) {
              if (usp.has("FamilyId")) usp.set("FamilyId", operation.familyId);
              if (usp.has("familyId")) usp.set("familyId", operation.familyId);
            }
          }
          return usp.toString();
        }
      }
      if (
        typeof URLSearchParams !== "undefined" &&
        body instanceof URLSearchParams
      ) {
        if (!operation.useFamily) {
          ["sku", "Sku", "SKU", "selectedSku", "SelectedSku"].forEach(function (
            k
          ) {
            if (body.has(k)) body.set(k, operation.sku);
          });
        } else {
          if (operation.familyId) {
            if (body.has("FamilyId")) body.set("FamilyId", operation.familyId);
            if (body.has("familyId")) body.set("familyId", operation.familyId);
          }
        }
        return body;
      }
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        if (!operation.useFamily) {
          ["sku", "Sku", "SKU", "selectedSku", "SelectedSku"].forEach(function (
            k
          ) {
            if (body.has(k)) body.set(k, operation.sku);
          });
        } else {
          if (operation.familyId) {
            if (body.has("FamilyId")) body.set("FamilyId", operation.familyId);
            if (body.has("familyId")) body.set("familyId", operation.familyId);
          }
        }
        return body;
      }
    } catch (_) {}
    return body;
  }

  // Intercept XHR requests
  if (!window.__optmCartTracker._interceptorsInstalled) {
    window.__optmCartTracker._interceptorsInstalled = true;

    (function () {
      var _open = XMLHttpRequest.prototype.open;
      var _send = XMLHttpRequest.prototype.send;
      var _setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

      XMLHttpRequest.prototype.open = function (m, u) {
        try {
          this.__method = m;
          this.__originalUrl = u;
          this.__headers = {};

          var tracker = window.__optmCartTracker;

          if (tracker && isTargetApi(u)) {
            var matchingOperation = null;
            var now = Date.now();

            tracker.activeOperations.forEach(function (operation, card) {
              if (now <= operation.until) {
                if (!matchingOperation) {
                  matchingOperation = operation;
                }
              } else {
                tracker.activeOperations.delete(card);
                card.removeAttribute("data-opt-locked");
              }
            });

            if (matchingOperation) {
              var rewrittenUrl = rewriteUrl(u, matchingOperation);
              if (rewrittenUrl !== u) {
                this.__originalUrl = rewrittenUrl;
                u = rewrittenUrl;
              }
            }
          }
        } catch (e) {
          this.__headers = {};
        }

        return _open.call(this, m, u);
      };

      XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
        try {
          if (!this.__headers) this.__headers = {};
          this.__headers[header] = value;
        } catch (_) {}
        return _setRequestHeader.call(this, header, value);
      };

      XMLHttpRequest.prototype.send = function (body) {
        var xhr = this;
        var originalOnReadyStateChange = this.onreadystatechange;

        this.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
              var actuallySucceeded = false;

              try {
                var responseData = JSON.parse(xhr.responseText);
                if (responseData.hasOwnProperty("Success")) {
                  actuallySucceeded = responseData.Success === true;
                } else {
                  actuallySucceeded = true;
                }
              } catch (e) {
                actuallySucceeded = true;
              }

              if (
                actuallySucceeded &&
                xhr.__originalUrl &&
                isTargetApi(xhr.__originalUrl)
              ) {
                var isListApi =
                  xhr.__originalUrl.toLowerCase().indexOf("shoppinglist") > -1;

                if (!isListApi) {
                  setTimeout(function () {
                    var tracker = window.__optmCartTracker;
                    if (tracker.activeOperations.size > 0) {
                      var oldestOperation = null;
                      var oldestTime = Infinity;

                      tracker.activeOperations.forEach(function (
                        operation,
                        card
                      ) {
                        if (operation.startTime < oldestTime) {
                          oldestTime = operation.startTime;
                          oldestOperation = {
                            operation: operation,
                            card: card,
                          };
                        }
                      });

                      if (oldestOperation) {
                        tracker.activeOperations.delete(oldestOperation.card);
                        oldestOperation.card.removeAttribute("data-opt-locked");
                      }
                    }
                  }, 200);
                }
              }
            }
          }

          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.apply(this, arguments);
          }
        };

        try {
          if (this.__originalUrl && isTargetApi(this.__originalUrl)) {
            var tracker = window.__optmCartTracker;
            var matchingOperation = null;
            var now = Date.now();

            tracker.activeOperations.forEach(function (operation, card) {
              if (now <= operation.until) {
                if (!matchingOperation) {
                  matchingOperation = operation;
                }
              }
            });

            if (matchingOperation) {
              body = rewriteBody(body, this.__headers || {}, matchingOperation);
            }
          }
        } catch (e) {}

        return _send.call(this, body);
      };
    })();

    document.addEventListener(
      "submit",
      function (e) {
        var tracker = window.__optmCartTracker;
        if (tracker.activeOperations.size === 0) return;

        var f = e.target;
        if (!f || !f.querySelectorAll) return;

        var inManagedCarousel = false;
        var matchingOperation = null;

        tracker.activeOperations.forEach(function (operation, card) {
          if (card.contains(f)) {
            inManagedCarousel = true;
            matchingOperation = operation;
          }
        });

        if (!inManagedCarousel || !matchingOperation) return;

        f.querySelectorAll(
          "input[name='sku'],input[name='Sku'],input[name='SKU'],input[name='selectedSku'],input[name='SelectedSku']"
        ).forEach(function (i) {
          i.value = matchingOperation.sku;
        });
      },
      true
    );
  }

  // ======= INIT =======
  function init() {
    if (!validateConfig()) {
      return;
    }

    function waitForHeadingsAndInit() {
      var allCarousels = document.querySelectorAll(CAROUSEL_SELECTOR);

      if (allCarousels.length === 0) {
        return;
      }

      var carousel = findAndCacheTargetCarousel();

      if (!carousel) {
        setTimeout(waitForHeadingsAndInit, 100);
        return;
      }

      carousel.setAttribute(ATTR_INSTANCE, INSTANCE_ID);

      function waitForCards() {
        if (cards().length > 0) {
          _state.carouselReady = true;
          tryApplyProductRecs();
        } else {
          setTimeout(waitForCards, 100);
        }
      }

      setTimeout(waitForCards, 200);

      var FALLBACK_CHECK_INTERVAL = 500;
      var MAX_WAIT_TIME = 8000;
      var waitElapsed = 0;

      function checkAndReveal() {
        var carousel = getTargetCarousel();
        if (!carousel) return;

        waitElapsed += FALLBACK_CHECK_INTERVAL;

        if (_state.productsApplied) {
          carousel.setAttribute("data-opt-ready", "true");
          return;
        }

        if (waitElapsed >= MAX_WAIT_TIME) {
          _state.fallbackTimerFired = true;
          if (_state.recsDataReady) {
            tryApplyProductRecs();
            setTimeout(function () {
              carousel.setAttribute("data-opt-ready", "true");
            }, 500);
          } else {
            carousel.setAttribute("data-opt-ready", "true");
          }
          return;
        }

        setTimeout(checkAndReveal, FALLBACK_CHECK_INTERVAL);
      }

      setTimeout(checkAndReveal, FALLBACK_CHECK_INTERVAL);

      setTimeout(positionCarousel, 200);
    }

    waitForHeadingsAndInit();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(init, 100);
    });
  } else {
    setTimeout(init, 100);
  }

  var mo = new MutationObserver(function () {
    clearTimeout(mo._t);
    mo._t = setTimeout(function () {
      tryApplyProductRecs();
    }, 120);
  });

  var observerRoot =
    getTargetCarousel() || document.querySelector(CAROUSEL_SELECTOR);

  if (observerRoot) {
    mo.observe(observerRoot, { childList: true, subtree: true });
  }
})();
