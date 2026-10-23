/* Optimizely Product Carousel with Product Recs v3 */
(function () {
  "use strict";

  // ======= INSTANCE ID =======
  var INSTANCE_ID;
  if (typeof extension !== "undefined" && extension.$instance) {
    INSTANCE_ID = extension.$instance;
  } else if (typeof window.extension !== "undefined" && window.extension.$instance) {
    INSTANCE_ID = window.extension.$instance;
  } else {
    if (!window.__optInstanceSeq) window.__optInstanceSeq = 0;
    INSTANCE_ID = "inst-" + ++window.__optInstanceSeq + "-" + Date.now();
  }

  // ======= CONFIG READER =======
  function getConfig(name, fallback) {
    if (typeof extension !== "undefined" && extension && extension[name] !== undefined) {
      return extension[name];
    }
    if (typeof window.extension !== "undefined" && window.extension && window.extension[name] !== undefined) {
      return window.extension[name];
    }
    return fallback;
  }

  var CONFIG = {
    carouselSelector: String(getConfig("carousel_selector", "")).trim(),
    titleCopy: String(getConfig("titleCopy", "")).trim(),
    replaceCount: parseInt(getConfig("replace_count", "10"), 10) || 10,
    positionName: String(getConfig("recs_position_name", "homeWidget")).trim(),
    positionTarget: String(getConfig("position_target", "")).trim(),
    positionType: String(getConfig("position_type", "none")).trim(),
    targetHeading: String(getConfig("target_heading", "")).trim()
  };

  var CARD_SEL = ".m-prodCard";
  var HEADING_SEL = "h3.o-productCarouselVue__title";

  // ======= ANTI-FLICKER CSS (per instance, injected immediately) =======
  (function injectAntiFlicker() {
    if (!CONFIG.carouselSelector) return;
    var styleId = "optv3-af-" + INSTANCE_ID;
    if (document.getElementById(styleId)) return;
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent =
      CONFIG.carouselSelector + " { opacity: 0 !important; visibility: hidden !important; }\n" +
      CONFIG.carouselSelector + '[data-opt-ready="true"] { opacity: 1 !important; visibility: visible !important; transition: opacity 0.3s ease-in; }';
    var head = document.head || document.getElementsByTagName("head")[0];
    if (head) {
      head.firstChild ? head.insertBefore(style, head.firstChild) : head.appendChild(style);
    }
  })();

  // ======= SINGLETON MANAGER BOOTSTRAP =======
  if (!window.__optCarouselManager) {
    window.__optCarouselManager = buildManager();
  }
  var MGR = window.__optCarouselManager;

  // ======= REGISTER THIS INSTANCE =======
  MGR.register(INSTANCE_ID, CONFIG);

  // ======= MANAGER FACTORY (executed ONCE by the first instance) =======
  function buildManager() {

    // _context is intentionally NOT cached at build time.
    // It is resolved lazily at first use inside initInstance, after the page
    // has had time to push dataLayer entries and render customerData.
    // Each call to getContext() re-evaluates unless _contextResolved is true,
    // which is set only after initInstance signals the DOM is ready.
    var _context = null;
    var _contextResolved = false;

    // ---------- GENERIC HELPERS ----------

    function toStr(v) {
      return v == null ? "" : String(v);
    }

    function trimStr(v) {
      return toStr(v).trim();
    }

    function lower(v) {
      return trimStr(v).toLowerCase();
    }

    // Produces a compact no-hyphen culture key, e.g. "en-au" → "enau".
    // NOTE: two cultures that differ only by punctuation would collide here.
    // This key is used only for stamp-text lookup; market/language are used
    // for all attribute and price resolution to avoid that ambiguity.
    function compactCulture(v) {
      var s = lower(v).replace(/_/g, "-").replace(/[^a-z-]/g, "");
      return s.replace(/-/g, "");
    }

    // Produces a normalized IETF-style tag, e.g. "EN_AU" → "en-au".
    function langTag(v) {
      var s = lower(v).replace(/_/g, "-").replace(/[^a-z-]/g, "");
      return s;
    }

    function getCustomerDataObject() {
      var cd = window.customerData;
      if (Array.isArray(cd) && cd.length > 0 && cd[0]) return cd[0];
      if (cd && typeof cd === "object" && !Array.isArray(cd)) return cd;
      return {};
    }

    // Scans dataLayer from newest to oldest, returning the most recent
    // non-empty value for each requested key.
    function collectLatestValues(keys) {
      var dl = window.dataLayer;
      var result = {};
      if (!Array.isArray(dl) || !keys || dl.length === 0) return result;

      var remaining = {};
      var remainingCount = 0;
      for (var j = 0; j < keys.length; j++) {
        remaining[keys[j]] = true;
        remainingCount++;
      }

      for (var i = dl.length - 1; i >= 0 && remainingCount > 0; i--) {
        var entry = dl[i] || {};
        for (var kIdx = 0; kIdx < keys.length; kIdx++) {
          var k = keys[kIdx];
          if (remaining[k] && entry[k] != null && entry[k] !== "") {
            result[k] = entry[k];
            remaining[k] = false;
            remainingCount--;
          }
        }
      }
      return result;
    }

    function getValue(key) {
      var latest = collectLatestValues([key]);
      if (latest[key] != null && latest[key] !== "") return latest[key];
      var customer = getCustomerDataObject();
      if (customer[key] != null && customer[key] !== "") return customer[key];
      return null;
    }

    function getEnvJson() {
      try {
        var envEl = document.getElementById("environment-variables");
        if (!envEl) return null;
        return JSON.parse(envEl.textContent || envEl.innerHTML || "{}");
      } catch (_) {
        return null;
      }
    }

    function getPathCultureCandidate() {
      var path = lower(location.pathname);
      var m = path.match(/\/([a-z]{2}(?:-[a-z]{2})?)\//i);
      return m ? m[1] : "";
    }

    function getRawCultureCandidate() {
      var env = getEnvJson() || {};
      var latest = collectLatestValues([
        "uiCulture", "customerCulture", "culture", "ep.uiculture"
      ]);
      var customer = getCustomerDataObject();

      var candidates = [
        window.__optimizelyData && window.__optimizelyData.uiCulture,
        latest.uiCulture,
        latest.customerCulture,
        latest.culture,
        latest["ep.uiculture"],
        customer.uiCulture,
        customer.culture,
        customer.customerCulture,
        env.UiCulture,
        env.uiCulture,
        document.documentElement && document.documentElement.lang,
        getPathCultureCandidate()
      ];

      for (var i = 0; i < candidates.length; i++) {
        var c = langTag(candidates[i]);
        if (c) return c;
      }
      return "";
    }

    function deriveMarketFromCulture(rawCulture) {
      var parts = langTag(rawCulture).split("-");
      return (parts.length >= 2 && parts[1]) ? parts[1] : "";
    }

    function deriveLanguageFromCulture(rawCulture) {
      return langTag(rawCulture).split("-")[0] || "";
    }

    function getCurrencyFromEnvironment() {
      var env = getEnvJson() || {};
      var currency =
        env.CurrencyCode || env.currencyCode ||
        env.Currency    || env.currency    ||
        getValue("currencyCode") || getValue("currency");
      return trimStr(currency).toUpperCase();
    }

    // FIX: expanded to cover AU, NZ, JP, KR, SG, HK, TW, and other markets
    // that were missing from v3.  Add new entries here as markets are launched.
    function getCurrencyByMarket(market) {
      var map = {
        // Americas
        us: "USD", ca: "CAD", mx: "MXN",
        // Europe
        gb: "GBP",
        ie: "EUR", fr: "EUR", de: "EUR", es: "EUR",
        it: "EUR", nl: "EUR", be: "EUR", at: "EUR", pt: "EUR",
        pl: "PLN",
        // Asia-Pacific
        au: "AUD",
        nz: "NZD",
        jp: "JPY",
        kr: "KRW",
        sg: "SGD",
        hk: "HKD",
        tw: "TWD",
        cn: "CNY",
        // Southeast Asia
        my: "MYR",
        th: "THB",
        id: "IDR",
        ph: "PHP",
        // Other
        br: "BRL",
        za: "ZAR",
        in: "INR",
        ch: "CHF",
        se: "SEK",
        no: "NOK",
        dk: "DKK"
      };
      return map[market] || "USD";
    }

    // FIX: Context is now resolved lazily and cached only after
    // markContextReady() is called from initInstance, giving dataLayer/
    // customerData time to be populated before we lock the values in.
    function resolveContext() {
      var rawCulture = getRawCultureCandidate();
      var normalizedCulture = compactCulture(rawCulture) || "enus";

      var market = deriveMarketFromCulture(rawCulture);
      if (!market) {
        market =
          lower(getValue("countryCode")) ||
          lower(getValue("market"))      ||
          lower(getValue("country"))     || "";
      }

      var marketMap = {
        "united states": "us", usa: "us", us: "us",
        "canada": "ca",        ca: "ca",
        "mexico": "mx",        mx: "mx",
        "australia": "au",     au: "au",
        "new zealand": "nz",   nz: "nz",
        "japan": "jp",         jp: "jp",
        "south korea": "kr",   kr: "kr",
        "singapore": "sg",     sg: "sg",
        "hong kong": "hk",     hk: "hk",
        "taiwan": "tw",        tw: "tw",
        "china": "cn",         cn: "cn",
        "malaysia": "my",      my: "my",
        "thailand": "th",      th: "th",
        "indonesia": "id",     id: "id",
        "philippines": "ph",   ph: "ph",
        "poland": "pl",        pl: "pl",
        "france": "fr",        fr: "fr",
        "germany": "de",       de: "de",
        "spain": "es",         es: "es",
        "italy": "it",         it: "it",
        "united kingdom": "gb", uk: "gb", gb: "gb",
        "ireland": "ie",       ie: "ie",
        "netherlands": "nl",   nl: "nl",
        "belgium": "be",       be: "be",
        "austria": "at",       at: "at",
        "portugal": "pt",      pt: "pt",
        "switzerland": "ch",   ch: "ch",
        "sweden": "se",        se: "se",
        "norway": "no",        no: "no",
        "denmark": "dk",       dk: "dk",
        "brazil": "br",        br: "br",
        "south africa": "za",  za: "za",
        "india": "in",         in: "in"
      };
      market = marketMap[market] || market || "us";

      var language = deriveLanguageFromCulture(rawCulture) || "en";
      var currency = getCurrencyFromEnvironment() || getCurrencyByMarket(market);

      return {
        rawCulture: rawCulture || "",
        culture: normalizedCulture,
        market: market,
        language: language,
        currency: currency
      };
    }

    function getContext() {
      if (_context && _contextResolved) return _context;
      // Re-evaluate on every call until markContextReady() seals it.
      _context = resolveContext();
      return _context;
    }

    // Called by initInstance once the DOM is sufficiently ready.
    // After this point getContext() returns the cached value permanently.
    function markContextReady() {
      if (_contextResolved) return;
      _context = resolveContext();
      _contextResolved = true;
    }

    function getCulture()       { return getContext().culture;    }
    function getRawCulture()    { return getContext().rawCulture; }
    function getMarket()        { return getContext().market;     }
    function getLanguage()      { return getContext().language;   }
    function getAttrSuffix()    { return "_" + getMarket();       }
    function getPriceCurrency() { return getContext().currency;   }
    function getWidgetMarketSuffix() { return getMarket().toUpperCase(); }

    // ---------- PRODUCT NORMALIZATION ----------

    function formatPrice(amount, culture, currency, language) {
      if (amount == null || amount === "") return null;
      try {
        var locale = getRawCulture() || "en-US";
        return new Intl.NumberFormat(locale, {
          style: "currency",
          currency: currency || "USD"
        }).format(amount);
      } catch (_) {
        if (culture === "frca") return Number(amount).toFixed(2).replace(".", ",") + " $";
        return "$" + Number(amount).toFixed(2);
      }
    }

    function numVal(v) {
      if (v == null) return null;
      var n = Number(String(v).replace(/[^\d.-]/g, ""));
      return isNaN(n) ? null : n;
    }

    function normText(s) {
      return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    }

    // ---------- PRICE PER UNIT ----------

    // Rendered as one .a-ppu line per kind. "original" carries no label; the
    // concentrated/diluted variants are labelled because a product can show
    // both at once (e.g. Tub & Tile lists concentrated and diluted per-litre).
    var PPU_KINDS = [
      { key: "original",     labelKey: ""             },
      { key: "concentrated", labelKey: "Concentrated" },
      { key: "diluted",      labelKey: "Diluted"      }
    ];

    // Measurement strings arrive pre-localized AND zero-padded from the feed
    // ("100.000 g", "1.000 l", AT "1.000 ladung", PL "1.000 masa"). Only the
    // padding is ours to strip — never translate the unit itself.
    function cleanPpuMeasure(v) {
      var s = trimStr(v);
      if (!s) return "";
      var m = s.match(/^([\d.,]+)\s*(.*)$/);
      if (!m) return s;
      var n = Number(String(m[1]).replace(/,/g, "."));
      if (isNaN(n)) return s;
      return (Math.round(n * 1000) / 1000) + (m[2] ? " " + m[2] : "");
    }

    // The storefront already ships localized copy for these labels in the
    // ProductCarousel component config, so read them off the page rather than
    // carrying a translation table that would drift per market.
    var _siteLabels = null;
    function getSiteLabels() {
      if (_siteLabels) return _siteLabels;
      _siteLabels = {};
      var scripts = document.querySelectorAll('script[id^="ProductCarousel-"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var parsed = JSON.parse(scripts[i].textContent);
          var labels = parsed && parsed.Labels;
          if (!labels) continue;
          for (var k in labels) {
            if (Object.prototype.hasOwnProperty.call(labels, k) && _siteLabels[k] == null) {
              _siteLabels[k] = labels[k];
            }
          }
        } catch (_) {}
      }
      return _siteLabels;
    }

    function getPpuLabel(labelKey) {
      if (!labelKey) return "";
      return trimStr(getSiteLabels()[labelKey]) || labelKey;
    }

    function getPpuEntry(a, kind, suffix, market) {
      var preferred = numVal(firstDefined(a, [
        kind + "preferredpriceperunit" + suffix,
        kind + "preferredpriceperunit_" + market
      ]));
      var regular = numVal(firstDefined(a, [
        kind + "regularpriceperunit" + suffix,
        kind + "regularpriceperunit_" + market
      ]));
      var measure = trimStr(firstDefined(a, [
        kind + "ppumeasurementtype" + suffix,
        kind + "ppumeasurementtype_" + market
      ]));

      // Pair the per-unit figure with the price the card actually shows, which
      // is the preferred (member) price; regular is the fallback only.
      var value = preferred != null ? preferred : regular;
      if (value == null || !measure) return null;
      return { value: value, measure: cleanPpuMeasure(measure) };
    }

    function buildPpuLines(a, suffix, market, culture, currency, language) {
      var lines = [];
      for (var i = 0; i < PPU_KINDS.length; i++) {
        var entry = getPpuEntry(a, PPU_KINDS[i].key, suffix, market);
        if (!entry) continue;
        var priced = formatPrice(entry.value, culture, currency, language);
        if (!priced) continue;
        var label = getPpuLabel(PPU_KINDS[i].labelKey);
        lines.push((label ? label + ": " : "") + priced + " / (" + entry.measure + ")");
      }
      return lines;
    }

    // ---------- FEED-DRIVEN STAMPS ----------

    // Tilde is the feed's delimiter for multi-value attributes (categoryids uses
    // it), and stampnames/stampstyles are plural, so split on it. Single values
    // simply yield a one-item list.
    function splitFeedList(v) {
      var s = trimStr(v);
      if (!s) return [];
      var parts = s.split("~");
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var t = trimStr(parts[i]);
        if (t) out.push(t);
      }
      return out;
    }

    // The feed lowercases the style token ("-blueoutlined") but the storefront's
    // classes are camelCase ("-blueOutlined", "-blueSolid"), and CSS class names
    // are case-sensitive — restore the capital on the style suffix.
    var STAMP_STYLE_SUFFIXES = ["outlined", "solid"];
    function canonicalStampClass(raw) {
      var s = lower(raw);
      if (!s) return "";
      if (s.charAt(0) !== "-") s = "-" + s;
      for (var i = 0; i < STAMP_STYLE_SUFFIXES.length; i++) {
        var suf = STAMP_STYLE_SUFFIXES[i];
        if (s.length > suf.length + 1 && s.slice(-suf.length) === suf) {
          return s.slice(0, s.length - suf.length) +
                 suf.charAt(0).toUpperCase() + suf.slice(1);
        }
      }
      return s;
    }

    // Copy arrives display-ready and localized per culture, and .a-stamp is
    // uppercased by site CSS, so the text is used verbatim — no casing or
    // translation of our own.
    function getFeedStamps(a, culture, market, language) {
      var names  = splitFeedList(getLocalizedAttr(a, "stampnames",  culture, market, language));
      var styles = splitFeedList(getLocalizedAttr(a, "stampstyles", culture, market, language));
      var out = [];
      for (var i = 0; i < names.length; i++) {
        var style = styles[i] != null ? styles[i] : styles[0];
        out.push({ text: names[i], cls: canonicalStampClass(style) });
      }
      return out;
    }

    // FIX: data-feed subdomain correction. The Peerius feed returns short
    // market subdomains for some markets (e.g. nz.melaleuca.com), but the live
    // storefront is served from the long form (newzealand.melaleuca.com). NZ
    // has no redirect so the short host 404s; AU redirects au->australia, but
    // the extra hop is avoidable. Remap known short hosts to the canonical one.
    // NOTE: the proper fix belongs in the data feed; this is a safety net.
    // Add new markets here as they launch with short-subdomain feed links.
    var HOST_ALIASES = {
      "nz.melaleuca.com": "newzealand.melaleuca.com",
      "au.melaleuca.com": "australia.melaleuca.com",
      "my.melaleuca.com": "malaysia.melaleuca.com"
    };

    function absUrl(href) {
      try {
        if (!href) return "";
        var parsed = new URL(href, location.origin);
        if (!/^https?:$/i.test(parsed.protocol)) return "#";
        var canonical = HOST_ALIASES[parsed.hostname.toLowerCase()];
        if (canonical) parsed.hostname = canonical;
        return parsed.toString();
      } catch (_) {
        return "#";
      }
    }

    function firstDefined(obj, keys) {
      if (!obj) return null;
      for (var i = 0; i < keys.length; i++) {
        if (obj[keys[i]] != null && obj[keys[i]] !== "") return obj[keys[i]];
      }
      return null;
    }

    // FIX: candidate list reordered so _market (most commonly used in Peerius
    // attribute naming) is tried before the compact culture and raw culture
    // variants.  The dead langTag(getRawCulture()) candidate (which produced a
    // hyphenated key like "en-au" unlikely to match any real attribute) is
    // replaced with rawCulture itself (e.g. "en-au") and moved lower in the
    // priority order as a speculative fallback.
    function getLocalizedAttr(a, baseName, culture, market, language) {
      var rawCulture = getRawCulture();  // e.g. "en-au"
      var candidates = [
        baseName + "_" + market,        // preferredprice_au       ← most likely
        baseName + "_" + culture,       // preferredprice_enau
        baseName + "_" + rawCulture,    // preferredprice_en-au     ← speculative
        baseName + "_" + language,      // preferredprice_en
        baseName + culture,             // preferredpriceenau
        baseName + market,              // preferredpriceau
        baseName + language,            // preferredpriceen
        baseName                        // preferredprice            ← bare fallback
      ];

      for (var i = 0; i < candidates.length; i++) {
        if (a[candidates[i]] != null && a[candidates[i]] !== "") return a[candidates[i]];
      }
      return null;
    }

    function getStampText(culture, language) {
      var exact = {
        enus: "SAVINGS PACK",
        esus: "CONJUNTO DE AHORROS",
        esmx: "CONJUNTO DE AHORROS",
        enca: "SAVINGS PACK",
        enau: "SAVINGS PACK",
        ennz: "SAVINGS PACK",
        frca: "ENSEMBLE D\u2019\u00C9CONOMIES",
        plpl: "ZESTAW OSZCZ\u0118DNO\u015ACIOWY",
        jajp: "\u5272\u5F15\u30D1\u30C3\u30AF"
      };
      if (exact[culture]) return exact[culture];
      if (language === "es") return "CONJUNTO DE AHORROS";
      if (language === "fr") return "ENSEMBLE D\u2019\u00C9CONOMIES";
      if (language === "pl") return "ZESTAW OSZCZ\u0118DNO\u015ACIOWY";
      if (language === "ja") return "\u5272\u5F15\u30D1\u30C3\u30AF";
      if (language === "ko") return "팬트리 팩";
      if (language === "ms") return "PEK JIMAT";
      if (language === "lt") return "RINKINYS UŽ MAŽESNĘ KAINĄ";
      if (language === "nl") return "BESPAARSET";
      if (language === "de") return "SPAR-PACK";
      if (culture === "zhmy" || culture === "zhsg") return "超值套组";
      if (culture === "zhtw") return "特惠組合";
      if (language === "zh") return null;
      return "SAVINGS PACK";
    }

    // Several markets inflect the points label by count (and Baltic/Slavic
    // languages have more plural forms than a two-branch table can express), so
    // read the copy the storefront already rendered on its own cards. Scanned
    // before any swap, so it only ever sees native markup.
    var _pointsLabels = null;
    function scanPointsLabels() {
      if (_pointsLabels && Object.keys(_pointsLabels).length) return _pointsLabels;
      _pointsLabels = {};
      var els = document.querySelectorAll(".m-prodCard__points .m-prodCard__text.-points");
      for (var i = 0; i < els.length; i++) {
        var parts = trimStr(els[i].textContent).match(/^([\d., \s]+?)\s*([^\d].*)$/);
        if (!parts) continue;
        var n = Number(String(parts[1]).replace(/[., \s]/g, ""));
        if (isNaN(n)) continue;
        if (_pointsLabels[n] == null) _pointsLabels[n] = trimStr(parts[2]);
      }
      return _pointsLabels;
    }

    function getPointsLabelFromPage(count) {
      var map = scanPointsLabels();
      if (map[count] != null) return map[count];
      // No exact match: reuse a form from the same side of the singular/plural
      // split rather than inventing an inflection.
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        if ((count === 1) === (Number(keys[i]) === 1)) return map[keys[i]];
      }
      return "";
    }

    function getPointsLabel(count, culture, language) {
      if (language === "es") return count === 1 ? "punto" : "puntos";
      if (language === "pl") return count === 1 ? "Punkt" : "Punkty";
      if (language === "fr") return count === 1 ? "Point" : "Points";
      if (language === "ja") return "\u30DD\u30A4\u30F3\u30C8";
      if (language === "ko") return "\uD3EC\uC778\uD2B8";
      if (language === "ms") return "Mata";
      if (language === "nl") return count === 1 ? "Punt" : "Punten";
      if (language === "de") return count === 1 ? "Punkt" : "Punkte";
      // Lithuanian grammar has a third form (taškų for 10-20), but the
      // storefront itself renders only two — mirror what it does.
      if (language === "lt") return count === 1 ? "Taškas" : "Taškai";
      if (culture === "zhmy" || culture === "zhsg") return "\u70B9\u6570";
      if (culture === "zhtw") return "\u9EDE";
      if (language === "zh") return "\u9EDE\u6578";
      var fromPage = getPointsLabelFromPage(count);
      if (fromPage) return fromPage;
      return count === 1 ? "Point" : "Points";
    }

    function getAddToCartLabel(title, language, culture) {
      if (language === "es") return "Agregar " + title + " al carrito";
      if (language === "fr") return "Ajouter " + title + " au panier";
      if (language === "pl") return "Dodaj " + title + " do koszyka";
      if (language === "ja") return title + " \u3092\u30AB\u30FC\u30C8\u306B\u8FFD\u52A0";
      if (culture === "zhmy" || culture === "zhsg") return "\u6DFB\u52A0" + title + " \u81F3\u8D2D\u7269\u8F66";
      if (culture === "zhhk" || culture === "zhtw") return "\u52A0\u5165" + title + "\u81F3\u8CFC\u7269\u8ECA";
      if (language === "zh") return "\u6DFB\u52A0" + title + " \u81F3\u8D2D\u7269\u8F66";
      return "Add " + title + " to cart";
    }

    function normRecsProduct(p, widgetName, widgetPosition) {
      if (!p) return null;

      var culture  = getCulture();
      var market   = getMarket();
      var language = getLanguage();
      var a        = (p && p.attributes) || {};
      var suffix   = getAttrSuffix();
      var currency = getPriceCurrency();

      var prices = (p.prices && p.prices[currency]) || {};

      var salePrice = prices.salePrice != null
        ? prices.salePrice
        : numVal(firstDefined(a, [
            "preferredprice" + suffix,
            "preferred_price" + suffix,
            "preferredPrice" + suffix,
            "preferredprice_" + market,
            "preferredprice"
          ]));

      var unitPrice = prices.unitPrice != null
        ? prices.unitPrice
        : numVal(firstDefined(a, [
            "regularprice" + suffix,
            "regular_price" + suffix,
            "regularPrice" + suffix,
            "regularprice_" + market,
            "regularprice"
          ]));

      var priceStr = "";
      if (salePrice != null && unitPrice != null && salePrice < unitPrice) {
        var wasLabel = language === "fr" ? "était"
                     : language === "es" ? "antes"
                     : "was";
        priceStr =
          formatPrice(salePrice, culture, currency, language) +
          " (" + wasLabel + " " +
          formatPrice(unitPrice, culture, currency, language) + ")";
      } else if (unitPrice != null) {
        priceStr = formatPrice(unitPrice, culture, currency, language);
      } else if (salePrice != null) {
        priceStr = formatPrice(salePrice, culture, currency, language);
      }

      var hasPack = false;
      var hpv = firstDefined(a, [
        "haspacksavings" + suffix,
        "hasPackSavings" + suffix,
        "haspacksavings_" + market,
        "haspacksavings"
      ]);
      if (hpv != null) {
        if (hpv === true || hpv === 1) hasPack = true;
        else if (typeof hpv === "string") hasPack = /^(true|yes|1)$/i.test(hpv);
      }

      var familyId = trimStr(firstDefined(a, [
        "familyid" + suffix,
        "familyId" + suffix,
        "familyid_" + market,
        "familyid"
      ]));

      var sku   = trimStr(p.refCode || p.sku || p.Sku || "");

      // FIX: title language. Peerius returns a base (often English) p.title even
      // on CJK-culture requests (e.g. zh-MY), while the localized value lives in
      // imagealttext_<culture> / title_<culture>. Preferring p.title stamps
      // English names onto a Chinese carousel. So for zh/ja/ko, when p.title has
      // no CJK characters but a localized CJK value exists, use the localized one.
      // No-op elsewhere: Latin markets and feeds whose p.title is already CJK.
      function hasCJK(s) {
        return /[㐀-鿿぀-ヿ가-힯]/.test(String(s || ""));
      }
      var localizedTitle =
        getLocalizedAttr(a, "imagealttext", culture, market, language) ||
        getLocalizedAttr(a, "title",        culture, market, language);
      var title;
      if ((language === "zh" || language === "ja" || language === "ko")
          && p.title && !hasCJK(p.title) && hasCJK(localizedTitle)) {
        title = localizedTitle;
      } else {
        title = p.title || localizedTitle || "Untitled Product";
      }

      var href = absUrl(
        firstDefined(a, [
          "pdplink_" + culture,
          "pdplink_" + market,
          "pdplink", "PdpLink", "pdpLink"
        ]) || p.url
      );

      var pointsVal = firstDefined(a, [
        "points" + suffix,
        "points_" + market,
        "points"
      ]) || "";

      var pointsStr = "";
      if (pointsVal) {
        var pn = parseFloat(pointsVal);
        if (!isNaN(pn)) {
          pointsStr = pn.toString() + " " + getPointsLabel(pn, culture, language);
        }
      }

      return {
        id:       trimStr((p.id != null ? p.id : p.refCode) || ""),
        sku:      sku,
        familyId: familyId,
        title:    title,
        price:    priceStr,
        ppu:      buildPpuLines(a, suffix, market, culture, currency, language),
        stamps:   getFeedStamps(a, culture, market, language),
        points:   pointsStr,
        img:      p.img || p.image || "",
        href:     href,
        hasPack:  hasPack,
        culture:  culture,
        market:   market,
        language: language,
        currency: currency,
        widgetName:     widgetName || "",
        widgetPosition: widgetPosition || ""
      };
    }

    // ---------- VISUAL SWAP ----------

    // FIX: walk to the deepest single-child <span> so we target the innermost
    // text node regardless of how many nesting levels the site uses.
    // The AU carousel wraps price in three nested spans; "span span" in v2/v3
    // only reached the middle one, leaving the innermost span as a child of
    // whatever we set textContent on (destroying it on re-render).
    function deepestPriceSpan(el) {
      var current = el;
      while (true) {
        var spanKids = [];
        for (var ci = 0; ci < current.children.length; ci++) {
          if (current.children[ci].tagName === "SPAN") spanKids.push(current.children[ci]);
        }
        if (spanKids.length === 1) { current = spanKids[0]; } else { break; }
      }
      return current;
    }

    function getStampClass(market) {
      var blue = { gb:1, ie:1, de:1, fr:1, it:1, nl:1, be:1, at:1, pt:1, es:1 };
      return blue[market] ? "-blueOutlined" : "-grayOutlined";
    }

    // Mirrors the storefront's own markup: a <p class="a-ppu"><span>text</span></p>
    // per line, appended inside the price wrapper after the price span.
    var PPU_CLASS = "a-ppu text-xs text-gray flex flex-col font-normal mt-5";

    function applyPpu(card, product) {
      var lines    = (product && product.ppu) || [];
      var existing = card.querySelectorAll(".a-ppu");

      // Stale PPU belongs to the card's original product, so when the
      // recommendation has none it must be removed rather than left behind.
      if (lines.length === 0) {
        for (var r = 0; r < existing.length; r++) existing[r].remove();
        return;
      }

      var host = existing.length
        ? existing[0].parentNode
        : (card.querySelector(".m-prodCard__pricing .m-prodCard__text.-price")
           || card.querySelector(".m-prodCard__pricing"));
      if (!host) return;

      for (var d = existing.length - 1; d >= lines.length; d--) existing[d].remove();

      for (var i = 0; i < lines.length; i++) {
        var el = card.querySelectorAll(".a-ppu")[i];
        if (!el) {
          el = document.createElement("p");
          el.className = PPU_CLASS;
          el.appendChild(document.createElement("span"));
          host.appendChild(el);
        }
        (el.querySelector("span") || el).textContent = lines[i];
      }
    }

    function swapVisuals(card, product, instanceId) {
      if (!card || !product) return;
      if (card.getAttribute("data-opt-locked") === "true") return;
      if (card.getAttribute("data-opt-sku") === product.sku) return;

      if (!card.hasAttribute("data-opt-orig-pid")) {
        card.setAttribute("data-opt-orig-pid", card.getAttribute("data-productid") || "");
      }

      card.setAttribute("data-opt-instance", instanceId);
      card.setAttribute("data-opt-sku",      product.sku);
      card.setAttribute("data-opt-id",       product.id);
      if (product.familyId) card.setAttribute("data-opt-familyid", product.familyId);
      if (product.title)    card.setAttribute("data-opt-title", product.title);
      if (product.widgetName)     card.setAttribute("data-opt-widget",   product.widgetName);
      if (product.widgetPosition) card.setAttribute("data-opt-position", product.widgetPosition);

      // Title
      var titleEl = card.querySelector("em.m-prodCard__title, h2, h3, h4, [class*='title']");
      if (titleEl && product.title) titleEl.textContent = product.title;

      // Price — use deepestPriceSpan to handle n-levels of nesting
      var priceEl = card.querySelector("[class*='price'], .m-prodCard__pricing .m-prodCard__text");
      if (priceEl && product.price) {
        deepestPriceSpan(priceEl).textContent = product.price;
      }

      applyPpu(card, product);

      // Points. The label lives in a styled <span> inside .m-prodCard__points;
      // a loose selector matches the WRAPPER first (its own class contains
      // "point", and it precedes its child in document order), and writing
      // textContent there destroys the span and its styling. Target the span,
      // rebuilding it if an earlier swap already flattened it.
      var ptsWrap = card.querySelector(".m-prodCard__points");
      var ptsEl   = card.querySelector(".m-prodCard__points .m-prodCard__text.-points") ||
                    card.querySelector(".m-prodCard__text.-points");
      if (!ptsEl && ptsWrap) {
        ptsEl = document.createElement("span");
        ptsEl.className = "m-prodCard__text -points";
        ptsWrap.textContent = "";
        ptsWrap.appendChild(ptsEl);
      }
      if (ptsEl && product.points) ptsEl.textContent = product.points;

      // Image
      var img = card.querySelector("img");
      if (img && product.img) {
        if (img.src !== product.img) img.src = product.img;
        img.removeAttribute("srcset");
        if (product.title) img.alt = product.title;
      }

      // Links
      var links = card.querySelectorAll("a[href]");
      for (var li = 0; li < links.length; li++) {
        if (product.href) links[li].href = product.href;
      }

      card.setAttribute("data-productid", product.sku);

      // FIX: localized aria-label via getAddToCartLabel()
      var addBtn = card.querySelector('button[aria-label*="Add"], button.-shelfToggle');
      if (addBtn && product.title) {
        addBtn.setAttribute("aria-label", getAddToCartLabel(product.title, product.language, product.culture));
      }

      ensurePackStamp(card, product);

      // Override main link to navigate to correct PDP
      var mainLink = card.querySelector("a.m-prodCard__row.-content");
      if (mainLink && product.href && mainLink.parentNode) {
        mainLink.setAttribute("data-opt-href", product.href);
        var clone = mainLink.cloneNode(true);
        mainLink.parentNode.replaceChild(clone, mainLink);
        clone.addEventListener("click", function (e) {
          var href = this.getAttribute("data-opt-href");
          if (href) {
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) window.open(href, "_blank", "noopener,noreferrer");
            else window.location.href = href;
          }
        }, true);
      }
    }

    function ensurePackStamp(card, product) {
      if (!card) return;
      var header = card.querySelector(".m-prodCard__header");
      if (!header) return;

      // Feed stamps win where present: they are localized, carry the site's own
      // style token, and cover types the built-in copy never had (e.g. "New",
      // limited-time offers). Markets whose feed has no stamp attributes fall
      // back to the pack-savings copy.
      var wanted = (product && product.stamps && product.stamps.length)
        ? product.stamps
        : [];

      if (wanted.length === 0 && product && product.hasPack === true) {
        var legacy = getStampText(
          product.culture  || getCulture(),
          product.language || getLanguage()
        );
        if (legacy) {
          wanted = [{
            text: legacy,
            cls:  getStampClass(product.market || getMarket())
          }];
        }
      }

      var host = header.querySelector(".m-prodCard__tag");

      if (wanted.length === 0) {
        if (host) {
          var stale = host.querySelectorAll(".a-stamp");
          for (var s = 0; s < stale.length; s++) stale[s].remove();
          if (host.children.length === 0) host.remove();
        }
        return;
      }

      if (!host) {
        host = document.createElement("div");
        host.className = "m-prodCard__tag";
        header.firstChild ? header.insertBefore(host, header.firstChild) : header.appendChild(host);
      }

      var existing = host.querySelectorAll(".a-stamp");
      for (var d = existing.length - 1; d >= wanted.length; d--) existing[d].remove();

      for (var i = 0; i < wanted.length; i++) {
        var em = host.querySelectorAll(".a-stamp")[i];
        if (!em) {
          var outer = document.createElement("div");
          em = document.createElement("em");
          outer.appendChild(em);
          host.appendChild(outer);
        }
        em.className = "a-stamp " + (wanted[i].cls || "-grayOutlined");
        em.textContent = wanted[i].text;
      }
    }

    // ---------- HEADING ----------

    function applyHeading(inst) {
      if (!inst.titleCopy || !inst.targetCarousel) return;
      var h = inst.targetCarousel.querySelector(HEADING_SEL);
      if (!h) return;
      if (!h.hasAttribute("data-opt-orig-heading")) {
        h.setAttribute("data-opt-orig-heading", (h.textContent || "").trim());
      }
      h.setAttribute("data-opt-instance", inst.instanceId);
      if (h.textContent.trim() !== inst.titleCopy) h.textContent = inst.titleCopy;
    }

    // ---------- PRODUCT APPLICATION ----------

    function applyProducts(inst) {
      var carousel = inst.targetCarousel;
      if (!carousel) return false;
      var cards = Array.prototype.slice.call(carousel.querySelectorAll(CARD_SEL));
      if (cards.length === 0 || inst.feedn.length === 0) return false;

      var limit = Math.min(cards.length, inst.feedn.length, inst.replaceCount);
      for (var i = 0; i < limit; i++) {
        swapVisuals(cards[i], inst.feedn[i], inst.instanceId);
      }
      inst.swappedCount = limit;
      inst.applied = true;
      carousel.setAttribute("data-opt-ready", "true");
      return true;
    }

    function tryApply(inst) {
      if (!inst.carouselReady || !inst.recsReady) return;
      applyHeading(inst);
      applyProducts(inst);
    }

    // ---------- CAROUSEL TARGETING ----------

    function findTargetCarousel(inst) {
      if (inst.targetCarousel) return inst.targetCarousel;

      var all = document.querySelectorAll(inst.carouselSelector);
      if (all.length === 0) return null;

      var target = null;
      var headingText = inst.targetHeading;

      if (headingText) {
        var lowerHeading = headingText.toLowerCase();
        for (var i = 0; i < all.length; i++) {
          var h = all[i].querySelector(HEADING_SEL);
          if (h && h.textContent.trim().toLowerCase().indexOf(lowerHeading) > -1) {
            target = all[i];
            break;
          }
        }
        if (!target) return null;
      } else {
        target = all[0];
      }

      for (var j = 0; j < all.length; j++) {
        if (all[j] !== target) all[j].setAttribute("data-opt-ready", "true");
      }

      inst.targetCarousel = target;
      target.setAttribute("data-opt-target-" + inst.instanceId, "true");
      return target;
    }

    function positionCarousel(inst) {
      if (!inst.positionTarget || inst.positionType === "none") return;

      var carousel = inst.targetCarousel;
      var target   = document.querySelector(inst.positionTarget);
      if (!carousel || !target || !target.parentNode) return;

      var preLoader = carousel.closest(".preComponentLoader");
      var script    = null;

      if (preLoader && preLoader.previousElementSibling) {
        script = preLoader.previousElementSibling;
        if (!(script.tagName === "SCRIPT" && script.id && script.id.indexOf("ProductCarousel-") === 0)) {
          script = null;
        }
      }

      var toMove = (script && script.parentNode) ? script.parentNode : carousel;

      try {
        if (inst.positionType === "before") {
          target.parentNode.insertBefore(toMove, target);
        } else if (inst.positionType === "after") {
          target.parentNode.insertBefore(toMove, target.nextSibling || null);
        } else if (inst.positionType === "replace") {
          target.parentNode.replaceChild(toMove, target);
        }
      } catch (_) {}
    }

    // ---------- RE-RENDER DETECTION ----------

    function setupObserver(inst) {
      var carousel = inst.targetCarousel;
      if (!carousel || inst._observer) return;

      var mo = new MutationObserver(function () {
        clearTimeout(mo._d);
        mo._d = setTimeout(function () {
          // Re-apply heading in case Vue re-rendered it after our initial write.
          applyHeading(inst);
          if (!inst.applied || inst.feedn.length === 0) return;
          var cards = carousel.querySelectorAll(CARD_SEL);
          if (cards.length === 0) return;
          if (!cards[0].hasAttribute("data-opt-sku")) {
            inst.applied = false;
            tryApply(inst);
          }
        }, 250);
      });

      mo.observe(carousel, { childList: true, subtree: true });
      inst._observer = mo;
    }

    // ---------- API INTERCEPTION HELPERS ----------

    function isInterceptableApi(pathname) {
      var p = pathname.toLowerCase();
      return (
        p.indexOf("/api/shelf")        !== -1 ||
        p.indexOf("/api/cart")         !== -1 ||
        p.indexOf("/api/shoppinglist") !== -1
      );
    }

    function findOpByOriginalPid(mgr, originalPid) {
      if (!originalPid) return null;
      var now   = Date.now();
      var match = null;
      mgr.pendingOps.forEach(function (op, opId) {
        if (now > op.expiresAt) { mgr.clearOp(opId); return; }
        if (op.originalProductId === originalPid) match = op;
      });
      return match;
    }

    function findMostRecentOp(mgr) {
      var now        = Date.now();
      var latest     = null;
      var latestTime = 0;
      mgr.pendingOps.forEach(function (op, opId) {
        if (now > op.expiresAt) { mgr.clearOp(opId); return; }
        if (op.createdAt > latestTime) { latestTime = op.createdAt; latest = op; }
      });
      return latest;
    }

    function extractSkuFromUrl(url) {
      try {
        var parsed = new URL(url, location.origin);
        return parsed.searchParams.get("Sku") || parsed.searchParams.get("sku") || "";
      } catch (_) { return ""; }
    }

    function findOpForRequest(mgr, url, method) {
      try {
        var parsed = new URL(url, location.origin);
        if (!isInterceptableApi(parsed.pathname)) return null;
      } catch (_) { return null; }

      var urlSku = extractSkuFromUrl(url);
      if (urlSku) {
        var byPid = findOpByOriginalPid(mgr, urlSku);
        if (byPid) return byPid;
      }

      if (method && method.toUpperCase() === "POST") {
        return findMostRecentOp(mgr);
      }
      return null;
    }

    // ---------- URL REWRITING ----------

    function rewriteUrl(url, op) {
      try {
        var parsed  = new URL(url, location.origin);
        var path    = parsed.pathname.toLowerCase();
        var changed = false;

        if (path.indexOf("/api/shelf") !== -1) {
          ["Sku", "sku"].forEach(function (k) {
            if (parsed.searchParams.has(k)) { parsed.searchParams.set(k, op.newSku); changed = true; }
          });
          if (op.newFamilyId) {
            ["FamilyId", "familyId", "familyid"].forEach(function (k) {
              if (parsed.searchParams.has(k)) { parsed.searchParams.set(k, op.newFamilyId); changed = true; }
            });
          }
          if (changed) op.shelfRewritten = true;
        }

        if (path.indexOf("/api/shoppinglist") !== -1) {
          ["sku", "Sku", "SKU"].forEach(function (k) {
            if (parsed.searchParams.has(k)) { parsed.searchParams.set(k, op.newSku); changed = true; }
          });
        }

        return changed ? parsed.toString() : url;
      } catch (_) { return url; }
    }

    // ---------- BODY REWRITING ----------

    function rewriteBody(body, headers, op, url) {
      if (!body || !op) return body;

      var path = "";
      try { path = new URL(url, location.origin).pathname.toLowerCase(); } catch (_) {}

      var isCartPost = path.indexOf("/api/cart")         !== -1;
      var isListPost = path.indexOf("/api/shoppinglist") !== -1;

      try {
        if (typeof body === "string") {
          var trimmed = body.trim();

          if (/^[\{\[]/.test(trimmed) && trimmed.indexOf(":") > -1) {
            var obj = JSON.parse(trimmed);
            rewriteJsonObj(obj, op, isCartPost, isListPost);
            return JSON.stringify(obj);
          }

          var ct = "";
          try {
            if (headers && headers.get) ct = (headers.get("content-type") || "").toLowerCase();
            else if (headers) ct = (headers["content-type"] || headers["Content-Type"] || "").toLowerCase();
          } catch (_) {}

          if (ct.indexOf("application/x-www-form-urlencoded") > -1) {
            var usp = new URLSearchParams(body);
            ["sku", "Sku", "SKU", "selectedSku", "SelectedSku"].forEach(function (k) {
              if (usp.has(k)) usp.set(k, op.newSku);
            });
            if (op.newFamilyId) {
              ["familyId", "FamilyId", "familyid"].forEach(function (k) {
                if (usp.has(k)) usp.set(k, op.newFamilyId);
              });
            }
            return usp.toString();
          }
        }

        if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
          ["sku", "Sku", "SKU", "selectedSku", "SelectedSku"].forEach(function (k) {
            if (body.has(k)) body.set(k, op.newSku);
          });
          return body;
        }

        if (typeof FormData !== "undefined" && body instanceof FormData) {
          ["sku", "Sku", "SKU", "selectedSku", "SelectedSku"].forEach(function (k) {
            if (body.has(k)) body.set(k, op.newSku);
          });
          if (op.newFamilyId) {
            ["familyId", "FamilyId", "familyid"].forEach(function (k) {
              if (body.has(k)) body.set(k, op.newFamilyId);
            });
          }
          return body;
        }
      } catch (_) {}

      return body;
    }

    function rewriteJsonObj(obj, op, isCartPost, isListPost) {
      if (!obj || typeof obj !== "object") return;
      Object.keys(obj).forEach(function (key) {
        var val = obj[key];

        if (/^(Sku|sku|SKU|selectedSku|SelectedSku)$/i.test(key)) {
          if (isCartPost) {
            if (String(val) === op.originalProductId) {
              obj[key] = op.newSku;
              op.cartRewritten = true;
            }
          } else {
            obj[key] = op.newSku;
          }
        }

        if (/^(FamilyId|familyId|family_id)$/i.test(key) && op.newFamilyId) {
          obj[key] = op.newFamilyId;
        }

        if (val && typeof val === "object") {
          rewriteJsonObj(val, op, isCartPost, isListPost);
        }
      });
    }

    // ---------- RESPONSE HANDLER ----------

    function handleResponse(mgr, url, method, responseText, op) {
      if (!op) return;
      var success = true;
      if (responseText) {
        try {
          var data = JSON.parse(responseText);
          if (data.hasOwnProperty("Success")) success = data.Success === true;
        } catch (_) {}
      }
      if (!success) return;

      var path = "";
      try { path = new URL(url, location.origin).pathname.toLowerCase(); } catch (_) {}

      var methodUpper = (method || "").toUpperCase();
      var isTerminal =
        (path.indexOf("/api/cart")         !== -1 && methodUpper === "POST") ||
        (path.indexOf("/api/shoppinglist") !== -1 && methodUpper === "POST" && path !== "/api/shoppinglists");

      if (isTerminal) mgr.clearOp(op.opId);
    }

    // ---------- XHR INTERCEPTOR ----------

    function installXhrInterceptor(mgr) {
      if (mgr._xhrInstalled) return;
      mgr._xhrInstalled = true;

      var _open    = XMLHttpRequest.prototype.open;
      var _send    = XMLHttpRequest.prototype.send;
      var _setHdr  = XMLHttpRequest.prototype.setRequestHeader;

      XMLHttpRequest.prototype.open = function (m, u) {
        this.__optm = { method: m, url: u, headers: {}, op: null };
        var op = findOpForRequest(mgr, u, m);
        if (op) {
          this.__optm.op = op;
          var rewritten = rewriteUrl(u, op);
          if (rewritten !== u) { this.__optm.rewrittenUrl = rewritten; u = rewritten; }
        }
        return _open.call(this, m, u);
      };

      XMLHttpRequest.prototype.setRequestHeader = function (h, v) {
        if (this.__optm) this.__optm.headers[h] = v;
        return _setHdr.call(this, h, v);
      };

      XMLHttpRequest.prototype.send = function (body) {
        var meta = this.__optm || {};
        var op   = meta.op;
        var url  = meta.rewrittenUrl || meta.url || "";

        if (!op && meta.method && meta.method.toUpperCase() === "POST") {
          op = findOpForRequest(mgr, meta.url || "", "POST");
          if (op) meta.op = op;
        }

        if (op && body && meta.method && meta.method.toUpperCase() === "POST") {
          body = rewriteBody(body, meta.headers, op, url);
        }

        var xhr = this;
        this.addEventListener("load", function () {
          if (xhr.status >= 200 && xhr.status < 300 && meta.op) {
            handleResponse(mgr, url, meta.method, xhr.responseText, meta.op);
          }
        });

        return _send.call(this, body);
      };
    }

    // ---------- FETCH INTERCEPTOR ----------

    function installFetchInterceptor(mgr) {
      if (mgr._fetchInstalled) return;
      mgr._fetchInstalled = true;

      var _fetch = window.fetch;
      if (!_fetch) return;

      window.fetch = function (input, init) {
        var url    = typeof input === "string" ? input : (input && input.url ? input.url : String(input));
        var method = (init && init.method) || "GET";

        try {
          var parsed = new URL(url, location.origin);
          if (isInterceptableApi(parsed.pathname)) {
            var op = findOpForRequest(mgr, url, method);
            if (op) {
              var newUrl = rewriteUrl(url, op);
              if (newUrl !== url) {
                input = typeof input === "string" ? newUrl : new Request(newUrl, input);
                url   = newUrl;
              }
              if (init && init.body && method.toUpperCase() === "POST") {
                init = Object.assign({}, init, {
                  body: rewriteBody(init.body, init.headers, op, url)
                });
              }
              return _fetch.call(this, input, init).then(function (response) {
                if (response.ok) {
                  response.clone().text().then(function (text) {
                    handleResponse(mgr, url, method, text, op);
                  }).catch(function () {});
                }
                return response;
              });
            }
          }
        } catch (_) {}

        return _fetch.call(this, input, init);
      };
    }

    // ---------- CLICK HANDLER ----------

    function installClickHandler(mgr) {
      if (mgr._clickInstalled) return;
      mgr._clickInstalled = true;

      document.addEventListener("click", function (e) {
        var el = e.target && e.target.closest ? e.target.closest("button, [role='button'], a") : null;
        if (!el) return;

        var card = el.closest(CARD_SEL);
        if (!card) return;

        var label = ((el.getAttribute("aria-label") || "") + " " + (el.textContent || "")).toLowerCase();

        var isShelfToggle =
          el.classList.contains("-shelfToggle") ||
          label.indexOf("to cart")   > -1 ||
          label.indexOf("al carrito") > -1 ||
          label.indexOf("au panier")  > -1 ||
          label.indexOf("do koszyka") > -1 ||
          label.indexOf("select")    > -1;

        var isAddToList =
          el.classList.contains("m-shoplistsAddItem__button") ||
          label.indexOf("add to list")   > -1 ||
          label.indexOf("playlist_add")  > -1;

        if (!isShelfToggle && !isAddToList) return;

        var instInfo = mgr.findInstanceForCard(card);
        if (!instInfo) return;

        var inst      = instInfo.instance;
        var cardIndex = instInfo.cardIndex;
        if (cardIndex < 0 || cardIndex >= inst.swappedCount) return;

        var p          = null;
        var stampedSku = card.getAttribute("data-opt-sku");
        if (stampedSku) {
          p = inst.bySku[stampedSku];
          if (!p) p = inst.feedn.find(function (x) { return x && x.sku === stampedSku; });
        }
        if (!p && cardIndex >= 0 && inst.feedn[cardIndex]) p = inst.feedn[cardIndex];
        if (!p || !p.sku) return;

        var existingOpId = card.getAttribute("data-opt-opid");
        if (existingOpId && mgr.pendingOps.has(existingOpId)) {
          var existingOp = mgr.pendingOps.get(existingOpId);
          if (Date.now() <= existingOp.expiresAt) return;
          mgr.clearOp(existingOpId);
        }

        var originalPid = card.getAttribute("data-opt-orig-pid") || "";
        if (!originalPid) return;

        var opId = "op-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
        var now  = Date.now();

        mgr.pendingOps.set(opId, {
          opId:            opId,
          instanceId:      inst.instanceId,
          card:            card,
          originalProductId: originalPid,
          newSku:          p.sku,
          newFamilyId:     p.familyId || "",
          createdAt:       now,
          expiresAt:       now + 4000,
          shelfRewritten:  false,
          cartRewritten:   false,
          apiType:         isAddToList ? "list" : "cart"
        });

        card.setAttribute("data-opt-locked", "true");
        card.setAttribute("data-opt-opid",   opId);
        setTimeout(function () { mgr.clearOp(opId); }, 4000);
      }, true);
    }

    // ---------- FORM SUBMIT HANDLER ----------

    function installFormHandler(mgr) {
      if (mgr._formInstalled) return;
      mgr._formInstalled = true;

      document.addEventListener("submit", function (e) {
        var form = e.target;
        if (!form || mgr.pendingOps.size === 0) return;

        var op = null;
        mgr.pendingOps.forEach(function (o) {
          if (o.card && o.card.contains(form)) op = o;
        });
        if (!op) return;

        var inputs = form.querySelectorAll(
          "input[name='sku'], input[name='Sku'], input[name='SKU'], input[name='selectedSku']"
        );
        for (var i = 0; i < inputs.length; i++) {
          inputs[i].value = op.newSku;
        }
      }, true);
    }

    // ---------- SMARTRECS CALLBACK ----------

    function installSmartRecs(mgr) {
      if (mgr._smartRecsInstalled) return;
      mgr._smartRecsInstalled = true;

      var origCb = window.PeeriusCallbacks && window.PeeriusCallbacks.smartRecs;
      window.PeeriusCallbacks = window.PeeriusCallbacks || {};

      window.PeeriusCallbacks.smartRecs = function (json) {
        Object.keys(mgr.instances).forEach(function (id) {
          processRecsForInstance(mgr, mgr.instances[id], json);
        });
        if (typeof origCb === "function") {
          try { origCb(json); } catch (_) {}
        }
      };
    }

    function processRecsForInstance(mgr, inst, json) {
      if (inst.recsReady && inst.applied) return;

      var marketSuffix      = getWidgetMarketSuffix();
      var requestedName     = trimStr(inst.positionName || "");
      var requestedNameLc   = requestedName.toLowerCase();
      var baseName          = requestedName.replace(/([A-Z]{2})$/i, "");
      var baseNameLc        = baseName.toLowerCase();
      var hasTwoLetterSuffix = /([A-Z]{2})$/i.test(requestedName);

      var targets = {};
      function addTarget(name) {
        var n = trimStr(name).toLowerCase();
        if (n) targets[n] = true;
      }
      addTarget(requestedName);
      addTarget(baseName);
      if (marketSuffix) {
        addTarget(baseName + marketSuffix);
        if (!hasTwoLetterSuffix) addTarget(requestedName + marketSuffix);
      }

      var widgets = (json || []).filter(function (w) {
        var pos = trimStr((w && w.position) || "").toLowerCase();
        var wid = trimStr((w && w.widget)   || "").toLowerCase();
        return !!targets[pos] || !!targets[wid];
      });
      if (widgets.length === 0) return;

      var preferred = [];
      if (hasTwoLetterSuffix) {
        preferred.push(requestedNameLc);
        if (marketSuffix) preferred.push((baseName + marketSuffix).toLowerCase());
        preferred.push(baseNameLc);
      } else {
        if (marketSuffix) preferred.push((requestedName + marketSuffix).toLowerCase());
        preferred.push(requestedNameLc);
        preferred.push(baseNameLc);
      }

      // FIX: some accounts are shared across markets (e.g. the SG+MY account)
      // and return MULTIPLE widgets at the same position — one per market —
      // where the other market's widget is empty (recs: []). Matching purely by
      // position would grab the first same-position widget (possibly the empty
      // one) and bail. So skip empty-recs widgets and prefer the widget whose
      // NAME carries this market's suffix (e.g. homeBestSellerWidgetMY).
      function hasRecs(w) { return w && Array.isArray(w.recs) && w.recs.length > 0; }
      var marketSfx = trimStr(marketSuffix).toLowerCase(); // e.g. "my"

      var widget = null;

      // 1) A widget whose NAME ends with this market's suffix AND has recs.
      if (marketSfx) {
        widget = widgets.find(function (w) {
          var wid = trimStr((w && w.widget) || "").toLowerCase();
          return hasRecs(w) && wid.slice(-marketSfx.length) === marketSfx;
        }) || null;
      }

      // 2) Preferred name/position match, but only if that widget has recs.
      if (!widget) {
        preferred.some(function (name) {
          var match = widgets.find(function (w) {
            var wid = trimStr((w && w.widget)   || "").toLowerCase();
            var pos = trimStr((w && w.position) || "").toLowerCase();
            return (wid === name || pos === name) && hasRecs(w);
          });
          if (match) { widget = match; return true; }
          return false;
        });
      }

      // 3) Any matched widget that actually has recs.
      if (!widget) widget = widgets.find(hasRecs) || null;

      // Nothing usable — bail (leaves the carousel on its native content).
      if (!widget) return;

      inst.feedn = widget.recs.map(function (p) {
        return normRecsProduct(p, widget.widget, widget.position);
      }).filter(function (p) { return p !== null; });

      inst.byTitle = {};
      inst.bySku   = {};
      inst.feedn.forEach(function (p) {
        if (p.title) inst.byTitle[normText(p.title)] = p;
        if (p.sku)   inst.bySku[p.sku]               = p;
      });

      inst.recsReady = true;
      tryApply(inst);
    }

    // ---------- INSTANCE INIT ----------

    function initInstance(mgr, inst) {
      if (!inst.carouselSelector) return;

      // FIX: seal the context now that the DOM/dataLayer has had time to load.
      // Both DOMContentLoaded and the setTimeout(100) delay in register() ensure
      // that by the time we reach here, most async data sources are available.
      markContextReady();

      // FIX: retry when the carousel selector returns no elements yet (e.g.
      // Vue hasn't rendered the component) instead of silently returning.
      // Cap retries at 80 attempts (~8 seconds) to avoid spinning forever.
      var carouselRetries = 0;
      var MAX_CAROUSEL_RETRIES = 80;

      function waitForCarousel() {
        var all = document.querySelectorAll(inst.carouselSelector);

        if (all.length === 0) {
          if (++carouselRetries < MAX_CAROUSEL_RETRIES) {
            setTimeout(waitForCarousel, 100);
          }
          // Selector never appeared — give up silently after ~8 s.
          return;
        }

        var carousel = findTargetCarousel(inst);
        if (!carousel) {
          // Selector exists but target heading not matched yet — keep trying.
          if (++carouselRetries < MAX_CAROUSEL_RETRIES) {
            setTimeout(waitForCarousel, 100);
          }
          return;
        }

        // Carousel found — now wait for cards to render.
        function waitForCards() {
          var cards = carousel.querySelectorAll(CARD_SEL);
          if (cards.length > 0) {
            inst.carouselReady = true;
            tryApply(inst);
            setupObserver(inst);
          } else {
            setTimeout(waitForCards, 100);
          }
        }
        setTimeout(waitForCards, 200);

        // Fallback: reveal carousel after 8 s even if recs never arrive.
        var elapsed          = 0;
        var fallbackInterval = 500;
        function fallbackReveal() {
          elapsed += fallbackInterval;
          if (inst.applied) {
            carousel.setAttribute("data-opt-ready", "true");
            return;
          }
          if (elapsed >= 8000) {
            if (inst.recsReady) tryApply(inst);
            setTimeout(function () { carousel.setAttribute("data-opt-ready", "true"); }, 500);
            return;
          }
          setTimeout(fallbackReveal, fallbackInterval);
        }
        setTimeout(fallbackReveal, fallbackInterval);

        setTimeout(function () { positionCarousel(inst); }, 200);
      }

      waitForCarousel();
    }

    // ========== MANAGER OBJECT ==========

    var manager = {
      _xhrInstalled:       false,
      _fetchInstalled:     false,
      _clickInstalled:     false,
      _formInstalled:      false,
      _smartRecsInstalled: false,
      instances:           {},
      pendingOps:          new Map(),

      getCulture:    getCulture,
      getRawCulture: getRawCulture,
      getMarket:     getMarket,
      getCurrency:   getPriceCurrency,

      register: function (instanceId, config) {
        var inst = {
          instanceId:      instanceId,
          carouselSelector: config.carouselSelector,
          titleCopy:       config.titleCopy,
          replaceCount:    config.replaceCount,
          positionName:    config.positionName,
          positionTarget:  config.positionTarget,
          positionType:    config.positionType,
          targetHeading:   config.targetHeading,
          targetCarousel:  null,
          feedn:           [],
          byTitle:         {},
          bySku:           {},
          swappedCount:    0,
          applied:         false,
          recsReady:       false,
          carouselReady:   false,
          _observer:       null
        };

        this.instances[instanceId] = inst;

        installClickHandler(this);
        installXhrInterceptor(this);
        installFetchInterceptor(this);
        installFormHandler(this);
        installSmartRecs(this);

        var self = this;
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", function () {
            setTimeout(function () { initInstance(self, inst); }, 100);
          });
        } else {
          setTimeout(function () { initInstance(self, inst); }, 100);
        }
      },

      findInstanceForCard: function (card) {
        var keys = Object.keys(this.instances);
        for (var i = 0; i < keys.length; i++) {
          var inst = this.instances[keys[i]];
          if (!inst.targetCarousel || !inst.applied) continue;
          if (!inst.targetCarousel.contains(card)) continue;
          var cards = Array.prototype.slice.call(inst.targetCarousel.querySelectorAll(CARD_SEL));
          var idx   = cards.indexOf(card);
          if (idx >= 0) return { instance: inst, cardIndex: idx };
        }
        return null;
      },

      clearOp: function (opId) {
        var op = this.pendingOps.get(opId);
        if (op) {
          if (op.card) {
            op.card.removeAttribute("data-opt-locked");
            op.card.removeAttribute("data-opt-opid");
          }
          this.pendingOps.delete(opId);
        }
      }
    };

    return manager;
  }
})();
