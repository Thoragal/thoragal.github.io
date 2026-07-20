sap.ui.define([], function () {
	"use strict";

	var TOKEN_STORAGE_KEY = "adminAuthToken";
	// Auto-detects the local dev server (ui5 serve on localhost/127.0.0.1)
	// vs. the real GitHub Pages deployment, so SERVICE_URL never needs to be
	// hand-swapped again -- neither for local testing nor before a commit.
	var bLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

	return {
		SERVICE_URL: bLocal ? "http://localhost:443" : "https://nodejs20prod-production.up.railway.app",
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
