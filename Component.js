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
		}
	});
});