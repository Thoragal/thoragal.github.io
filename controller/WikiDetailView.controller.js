sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageToast"

], function (BaseController, JSONModel, MessageToast) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.WikiDetailView", {

		onInit: function () {
			this.getView().byId("idPageWikiDetail").setBusy(true);

			this.getView().byId("idButtonNavToWiki").setType("Emphasized");

			//Set Model
			var sPath = sap.ui.require.toUrl("Homepage/Homepage/model/WikiData.json");
			var oModel = new JSONModel(sPath);
			this.getView().setModel(oModel, "WikiModel");

			var oRouter = this.getOwnerComponent().getRouter();
			oRouter.getRoute("WikiDetailView").attachPatternMatched(this._onObjectMatched, this);

			this.getView().byId("idPageWikiDetail").setBusy(false);
			this._setVisibilityContactMeHeaderButton();
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
			var sPath = sap.ui.require.toUrl("Homepage/Homepage/model/WikiData.json");
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
			var sPath = sap.ui.require.toUrl("Homepage/Homepage/model/WikiData.json");
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
			var sPath = sap.ui.require.toUrl("Homepage/Homepage/model/WikiData.json");

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

	});

});
