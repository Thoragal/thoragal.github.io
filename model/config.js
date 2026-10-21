sap.ui.define([], function () {
	"use strict";

	var TOKEN_STORAGE_KEY = "adminAuthToken";
	var BACKEND_STORAGE_KEY = "backendOverride";

	// All known backend destinations. Every URL listed here must also be
	// allowed in the CSP (img-src + connect-src) in index.html -- the CSP is a
	// static <meta> tag and cannot follow this list automatically.
	var BACKENDS = {
		railway: "https://nodejs20prod-production.up.railway.app",
		nas: "https://thoragal.synology.me"
	};
	// What every visitor gets unless they opted into another backend below.
	var DEFAULT_BACKEND = "railway";
	var LOCAL_BACKEND_URL = "http://localhost:443";

	// Auto-detects the local dev server (ui5 serve on localhost/127.0.0.1)
	// vs. the real GitHub Pages deployment, so SERVICE_URL never needs to be
	// hand-swapped again -- neither for local testing nor before a commit.
	var bLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

	// Per-visitor override, so a new backend can be tested on the live site
	// while everyone else keeps the default: open the site once with
	// ?backend=nas (remembered in localStorage), ?backend=default clears it.
	// Unknown values are ignored. Storage can throw (private mode, blocked
	// site data), in which case the override just doesn't persist.
	function resolveBackendKey() {
		var sRequested = new URLSearchParams(window.location.search).get("backend");
		try {
			if (sRequested === "default") {
				localStorage.removeItem(BACKEND_STORAGE_KEY);
			} else if (Object.prototype.hasOwnProperty.call(BACKENDS, sRequested)) {
				localStorage.setItem(BACKEND_STORAGE_KEY, sRequested);
				return sRequested;
			}
			var sStored = localStorage.getItem(BACKEND_STORAGE_KEY);
			if (Object.prototype.hasOwnProperty.call(BACKENDS, sStored)) {
				return sStored;
			}
		} catch (oError) {
			// Fall through; a requested key still applies for this page load.
			if (Object.prototype.hasOwnProperty.call(BACKENDS, sRequested)) {
				return sRequested;
			}
		}
		return DEFAULT_BACKEND;
	}

	var sBackendKey = bLocal ? "local" : resolveBackendKey();
	var sServiceUrl = bLocal ? LOCAL_BACKEND_URL : BACKENDS[sBackendKey];
	if (!bLocal && sBackendKey !== DEFAULT_BACKEND) {
		console.info("Backend override active: " + sBackendKey + " (" + sServiceUrl + "). Use ?backend=default to reset.");
	}

	return {
		SERVICE_URL: sServiceUrl,
		TOKEN_STORAGE_KEY: TOKEN_STORAGE_KEY,

		// Centralizes all admin-token sessionStorage access behind this one
		// module, so a future change to how/where the token is stored (e.g.
		// an httpOnly cookie) only touches this file instead of every
		// call site across Component.js/BaseController.js/WikiController.js.
		getToken: function () {
			return sessionStorage.getItem(TOKEN_STORAGE_KEY);
		},
		setToken: function (sToken) {
			sessionStorage.setItem(TOKEN_STORAGE_KEY, sToken);
		},
		clearToken: function () {
			sessionStorage.removeItem(TOKEN_STORAGE_KEY);
		}
	};
});
