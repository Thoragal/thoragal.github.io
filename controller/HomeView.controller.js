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
			
			this._setVisibilityTileContactMe();
			//this._setVisibilityContactMeHeaderButton();
		},
		
		_setVisibilityTileContactMe: async function () {
			var fEmailServeralive = await this._getEmailServerAlive(); 
			this.getView().byId("idTileContactMe").setVisible(fEmailServeralive);
		}
	});
});