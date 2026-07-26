sap.ui.define([
	"./BaseController",
	"sap/base/i18n/Localization",
	"../model/wikiRenderer"
], function (BaseController, Localization, wikiRenderer) {
	"use strict";

	var SUPPORTED_LANGS = ["de", "en", "es"];

	return BaseController.extend("Homepage.Homepage.controller.DatenschutzView", {

		onInit: function () {
			this._setVisibilityContactMeHeaderButton();
			this._loadContent();

			this._fnOnLocalizationChange = this._loadContent.bind(this);
			Localization.attachChange(this._fnOnLocalizationChange);
		},

		onAfterRendering: function () {
			this._observeFooterVisibility("idDatenschutzScrollEndMarker");
		},

		onExit: function () {
			Localization.detachChange(this._fnOnLocalizationChange);
			this._disconnectFooterVisibilityObserver();
		},

		_getLang: function () {
			var sLang = (Localization.getLanguage() || "de").slice(0, 2).toLowerCase();
			return SUPPORTED_LANGS.includes(sLang) ? sLang : "de";
		},

		// The privacy policy text lives as plain Markdown under model/Datenschutz/
		// (one file per language) rather than as i18n keys -- too long and
		// structured (headings, lists) for the .properties format. Rendered
		// through the same wikiRenderer used for Wiki text blocks.
		_loadContent: function () {
			var sUrl = sap.ui.require.toUrl("Homepage/Homepage/model/Datenschutz/" + this._getLang() + ".md");

			fetch(sUrl)
				.then(function (oResponse) {
					return oResponse.text();
				})
				.then(function (sMarkdown) {
					// sap.ui.core.HTML#setContent can only render a single root
					// element -- without this wrapper, everything after the
					// Markdown's first heading/paragraph is silently dropped.
					this.byId("idDatenschutzContent").setContent("<div>" + wikiRenderer.renderMarkdown(sMarkdown) + "</div>");
				}.bind(this))
				.catch(function (oError) {
					console.error("Datenschutz content could not be loaded", oError);
				});
		}

	});

});
