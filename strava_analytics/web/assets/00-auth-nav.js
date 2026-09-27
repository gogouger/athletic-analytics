/**
 * Meron auth nav — single source of truth for "is anyone signed in?"
 *
 * Hits the same-origin Authelia proxy (/__authstate, served by Caddy on
 * meron.ggouger.localhost) to read the SSO session and reflects it onto
 * the DOM as `body[data-auth="user"]` vs `body[data-auth="anon"]`. CSS
 * then hides protected nav links and CTA buttons for anonymous visitors.
 *
 * If /__authstate is unreachable (running outside the Caddy stack, e.g.
 * bare `python -m strava_analytics.web`), falls back to Meron's own
 * cookie-session endpoint /api/auth/me — older standalone behaviour.
 *
 * Clicking any sign-in or protected link sends the browser to the central
 * Authelia portal. Authentication policy and passkey handling live there,
 * rather than being reimplemented inside this application.
 */
(function () {
    "use strict";

    var STATE = { authed: false, username: "", inlineActive: false };

    function setBodyAuth(authed) {
        document.body.setAttribute("data-auth", authed ? "user" : "anon");
    }

    function escapeHTML(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                     "\"": "&quot;", "'": "&#39;" })[c];
        });
    }

    function renderSlot() {
        var slot = document.getElementById("nav-auth-slot");
        var gear = document.getElementById("nav-settings-gear");
        if (!slot) return;
        if (STATE.authed) {
            var name = STATE.username || "account";
            slot.innerHTML =
                '<span style="opacity:0.6">' + escapeHTML(name) + '</span>' +
                '  <a href="#" data-meron-logout ' +
                'class="family-auth-action">Sign out</a>';
            if (gear) gear.style.display = "";
        } else {
            slot.innerHTML =
                '<a href="#" data-meron-login ' +
                'class="family-auth-action">Owner sign in</a>';
            if (gear) gear.style.display = "none";
        }
    }

    // Hit the Authelia same-origin proxy (canonical SSO). Falls back to
    // Meron's own /api/auth/me when outside the Caddy stack.
    function refresh() {
        return fetch("/__authstate", {
            credentials: "include",
            headers: { "Accept": "application/json" },
        })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (s) {
            STATE.inlineActive = true;
            var d = (s && s.data) || {};
            STATE.authed = (d.authentication_level || 0) >= 1;
            STATE.username = d.username || "";
            setBodyAuth(STATE.authed);
            renderSlot();
        })
        .catch(function () {
            // /__authstate unreachable — try Meron's own session as a fallback.
            return fetch("/api/auth/me", { credentials: "same-origin" })
                .then(function (r) {
                    if (!r.ok) throw 0;
                    return r.json();
                })
                .then(function (body) {
                    STATE.authed = true;
                    STATE.username = body.username || "";
                    setBodyAuth(true);
                    renderSlot();
                })
                .catch(function () {
                    STATE.authed = false;
                    STATE.username = "";
                    setBodyAuth(false);
                    renderSlot();
                });
        });
    }

    function goToLogin(href) {
        var target = href || location.href;
        location.href = "https://auth.gordongouger.com/?rd=" + encodeURIComponent(target);
    }

    function logout() {
        // Prefer Authelia (the canonical SSO); also clear Meron's own
        // session cookie as belt-and-suspenders for the standalone case.
        fetch("/__authlogout", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: "{}",
        })
        .catch(function () { /* ignore — fallback below covers it */ })
        .finally(function () {
            fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin",
            }).finally(function () { location.href = "/"; });
        });
    }

    // ── Global click handler ─────────────────────────────────────────
    // Delegated so it works through Dash page-swaps.
    document.addEventListener("click", function (ev) {
        var logoutEl = ev.target.closest("[data-meron-logout]");
        if (logoutEl) {
            ev.preventDefault();
            logout();
            return;
        }
        var loginEl = ev.target.closest("[data-meron-login]");
        if (loginEl) {
            ev.preventDefault();
            goToLogin(null);
            return;
        }
        // Anonymous users authenticate centrally, then return to the target.
        if (!STATE.authed) {
            var prot = ev.target.closest(".meron-nav-link.protected, .auth-only a, a.auth-only");
            if (prot && prot.getAttribute("href")) {
                ev.preventDefault();
                goToLogin(prot.href);
                return;
            }
        }
    });

    // Run on initial load.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            setBodyAuth(false); // start anon to avoid flash-of-protected
            refresh();
        });
    } else {
        setBodyAuth(false);
        refresh();
    }

    // Dash swaps the page-container without firing a full navigation;
    // re-render the slot whenever the navbar's auth slot appears.
    new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
            if (muts[i].addedNodes.length) {
                var slot = document.getElementById("nav-auth-slot");
                if (slot && !slot.dataset.meronAuthRendered) {
                    slot.dataset.meronAuthRendered = "1";
                    renderSlot();
                }
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
})();
