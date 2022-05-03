sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.ListView", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf Homepage.Homepage.view.ListView
		 */
		onInit: function() {
			this.getView().byId("idButtonNavToList").setType("Emphasized");	
			
			var oTable = this.byId("IdObjectTableData");
			
			this._oTable = oTable;
			// get the path to the JSON file
			var sPath = jQuery.sap.getModulePath("Homepage.Homepage", "/model/AbapListData.json"); 
			
			// initialize the model with the JSON file
			var oModel = new JSONModel(sPath);
			oModel.AbapListDataTitle = this.getResourceBundle().getText("AbapListDataTitle");
			
			// Remove limitation of 100 rows
			oModel.setSizeLimit(10000);
			
			// set the model to the view
			this.getView().setModel(oModel, "AbapListModel");
				
			// Create an object of filters
			this._mFilters = {
				"countAll": [],
				"countTable": [new Filter("type", FilterOperator.EQ, "Tabelle")],
				"countTransaction": [new Filter("type", FilterOperator.EQ, "Transaktion")],
				"countClass": [new Filter("type", FilterOperator.EQ, "Klasse")],
				"countFuba": [new Filter("type", FilterOperator.EQ, "Fuba")],
				"countProgram": [new Filter("type", FilterOperator.EQ, "Programm")],
				"countShortcut": [new Filter("type", FilterOperator.EQ, "Shortcut")]
				};
				
			this._setFilterCountValues();
		},

		/**
		 * Triggered by the table's 'updateFinished' event: after new table
		 * data is available, this handler method updates the table counter.
		 * This should only happen if the update was successful, which is
		 * why this handler is attached to 'updateFinished' and not to the
		 * table's list binding's 'dataReceived' method.
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished : function (oEvent) {
			// Update the worklist's object counter after the table update
			var sTitle,
				oTable = oEvent.getSource(),
				iTotalItems = oEvent.getParameter("total");
			// only update the counter if the length is final and
			// the table is not empty
			if (iTotalItems && oTable.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("AbapListDataTitleCount") + " (" + [iTotalItems] + ")";
				//this._countValue();
			} else {
				sTitle = this.getResourceBundle().getText("AbapListDataTitle");
			}
			this.getModel("AbapListModel").setProperty("/AbapListDataTitle", sTitle);
		},
		
		/**
		 * Event handler when a filter tab gets pressed
		 * @param {sap.ui.base.Event} oEvent the filter tab event
		 * @public
		 */
		onQuickFilter: function(oEvent) {
			var oBinding = this._oTable.getBinding("items"),
				sKey = oEvent.getParameter("selectedKey");
			oBinding.filter(this._mFilters[sKey]);
		},
		
		onObjectTableSearch : function(oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
			} else {
				var aTableSearchState = [];
				var sQuery = oEvent.getParameter("query");

				if (sQuery && sQuery.length > 0) {
					aTableSearchState = [new Filter("description", FilterOperator.Contains, sQuery)];
				}
				this._applySearch(aTableSearchState);
			}
		},
		
		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @param {sap.ui.model.Filter[]} aTableSearchState An array of filters for the search
		 * @private
		 */
		_applySearch: function(aTableSearchState) {
			var oTable = this.byId("IdObjectTableData");
			//	oViewModel = this.getModel("AbapListModel");
			oTable.getBinding("items").filter(aTableSearchState, "Application");
		},

		_setFilterCountValues: function(){
			var oAbapListModel = this.getModel("AbapListModel");
			var sPath = jQuery.sap.getModulePath("Homepage.Homepage", "/model/AbapListData.json"); 
			oAbapListModel.loadData(sPath, "", false);
			
			var oBinding = this._oTable.getBinding("items");
			
			oBinding.filter(this._mFilters["countTable"]);
			this.getView().byId("idFilterTable").setCount(oBinding.iLength);	
			
			oBinding.filter(this._mFilters["countTransaction"]);
			this.getView().byId("idFilterTransaction").setCount(oBinding.iLength);	
			
			oBinding.filter(this._mFilters["countClass"]);
			this.getView().byId("idFilterClass").setCount(oBinding.iLength);	
			
			oBinding.filter(this._mFilters["countFuba"]);
			this.getView().byId("idFilterFuba").setCount(oBinding.iLength);	
			
			oBinding.filter(this._mFilters["countProgram"]);
			this.getView().byId("idFilterProgram").setCount(oBinding.iLength);	
			
			oBinding.filter(this._mFilters["countShortcut"]);
			this.getView().byId("idFilterShortcut").setCount(oBinding.iLength);	
			
			oBinding.filter(this._mFilters["countAll"]);
			this.getView().byId("idFilterAll").setCount(oBinding.iLength);	
		},
		
		_setFilterCount: function(){
			var oBinding = this._oTable.getBinding("items");
			var oAbapListModel = this.getModel("AbapListModel");
 
			oBinding.filter(this._mFilters["countTable"]);
			oAbapListModel.countTable = oBinding.iLength;
			oAbapListModel.setProperty("/countTable", oAbapListModel.countTable);
			
			oBinding.filter(this._mFilters["countTransaction"]);
			oAbapListModel.countTransaction = oBinding.iLength;
			oAbapListModel.setProperty("/countTransaction", oAbapListModel.countTransaction);
			
			oBinding.filter(this._mFilters["countClass"]);
			oAbapListModel.countClass = oBinding.iLength;
			oAbapListModel.setProperty("/countClass", oAbapListModel.countClass);
			
			oBinding.filter(this._mFilters["countFuba"]);
			oAbapListModel.countFuba = oBinding.iLength;
			oAbapListModel.setProperty("/countFuba", oAbapListModel.countFuba);
		
			oBinding.filter(this._mFilters["countProgram"]);
			oAbapListModel.countProgram = oBinding.iLength;
			oAbapListModel.setProperty("/countProgram", oAbapListModel.countProgram);
			
			oBinding.filter(this._mFilters["countShortcut"]);
			oAbapListModel.countShortcut = oBinding.iLength;
			oAbapListModel.setProperty("/countShortcut", oAbapListModel.countShortcut);
		
			oBinding.filter(this._mFilters["countAll"]);
			oAbapListModel.countAll = oBinding.iLength;
			oAbapListModel.setProperty("/countAll", oAbapListModel.countAll);
		}
		
		/**
		 * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
		 * This hook is the same one that SAPUI5 controls get after being rendered.
		 * @memberOf ch.interdiscount.mobilepos.gefret.zmobilepos_gefret.view.NewRet
		 */
		//	onAfterRendering: function() {
		//		
		// },
		
		/**
		 * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
		 * (NOT before the first rendering! onInit() is used for that one!).
		 * @memberOf Homepage.Homepage.view.ListView
		 */
		//	onBeforeRendering: function() {
		//
		//	},

		/**
		 * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
		 * This hook is the same one that SAPUI5 controls get after being rendered.
		 * @memberOf Homepage.Homepage.view.ListView
		 */
		//	onAfterRendering: function() {
		//
		//	},

		/**
		 * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
		 * @memberOf Homepage.Homepage.view.ListView
		 */
		//	onExit: function() {
		//
		//	}

	});

});