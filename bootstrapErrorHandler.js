// UI5 itself hasn't loaded yet when any of this runs, so it has to be plain
// HTML/JS -- no UI5 controls, no i18n bundle available. Kept as its own file
// (not inline in index.html) because a CSP without 'unsafe-inline' in
// script-src blocks inline <script> blocks.
function handleUi5BootstrapError() {
	document.body.innerHTML = "<div style='font-family: sans-serif; padding: 2rem; text-align: center;'>"
		+ "<p>Die Anwendung konnte nicht geladen werden (SAPUI5 CDN nicht erreichbar). Bitte versuche es später erneut.</p>"
		+ "<p>The application could not be loaded (SAPUI5 CDN unreachable). Please try again later.</p>"
		+ "</div>";
}

// The sap-ui-bootstrap <script> tag is created here rather than declared as
// static HTML in index.html, so its error handler can be wired up as a JS
// property (oScript.onerror = ...) instead of an inline onerror="..."
// attribute. CSP treats inline event handler attributes the same as inline
// <script> blocks -- without 'unsafe-inline', an onerror="..." attribute is
// silently never invoked, which defeats the whole point of this fallback.
(function () {
	var oScript = document.createElement("script");
	oScript.id = "sap-ui-bootstrap";
	oScript.setAttribute("data-sap-ui-theme", "sap_fiori_3");
	oScript.setAttribute("data-sap-ui-resourceroots", "{\"Homepage.Homepage\": \"./\"}");
	oScript.setAttribute("data-sap-ui-compatVersion", "edge");
	oScript.setAttribute("data-sap-ui-oninit", "module:sap/ui/core/ComponentSupport");
	oScript.setAttribute("data-sap-ui-async", "true");
	oScript.setAttribute("data-sap-ui-frameOptions", "deny");
	oScript.onerror = handleUi5BootstrapError;
	// Set last -- assigning src is what triggers the fetch, so every other
	// attribute UI5's own bootstrap code reads off this tag must already be
	// in place beforehand.
	oScript.src = "https://sapui5.hana.ondemand.com/1.141.1/resources/sap-ui-core.js";
	document.head.appendChild(oScript);
})();
