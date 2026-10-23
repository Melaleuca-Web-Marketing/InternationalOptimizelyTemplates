/**
 * tmpl-herocarousel-v2 apply_js
 *
 * v1 behavior, unchanged: replaces ALL hero carousel slides with slides
 * defined in a JSON configuration. Supports both static and video slide types.
 *
 * v2 additions:
 * - Optional single-slide targeting via the "slide_index" field. When set,
 *   this instance replaces ONLY that one slide (by its 0-based position in
 *   the carousel) and leaves every other slide's DOM completely untouched.
 *   This lets two (or more) instances of this template run concurrently
 *   against the same carousel, each owning a different slide, so Slide 1
 *   and Slide 2 can each run their own independent A/B test without the
 *   race condition that would occur if two instances both tried to replace
 *   the whole slide array. Leave "slide_index" blank to get the original
 *   v1 full-carousel-replacement behavior untouched.
 * - Lazy-image hardening: any <img> found inside a slide's "description"
 *   HTML that carries a data-src attribute (e.g. an editor-authored
 *   mobile-only "width extender" image meant to force the content column's
 *   width) is promoted immediately -- its data-src is copied into src and
 *   it is marked data-ll-status="loaded". This closes a bug class where such
 *   an image sits inside a "hidden on desktop" wrapper and the site's
 *   lazy-load observer never fires on it (because it never has visible
 *   layout to intersect), leaving its src empty, its width 0, and the
 *   content column collapsed to text width -- which breaks centering at
 *   the breakpoint where that image was supposed to be visible.
 *
 * Features (unchanged from v1):
 * - Parses slide definitions from JSON in extension.slides_json
 * - Removes all existing slides (remove-then-insert strategy) [full mode]
 * - Inserts new slides based on JSON configuration
 * - Supports static slides and video slides with JWPlayer modal
 * - Configurable link behavior (full banner, button only, or none)
 * - Bandwidth detection for optimal video quality
 * - Editor preview mode
 */
