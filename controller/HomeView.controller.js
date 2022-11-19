sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, formatter, JSONModel) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.HomeView", {
		
		onInit: function () {

			//var oImgModel = new JSONModel(sap.ui.require.toUrl("sap/ui/demo/mock/img.json"));
			//this.getView().setModel(oImgModel, "img");
			
			this.getView().byId("idButtonNavToHome").setType("Emphasized");
		}
	});
});