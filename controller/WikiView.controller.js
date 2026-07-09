sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"

], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.WikiView", {

		onInit: function () {
			this.getView().byId("idButtonNavToWiki").setType("Emphasized");

			var sPath = sap.ui.require.toUrl("Homepage/Homepage/model/WikiData.json");
			var oModel = new JSONModel(sPath);
			this.getView().setModel(oModel, "WikiModel");

			this._setVisibilityContactMeHeaderButton();
		},

		onPressRow: function (oEvent) {
			var oObj = oEvent.getSource().getBindingContext("WikiModel").getObject();

			var oData = {
				Id: oObj.id
			};

			this.getRouter().navTo("WikiDetailView", oData);
		}

	});

});
