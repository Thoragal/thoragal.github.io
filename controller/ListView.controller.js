sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/base/i18n/Localization",
	"sap/m/MessageBox",
	"../model/config"
], function (BaseController, JSONModel, Filter, FilterOperator, Localization, MessageBox, config) {
	"use strict";

	var SUPPORTED_LANGS = ["de", "en", "es"];

	return BaseController.extend("Homepage.Homepage.controller.ListView", {

		onInit: function() {
			this._initObjectList();

			this.getView().byId("idButtonNavToList").setType("Emphasized");
			this._setVisibilityContactMeHeaderButton();

			this.getView().setModel(new JSONModel({ Types: [], Categories: [] }), "AdminLookupModel");
			this.getView().setModel(new JSONModel({ id: null, type_id: null, category_id: null, value: "", description_de: "", description_en: "", description_es: "" }), "localDataModelListEntry");
		},

		onExit: function () {
			Localization.detachChange(this._fnOnLocalizationChange);
		},

		/**
		 * Shared setup for the objectlist table: model, filters, initial load,
		 * and the language-change listener.
		 * @private
		 */
		_initObjectList: function () {
			this.getView().byId("idPageList").setBusy(true);

			var oTable = this.byId("IdObjectTableDataList");
			this._oTable = oTable;

			// initialize the model, data is loaded asynchronously from the backend
			var oModel = new JSONModel();
			oModel.AbapListDataTitle = this.getResourceBundle().getText("AbapListDataTitle");

			// Remove limitation of 100 rows
			oModel.setSizeLimit(10000);

			// set the model to the view
			this.getView().setModel(oModel, "AbapListModel");

			// Create an object of filters. type_key is the language-neutral key returned
			// by the backend, so these filters keep working regardless of the UI language.
			this._mFilters = {
				"countAll": [],
				"countTable": [new Filter("type_key", FilterOperator.EQ, "table")],
				"countTransaction": [new Filter("type_key", FilterOperator.EQ, "transaction")],
				"countClass": [new Filter("type_key", FilterOperator.EQ, "class")],
				"countFuba": [new Filter("type_key", FilterOperator.EQ, "function_module")],
				"countProgram": [new Filter("type_key", FilterOperator.EQ, "program")],
				"countShortcut": [new Filter("type_key", FilterOperator.EQ, "shortcut")]
				};

			this._loadObjectList().then(function () {
				this._setFilterCountValues();
				this.getView().byId("idPageList").setBusy(false);
			}.bind(this));

			// Re-fetch in the new language whenever the UI language changes while this view is showing.
			this._fnOnLocalizationChange = this._onLocalizationChange.bind(this);
			Localization.attachChange(this._fnOnLocalizationChange);
		},

		_onLocalizationChange: function () {
			this._loadObjectList().then(function () {
				this._setFilterCountValues();
			}.bind(this));
		},

		_getLang: function () {
			var sLang = (Localization.getLanguage() || "en").slice(0, 2).toLowerCase();
			if (!SUPPORTED_LANGS.includes(sLang)) {
				sLang = "en";
			}
			return sLang;
		},

		/**
		 * Fetches the object list from the backend in the current UI language and
		 * populates the "AbapListModel" with the result.
		 * @returns {Promise} resolves once the model has been populated
		 * @private
		 */
		_loadObjectList: function () {
			var oModel = this.getModel("AbapListModel");

			return fetch(config.SERVICE_URL + "/objectlist?lang=" + this._getLang())
				.then(function (oResponse) {
					if (!oResponse.ok) {
						throw new Error("Request failed with status " + oResponse.status);
					}
					return oResponse.json();
				})
				.then(function (oData) {
					oData.AbapListDataTitle = oModel.AbapListDataTitle;
					oModel.setData(oData);
				})
				.catch(function (oError) {
					console.error("Objectlist could not be loaded", oError);
				});
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

		onObjectTableFilter : function(oEvent) {
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
					aTableSearchState = [new Filter("category", FilterOperator.Contains, sQuery)];
				}
				this._applySearch(aTableSearchState);
			}
		},

		onObjectTableFilterValue : function(oEvent) {
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
					aTableSearchState = [new Filter("value", FilterOperator.Contains, sQuery)];
				}
				this._applySearch(aTableSearchState);
			}
		},

		/**
		 * Re-applies the current filter/count state on the table's list binding.
		 * @public
		 */
		onRefresh: function () {
			this._loadObjectList().then(function () {
				this._setFilterCountValues();
			}.bind(this));
		},

		onItemPress: function (oEvent) {
			// Remove old navigation marker
			var oTable = this.byId("IdObjectTableDataList");
			oTable.getItems().forEach(function(oItem) {
				oItem.setNavigated(false);
			});

			// Set new navigation marker
			var oSelectedItem = oEvent.getParameter("listItem");
			oSelectedItem.setNavigated(true);
		},

		onCopy: function(oEvent) {
			var oSource = oEvent.getSource();
			var oParent = oSource.getParent();
			var oContext = oParent.getBindingContext("AbapListModel");
			var oObject = oContext.getObject();

    		var oResourceBundle = this.getView().getModel("i18n").getResourceBundle();
    		var sTableCopied = oResourceBundle.getText("TableCopied");

			navigator.clipboard.writeText(oObject.value)
				.then(() => {
                    sap.m.MessageToast.show( sTableCopied + ": " + oObject.value);
                })
                .catch(err => {
                	var sTableCopiedError = oResourceBundle.getText("TableCopiedError");
                    console.error( sTableCopiedError, err);
                });
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @param {sap.ui.model.Filter[]} aTableSearchState An array of filters for the search
		 * @private
		 */
		_applySearch: function(aTableSearchState) {
			var oTable = this.byId("IdObjectTableDataList");
			oTable.getBinding("items").filter(aTableSearchState, "Application");
		},

		_setFilterCountValues: function(){
			var oBinding = this._oTable.getBinding("items");

			oBinding.filter(this._mFilters.countTable);
			this.getView().byId("idFilterTable").setCount(oBinding.iLength);

			oBinding.filter(this._mFilters.countTransaction);
			this.getView().byId("idFilterTransaction").setCount(oBinding.iLength);

			oBinding.filter(this._mFilters.countClass);
			this.getView().byId("idFilterClass").setCount(oBinding.iLength);

			oBinding.filter(this._mFilters.countFuba);
			this.getView().byId("idFilterFuba").setCount(oBinding.iLength);

			oBinding.filter(this._mFilters.countProgram);
			this.getView().byId("idFilterProgram").setCount(oBinding.iLength);

			oBinding.filter(this._mFilters.countShortcut);
			this.getView().byId("idFilterShortcut").setCount(oBinding.iLength);

			oBinding.filter(this._mFilters.countAll);
			this.getView().byId("idFilterAll").setCount(oBinding.iLength);
		},

		// Loads the type/category dropdown options for the Add/Edit dialog,
		// once, the first time either is opened -- not needed just to view
		// the public list.
		_loadLookups: function () {
			if (this._pLookupsLoaded) {
				return this._pLookupsLoaded;
			}
			var oModel = this.getView().getModel("AdminLookupModel");
			var sLang = this._getLang();

			this._pLookupsLoaded = Promise.all([
				fetch(config.SERVICE_URL + "/objectlist/types?lang=" + sLang).then(function (oResponse) {
					if (!oResponse.ok) {
						throw new Error("Request failed with status " + oResponse.status);
					}
					return oResponse.json();
				}),
				fetch(config.SERVICE_URL + "/objectlist/categories?lang=" + sLang).then(function (oResponse) {
					if (!oResponse.ok) {
						throw new Error("Request failed with status " + oResponse.status);
					}
					return oResponse.json();
				})
			]).then(function (aResults) {
				oModel.setData({ Types: aResults[0].TypeData, Categories: aResults[1].CategoryData });
			}).catch(function (oError) {
				console.error("Admin lookups could not be loaded", oError);
				this._pLookupsLoaded = null;
			}.bind(this));

			return this._pLookupsLoaded;
		},

		onPressAdminAdd: function () {
			this._loadLookups().then(function () {
				// sap.m.Select falls back to displaying its first item whenever
				// selectedKey doesn't match anything, without updating the bound
				// model. Default to the same first lookup entries here so what is
				// shown and what gets submitted on Save are never out of sync.
				var oLookupData = this.getView().getModel("AdminLookupModel").getData();
				var iDefaultTypeId = oLookupData.Types.length ? oLookupData.Types[0].id : null;
				var iDefaultCategoryId = oLookupData.Categories.length ? oLookupData.Categories[0].id : null;

				this.getView().getModel("localDataModelListEntry").setData({
					id: null, type_id: iDefaultTypeId, category_id: iDefaultCategoryId, value: "",
					description_de: "", description_en: "", description_es: ""
				});
				this._openListEntryDialog();
			}.bind(this));
		},

		onPressAdminEdit: function (oEvent) {
			var oRow = oEvent.getSource().getParent().getParent().getBindingContext("AbapListModel").getObject();

			this._loadLookups().then(function () {
				return fetch(config.SERVICE_URL + "/objectlist/" + oRow.id, {
					headers: this._authHeaders()
				});
			}.bind(this)).then(function (oResponse) {
				if (oResponse.status === 401) {
					this._handleUnauthorized();
					throw new Error("Unauthorized");
				}
				if (!oResponse.ok) {
					throw new Error("Request failed with status " + oResponse.status);
				}
				return oResponse.json();
			}.bind(this)).then(function (oData) {
				this.getView().getModel("localDataModelListEntry").setData(oData);
				this._openListEntryDialog();
			}.bind(this)).catch(function (oError) {
				console.error("Object entry could not be loaded", oError);
			});
		},

		_openListEntryDialog: function () {
			var oComponent = this.getOwnerComponent();
			if (!oComponent.ListEntryDialog) {
				oComponent.ListEntryDialog = sap.ui.core.Fragment.load({
					id: oComponent.createId("idFragListEntryDialog"),
					name: "Homepage.Homepage.view.fragments.ListEntryDialog",
					controller: this
				}).then(function (oDialog) {
					oComponent.ListEntryDialog = oDialog;
					this.getView().addDependent(oDialog);
					oDialog.open();
					return oDialog;
				}.bind(this));
			} else {
				Promise.resolve(oComponent.ListEntryDialog).then(function (oDialog) {
					oDialog.open();
				});
			}
		},

		onPressListEntryCancel: function () {
			var oComponent = this.getOwnerComponent();
			Promise.resolve(oComponent.ListEntryDialog).then(function (oDialog) {
				oDialog.close();
			});
		},

		onPressListEntrySave: function () {
			var oComponent = this.getOwnerComponent();
			var oEntryData = this.getView().getModel("localDataModelListEntry").getData();
			var bIsUpdate = !!oEntryData.id;
			var sUrl = config.SERVICE_URL + "/objectlist" + (bIsUpdate ? "/" + oEntryData.id : "");
			var sMethod = bIsUpdate ? "PUT" : "POST";

			fetch(sUrl, {
				method: sMethod,
				headers: this._authHeaders(),
				body: JSON.stringify({
					type_id: oEntryData.type_id,
					category_id: oEntryData.category_id,
					value: oEntryData.value,
					description_de: oEntryData.description_de,
					description_en: oEntryData.description_en,
					description_es: oEntryData.description_es
				})
			}).then(function (oResponse) {
				if (oResponse.status === 401) {
					this._handleUnauthorized();
					throw new Error("Unauthorized");
				}
				if (!oResponse.ok) {
					throw new Error("Request failed with status " + oResponse.status);
				}
				Promise.resolve(oComponent.ListEntryDialog).then(function (oDialog) {
					oDialog.close();
				});
				this.onRefresh();
			}.bind(this)).catch(function (oError) {
				console.error("Object entry could not be saved", oError);
				MessageBox.error(this.getResourceBundle().getText("AdminSaveError"));
			}.bind(this));
		},

		onPressAdminDelete: function (oEvent) {
			var oRow = oEvent.getSource().getParent().getParent().getBindingContext("AbapListModel").getObject();
			var oResourceBundle = this.getResourceBundle();

			MessageBox.confirm(oResourceBundle.getText("AdminDeleteConfirm", [oRow.value]), {
				onClose: function (sAction) {
					if (sAction !== MessageBox.Action.OK) {
						return;
					}
					fetch(config.SERVICE_URL + "/objectlist/" + oRow.id, {
						method: "DELETE",
						headers: this._authHeaders()
					}).then(function (oResponse) {
						if (oResponse.status === 401) {
							this._handleUnauthorized();
							throw new Error("Unauthorized");
						}
						if (!oResponse.ok) {
							throw new Error("Request failed with status " + oResponse.status);
						}
						this.onRefresh();
					}.bind(this)).catch(function (oError) {
						console.error("Object entry could not be deleted", oError);
						MessageBox.error(oResourceBundle.getText("AdminDeleteError"));
					}.bind(this));
				}.bind(this)
			});
		}

	});

});
