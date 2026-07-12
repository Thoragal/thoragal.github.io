sap.ui.define([
	"./BaseController"
], function (BaseController) {
	"use strict";

	// Shared controller for both the standard Wiki view and the list
	// (WikiOverview) view -- see manifest.json routing. All wiki entry
	// create/edit/delete and block-editor logic lives in BaseController so
	// it's also available to the detail view.
	return BaseController.extend("Homepage.Homepage.controller.WikiView", {

		onInit: function () {
			this.getView().byId("idButtonNavToWiki").setType("Emphasized");

			this._loadWikiModel();
			this._initWikiEntryDraftModel();

			this._setVisibilityContactMeHeaderButton();
		},

		onPressRow: function (oEvent) {
			var oObj = oEvent.getSource().getBindingContext("WikiModel").getObject();
			this.getRouter().navTo("WikiDetailView", { Id: oObj.id });
		}

	});

});
