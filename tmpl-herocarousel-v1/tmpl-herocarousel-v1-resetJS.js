/**
 * tmpl-herocarousel-v1 undo_js
 *
 * Cleans up slide markers and removes video modals.
 * Does NOT restore original carousel content (per design).
 */
(function () {
    var KEY = "opti-herocarousel-" + String(extension.$instance);
    var INSTANCE_ID = String(extension.$instance);
    var SELECTOR = (extension.selector || ".o-heroCarousel__slider").trim();
    var DEBUG = String(extension.debug_logging || "false").toLowerCase() === "true";
    var utils = window.optimizely.get("utils");
    var LISTENER_KEY = "opti-video-listener-" + INSTANCE_ID;
    var ACTIVE_MODAL_KEY = "opti-video-cleanup-" + INSTANCE_ID;

    function log() {
        if (!DEBUG) return;
        var a = [].slice.call(arguments);
        console.log("[herocarousel-v1] " + a.shift(), ...a);
    }

    log("Running undo/reset...");

    var videoListeners = window[LISTENER_KEY];
    if (videoListeners) {
        if (videoListeners.clickHandler) document.removeEventListener("click", videoListeners.clickHandler, true);
        if (videoListeners.keydownHandler) document.removeEventListener("keydown", videoListeners.keydownHandler, true);
        delete window[LISTENER_KEY];
        log("Removed delegated video listeners");
    }

    var activeModalCleanup = window[ACTIVE_MODAL_KEY];
    if (typeof activeModalCleanup === "function") {
        try { activeModalCleanup(true); } catch (e) { log("Could not fully clean active modal:", e); }
        delete window[ACTIVE_MODAL_KEY];
    }

    // Remove any open video modals for this instance
    var modal = document.querySelector('.opti-video-modal[data-opti-instance="' + INSTANCE_ID + '"]');
    if (modal) {
        // Try to clean up JWPlayer if it exists
        var players = modal.querySelectorAll('[id^="opti-player-"]');
        players.forEach(function (playerEl) {
            if (typeof window.jwplayer !== "undefined") {
                try {
                    var player = window.jwplayer(playerEl.id);
                    if (player && typeof player.remove === "function") {
                        player.remove();
                    }
                } catch (e) {
                    log("Could not remove player:", e);
                }
            }
        });
        modal.remove();
        delete window[ACTIVE_MODAL_KEY];
        log("Removed video modal");
    }

    // Remove editor preview
    var preview = document.getElementById("opti-herocarousel-preview-" + INSTANCE_ID);
    if (preview) {
        preview.remove();
        log("Removed editor preview");
    }

    // Remove anti-flicker style attribute
    var flickerStyle = document.getElementById("opti-flicker-fix-" + INSTANCE_ID);
    if (flickerStyle) {
        flickerStyle.remove();
        log("Removed anti-flicker style");
    }

    // Unbind Slick resize listener
    var $ = window.jQuery || window.$;
    if ($) {
        $(SELECTOR).off('setPosition.opti');
    }

    // Clean up slider slides
    utils.waitForElement(SELECTOR).then(function (slider) {
        if (!slider) return;

        // Remove carousel applied marker
        slider.removeAttribute("data-opti-carousel-applied");

        // Clean up all slides touched by this instance
        var touched = slider.querySelectorAll('[data-opti-applied="' + KEY + '"]');
        for (var i = 0; i < touched.length; i++) {
            var el = touched[i];
            el.removeAttribute("data-opti-applied");
            el.removeAttribute("data-opti-hiding");
            el.removeAttribute("data-opti-ready");
            el.removeAttribute("data-opti-removing");
        }

        // NEW: Remove inserted slides
        var inserted = slider.querySelectorAll('[data-opti-inserted="' + KEY + '"]');
        if (inserted.length > 0) {
            var $ = window.jQuery || window.$;
            var slickAPI = null;
            if ($ && typeof $.fn.slick === 'function') {
                slickAPI = function (cmd, arg) { return $(slider).slick(cmd, arg); };
            } else if (slider.slick) {
                slickAPI = function (cmd, arg) {
                    var method = cmd;
                    if (cmd === 'slickRemove') method = 'removeSlide';
                    // We only use remove in undo, but good to be safe
                    if (typeof slider.slick[method] === 'function') return slider.slick[method](arg);
                    return null;
                };
            }

            if (slickAPI && (slider.classList.contains('slick-initialized') || slider.querySelector('.slick-track'))) {
                log("Using Slick API to remove " + inserted.length + " inserted slides");
                // Collect indices and remove from highest to lowest to avoid index shifting
                var indicesToRemove = [];
                for (var n = 0; n < inserted.length; n++) {
                    var idx = parseInt(inserted[n].getAttribute('data-slick-index'), 10);
                    if (!isNaN(idx)) indicesToRemove.push(idx);
                }
                indicesToRemove.sort(function (a, b) { return b - a; });
                indicesToRemove.forEach(function (idx) {
                    try { slickAPI('slickRemove', idx); } catch (e) { log("Error removing slide at index " + idx, e); }
                });

                // Refresh dots
                try { slickAPI('setPosition'); } catch (e) { }
            } else {
                log("Slick API not available, using manual removal for " + inserted.length + " slides");
                for (var n = 0; n < inserted.length; n++) {
                    inserted[n].remove();
                }
            }
        }

        // Clean up video handler attributes
        var videoTriggers = slider.querySelectorAll("[data-opti-video-attached]");
        for (var j = 0; j < videoTriggers.length; j++) {
            videoTriggers[j].removeAttribute("data-opti-video-attached");
        }

        // Show any hidden slides
        var hiddenSlides = slider.querySelectorAll('.slick-slide[style*="display: none"]');
        for (var k = 0; k < hiddenSlides.length; k++) {
            hiddenSlides[k].style.display = "";
        }

        // Show any hidden dots
        try {
            var dotsContainer = document.querySelector(".o-heroCarousel__dots .slick-dots");
            if (dotsContainer) {
                var dots = dotsContainer.querySelectorAll("li");
                for (var d = 0; d < dots.length; d++) {
                    if (dots[d].style.display === "none") {
                        dots[d].style.display = "";
                    }
                }
            }
        } catch (_) { }

        log("Cleaned up", touched.length, "slides");
    });

    log("Reset complete");
})();
