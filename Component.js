sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"Homepage/Homepage/model/models",
	"sap/ui/model/json/JSONModel",
	"Homepage/Homepage/model/config"
], function (UIComponent, Device, models, JSONModel, config) {
	"use strict";

	return UIComponent.extend("Homepage.Homepage.Component", {

		metadata: {
			manifest: "json"
		},

		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * @public
		 * @override
		 */
		init: function () {
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// enable routing
			this.getRouter().initialize();

			// set the device model
			this.setModel(models.createDeviceModel(), "device");

			// Global admin-mode flag, used by the shared Header (login/logout
			// button) and by ListView's Actions column/Add button. Optimistically
			// true if a token already exists in sessionStorage (e.g. after a page
			// reload) -- an expired/invalid token surfaces as a 401 on first use.
			this.setModel(new JSONModel({ isAdmin: !!config.getToken() }), "adminModeModel");

			// Route-level guard for the admin-only Notizblock feature, kept here
			// (not just in NotizblockController's onInit/_guardAdminRoute)
			// because attachPatternMatched (which NotizblockController.onInit
			// uses) can only react to matches that happen *after* it's
			// attached -- the very first time a Notizblock view is ever
			// constructed, that construction is itself a reaction to this
			// same route match, so the per-view listener isn't attached in
			// time to catch it. attachRouteMatched here is registered once at
			// app start, before any route has ever matched, so it reliably
			// catches that first visit too; NotizblockController's own guard
			// then covers every visit after that (including a cached view
			// revisited after logging out). Delegates to the root view's
			// controller (always present, unlike whichever page happens to be
			// showing) so both paths funnel through the same
			// _promptLoginForRoute/onPressLoginSubmit redirect-back logic.
			this.getRouter().attachRouteMatched(function (oEvent) {
				var sRouteName = oEvent.getParameter("name");
				if (sRouteName && sRouteName.indexOf("Notizblock") === 0
						&& !this.getModel("adminModeModel").getProperty("/isAdmin")) {
					var oAppController = this.getRootControl().getController();
					oAppController._promptLoginForRoute("HomeView");
				}
			}, this);
		}
	});
});