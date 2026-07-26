sap.ui.define([
	"./BaseController"
], function (BaseController) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.ImpressumView", {

		onInit: function () {
			this._setVisibilityContactMeHeaderButton();
		},

		onAfterRendering: function () {
			this._observeFooterVisibility("idImpressumScrollEndMarker");
		},

		onExit: function () {
			this._disconnectFooterVisibilityObserver();
		}

	});

});
