sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/library",
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/ui/core/Fragment",
	"sap/base/i18n/Localization",
	"../model/formatter",
	"../model/config"
], function (Controller, UIComponent, mobileLibrary, History, JSONModel, MessageBox, Fragment, Localization, formatter, config) {
	"use strict";

	var EMAIL_SERVICE_TIMEOUT_MS = 8000;
	var TOKEN_STORAGE_KEY = "adminAuthToken";

	return Controller.extend("Homepage.Homepage.controller.BaseController", {

		// set formatter
    	formatter: formatter,

		onNavToHome: function (oEvent) {
			this.getRouter().navTo("HomeView");
		},
		onNavToWiki: function (oEvent) {
			if (this.getOwnerComponent()._sWikiView === "Overview") {
				this.onNavToWikiOverview(oEvent);
			}
			else {
				this.onNavToWikiStandard(oEvent);
			}
		},
		onNavToWikiStandard: function (oEvent) {
			this.getOwnerComponent()._sWikiView = "Standard";
			this.getRouter().navTo("WikiView");
		},
		onNavToWikiOverview: function (oEvent) {
			this.getOwnerComponent()._sWikiView = "Overview";
			this.getRouter().navTo("WikiOverviewView");
		},
		onNavToList: function (oEvent) {
			this.getRouter().navTo("ListView");
		},
		onNavToAboutMe: function (oEvent) {
			this.getRouter().navTo("AboutMeView");
		},
		
		onNavToContactMe: function (oEvent) {
			//Dialog öffnen
			var oComponent = this.getOwnerComponent();
			if (!oComponent.ContactMeDialog) {
				oComponent.ContactMeDialog = sap.ui.core.Fragment.load({
					id: oComponent.createId("idFragContactMeDialog"),
					name: "Homepage.Homepage.view.fragments.ContactMe",
					controller: this
				}).then(function (oDialog) {
					oComponent.ContactMeDialog = oDialog;
					// connect dialog to the root view of this component
					this.getView().addDependent(oDialog);
					oDialog.open();
				}.bind(this));
			} else {
				oComponent.ContactMeDialog.open();
			}
		},
		
		onPressContactMeDialogCancel: function (oEvent){
			var oComponent = this.getOwnerComponent();
			oComponent.ContactMeDialog.close();
		},
		
		onPressContactMeDialogOk: function (oEvent){
			if (!this._checkValidityContactMeData(oEvent)){
				return;
			}

			/*Send Message*/
			var sContactMeData = this.getView().getModel("localDataModelContactMe").getData();

			fetch(config.SERVICE_URL + "/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(sContactMeData),
				signal: AbortSignal.timeout(EMAIL_SERVICE_TIMEOUT_MS)
			}).then(function (oResponse) {
				if (!oResponse.ok) {
					throw new Error("Request failed with status " + oResponse.status);
				}
				this._displayMessageContactMeSend(true);
				this._clearContactMeData();
			}.bind(this)).catch(function (oError) {
				console.error("Contact-Me email could not be sent", oError);
				this._displayMessageContactMeSend(false);
			}.bind(this));
		},
		
		onNavToLanguage: function (oEvent) {
			var oComponent = this.getOwnerComponent();
			//Dialog öffnen
			if (!oComponent.LanguageDialog) {
				oComponent.refDateDialog = sap.ui.core.Fragment.load({
					id: oComponent.createId("idFragLanguageDialog"),
					name: "Homepage.Homepage.view.fragments.Language",
					controller: this
				}).then(function (oDialog) {
					oComponent.LanguageDialog = oDialog;
					// connect dialog to the root view of this component
					this.getView().addDependent(oDialog);
					oDialog.open();
				}.bind(this));
			} else {
				oComponent.LanguageDialog.open();
			}
		},

		onPressLanguageDialogCancel: function (oEvent){
			var oComponent = this.getOwnerComponent();
			oComponent.LanguageDialog.close();
		},
		
		onPressLanguageDialogApply: function (oEvent){
			var oComponent = this.getOwnerComponent();
			var oDialog = oComponent.LanguageDialog;
			
		    if (oDialog) {
		        var oRadioButtonGroup = sap.ui.core.Fragment.byId(oComponent.createId("idFragLanguageDialog"), "rbg1");
		
		        if (oRadioButtonGroup) {
		            var iSelectedIndex = oRadioButtonGroup.getSelectedIndex();
				};
		    };
		    var sLanguage;    
		    switch (iSelectedIndex) { case 0: sLanguage="de"; break;
									  case 1: sLanguage="en"; break;
									  case 2: sLanguage="es"; break;
									  default: sLanguage="de";
									};

			/*Change language*/
			Localization.setLanguage(sLanguage);
			
			/*Close window*/
			this.onPressLanguageDialogCancel(oEvent);
		},
		
		// Reachable from every page's Header: opens the login dialog if
		// logged out, logs out immediately if already logged in (no
		// confirmation -- low stakes, and the button icon already shows the
		// current state before it's pressed).
		onPressAdminToggle: function () {
			var oAdminModeModel = this.getOwnerComponent().getModel("adminModeModel");
			if (oAdminModeModel.getProperty("/isAdmin")) {
				this._logout();
			} else {
				this._openLoginDialog();
			}
		},

		_logout: function () {
			sessionStorage.removeItem(TOKEN_STORAGE_KEY);
			this.getOwnerComponent().getModel("adminModeModel").setProperty("/isAdmin", false);
		},

		_openLoginDialog: function () {
			var oComponent = this.getOwnerComponent();
			if (!oComponent.LoginDialog) {
				oComponent.LoginDialog = sap.ui.core.Fragment.load({
					id: oComponent.createId("idFragLoginDialog"),
					name: "Homepage.Homepage.view.fragments.Login",
					controller: this
				}).then(function (oDialog) {
					oComponent.LoginDialog = oDialog;
					this.getView().addDependent(oDialog);
					oDialog.open();
					return oDialog;
				}.bind(this));
			} else {
				Promise.resolve(oComponent.LoginDialog).then(function (oDialog) {
					oDialog.open();
				});
			}
		},

		onPressLoginDialogCancel: function () {
			var oComponent = this.getOwnerComponent();
			Promise.resolve(oComponent.LoginDialog).then(function (oDialog) {
				oDialog.close();
			});
		},

		onPressLoginSubmit: function () {
			var oComponent = this.getOwnerComponent();
			var oLoginData = this.getView().getModel("localDataModelLogin").getData();

			fetch(config.SERVICE_URL + "/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username: oLoginData.username, password: oLoginData.password })
			}).then(function (oResponse) {
				return oResponse.json().then(function (oData) {
					return { ok: oResponse.ok, data: oData };
				});
			}).then(function (oResult) {
				if (!oResult.ok) {
					this._setLoginErrorVisible(true);
					return;
				}
				sessionStorage.setItem(TOKEN_STORAGE_KEY, oResult.data.token);
				this._setLoginErrorVisible(false);
				this.getOwnerComponent().getModel("adminModeModel").setProperty("/isAdmin", true);
				Promise.resolve(oComponent.LoginDialog).then(function (oDialog) {
					oDialog.close();
				});
			}.bind(this)).catch(function (oError) {
				console.error("Login failed", oError);
				this._setLoginErrorVisible(true);
			}.bind(this));
		},

		_setLoginErrorVisible: function (bVisible) {
			var oComponent = this.getOwnerComponent();
			var oText = sap.ui.core.Fragment.byId(oComponent.createId("idFragLoginDialog"), "idTextLoginError");
			if (oText) {
				oText.setVisible(bVisible);
			}
		},

		_authHeaders: function () {
			return {
				"Content-Type": "application/json",
				"Authorization": "Bearer " + sessionStorage.getItem(TOKEN_STORAGE_KEY)
			};
		},

		// Called whenever an admin-only fetch call receives a 401 (token
		// missing/expired/tampered). Drops back to logged-out state and
		// re-prompts, consistent with onPressAdminToggle's logged-out path.
		_handleUnauthorized: function () {
			sessionStorage.removeItem(TOKEN_STORAGE_KEY);
			this.getOwnerComponent().getModel("adminModeModel").setProperty("/isAdmin", false);
			this._openLoginDialog();
		},

		_clearContactMeData: function(){
			var sContactMeData = this.getView().getModel("localDataModelContactMe").getData();
			sContactMeData.NameFirst = "";
			sContactMeData.NameLast = "";
			sContactMeData.Email = "";
			sContactMeData.Text = "";
			this.getView().getModel("localDataModelContactMe").setData(sContactMeData);
		},
		
		_checkEmailServerAlive: function(){
			return fetch(config.SERVICE_URL + "/", {
				signal: AbortSignal.timeout(EMAIL_SERVICE_TIMEOUT_MS)
			}).then(function (oResponse) {
				return oResponse.ok;
			}).catch(function () {
				return false;
			});
		},

		_getEmailServerAlive: async function(){
			var oComponent = this.getOwnerComponent();
			if (oComponent._bEmailServerAlive === undefined){
				oComponent._bEmailServerAlive = await this._checkEmailServerAlive();
			};
			return oComponent._bEmailServerAlive;
		},

		_setVisibilityContactMeHeaderButton: async function () {
			var bEmailServerAlive = await this._getEmailServerAlive();
			this.getView().byId("idContactMeButton").setVisible(bEmailServerAlive);
		},
		
		_displayMessageContactMeSend: function(fSuccess){
			if (fSuccess === true){
			/*Success Message*/
				MessageBox.success(this.getResourceBundle().getText("txtMessageSendSuccess"), {
					onClose: function (oAction) {
						var oComponent = this.getOwnerComponent();
						oComponent.ContactMeDialog.close();
					}.bind(this)
				});
			}
			else {
			/*Error Message*/
				MessageBox.error(this.getResourceBundle().getText("txtMessageSendError"), {
							onClose: function (oAction) {
						}.bind(this)
					});
			}
		},
		
		_checkValidityContactMeData: function (oEvent){
			var sContactMeData = this.getView().getModel("localDataModelContactMe").getData();
			var bValid = true;
			var oComponent = this.getOwnerComponent();

			/*Check if mandatory Data is supplied*/
			//FirstName
			if (sContactMeData.NameFirst === undefined || sContactMeData.NameFirst === "") {
				bValid = false;
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeFirstName").setValueState(sap.ui.core.ValueState.Error);
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeFirstName").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeFirstName").setValueState(sap.ui.core.ValueState.None);
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeFirstName").setValueStateText("");
			}
			
			//LastName
			if (sContactMeData.NameLast === undefined || sContactMeData.NameLast === "") {
				bValid = false;
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeLastName").setValueState(sap.ui.core.ValueState.Error);
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeLastName").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeLastName").setValueState(sap.ui.core.ValueState.None);
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeLastName").setValueStateText("");
			}
			
			//Email
			if (sContactMeData.Email === undefined || sContactMeData.Email === "") {
				bValid = false;
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeEmail").setValueState(sap.ui.core.ValueState.Error);
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeEmail").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeEmail").setValueState(sap.ui.core.ValueState.None);
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeEmail").setValueStateText("");
			}
			
			//Text
			if (sContactMeData.Text === undefined || sContactMeData.Text === "") {
				bValid = false;
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idTextAreaContactMeText").setValueState(sap.ui.core.ValueState.Error);
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idTextAreaContactMeText").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idTextAreaContactMeText").setValueState(sap.ui.core.ValueState.None);
				sap.ui.core.Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idTextAreaContactMeText").setValueStateText("");
			}
			
			return bValid;
			
		},
		
		/**
		 * Convenience method for accessing the router.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter: function () {
			return UIComponent.getRouterFor(this);
		},

		/**
		 * Convenience method for getting the view model by name.
		 * @public
		 * @param {string} [sName] the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.mvc.View} the view instance
		 */
		setModel: function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/**
		 * Getter for the resource bundle.
		 * @public
		 * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
		 */
		getResourceBundle: function () {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		/**
		 * Go Back in history
		 * @public
		 */
		onNavBack: function () {

			var oHistory = History.getInstance();
			var sPreviousHash = oHistory.getPreviousHash();

			if (sPreviousHash !== undefined) {
				window.history.go(-1);
			} else {
				var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
				oRouter.navTo("HomeView", {}, true);
			}
		},

		/**
		 * Adds a history entry in the FLP page history
		 * @public
		 * @param {object} oEntry An entry object to add to the hierachy array as expected from the ShellUIService.setHierarchy method
		 * @param {boolean} bReset If true resets the history before the new entry is added
		 */
		addHistoryEntry: (function () {
			var aHistoryEntries = [];

			return function (oEntry, bReset) {
				if (bReset) {
					aHistoryEntries = [];
				}

				var bInHistory = aHistoryEntries.some(function (oHistoryEntry) {
					return oHistoryEntry.intent === oEntry.intent;
				});

				if (!bInHistory) {
					aHistoryEntries.push(oEntry);
					this.getOwnerComponent().getService("ShellUIService").then(function (oService) {
						oService.setHierarchy(aHistoryEntries);
					});
				}
			};
		})()

	});

});