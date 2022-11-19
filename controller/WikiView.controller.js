sap.ui.define([
	"./BaseController",
	"../model/formatter",
	"sap/ui/model/json/JSONModel"

], function (BaseController, formatter, JSONModel) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.WikiView", {
		
		// set formatter
    	formatter: formatter,

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf Homepage.Homepage.view.WikiView
		 */
		onInit: function () {
//			this.getView().byId("idPageWiki").setBusy(true);
			
			this.getView().byId("idButtonNavToWiki").setType("Emphasized");	
			
			var sPath = jQuery.sap.getModulePath("Homepage.Homepage", "/model/WikiData.json"); 
			var oModel = new JSONModel(sPath);
			this.getView().setModel(oModel, "WikiModel");
			
//			this.getView().byId("idPageWiki").setBusy(false);
		},

		onPressRow: function (oEvent) {
			var oObj = oEvent.getSource().getBindingContext("WikiModel").getObject();

			var oData = {
				Id: oObj.id
			};
			
			this.getRouter().navTo("WikiDetailView", oData);
		}
		/**
		 * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
		 * (NOT before the first rendering! onInit() is used for that one!).
		 * @memberOf Homepage.Homepage.view.WikiView
		 */
		//	onBeforeRendering: function() {
		//
		//	},

		/**
		 * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
		 * This hook is the same one that SAPUI5 controls get after being rendered.
		 * @memberOf Homepage.Homepage.view.WikiView
		 */
		//	onAfterRendering: function() {
		//
		//	},

		/**
		 * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
		 * @memberOf Homepage.Homepage.view.WikiView
		 */
		//	onExit: function() {
		//
		//	}

	});

});