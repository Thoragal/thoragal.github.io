sap.ui.define([
	"./NotizblockController"
], function (NotizblockController) {
	"use strict";

	// Shared controller for both the standard Notizblock view and the list
	// (NotizblockOverview) view -- see manifest.json routing. Mirrors
	// WikiView.controller.js, plus the admin route guard.
	return NotizblockController.extend("Homepage.Homepage.controller.NotizblockView", {

		// The guard can't live directly in onInit: onInit only runs once, the
		// first time this view is constructed. If that first-ever visit is
		// blocked (not admin yet), the view is left permanently
		// uninitialized (_loadNotizblockModel/_initNotizblockEntryDraftModel
		// never ran) -- and since the view instance is then cached, onInit
		// never runs again even after logging in later, so it would stay
		// broken for the rest of the session. attachPatternMatched instead
		// fires on every navigation to this route regardless of caching, so
		// the guard (and the one-time init, tracked via
		// _bNotizblockViewInitialized) reliably runs the first time it's
		// actually allowed to.
		onInit: function () {
			var sRouteName = this.getView().getViewName().indexOf("NotizblockOverviewView") !== -1
				? "NotizblockOverviewView" : "NotizblockView";
			this.getRouter().getRoute(sRouteName).attachPatternMatched(this._onNotizblockRouteMatched, this);
		},

		_onNotizblockRouteMatched: function () {
			if (!this._guardAdminRoute() || this._bNotizblockViewInitialized) {
				return;
			}
			this._bNotizblockViewInitialized = true;

			this.getView().byId("idButtonNavToNotizblock").setType("Emphasized");

			this._loadNotizblockModel();
			this._initNotizblockEntryDraftModel();

			this._setVisibilityContactMeHeaderButton();
		},

		onAfterRendering: function () {
			this._observeFooterVisibility("idNotizblockScrollEndMarker");
		},

		onExit: function () {
			this._disconnectFooterVisibilityObserver();
		},

		onPressRow: function (oEvent) {
			var oObj = oEvent.getSource().getBindingContext("NotizblockModel").getObject();
			this.getRouter().navTo("NotizblockDetailView", { Id: oObj.id });
		}

	});

});
