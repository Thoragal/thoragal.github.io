sap.ui.define([], function () {
	"use strict";

	// Renders wiki block content to safe HTML strings. markdown-it and
	// highlight.js are vendored under webapp/lib/ and loaded as globals by
	// index.html. Markdown is rendered with raw HTML disabled (html:false),
	// so admin-authored text can never inject markup; code is escaped by
	// highlight.js (or manually when the language is unknown). The output is
	// therefore safe to hand to a sap.ui.core.HTML control.

	var _oMd = null;

	function getMd() {
		if (!_oMd && window.markdownit) {
			_oMd = window.markdownit({ html: false, linkify: true, breaks: false });
		}
		return _oMd;
	}

	function escapeHtml(sText) {
		return (sText || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	return {
		// Block-level Markdown (paragraphs, lists, links, ...) -> HTML.
		renderMarkdown: function (sText) {
			var oMd = getMd();
			return oMd ? oMd.render(sText || "") : "<p>" + escapeHtml(sText) + "</p>";
		},

		// Inline Markdown (no wrapping <p>) -> HTML, for short captions.
		renderInline: function (sText) {
			var oMd = getMd();
			return oMd ? oMd.renderInline(sText || "") : escapeHtml(sText);
		},

		// Raw code -> a highlighted <pre><code> block. Falls back to plain
		// escaped text when highlight.js or the language grammar is missing.
		renderCode: function (sCode, sLanguage) {
			var sBody;
			if (window.hljs && sLanguage && window.hljs.getLanguage(sLanguage)) {
				sBody = window.hljs.highlight(sCode || "", { language: sLanguage, ignoreIllegals: true }).value;
			} else {
				sBody = escapeHtml(sCode);
			}
			return "<pre class=\"wikiCodePre\"><code class=\"hljs\">" + sBody + "</code></pre>";
		}
	};
});
