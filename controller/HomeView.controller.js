sap.ui.define([
	"./BaseController"
], function (BaseController) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.HomeView", {

		onInit: function () {
			this.getView().byId("idButtonNavToHome").setType("Emphasized");

			this._setVisibilityTileContactMe();
			this._setVisibilityContactMeHeaderButton();
		},

		onAfterRendering: function () {
			this._observeFooterVisibility("idHomeScrollEndMarker");
		},

		onExit: function () {
			this._disconnectFooterVisibilityObserver();
		},

		_setVisibilityTileContactMe: async function () {
			var fEmailServeralive = await this._getEmailServerAlive();
			this.getView().byId("idTileContactMe").setVisible(fEmailServeralive);
		}
	});
});