sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/base/i18n/Localization",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"../model/config"
], function (BaseController, JSONModel, Filter, FilterOperator, Localization, MessageBox, MessageToast, config) {
	"use strict";

	var SUPPORTED_LANGS = ["de", "en", "es"];

	return BaseController.extend("Homepage.Homepage.controller.ListView", {

		onInit: function() {
			this._initObjectList();

			this.getView().byId("idButtonNavToList").setType("Emphasized");
			this._setVisibilityContactMeHeaderButton();

			this.getView().setModel(new JSONModel({ Types: [], Categories: [] }), "AdminLookupModel");
			this.getView().setModel(new JSONModel({ id: null, type_id: null, category_id: null, value: "", description_de: "", description_en: "", description_es: "" }), "localDataModelListEntry");
			this.getView().setModel(new JSONModel({ Categories: [] }), "CategoryManagerModel");
			this.getView().setModel(new JSONModel({ id: null, label_de: "", label_en: "", label_es: "" }), "localDataModelCategoryEntry");
			this.getView().setModel(new JSONModel({ Types: [] }), "TypeManagerModel");
			this.getView().setModel(new JSONModel({ id: null, label_de: "", label_en: "", label_es: "" }), "localDataModelTypeEntry");

			var oCategoryManager = this._makeLookupManager({
				managerModel: "CategoryManagerModel",
				entryModel: "localDataModelCategoryEntry",
				managerDataKey: "Categories",
				urlSegment: "categories",
				dialogName: "CategoriesDialog",
				dialogId: "idFragCategoriesDialog",
				entryDialogName: "CategoryEntryDialog",
				entryDialogId: "idFragCategoryEntryDialog",
				keyExistsCode: "category_key_exists",
				keyExistsI18n: "CategoryKeyExistsError",
				saveErrorI18n: "CategorySaveError",
				inUseCode: "category_in_use",
				inUseI18n: "CategoryInUseError",
				deleteErrorI18n: "CategoryDeleteError",
				deleteConfirmI18n: "CategoryDeleteConfirm"
			});
			this.onPressManageCategories = oCategoryManager.onPressManage;
			this.onPressCategoriesClose = oCategoryManager.onPressClose;
			this.onPressCategoryAdd = oCategoryManager.onPressAdd;
			this.onPressCategoryEdit = oCategoryManager.onPressEdit;
			this.onPressCategoryEntryCancel = oCategoryManager.onPressEntryCancel;
			this.onPressCategoryEntrySave = oCategoryManager.onPressEntrySave;
			this.onPressCategoryDelete = oCategoryManager.onPressDelete;

			var oTypeManager = this._makeLookupManager({
				managerModel: "TypeManagerModel",
				entryModel: "localDataModelTypeEntry",
				managerDataKey: "Types",
				urlSegment: "types",
				dialogName: "TypesDialog",
				dialogId: "idFragTypesDialog",
				entryDialogName: "TypeEntryDialog",
				entryDialogId: "idFragTypeEntryDialog",
				keyExistsCode: "type_key_exists",
				keyExistsI18n: "TypeKeyExistsError",
				saveErrorI18n: "TypeSaveError",
				inUseCode: "type_in_use",
				inUseI18n: "TypeInUseError",
				deleteErrorI18n: "TypeDeleteError",
				deleteConfirmI18n: "TypeDeleteConfirm"
			});
			this.onPressManageTypes = oTypeManager.onPressManage;
			this.onPressTypesClose = oTypeManager.onPressClose;
			this.onPressTypeAdd = oTypeManager.onPressAdd;
			this.onPressTypeEdit = oTypeManager.onPressEdit;
			this.onPressTypeEntryCancel = oTypeManager.onPressEntryCancel;
			this.onPressTypeEntrySave = oTypeManager.onPressEntrySave;
			this.onPressTypeDelete = oTypeManager.onPressDelete;
		},

		// Categories and Types are both simple label-lookup entities managed
		// through an identical add/edit/delete/rename flow (a manager dialog
		// listing entries, and a small entry dialog for add/edit), differing
		// only in which model/dialog/i18n keys/backend segment they target.
		// This factory generates the 7 handler functions for one such entity
		// so the flow is implemented once instead of duplicated per entity.
		// @private
		_makeLookupManager: function (oOpts) {
			var that = this;

			function loadForManage() {
				var oModel = that.getView().getModel(oOpts.managerModel);
				return fetch(config.SERVICE_URL + "/objectlist/" + oOpts.urlSegment + "/manage", {
					headers: that._authHeaders()
				}).then(function (oResponse) {
					return that._checkResponse(oResponse).json();
				}).then(function (oData) {
					var oNewData = {};
					oNewData[oOpts.managerDataKey] = oData[oOpts.managerDataKey];
					oModel.setData(oNewData);
				}).catch(function (oError) {
					console.error(oOpts.managerDataKey + " could not be loaded", oError);
				});
			}

			function openEntryDialog() {
				return that._openDialog(oOpts.entryDialogName, oOpts.entryDialogId, "Homepage.Homepage.view.fragments." + oOpts.entryDialogName);
			}

			return {
				onPressManage: function () {
					loadForManage();
					that._openDialog(oOpts.dialogName, oOpts.dialogId, "Homepage.Homepage.view.fragments." + oOpts.dialogName);
				},

				onPressClose: function () {
					that._closeDialog(oOpts.dialogName);
				},

				onPressAdd: function () {
					that.getView().getModel(oOpts.entryModel).setData({ id: null, label_de: "", label_en: "", label_es: "" });
					openEntryDialog();
				},

				onPressEdit: function (oEvent) {
					var oRow = oEvent.getSource().getParent().getParent().getBindingContext(oOpts.managerModel).getObject();
					that.getView().getModel(oOpts.entryModel).setData({
						id: oRow.id, label_de: oRow.label_de || "", label_en: oRow.label_en || "", label_es: oRow.label_es || ""
					});
					openEntryDialog();
				},

				onPressEntryCancel: function () {
					that._closeDialog(oOpts.entryDialogName);
				},

				onPressEntrySave: function () {
					var oResourceBundle = that.getResourceBundle();
					var oEntryData = that.getView().getModel(oOpts.entryModel).getData();
					var bIsUpdate = !!oEntryData.id;
					var sUrl = config.SERVICE_URL + "/objectlist/" + oOpts.urlSegment + (bIsUpdate ? "/" + oEntryData.id : "");
					var sMethod = bIsUpdate ? "PUT" : "POST";

					fetch(sUrl, {
						method: sMethod,
						headers: that._authHeaders(),
						body: JSON.stringify({
							label_de: oEntryData.label_de,
							label_en: oEntryData.label_en,
							label_es: oEntryData.label_es
						})
					}).then(function (oResponse) {
						return that._checkResponse(oResponse, true);
					}).then(function () {
						that._closeDialog(oOpts.entryDialogName);
						that._reloadLookups();
						loadForManage();
						that.onRefresh();
					}).catch(function (oError) {
						console.error(oOpts.managerDataKey + " entry could not be saved", oError);
						if (oError && oError.handled && oError.code === oOpts.keyExistsCode) {
							MessageBox.error(oResourceBundle.getText(oOpts.keyExistsI18n));
							return;
						}
						MessageBox.error(oResourceBundle.getText(oOpts.saveErrorI18n));
					});
				},

				onPressDelete: function (oEvent) {
					var oRow = oEvent.getSource().getParent().getParent().getBindingContext(oOpts.managerModel).getObject();
					var oResourceBundle = that.getResourceBundle();

					MessageBox.confirm(oResourceBundle.getText(oOpts.deleteConfirmI18n, [oRow.label_de]), {
						onClose: function (sAction) {
							if (sAction !== MessageBox.Action.OK) {
								return;
							}
							fetch(config.SERVICE_URL + "/objectlist/" + oOpts.urlSegment + "/" + oRow.id, {
								method: "DELETE",
								headers: that._authHeaders()
							}).then(function (oResponse) {
								return that._checkResponse(oResponse, true);
							}).then(function () {
								that._reloadLookups();
								loadForManage();
								that.onRefresh();
							}).catch(function (oError) {
								console.error(oOpts.managerDataKey + " entry could not be deleted", oError);
								if (oError && oError.handled && oError.code === oOpts.inUseCode) {
									MessageBox.error(oResourceBundle.getText(oOpts.inUseI18n, [oError.count]));
									return;
								}
								MessageBox.error(oResourceBundle.getText(oOpts.deleteErrorI18n));
							});
						}
					});
				}
			};
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

			// initialize the model, data is loaded asynchronously from the backend.
			// loadError starts false explicitly -- otherwise the "visible" binding
			// reads undefined before the first fetch resolves, which the control
			// renders as its default (true), flashing the error strip on every load.
			var oModel = new JSONModel({ loadError: false });
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
					return this._checkResponse(oResponse).json();
				}.bind(this))
				.then(function (oData) {
					oData.AbapListDataTitle = oModel.AbapListDataTitle;
					oModel.setData(oData);
					oModel.setProperty("/loadError", false);
				})
				.catch(function (oError) {
					console.error("Objectlist could not be loaded", oError);
					oModel.setProperty("/loadError", true);
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
                    MessageToast.show( sTableCopied + ": " + oObject.value);
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

		// Counts entries per type_key directly from the model data instead of
		// repeatedly re-filtering the visible table binding. The old approach
		// mutated the live binding as a side effect and left it reset to "all",
		// so after onRefresh the table diverged from the still-selected quick-
		// filter tab. Counting from the data leaves the user's filter untouched.
		_setFilterCountValues: function(){
			var aData = (this.getModel("AbapListModel").getData().ObjectData) || [];
			var mCountByKey = {};
			aData.forEach(function (oRow) {
				mCountByKey[oRow.type_key] = (mCountByKey[oRow.type_key] || 0) + 1;
			});

			this.getView().byId("idFilterAll").setCount(aData.length);
			this.getView().byId("idFilterTable").setCount(mCountByKey.table || 0);
			this.getView().byId("idFilterTransaction").setCount(mCountByKey.transaction || 0);
			this.getView().byId("idFilterClass").setCount(mCountByKey.class || 0);
			this.getView().byId("idFilterFuba").setCount(mCountByKey.function_module || 0);
			this.getView().byId("idFilterProgram").setCount(mCountByKey.program || 0);
			this.getView().byId("idFilterShortcut").setCount(mCountByKey.shortcut || 0);
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
					return this._checkResponse(oResponse).json();
				}.bind(this)),
				fetch(config.SERVICE_URL + "/objectlist/categories?lang=" + sLang).then(function (oResponse) {
					return this._checkResponse(oResponse).json();
				}.bind(this))
			]).then(function (aResults) {
				oModel.setData({ Types: aResults[0].TypeData, Categories: aResults[1].CategoryData });
			}).catch(function (oError) {
				console.error("Admin lookups could not be loaded", oError);
				this._pLookupsLoaded = null;
			}.bind(this));

			return this._pLookupsLoaded;
		},

		// Bypasses _loadLookups()'s memoization so the ListEntryDialog's
		// category Select picks up changes immediately after a category is
		// added/renamed/deleted.
		_reloadLookups: function () {
			this._pLookupsLoaded = null;
			return this._loadLookups();
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
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				this.getView().getModel("localDataModelListEntry").setData(oData);
				this._openListEntryDialog();
			}.bind(this)).catch(function (oError) {
				console.error("Object entry could not be loaded", oError);
			});
		},

		_openListEntryDialog: function () {
			return this._openDialog("ListEntryDialog", "idFragListEntryDialog", "Homepage.Homepage.view.fragments.ListEntryDialog");
		},

		onPressListEntryCancel: function () {
			this._closeDialog("ListEntryDialog");
		},

		onPressListEntrySave: function () {
			var oEntryData = this.getView().getModel("localDataModelListEntry").getData();
			var bIsUpdate = !!oEntryData.id;
			var sUrl = config.SERVICE_URL + "/objectlist" + (bIsUpdate ? "/" + oEntryData.id : "");
			var sMethod = bIsUpdate ? "PUT" : "POST";

			fetch(sUrl, {
				method: sMethod,
				headers: this._authHeaders(),
				body: JSON.stringify({
					// sap.m.Select's selectedKey is string-typed, so picking an
					// entry in the Type/Category dropdown overwrites this
					// two-way-bound model property with a string -- Number()
					// restores what the backend's Number.isInteger check requires.
					type_id: Number(oEntryData.type_id),
					category_id: Number(oEntryData.category_id),
					value: oEntryData.value,
					description_de: oEntryData.description_de,
					description_en: oEntryData.description_en,
					description_es: oEntryData.description_es
				})
			}).then(function (oResponse) {
				this._checkResponse(oResponse);
				this._closeDialog("ListEntryDialog");
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
						this._checkResponse(oResponse);
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
