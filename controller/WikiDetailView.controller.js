sap.ui.define([
	"./BaseController",
	"../model/formatter",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageToast"

], function (BaseController, formatter, JSONModel, MessageToast) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.WikiDetailView", {

		// set formatter
    	formatter: formatter,

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf Homepage.Homepage.view.WikiDetailView
		 */
		onInit: function () {
			this.getView().byId("idPageWikiDetail").setBusy(true);

			this.getView().byId("idButtonNavToWiki").setType("Emphasized");	

			//Set Model
			var sPath = jQuery.sap.getModulePath("Homepage.Homepage", "/model/WikiData.json"); 
			var oModel = new JSONModel(sPath);
			this.getView().setModel(oModel, "WikiModel");
			
			var oRouter = this.getOwnerComponent().getRouter();
			oRouter.getRoute("WikiDetailView").attachPatternMatched(this._onObjectMatched, this);
			
			this.getView().byId("idPageWikiDetail").setBusy(false);
		},
		
		onNavToWikiDetailNext: function(oEvent){
			var iNewIndexProposal = this._getIndexWithId(this.sWindowId) + 1;
			var iNewIndexConfirmed = this._getConfirmedIndex(iNewIndexProposal);
			var sNewId = this._getIdWithIndex(iNewIndexConfirmed);
			
			var oData = {
				Id: sNewId
			};
			
			this.getRouter().navTo("WikiDetailView", oData);
		},
		
		onNavToWikiDetailPrevious: function(oEvent){
			var iNewIndexProposal = this._getIndexWithId(this.sWindowId) - 1;
			var iNewIndexConfirmed = this._getConfirmedIndex(iNewIndexProposal);
			var sNewId = this._getIdWithIndex(iNewIndexConfirmed);
			
			var oData = {
				Id: sNewId
			};
			
			this.getRouter().navTo("WikiDetailView", oData);
		},
		
		_bindWikiDetail: function(iIndex){
			//Element Binding
			var oObjectHeader = this.byId("idObjectHeader");
			oObjectHeader.bindElement("WikiModel>/Wiki/" + iIndex + "/");
			
			//Aggregation Binding
			var oListWikiDetail = this.byId("idListWikiDetail");
			var oTemplate = oListWikiDetail.getBindingInfo("items").template;
			oListWikiDetail.bindAggregation("items", "WikiModel>/Wiki/" + iIndex + "/content/", oTemplate);
		},
		
		_getIndexWithId: function(sId){
			var oModel = this.getView().getModel("WikiModel");
			var sPath = jQuery.sap.getModulePath("Homepage.Homepage", "/model/WikiData.json"); 
			oModel.loadData(sPath, "", false);
			
			var tWikidata = oModel.getProperty("/Wiki");
			for(var i = 0; i < tWikidata.length; i++) {
				var sWikidata = tWikidata[i];
				if (sWikidata.id === sId){
					break;
				}
			}
			return i;
		},
		
		_getIdWithIndex: function(iIndex){
			var oModel = this.getView().getModel("WikiModel");
			var sPath = jQuery.sap.getModulePath("Homepage.Homepage", "/model/WikiData.json"); 
			oModel.loadData(sPath, "", false);
			
			var tWikidata = oModel.getProperty("/Wiki");
			var sWikidata = tWikidata[iIndex];
			return sWikidata.id;
		},

		_onObjectMatched: function (oEvent) {
			this.sWindowId = window.decodeURIComponent(oEvent.getParameter("arguments").Id);
			var iIndex = this._getIndexWithId(this.sWindowId);
			this.iWikiDetailIndex = iIndex;
			
			this._bindWikiDetail(iIndex);
		},
		
		_getConfirmedIndex: function(iIndex){
			var oModel = this.getView().getModel("WikiModel");
			var sPath = jQuery.sap.getModulePath("Homepage.Homepage", "/model/WikiData.json"); 
			
			oModel.loadData(sPath, "", false);
			
			var tWikidata = oModel.getProperty("/Wiki");
			
			var sMessage;
			var iConfirmedIndex;
			
			if (iIndex < 0) {
				iConfirmedIndex = (tWikidata.length - 1);
				
				sMessage = this.getResourceBundle().getText("WikiDetailLoadLast");
				MessageToast.show(sMessage);
				
				} 
			else if (iIndex > (tWikidata.length - 1)) {
			 	iConfirmedIndex = 0;
			 	
				sMessage = this.getResourceBundle().getText("WikiDetailLoadFirst");
				MessageToast.show(sMessage);
			 	
			}
			else {
				iConfirmedIndex = iIndex;
			}
			
			return iConfirmedIndex;
		}

		/**
		 * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
		 * (NOT before the first rendering! onInit() is used for that one!).
		 * @memberOf Homepage.Homepage.view.WikiDetailView
		 */
		//	onBeforeRendering: function() {
		//		
		//	},

		/**
		 * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
		 * This hook is the same one that SAPUI5 controls get after being rendered.
		 * @memberOf Homepage.Homepage.view.WikiDetailView
		 */
		//	onAfterRendering: function() {
		//
		//	},

		/**
		 * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
		 * @memberOf Homepage.Homepage.view.WikiDetailView
		 */
		//	onExit: function() {
		//
		//	}

	});

});

			//this.getRouter().navTo("WikiDetailView", oData);
			//var oRouter = this.getOwnerComponent().getRouter();
			
			//var sId = window.decodeURIComponent(oEvent.getParameter("arguments").Id);
			//var sIntId = parseInt(sId);