(function () {
    var utils = window.optimizely.get("utils");
    var KEY = "opti-herocarousel-" + String(extension.$instance);
    var INSTANCE_ID = String(extension.$instance);
    var SELECTOR = (extension.selector || ".o-heroCarousel__slider").trim();
    var DEBUG = String(extension.debug_logging || "false").toLowerCase() === "true";
    var LISTENER_KEY = "opti-video-listener-" + INSTANCE_ID;
    var ACTIVE_MODAL_KEY = "opti-video-cleanup-" + INSTANCE_ID;

    // v2: optional single-slide targeting
    var SLIDE_INDEX_RAW = String(extension.slide_index != null ? extension.slide_index : "").trim();
    var SLIDE_INDEX = SLIDE_INDEX_RAW === "" ? null : parseInt(SLIDE_INDEX_RAW, 10);
    var SINGLE_SLIDE_MODE = (SLIDE_INDEX !== null && !isNaN(SLIDE_INDEX) && SLIDE_INDEX >= 0);

    // ==================== LOGGING ====================

    var BADGE = "background:#6366F1;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600";
    var C_INFO = "color:#10B981";
    var C_WARN = "color:#F59E0B";
    var C_ERR = "color:#EF4444";
    var C_EDITOR = "color:#A855F7";

    function logI() {
        if (!DEBUG) return;
        var a = [].slice.call(arguments);
        console.log("%cHERO-CAROUSEL%c " + a.shift(), BADGE, C_INFO, ...a);
    }
    function logW() {
        if (!DEBUG) return;
        var a = [].slice.call(arguments);
        console.warn("%cHERO-CAROUSEL%c " + a.shift(), BADGE, C_WARN, ...a);
    }
    function logE() {
        var a = [].slice.call(arguments);
        console.error("%cHERO-CAROUSEL%c " + a.shift(), BADGE, C_ERR, ...a);
    }
    function logEditor() {
        if (!DEBUG) return;
        var a = [].slice.call(arguments);
        console.log("%cHERO-CAROUSEL%c " + a.shift(), BADGE, C_EDITOR, ...a);
    }

    // ==================== ENVIRONMENT DETECTION ====================

    function detectEnv() {
        var env = { isEditor: false, hasJQ: false, jqVer: null, hasSlick: false, editorMethod: null };
        try {
            var st = window.optimizely && window.optimizely.get && window.optimizely.get("state");
            if (st && (st.isEditor || st.getActiveEditorElement || st.getEditorContext)) {
                env.isEditor = true;
                env.editorMethod = "state-api-current";
            }
            if (!env.isEditor && window.optimizelyEditor) {
                env.isEditor = true;
                env.editorMethod = "window.optimizelyEditor";
            }
            if (!env.isEditor && window.parent !== window) {
                try {
                    if (window.parent.optimizelyEditor) {
                        env.isEditor = true;
                        env.editorMethod = "parent.optimizelyEditor";
                    } else if (window.parent.optimizely && window.parent.optimizely.get) {
                        var parentState = window.parent.optimizely.get("state");
                        if (parentState && (parentState.isEditor || parentState.getActiveEditorElement)) {
                            env.isEditor = true;
                            env.editorMethod = "parent-state-api";
                        }
                    }
                } catch (e) { }
            }
            if (!env.isEditor && window.location.href.indexOf("optimizely_editor") > -1) {
                env.isEditor = true;
                env.editorMethod = "url-parameter";
            }
        } catch (_) { }
        try {
            var $ = window.jQuery || window.$;
            env.hasJQ = !!$;
            env.jqVer = ($ && $.fn && $.fn.jquery) || null;
            env.hasSlick = !!($ && $.fn && $.fn.slick);
        } catch (_) { }
        return env;
    }

    // ==================== JSON PARSING ====================

    function parseSlides() {
        var raw = extension.slides_json || "";
        if (!raw.trim()) {
            logW("No slides JSON provided");
            return null;
        }
        try {
            var slides = JSON.parse(raw);
            if (!Array.isArray(slides)) {
                logE("Slides JSON must be an array (found: " + typeof slides + "). Wrap your slide object(s) in [ ... ].");
                return null;
            }
            if (slides.length === 0) {
                logW("Slides JSON array is empty");
                return null;
            }

            // v2: validate structure per-slide so a malformed entry names itself
            // instead of surfacing as a generic downstream TypeError.
            var structuralErrors = [];
            for (var i = 0; i < slides.length; i++) {
                var s = slides[i];
                if (!s || typeof s !== "object" || Array.isArray(s)) {
                    structuralErrors.push("Slide at index " + i + " is not a valid object (found: " + JSON.stringify(s) + "). Check for a missing/extra comma or bracket in slides_json.");
                }
            }
            if (structuralErrors.length) {
                structuralErrors.forEach(function (msg) { logE(msg); });
                logE("Aborting: slides_json has " + structuralErrors.length + " malformed entr" + (structuralErrors.length === 1 ? "y" : "ies") + ".");
                return null;
            }

            logI("Parsed", slides.length, "slides from JSON");
            return slides;
        } catch (e) {
            logE("Failed to parse slides JSON:", e.message);
            return null;
        }
    }

    // v2: warn (non-fatal) about video slides missing any playable URL --
    // these still render (defaults cover every field), they just won't have
    // anything for the modal to play, which is easy to miss in a JSON blob.
    function warnAboutMissingVideoUrls(slidesToCheck) {
        for (var i = 0; i < slidesToCheck.length; i++) {
            var s = slidesToCheck[i];
            if (!isVideoSlide(s)) continue;
            var urlCheck = {
                hls: s.videoHls, dash: s.videoDash,
                progressive1080: s.videoUrl1080, progressive720: s.videoUrl720,
                progressive360: s.videoUrl360, progressive270: s.videoUrl270, progressive144: s.videoUrl144
            };
            if (!hasAnyVideoUrl(urlCheck)) {
                logW("Slide at index " + i + " has type \"video\" but no playable video URL fields are set (videoHls/videoDash/videoUrl1080/720/360/270/144). The play button will show but the modal will have nothing to play.");
            }
        }
    }

    // ==================== VIDEO CONFIGURATION ====================

    var videoConfigs = {}; // Store video configs per slide index

    function buildVideoConfig(slide, index) {
        return {
            mediaId: "opti-video-" + INSTANCE_ID + "-" + index,
            title: slide.videoTitle || "Video",
            description: slide.videoDescription || "",
            culture: slide.videoCulture || "en-US",
            runTimeSeconds: parseInt(slide.videoRuntime, 10) || 180,
            hls: slide.videoHls || "",
            dash: slide.videoDash || "",
            progressive1080: slide.videoUrl1080 || "",
            progressive720: slide.videoUrl720 || "",
            progressive360: slide.videoUrl360 || "",
            progressive270: slide.videoUrl270 || "",
            progressive144: slide.videoUrl144 || "",
            thumbnailImageUrl: slide.videoThumbnail || "",
            subtitlePath: slide.videoSubtitlePath || "",
            selectedUrl: "",
            selectedLabel: "",
            bandwidth: null
        };
    }

    function hasAnyVideoUrl(config) {
        return config.hls || config.dash || config.progressive1080 ||
            config.progressive720 || config.progressive360 ||
            config.progressive270 || config.progressive144;
    }

    // ==================== BANDWIDTH & VIDEO QUALITY ====================

    function estimateBandwidth(callback) {
        if (navigator.connection && navigator.connection.downlink) {
            return callback(navigator.connection.downlink);
        }
        var start = Date.now();
        var img = new Image();
        img.onload = function () {
            var mbps = (50000 * 8) / ((Date.now() - start) / 1000) / 1024 / 1024;
            callback(mbps);
        };
        img.onerror = function () { callback(1.0); };
        img.src = "https://cdnsc1.melaleuca.com/na/images/product-store/new-welcome/hero-1-small--en-us.jpg?t=" + Date.now();
    }

    function selectVideoQuality(bandwidth, config) {
        var qualities = [
            { min: 5.0, url: config.progressive1080, label: "1080p" },
            { min: 2.5, url: config.progressive720, label: "720p" },
            { min: 1.0, url: config.progressive360, label: "360p" },
            { min: 0.6, url: config.progressive270, label: "270p" },
            { min: 0, url: config.progressive144, label: "144p" }
        ];
        for (var i = 0; i < qualities.length; i++) {
            if (bandwidth >= qualities[i].min && qualities[i].url) {
                return { url: qualities[i].url, label: qualities[i].label };
            }
        }
        for (var j = 0; j < qualities.length; j++) {
            if (qualities[j].url) return { url: qualities[j].url, label: qualities[j].label };
        }
        return { url: "", label: "" };
    }

    function buildVideoSources(config) {
        var sources = [];
        if (config.hls) sources.push({ file: config.hls, type: "hls" });
        if (config.dash) sources.push({ file: config.dash, type: "dash" });
        if (config.selectedUrl) {
            sources.push({ file: config.selectedUrl, type: "mp4", label: config.selectedLabel || "auto" });
        }
        var progressive = [
            { key: "progressive1080", label: "1080p" },
            { key: "progressive720", label: "720p" },
            { key: "progressive360", label: "360p" },
            { key: "progressive270", label: "270p" },
            { key: "progressive144", label: "144p" }
        ];
        progressive.forEach(function (q) {
            var url = config[q.key];
            if (url && url !== config.selectedUrl) {
                sources.push({ file: url, type: "mp4", label: q.label });
            }
        });
        return sources;
    }

    // ==================== VIDEO MODAL ====================

    function waitForJWPlayer(callback) {
        if (typeof window.jwplayer !== "undefined") return callback(true);
        var attempts = 0;
        var check = setInterval(function () {
            if (typeof window.jwplayer !== "undefined") {
                clearInterval(check);
                callback(true);
            } else if (++attempts >= 50) {
                clearInterval(check);
                callback(false);
            }
        }, 100);
    }

    function showVideoModal(slideIndex) {
        var config = videoConfigs[slideIndex];
        if (!config) {
            logE("No video config found for slide index:", slideIndex);
            return;
        }

        var existingCleanup = window[ACTIVE_MODAL_KEY];
        if (typeof existingCleanup === "function") {
            existingCleanup(true);
        } else {
            var existing = document.querySelector('.opti-video-modal[data-opti-instance="' + INSTANCE_ID + '"]');
            if (existing) existing.remove();
        }

        var playerId = "opti-player-" + INSTANCE_ID + "-" + slideIndex;
        var modalHTML =
            '<div class="opti-video-modal" data-opti-instance="' + INSTANCE_ID + '">' +
            '<div class="opti-video-container">' +
            '<button class="opti-video-close" aria-label="Close video">' +
            '<span aria-hidden="true" class="a-icon material-icons -inherit">close</span>' +
            '</button>' +
            '<div class="opti-video-loading"></div>' +
            '<div class="opti-video-player" id="' + playerId + '"></div>' +
            '</div></div>';

        document.body.insertAdjacentHTML("beforeend", modalHTML);
        var modal = document.querySelector('.opti-video-modal[data-opti-instance="' + INSTANCE_ID + '"]');
        if (!modal) return;

        var player = null;
        var removed = false;
        var escHandler = null;
        var cleanupModal = function (immediate) {
            if (removed) return;
            removed = true;
            window[ACTIVE_MODAL_KEY] = null;
            if (escHandler) document.removeEventListener("keydown", escHandler);
            if (player) {
                try { player.remove(); } catch (e) { }
                player = null;
            }
            if (immediate) {
                if (modal.parentNode) modal.remove();
                return;
            }
            modal.classList.remove("opti-visible");
            setTimeout(function () {
                if (modal.parentNode) modal.remove();
            }, 300);
        };
        window[ACTIVE_MODAL_KEY] = cleanupModal;

        // Fade in
        setTimeout(function () { modal.classList.add("opti-visible"); }, 10);

        // Initialize player
        waitForJWPlayer(function (success) {
            if (removed) return;
            if (!success) {
                modal.querySelector(".opti-video-loading").style.display = "none";
                return;
            }

            var sources = buildVideoSources(config);
            if (!sources.length) {
                modal.querySelector(".opti-video-loading").style.display = "none";
                return;
            }

            var tracks = config.subtitlePath
                ? [{ file: config.subtitlePath, kind: "captions", label: "Captions" }]
                : [];

            player = window.jwplayer(playerId).setup({
                playlist: [{
                    title: config.title,
                    description: config.description,
                    sources: sources,
                    image: config.thumbnailImageUrl || "",
                    tracks: tracks
                }],
                width: "100%",
                aspectratio: "16:9",
                autostart: true,
                controls: true,
                displaytitle: true,
                stretching: "uniform"
            });

            player.on("ready", function () {
                if (removed) return;
                var loader = modal.querySelector(".opti-video-loading");
                if (loader) loader.style.display = "none";
            });
        });

        // Close handlers
        var closeModal = function () {
            cleanupModal(false);
        };

        modal.querySelector(".opti-video-close").addEventListener("click", closeModal);
        modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

        escHandler = function (e) { if (e.key === "Escape") closeModal(); };
        document.addEventListener("keydown", escHandler);
    }

    // ==================== SLIDE HTML GENERATION ====================

    // Helper to build data-gtm-promo attribute value
    function buildGtmPromoAttr(slide) {
        if (!slide.gtmPromo) return '';
        var promo = slide.gtmPromo;
        // Build the JSON object for the attribute
        var promoObj = {
            id: promo.id || '',
            name: promo.name || '',
            creative: promo.creative || '',
            position: promo.position || ''
        };
        // Escape for HTML attribute (encode quotes)
        var jsonStr = JSON.stringify(promoObj).replace(/"/g, '&quot;');
        return ' data-opt-promo="' + jsonStr + '"';
    }

    function generateBannerContentHTML(slide, index, isVideo) {
        var videoCol = '';
        if (isVideo) {
            videoCol = '<div class="m-fwBanner__col -video ' + (slide.hideVideoIcon || "visible") + '">' +
                '<div class="o-vidCurate flex w-full h-full justify-center xl:justify-end items-center m-auto">' +
                '<button aria-hidden="" class="o-videoModalButton opti-video-trigger" data-opti-instance="' + INSTANCE_ID + '" data-slide-index="' + index + '" data-video-title="' + (slide.videoTitle || "") + '">' +
                '<span class="sr-only">' + (slide.videoTitle || "Play video") + '</span>' +
                '<div aria-hidden="true" class="m-videoToggle__button items-center justify-center">' +
                '<img src="https://cdnsc1.melaleuca.com/na/images/atoms/play-overlay.png" alt="" aria-hidden="True" class="loaded" data-ll-status="loaded" />' +
                '</div>' +
                '</button>' +
                '</div>' +
                '</div>';
        }

        // Build GTM promo attribute if present
        var gtmPromoAttr = buildGtmPromoAttr(slide);
        var videoAttr = isVideo
            ? ' data-slide-type="video" data-slide-index="' + index + '" data-video-click-behavior="' + (slide.videoClickBehavior || "button") + '"'
            : '';

        return '<div id="optiSlide-' + INSTANCE_ID + '-' + index + '" data-opti-instance="' + INSTANCE_ID + '" data-link-behavior="' + (slide.linkBehavior || "full") + '"' + videoAttr + '>' +
            '<div style="width: 100%; display: inline-block">' +
            '<div data-testid="container-fullWidthBanner" class="m-fwBanner ' + (slide.bannerHeight || "-h-lg") + ' -slide ' + (slide.stackMobile || "-stackMobile") + '"' + gtmPromoAttr + '>' +
            '<div class="m-fwBanner__row -media">' +
            '<picture class="a-genImg">' +
            '<source srcset="' + (slide.desktopImage || "") + '" media="(min-width: 1024px)" />' +
            '<source srcset="' + (slide.tabletImage || "") + '" media="(min-width: 768px)" />' +
            '<source srcset="' + (slide.tabletImage || "") + '" media="(min-width: 576px)" />' +
            '<source srcset="' + (slide.mobileImage || "") + '" media="(max-width: 575px)" />' +
            '<img src="' + (slide.desktopImage || "") + '" alt="' + (slide.altText || "") + '" class="a-genImg__img loaded" data-ll-status="loaded" decoding="async" />' +
            '</picture>' +
            '</div>' +
            '<div class="m-fwBanner__row -columns ' + (slide.contentSize || "-w-sm") + ' ' + (slide.contentHorizontalAlignment || "-left") + ' ' + (slide.contentVerticalAlignment || "-top") + '">' +
            '<div class="m-fwBanner__columns">' +
            '<div class="m-fwBanner__col -content">' +
            '<div class="m-fwBanner__rte">' +
            '<div class="m-rte">' + (slide.description || "") + '</div>' +
            '</div>' +
            '<div class="m-fwBanner__cta ' + (slide.buttonAlignment || "-left") + ' ' + (slide.hideCTA || "visible") + '">' +
            '<div class="a-authorBtn text-center -default rounded-full px-32 to-sm:px-32 md:px-32 ' + (slide.buttonStyle || "bg-green") + '" data-opti-role="cta">' +
            (slide.buttonCopy || "Button") +
            '</div>' +
            '</div>' +
            '</div>' +
            videoCol +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function generateSlideHTML(slide, index) {
        var type = (slide.type || "static").toLowerCase();
        if (type === "video") {
            videoConfigs[index] = buildVideoConfig(slide, index);
            return generateBannerContentHTML(slide, index, true);
        }
        return generateBannerContentHTML(slide, index, false);
    }

    function isVideoSlide(slide) {
        return (slide && (slide.type || "").toLowerCase() === "video");
    }

    function getVideoClickBehavior(slide) {
        var behavior = String(slide && slide.videoClickBehavior || "button").toLowerCase();
        return behavior === "banner" || behavior === "full" ? "banner" : "button";
    }

    function isBannerVideoTrigger(slide) {
        return isVideoSlide(slide) && getVideoClickBehavior(slide) === "banner";
    }

    // ==================== LAZY IMAGE HARDENING (v2) ====================
    // Any <img> authored into a slide's "description" HTML is pasted in
    // verbatim. If an editor (or a copy/paste from a page that lazy-loads
    // images) leaves it as data-src instead of src, and that image lives
    // inside a responsive "hidden" wrapper, the site's lazy-load observer
    // may never fire on it (it has no visible layout box to intersect), so
    // it never resolves. That has silently broken slide layouts before
    // (e.g. a mobile-only "width extender" image that never loads, causing
    // the text column to shrink-wrap and lose its centering). Promote any
    // such image immediately instead of waiting on lazy-load.
    function promoteLazyImages(container) {
        if (!container) return;
        try {
            var imgs = container.querySelectorAll("img[data-src]");
            for (var i = 0; i < imgs.length; i++) {
                var img = imgs[i];
                if (!img.getAttribute("src")) {
                    img.setAttribute("src", img.getAttribute("data-src"));
                }
                img.setAttribute("data-ll-status", "loaded");
            }
        } catch (e) {
            logW("promoteLazyImages failed:", e.message);
        }
    }

    // ==================== LINK BEHAVIOR ====================

    function replaceTag(el, tagName) {
        if (!el || el.tagName.toLowerCase() === tagName) return el;
        var newEl = document.createElement(tagName);
        for (var i = 0; i < el.attributes.length; i++) {
            var a = el.attributes[i];
            newEl.setAttribute(a.name, a.value);
        }
        newEl.className = el.className;
        while (el.firstChild) newEl.appendChild(el.firstChild);
        el.parentNode.replaceChild(newEl, el);
        return newEl;
    }

    function applyLinkBehavior(slideEl, slide) {
        var mode = slide.linkBehavior || "full";
        var link = slide.link || "#";
        var target = slide.linkTarget || "";
        var banner = slideEl.querySelector(".m-fwBanner");
        var enableBannerVideoTrigger = isBannerVideoTrigger(slide);
        if (!banner) return;

        banner = replaceTag(banner, "div");
        banner.removeAttribute("href");
        banner.removeAttribute("target");
        banner.removeAttribute("rel");
        banner.removeAttribute("data-testid");
        banner.removeAttribute("data-opti-role");
        banner.removeAttribute("data-opti-video-clickable");
        banner.removeAttribute("tabindex");
        banner.removeAttribute("role");
        banner.removeAttribute("aria-label");
        banner.style.cursor = "";

        if (enableBannerVideoTrigger && mode === "full") {
            logW("Slide", slideEl.getAttribute("data-slide-index"), "cannot use full link behavior and full-banner video click together. Falling back to video banner trigger only.");
            mode = "none";
        }

        if (mode === "full") {
            banner = replaceTag(banner, "a");
            banner.setAttribute("href", link);
            if (target) {
                banner.setAttribute("target", target);
                banner.setAttribute("rel", "noopener noreferrer");
            } else {
                banner.removeAttribute("target");
                banner.removeAttribute("rel");
            }
            banner.setAttribute("data-testid", "link-fullWidthBanner");
            banner.setAttribute("data-opti-role", "full-link");

            var cta = slideEl.querySelector(".m-fwBanner__cta .a-authorBtn");
            if (cta && cta.tagName.toLowerCase() === "a") replaceTag(cta, "div");
        } else if (mode === "button") {
            var cta2 = slideEl.querySelector(".m-fwBanner__cta .a-authorBtn");
            if (cta2) {
                cta2 = replaceTag(cta2, "a");
                cta2.setAttribute("href", link);
                if (target) {
                    cta2.setAttribute("target", target);
                    cta2.setAttribute("rel", "noopener noreferrer");
                } else {
                    cta2.removeAttribute("target");
                    cta2.removeAttribute("rel");
                }
            }
        } else {
            var cta3 = slideEl.querySelector(".m-fwBanner__cta .a-authorBtn");
            if (cta3) {
                cta3 = replaceTag(cta3, "div");
                cta3.removeAttribute("href");
                cta3.removeAttribute("target");
                cta3.removeAttribute("rel");
            }
        }

        if (enableBannerVideoTrigger) {
            banner = slideEl.querySelector(".m-fwBanner");
            if (banner) {
                banner = replaceTag(banner, "div");
                banner.removeAttribute("href");
                banner.removeAttribute("target");
                banner.removeAttribute("rel");
                banner.setAttribute("data-opti-video-clickable", "banner");
                banner.setAttribute("data-opti-role", "video-banner-trigger");
                banner.setAttribute("tabindex", "0");
                banner.setAttribute("role", "button");
                banner.setAttribute("aria-label", slide.videoTitle || slide.altText || "Play video");
                banner.style.cursor = "pointer";
            }
        }

        slideEl.setAttribute("data-link-behavior", mode);
        slideEl.setAttribute("data-opti-linkbehavior", mode);
    }

    // ==================== VIDEO HANDLERS ====================

    function getAppliedVideoSlide(target) {
        var slide = target && target.closest('[data-opti-instance="' + INSTANCE_ID + '"][data-slide-type="video"]');
        if (!slide) return null;
        return slide.closest('.slick-slide[data-opti-applied="' + KEY + '"]') ? slide : null;
    }

    function activateVideoSlide(slide, event) {
        if (!slide) return false;
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        showVideoModal(parseInt(slide.getAttribute("data-slide-index"), 10));
        return true;
    }

    // Unified Video Click Handling (Delegated)
    if (!window[LISTENER_KEY]) {
        var clickHandler = function (e) {
            var trigger = e.target.closest(".opti-video-trigger");
            var slide = null;

            if (trigger && trigger.getAttribute("data-opti-instance") === INSTANCE_ID) {
                slide = getAppliedVideoSlide(trigger);
                if (!slide) return;
                activateVideoSlide(slide, e);
                return;
            }

            var banner = e.target.closest('.m-fwBanner[data-opti-video-clickable="banner"]');
            if (!banner) return;

            slide = getAppliedVideoSlide(banner);
            if (!slide) return;
            if (e.target.closest(".opti-video-trigger")) return;
            if (e.target.closest('a[href], button, input, select, textarea, summary, [contenteditable="true"]')) return;
            activateVideoSlide(slide, e);
        };

        var keydownHandler = function (e) {
            var banner = e.target.closest('.m-fwBanner[data-opti-video-clickable="banner"]');
            var slide = null;
            if (!banner) return;
            if (e.key !== "Enter" && e.key !== " ") return;
            slide = getAppliedVideoSlide(banner);
            if (!slide) return;
            activateVideoSlide(slide, e);
        };

        document.addEventListener("click", clickHandler, true);
        document.addEventListener("keydown", keydownHandler, true);
        window[LISTENER_KEY] = {
            clickHandler: clickHandler,
            keydownHandler: keydownHandler
        };
    }

    // ==================== UTILITIES ====================

    function debounce(fn, ms) {
        var t = null;
        return function () {
            if (t) clearTimeout(t);
            var args = arguments, self = this;
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }

    function waitForEl(sel, cb) {
        var tries = 180;
        (function poll() {
            var el = document.querySelector(sel);
            if (el) return cb(el);
            if (--tries <= 0) {
                logW("Selector not found:", sel);
                return cb(null);
            }
            setTimeout(poll, 100);
        })();
    }

    function hasTrack(slider) {
        return !!slider.querySelector(".slick-track");
    }

    function isInitialized(slider) {
        return slider.classList.contains("slick-initialized") || hasTrack(slider);
    }

    function blurCarouselFocus(slider) {
        var activeEl = document.activeElement;
        if (!slider || !activeEl || activeEl === document.body) return;
        if (!slider.contains(activeEl)) return;
        if (typeof activeEl.blur === "function") activeEl.blur();
    }

    function alreadyApplied(slider) {
        var applied = slider.hasAttribute("data-opti-carousel-applied");
        if (!applied) return false;

        try {
            var slides = parseSlides();
            if (!slides) return false;

            // 1. Check Slide Count (Real Slides)
            var realSlides = slider.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
            if (realSlides.length !== slides.length) {
                return false;
            }

            // 2. Check Dot Count
            var dots = document.querySelectorAll('.slick-dots li');
            if (dots.length > 0 && dots.length !== slides.length) {
                return false;
            }

            // 3. NEW: Check Real Slides & Clones (RESIZE PERSISTENCE)
            // Slick often re-renders slides on resize, stripping non-Slick attributes.
            var firstReal = slider.querySelector('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
            if (firstReal && !firstReal.hasAttribute("data-opti-applied")) {
                logW("Real slides lost custom attributes. Re-sync needed.");
                return false;
            }

            var clones = slider.querySelectorAll('.slick-slide.slick-cloned');
            if (clones.length > 0) {
                var firstClone = clones[0];
                if (!firstClone.hasAttribute("data-opti-applied")) {
                    logW("Clones lost custom attributes. Re-sync needed.");
                    return false;
                }
            }
        } catch (e) { }

        return true;
    }

    // v2: single-slide equivalent of alreadyApplied() above -- only checks
    // the one slide (and its clones) this instance owns, never the whole set.
    function alreadyAppliedSingle(slider, targetIndex) {
        try {
            var track = slider.querySelector(".slick-track") || slider;
            var target = track.querySelector('.slick-slide[data-slick-index="' + targetIndex + '"]:not([data-opti-removed])');
            return !!(target && target.getAttribute("data-opti-applied") === KEY);
        } catch (e) {
            return false;
        }
    }

    // ==================== REPLACE SLIDE CONTENT ====================
    // Strategy:
    // 1. Pre-Init: Modify DOM directly (remove old, add new).
    // 2. Post-Init: MANUALLY manipulate the DOM to match slide count, then update content.
    //    (Slick API is unreliable in this env, so we use strategies from insert/remove templates)

    function normalizeIndex(i, mod) {
        return ((i % mod) + mod) % mod;
    }

    function getSlideWidth(track) {
        var slide = track.querySelector('.slick-slide');
        if (slide) {
            return slide.getBoundingClientRect().width || parseFloat(slide.style.width) || 0;
        }
        return 0;
    }

    // Manually add slides to the track (from tmpl-hero-insert-slide-v1)
    function manualAddSlides(track, countToAdd) {
        if (countToAdd <= 0) return;
        var slideWidth = getSlideWidth(track);
        var currentWidth = parseFloat((track.style.width || '').replace('px', '')) || 0;
        var addedWidth = 0;

        // Find insertion point: After the active block of real slides, but before the end clones.
        var realSlides = track.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
        var lastReal = realSlides.length > 0 ? realSlides[realSlides.length - 1] : null;
        var insertBeforeNode = lastReal ? lastReal.nextSibling : null;

        for (var i = 0; i < countToAdd; i++) {
            var wrapper = document.createElement('div');
            wrapper.className = 'slick-slide';
            if (slideWidth) wrapper.style.width = slideWidth + 'px';
            wrapper.setAttribute('data-opti-inserted', KEY);
            wrapper.setAttribute('data-optly-injected', 'true');
            wrapper.setAttribute('aria-hidden', 'true');
            wrapper.setAttribute('role', 'group');
            wrapper.setAttribute('aria-roledescription', 'slide');

            // Inner structure
            wrapper.innerHTML = '<div><div style="width: 100%; display: inline-block;"></div></div>';

            if (insertBeforeNode) {
                track.insertBefore(wrapper, insertBeforeNode);
            } else {
                track.appendChild(wrapper);
            }
            addedWidth += slideWidth;
        }

        if (currentWidth && addedWidth) {
            track.style.width = (currentWidth + addedWidth) + 'px';
        }
        logI("Manually added", countToAdd, "slides to DOM (" + (insertBeforeNode ? "inserted before clones" : "appended") + ")");
    }

    // Manually remove slides from the end (from tmpl-heroslide-remove-from-end-v1)
    function manualRemoveSlides(track, countToRemove) {
        if (countToRemove <= 0) return;
        var realSlides = track.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
        var total = realSlides.length;
        var startIdx = Math.max(0, total - countToRemove);
        var toRemove = Array.prototype.slice.call(realSlides).slice(startIdx);

        var removedWidth = 0;

        for (var i = 0; i < toRemove.length; i++) {
            var slide = toRemove[i];
            slide.setAttribute("data-opti-removed", KEY);
            slide.style.display = "none";

            // Also hide clones if possible (though we are mainly targeting real slides here for content)
            // Complex clone matching skipped for simplicity unless visual artifacts appear

            var w = parseFloat(slide.style.width || "0");
            removedWidth += w;
        }

        var currentWidth = parseFloat((track.style.width || '').replace('px', '')) || 0;
        if (currentWidth && removedWidth) {
            track.style.width = (currentWidth - removedWidth) + 'px';
        }
        logI("Manually removed/hidden", toRemove.length, "slides");
    }

    function replaceAllSlides(slider, slides, callback) {
        var newCount = slides.length;
        var env = detectEnv();
        var $ = window.jQuery || window.$;

        // --- PRE-INIT STRATEGY ---
        if (!isInitialized(slider)) {
            logI("Pre-init: replacing DOM children directly for", newCount, "slides");
            slider.innerHTML = "";
            for (var i = 0; i < newCount; i++) {
                var slide = slides[i];
                var html = generateSlideHTML(slide, i);
                var wrapper = document.createElement("div");
                wrapper.innerHTML = html;
                slider.appendChild(wrapper);
                promoteLazyImages(wrapper);

                var content = wrapper.querySelector('[id^="optiSlide-"]');
                if (content) applyLinkBehavior(content, slide);
            }
            slider.setAttribute("data-opti-carousel-applied", KEY);
            logI("Pre-init replacement complete");
            return callback(true);
        }

        // --- POST-INIT STRATEGY ---
        var track = slider.querySelector(".slick-track");
        if (!track) {
            logW("No .slick-track found");
            return callback(false);
        }

        // 1. Determine Slick's Internal Truth
        var slickInternalCount = 0;
        var slickObj = null;
        if ($ && env.hasSlick) {
            try {
                slickObj = $(slider).slick('getSlick');
                slickInternalCount = (slickObj && typeof slickObj.slideCount !== 'undefined') ? slickObj.slideCount : 0;
            } catch (e) { }
        } else if (slider.slick && typeof slider.slick.slideCount !== 'undefined') {
            slickInternalCount = slider.slick.slideCount;
        }

        // 2. Analyze DOM
        var realSlides = track.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
        var domCount = realSlides.length;

        // If we couldn't get internal count but have DOM, assume DOM is somewhat valid but prefer DOM count
        if (slickInternalCount === 0 && domCount > 0) {
            // Fallback: trust DOM attributes if internal API completely failed
            var indexed = Array.prototype.slice.call(realSlides).filter(function (s) { return s.hasAttribute('data-slick-index'); });
            slickInternalCount = indexed.length;
        }

        logI("Post-init sync. DOM:", domCount, "SLICK INTERNAL:", slickInternalCount, "TARGET:", newCount);

        // --- NEW: Anti-flicker - Mark all slides as hiding before we start sync ---
        var allSlides = track.querySelectorAll('.slick-slide');
        for (var h = 0; h < allSlides.length; h++) {
            allSlides[h].setAttribute("data-opti-hiding", "true");
            allSlides[h].removeAttribute("data-opti-ready");
        }

        // 3. Cleanup Zombies (DOM elements > Slick Internal Count)
        // If DOM has 17 but Slick has 5, the last 12 are zombies.
        if (domCount > slickInternalCount) {
            var zombieCount = domCount - slickInternalCount;
            logW("Detected", zombieCount, "zombie slides (DOM > Slick). Removing manually.");
            // Remove from end
            var zombies = Array.prototype.slice.call(realSlides).slice(slickInternalCount);
            for (var z = 0; z < zombies.length; z++) {
                zombies[z].remove();
            }
            // Refresh DOM query
            realSlides = track.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
            domCount = realSlides.length;
        }

        // 4. Synchronize Count
        var slickAPI = null;
        if ($ && typeof $.fn.slick === 'function') {
            slickAPI = function (cmd, arg1, arg2) { return $(slider).slick(cmd, arg1, arg2); };
        } else if (slider.slick) {
            slickAPI = function (cmd, arg1, arg2) {
                var method = cmd;
                if (cmd === 'slickAdd') method = 'addSlide';
                if (cmd === 'slickRemove') method = 'removeSlide';

                if (typeof slider.slick[method] === 'function') {
                    return slider.slick[method](arg1, arg2);
                }
                return null;
            };
        }

        if (newCount !== slickInternalCount) {
            if (slickAPI) {
                logI("Using Slick API to sync (" + slickInternalCount + " -> " + newCount + ")");
                try {
                    // Remove extra recognized slides
                    while (slickInternalCount > newCount) {
                        slickAPI('slickRemove', slickInternalCount - 1);
                        slickInternalCount--;
                    }
                    // Add new slides
                    while (slickInternalCount < newCount) {
                        var wrapper = document.createElement('div');
                        wrapper.className = 'slick-slide';
                        wrapper.setAttribute('data-opti-inserted', KEY);
                        wrapper.innerHTML = '<div><div style="width: 100%; display: inline-block;"></div></div>';
                        slickAPI('slickAdd', wrapper);
                        slickInternalCount++;
                    }
                    // Refresh
                    slickAPI('setPosition');
                } catch (e) {
                    logE("Slick API error during sync:", e.message);
                    // Fallback to manual if API call failed
                    if (newCount > domCount) manualAddSlides(track, newCount - domCount);
                    else if (newCount < domCount) manualRemoveSlides(track, domCount - newCount);
                }
            } else {
                logW("Slick API not available - using manual DOM fallback");
                if (newCount > domCount) manualAddSlides(track, newCount - domCount);
                else if (newCount < domCount) manualRemoveSlides(track, domCount - newCount);
            }
        } else {
            logI("Counts match, only replacing content.");
            // Even if counts match, try to refresh dots if they are out of sync
            try {
                var currentDots = document.querySelectorAll('.slick-dots li');
                if (currentDots.length > 0 && currentDots.length !== newCount && slickAPI) {
                    logI("Dots mismatch (" + currentDots.length + " vs " + newCount + "), forcing refresh");
                    slickAPI('setPosition');
                }
            } catch (e) { }
        }

        // Refresh references after structural changes
        realSlides = track.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
        // Verify Sync Success
        if ($ && env.hasSlick) {
            try {
                slickObj = $(slider).slick('getSlick');
                var currentCount = (slickObj && typeof slickObj.slideCount !== 'undefined') ? slickObj.slideCount : 0;

                // If Slick still thinks it has too many, or DOM has too many
                var postSyncRealSlides = track.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
                var postSyncDomCount = postSyncRealSlides.length;

                if (postSyncDomCount > newCount) {
                    logW("Sync failed to remove slides. forcing manual removal of", (postSyncDomCount - newCount), "slides.");
                    var toRemove = Array.prototype.slice.call(postSyncRealSlides).slice(newCount);
                    for (var r = 0; r < toRemove.length; r++) {
                        toRemove[r].remove();
                    }
                    // Force refresh
                    $(slider).slick('refresh');
                    if (slickObj) slickObj.slideCount = newCount; // Patch internal if needed
                }
            } catch (e) { }
        }

        // 5. Replace Content
        var finalCount = 0;
        try {
            finalCount = track.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])').length;
        } catch (e) { finalCount = newCount; }

        var limit = Math.min(newCount, finalCount);
        logI("Replacing content for first", limit, "slides");

        for (var i = 0; i < limit; i++) {
            var slide = slides[i];
            var html = generateSlideHTML(slide, i);
            var targetSlide = realSlides[i];

            if (targetSlide) {
                targetSlide.innerHTML = '<div><div style="width: 100%; display: inline-block;">' + html + '</div></div>';
                targetSlide.setAttribute("data-opti-applied", KEY);
                targetSlide.setAttribute("data-optly-injected", "true");
                targetSlide.removeAttribute("data-opti-hiding");
                promoteLazyImages(targetSlide);

                var slideContent = targetSlide.querySelector('[id^="optiSlide-"]');
                if (slideContent) applyLinkBehavior(slideContent, slide);
            } else {
                logE("Target slide at index", i, "not found during content replacement!");
            }
        }

        // Sync dots manually as a double-check/polish
        try {
            var dots = document.querySelectorAll('.slick-dots li');
            if (dots.length > 0) {
                for (var d = 0; d < dots.length; d++) {
                    dots[d].style.display = (d < newCount) ? '' : 'none';
                }
            }
        } catch (e) { }

        // 6. Sync Clones (Fix for infinite scroll glitch)
        var clones = track.querySelectorAll('.slick-slide.slick-cloned');
        for (var c = 0; c < clones.length; c++) {
            var clone = clones[c];
            var idx = parseInt(clone.getAttribute('data-slick-index') || '-1', 10);

            // Normalize index to get the "real" slide index (0 to N-1)
            // Note: idx can be negative for pre-clones
            var realIndex = ((idx % newCount) + newCount) % newCount;

            var sourceSlide = realSlides[realIndex];
            if (sourceSlide) {
                clone.innerHTML = sourceSlide.innerHTML;
                clone.setAttribute("data-opti-applied", KEY);
                clone.removeAttribute("data-opti-hiding");
                promoteLazyImages(clone);

                // Re-apply link behavior since we just overwrote the HTML
                var cloneContent = clone.querySelector('[id^="optiSlide-"]');
                if (cloneContent) {
                    // We need the slide data for this index.
                    // sourceSlide should correspond to slides[realIndex]
                    applyLinkBehavior(cloneContent, slides[realIndex]);
                }
            }
        }

        // Attach video handlers (deprecated - handled by delegated listener above, but keeping for visual mark if needed)
        // attachVideoHandlers(track);

        slider.setAttribute("data-opti-carousel-applied", KEY);

        // --- NEW: Anti-flicker - Mark as ready after short delay to ensure rendering ---
        setTimeout(function () {
            var all = track.querySelectorAll('.slick-slide');
            for (var r = 0; r < all.length; r++) {
                all[r].removeAttribute("data-opti-hiding");
                all[r].setAttribute("data-opti-ready", "true");
            }
        }, 50);

        callback(true);
    }

    // ==================== SINGLE-SLIDE TARGETING (v2) ====================
    // Replaces exactly one slide (by its logical 0-based position) and its
    // matching slick-cloned counterparts, if any. Never touches slide count,
    // never touches any other slide -- safe to run alongside another
    // instance of this template targeting a different index on the same
    // carousel.

    var singleApplyRetryCount = 0;
    var MAX_SINGLE_APPLY_RETRIES = 20;

    function getSlickTotalCount(slider) {
        var $ = window.jQuery || window.$;
        try {
            if ($ && $.fn && $.fn.slick) {
                var slickObj = $(slider).slick('getSlick');
                if (slickObj && typeof slickObj.slideCount !== 'undefined') return slickObj.slideCount;
            } else if (slider.slick && typeof slider.slick.slideCount !== 'undefined') {
                return slider.slick.slideCount;
            }
        } catch (e) { }
        return 0;
    }

    function applySingleSlide(slider, targetIndex, slideData) {
        if (!slider) {
            logW("Slider not found (single-slide mode)");
            removeAntiFlickerStyle();
            return;
        }

        if (!document.body.contains(slider)) {
            logW("Slider element is stale (single-slide mode), re-querying...");
            var fresh = document.querySelector(SELECTOR);
            if (fresh) return applySingleSlide(fresh, targetIndex, slideData);
            logW("Could not find fresh slider element, aborting this attempt");
            return;
        }

        if (!isInitialized(slider)) {
            singleApplyRetryCount++;
            if (singleApplyRetryCount > MAX_SINGLE_APPLY_RETRIES) {
                logE("Max retries reached waiting for slider initialization (single-slide mode). Aborting.");
                removeAntiFlickerStyle();
                return;
            }
            logW("Slider not initialized (single-slide mode), waiting... (attempt " + singleApplyRetryCount + "/" + MAX_SINGLE_APPLY_RETRIES + ")");
            setTimeout(function () {
                var el = document.querySelector(SELECTOR) || slider;
                applySingleSlide(el, targetIndex, slideData);
            }, 500);
            return;
        }

        var track = slider.querySelector(".slick-track");
        if (!track) {
            logW("No .slick-track found (single-slide mode)");
            removeAntiFlickerStyle();
            return;
        }

        var target = track.querySelector('.slick-slide[data-slick-index="' + targetIndex + '"]:not([data-opti-removed])');
        if (!target) {
            logW("No slide found at index", targetIndex, "(single-slide mode) -- check the Target Slide Index against the carousel's real slide count");
            removeAntiFlickerStyle();
            return;
        }

        // v2: collision guard -- warn loudly if another instance already
        // claimed this same index. Doesn't block the write (a broken
        // half-applied slide is worse than a flickering one), but makes the
        // misconfiguration impossible to miss in the console instead of
        // manifesting as "my slide keeps reverting" during QA.
        var existingOwner = target.getAttribute("data-opti-slide-owner");
        if (existingOwner) {
            var ownerKey = existingOwner.slice(existingOwner.indexOf(":") + 1);
            if (ownerKey && ownerKey !== KEY) {
                logE("SLIDE INDEX COLLISION: index", targetIndex, "is already owned by another v2 instance (" + ownerKey + "). This instance (" + KEY + ") is about to overwrite it. Check the \"Target Slide Index\" field across your v2 extension instances for duplicates.");
            }
        }

        var html = generateSlideHTML(slideData, targetIndex);

        target.innerHTML = '<div><div style="width: 100%; display: inline-block;">' + html + '</div></div>';
        target.setAttribute("data-opti-applied", KEY);
        target.setAttribute("data-optly-injected", "true");
        target.setAttribute("data-opti-slide-owner", targetIndex + ":" + KEY);
        promoteLazyImages(target);

        var slideContent = target.querySelector('[id^="optiSlide-"]');
        if (slideContent) applyLinkBehavior(slideContent, slideData);

        // Patch any clones representing the same logical slide (infinite-loop wrap visuals)
        var total = getSlickTotalCount(slider);
        if (total > 0) {
            var clones = track.querySelectorAll('.slick-slide.slick-cloned');
            for (var c = 0; c < clones.length; c++) {
                var clone = clones[c];
                var idx = parseInt(clone.getAttribute('data-slick-index'), 10);
                if (isNaN(idx)) continue;
                var normalized = ((idx % total) + total) % total;
                if (normalized !== targetIndex) continue;

                clone.innerHTML = '<div><div style="width: 100%; display: inline-block;">' + html + '</div></div>';
                clone.setAttribute("data-opti-applied", KEY);
                promoteLazyImages(clone);

                var cloneContent = clone.querySelector('[id^="optiSlide-"]');
                if (cloneContent) applyLinkBehavior(cloneContent, slideData);
            }
        }

        slider.setAttribute("data-opti-carousel-applied", KEY);
        logI("Single-slide replacement complete for index", targetIndex);
    }

    // ==================== EDITOR PREVIEW ====================

    function insertEditorPreview(slider, slides) {
        var env = detectEnv();
        if (!env.isEditor) return;

        var previewId = "opti-herocarousel-preview-" + INSTANCE_ID;
        var existing = document.getElementById(previewId);
        if (existing) existing.remove();

        logEditor("Creating editor preview for", slides.length, "slides");

        var host = slider.closest(".o-heroCarousel") || slider;
        var shell = document.createElement("div");
        shell.id = previewId;
        shell.className = "opti-herocarousel-preview";
        shell.setAttribute("data-opti-editor-preview", KEY);

        var badge = document.createElement("div");
        badge.className = "opti-herocarousel-preview__badge";
        badge.textContent = SINGLE_SLIDE_MODE
            ? "EDITOR PREVIEW - Single-Slide Mode - Target Index " + SLIDE_INDEX
            : "EDITOR PREVIEW - " + slides.length + " Slides Configured";
        shell.appendChild(badge);

        var slidesContainer = document.createElement("div");
        slidesContainer.className = "opti-herocarousel-preview__slides";

        for (var i = 0; i < slides.length; i++) {
            var slide = slides[i];
            var slideIndexForRender = SINGLE_SLIDE_MODE ? SLIDE_INDEX : i;
            var slideType = (slide.type || "static").toLowerCase();
            var html = generateSlideHTML(slide, slideIndexForRender);

            var card = document.createElement("div");
            card.className = "opti-herocarousel-preview__slide";

            var numBadge = document.createElement("div");
            numBadge.className = "opti-herocarousel-preview__slide-badge";
            numBadge.textContent = "Slide " + (slideIndexForRender + 1);

            var typeBadge = document.createElement("div");
            typeBadge.className = "opti-herocarousel-preview__slide-type" + (slideType === "video" ? " -video" : "");
            typeBadge.textContent = slideType === "video" ? "VIDEO" : "STATIC";

            var content = document.createElement("div");
            content.innerHTML = html;
            promoteLazyImages(content);

            card.appendChild(numBadge);
            card.appendChild(typeBadge);
            card.appendChild(content);
            slidesContainer.appendChild(card);

            // Apply link behavior to preview slide
            var slideContent = card.querySelector('[id^="optiSlide-"]');
            if (slideContent) {
                applyLinkBehavior(slideContent, slide);
            }
        }

        shell.appendChild(slidesContainer);
        host.insertAdjacentElement("afterend", shell);

        // Video triggers in preview handled by delegated listener

        logEditor("Editor preview rendered for", slides.length, "slides");
    }

    // ==================== MAIN APPLY ====================

    var isApplying = false;
    var applyRetryCount = 0;
    var MAX_APPLY_RETRIES = 20; // Increased from 10 to 20

    function apply(slider, slides) {
        if (!slider) {
            logW("Slider not found");
            removeAntiFlickerStyle();
            return;
        }

        // Check if slider is still in DOM (not stale)
        if (!document.body.contains(slider)) {
            logW("Slider element is stale (detached from DOM), re-querying...");
            var freshSlider = document.querySelector(SELECTOR);
            if (freshSlider) {
                logI("Found fresh slider element, restarting apply with new element");
                apply(freshSlider, slides);
            } else {
                logW("Could not find fresh slider element, aborting this attempt");
            }
            return;
        }

        // Prevent re-entry
        if (isApplying) {
            logI("Apply already in progress, skipping");
            return;
        }

        var env = detectEnv();
        logI("Starting carousel replacement. Slides:", slides.length, "Editor:", env.isEditor, "Initialized:", isInitialized(slider));

        // Note: alreadyApplied() is still used internally but we allow re-syncing here
        // if initialized but slides count differs or some slides are missing indices.
        var realSlides = slider.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])');
        var appliedFlag = slider.hasAttribute("data-opti-carousel-applied");
        var slickIndexed = slider.querySelectorAll('.slick-slide:not(.slick-cloned):not([data-opti-removed])[data-slick-index]').length;
        var dots = document.querySelectorAll('.slick-dots li');

        // Check if slides AND dots are synced
        var countMatch = (realSlides.length === slides.length);
        var slickMatch = (slickIndexed === realSlides.length); // All slides should be indexed
        var dotsMatch = (dots.length === 0 || dots.length === slides.length);

        if (appliedFlag && countMatch && slickMatch && dotsMatch && !env.isEditor && alreadyApplied(slider)) {
            logI("Carousel already applied correctly, skipping");
            return;
        }

        // Editor: preview only
        if (env.isEditor) {
            logEditor("Editor mode - showing preview only, NOT modifying carousel");
            insertEditorPreview(slider, slides);
            return;
        }

        // QA/Prod: actual replacement
        if (!isInitialized(slider)) {
            applyRetryCount++;
            if (applyRetryCount > MAX_APPLY_RETRIES) {
                logE("Max retries reached waiting for slider initialization. Aborting.");
                removeAntiFlickerStyle();
                return;
            }
            logW("Slider not initialized, waiting... (attempt " + applyRetryCount + "/" + MAX_APPLY_RETRIES + ")");

            // Retry with potentially fresh element search in next tick
            setTimeout(function () {
                var el = document.querySelector(SELECTOR) || slider;
                apply(el, slides);
            }, 500);
            return;
        }

        // Mark as applying to prevent re-entry
        isApplying = true;

        replaceAllSlides(slider, slides, function (success) {
            isApplying = false;
            if (!success) {
                logW("Failed to replace slides");
                removeAntiFlickerStyle();
                return;
            }

            // Mark slider as applied ONLY at the very end to reveal it (anti-flicker)
            // If it was already applied (re-sync), this just keeps it visible.
            slider.setAttribute("data-opti-carousel-applied", KEY);

            logI("Carousel replacement complete:", slides.length, "slides");
        });
    }


    // ==================== INITIALIZATION ====================

    function removeAntiFlickerStyle() {
        var flickerStyle = document.getElementById("opti-flicker-fix-" + INSTANCE_ID);
        if (flickerStyle) flickerStyle.remove();
    }

    function injectAntiFlickerStyle() {
        var styleId = "opti-flicker-fix-" + INSTANCE_ID;
        if (document.getElementById(styleId)) return;
        var style = document.createElement("style");
        style.id = styleId;
        // The container is hidden ONLY if it doesn't have the applied attribute yet
        style.innerText = SELECTOR + ':not([data-opti-carousel-applied]) { opacity: 0 !important; visibility: hidden !important; transition: none !important; } ' +
            SELECTOR + '[data-opti-carousel-applied] { opacity: 1 !important; visibility: visible !important; transition: opacity 0.4s ease-in !important; }';
        document.head.appendChild(style);
    }

    var slides = parseSlides();
    if (!slides) {
        logW("No valid slides to apply");
        removeAntiFlickerStyle();
        return;
    }

    // v2: single-slide mode only ever uses the first object in slides_json --
    // this instance owns exactly one slide.
    var singleSlideData = null;
    if (SINGLE_SLIDE_MODE) {
        singleSlideData = slides[0];
        if (!singleSlideData) {
            logE("Single-slide mode: slides_json array is empty, nothing to apply for index", SLIDE_INDEX);
            removeAntiFlickerStyle();
            return;
        }
        if (slides.length > 1) {
            logW("Single-slide mode: slides_json contains " + slides.length + " entries; only index 0 is used, the rest are ignored.");
        }
        logI("Single-slide mode active. Target index:", SLIDE_INDEX);
    }

    warnAboutMissingVideoUrls(SINGLE_SLIDE_MODE ? [singleSlideData] : slides);

    injectAntiFlickerStyle();

    // Estimate bandwidth for video slides
    var hasVideoSlides = SINGLE_SLIDE_MODE
        ? isVideoSlide(singleSlideData)
        : slides.some(function (s) { return (s.type || "").toLowerCase() === "video"; });

    if (SINGLE_SLIDE_MODE && isVideoSlide(singleSlideData)) {
        videoConfigs[SLIDE_INDEX] = buildVideoConfig(singleSlideData, SLIDE_INDEX);
    }

    if (hasVideoSlides) {
        estimateBandwidth(function (bandwidth) {
            logI("Estimated bandwidth:", bandwidth.toFixed(2), "Mbps");
            // Update video configs with selected quality
            for (var key in videoConfigs) {
                var config = videoConfigs[key];
                config.bandwidth = bandwidth;
                var selected = selectVideoQuality(bandwidth, config);
                config.selectedUrl = selected.url;
                config.selectedLabel = selected.label;
            }
        });
    }

    // Wait for slider and apply
    waitForEl(SELECTOR, function (slider) {
        if (!slider) {
            removeAntiFlickerStyle();
            return;
        }

        var $ = window.jQuery || window.$;

        // --- v2: single-slide mode has its own, independent run loop ---
        if (SINGLE_SLIDE_MODE) {
            var runApplySingle = function () {
                blurCarouselFocus(slider);
                var env = detectEnv();
                if (env.isEditor) {
                    logEditor("Editor mode - showing single-slide preview only, NOT modifying carousel");
                    insertEditorPreview(slider, [singleSlideData]);
                    return;
                }
                if (alreadyAppliedSingle(slider, SLIDE_INDEX)) {
                    logI("Slide", SLIDE_INDEX, "already applied correctly, skipping");
                    return;
                }
                applySingleSlide(slider, SLIDE_INDEX, singleSlideData);
            };

            if ($ && typeof $(slider).on === 'function') {
                logI("Attaching Slick setPosition listener (single-slide mode)");
                $(slider).on('setPosition.opti', debounce(runApplySingle, 200));
            }

            debounce(runApplySingle, 50)();

            setTimeout(function () {
                if (!alreadyAppliedSingle(slider, SLIDE_INDEX)) {
                    logW("Retry #1 (single-slide mode)");
                    runApplySingle();
                }
            }, 1500);

            setTimeout(function () {
                if (!alreadyAppliedSingle(slider, SLIDE_INDEX)) {
                    logW("Retry #2 (single-slide mode)");
                    runApplySingle();
                }
            }, 3500);

            return;
        }

        // --- v1 behavior: full-carousel replacement ---
        var runApply = function () {
            blurCarouselFocus(slider);
            apply(slider, slides);
        };

        // Hook Slick events to re-apply on resize/update
        if ($ && typeof $(slider).on === 'function') {
            logI("Attaching Slick setPosition listener for resize handling");
            $(slider).on('setPosition.opti', debounce(runApply, 200));
        }

        // Initial apply
        debounce(runApply, 50)();

        // Retry logic for stability in slow environments
        setTimeout(function () {
            if (!alreadyApplied(slider)) {
                logW("Retry #1");
                runApply();
            }
        }, 1500);

        setTimeout(function () {
            if (!alreadyApplied(slider)) {
                logW("Retry #2");
                runApply();
            }
        }, 3500);
    });
})();
