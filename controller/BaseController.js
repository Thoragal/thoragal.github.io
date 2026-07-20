sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/library",
	"sap/ui/core/routing/History",
	"sap/m/MessageBox",
	"sap/ui/core/Fragment",
	"sap/base/i18n/Localization",
	"sap/ui/core/library",
	"../model/formatter",
	"../model/config"
], function (Controller, UIComponent, mobileLibrary, History, MessageBox, Fragment, Localization, coreLibrary, formatter, config) {
	"use strict";

	var EMAIL_SERVICE_TIMEOUT_MS = 8000;

	return Controller.extend("Homepage.Homepage.controller.BaseController", {

		// set formatter
    	formatter: formatter,

		// Lazy-loads a dialog fragment the first time it's requested, caches the
		// (promise of the) dialog on the component so it survives view switches,
		// and opens it. Caching the promise -- not just the resolved dialog --
		// makes rapid double-clicks safe: a second call reuses the in-flight
		// load instead of starting a second one (which would create duplicate
		// control IDs) or calling .open() on a bare promise.
		_openDialog: function (sCacheKey, sFragmentId, sFragmentName) {
			var oComponent = this.getOwnerComponent();
			if (!oComponent[sCacheKey]) {
				oComponent[sCacheKey] = Fragment.load({
					id: oComponent.createId(sFragmentId),
					name: sFragmentName,
					controller: this
				}).then(function (oDialog) {
					this.getView().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}
			return Promise.resolve(oComponent[sCacheKey]).then(function (oDialog) {
				oDialog.open();
				return oDialog;
			});
		},

		// Closes a dialog opened via _openDialog, tolerating the case where it
		// was never opened or is still loading.
		_closeDialog: function (sCacheKey) {
			var oDialog = this.getOwnerComponent()[sCacheKey];
			if (oDialog) {
				Promise.resolve(oDialog).then(function (oResolvedDialog) {
					oResolvedDialog.close();
				});
			}
		},

		// Hook fired after every login/logout/unauthorized-drop (see _logout,
		// onPressLoginSubmit, _handleUnauthorized below) -- runs regardless of
		// which controller happens to be active, since the admin toggle in the
		// Header is reachable from every page. No-op by default; WikiController
		// overrides it to refresh the WikiModel (private-entry visibility
		// depends on admin state) so that feature-specific logic doesn't have
		// to live here.
		_onAuthStateChanged: function () {},

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
			this._openDialog("ContactMeDialog", "idFragContactMeDialog", "Homepage.Homepage.view.fragments.ContactMe");
		},

		onPressContactMeDialogCancel: function (oEvent){
			this._closeDialog("ContactMeDialog");
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
				this._checkResponse(oResponse);
				this._displayMessageContactMeSend(true);
				this._clearContactMeData();
			}.bind(this)).catch(function (oError) {
				console.error("Contact-Me email could not be sent", oError);
				this._displayMessageContactMeSend(false);
			}.bind(this));
		},

		onNavToLanguage: function (oEvent) {
			this._openDialog("LanguageDialog", "idFragLanguageDialog", "Homepage.Homepage.view.fragments.Language");
		},

		onPressLanguageDialogCancel: function (oEvent){
			this._closeDialog("LanguageDialog");
		},

		onPressLanguageDialogApply: function (oEvent){
			var oComponent = this.getOwnerComponent();
			var oRadioButtonGroup = Fragment.byId(oComponent.createId("idFragLanguageDialog"), "rbg1");
			var iSelectedIndex = oRadioButtonGroup ? oRadioButtonGroup.getSelectedIndex() : 0;
			// The language is read from the selected button's own customData
			// (set per-button in the fragment) rather than a hardcoded
			// index->language mapping here, so the two can't drift apart if
			// the buttons are ever reordered or added to in the fragment.
			var oSelectedButton = oRadioButtonGroup && oRadioButtonGroup.getButtons()[iSelectedIndex];
			var sLanguage = (oSelectedButton && oSelectedButton.data("lang")) || "de";

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
			config.clearToken();
			this.getOwnerComponent().getModel("adminModeModel").setProperty("/isAdmin", false);
			this._onAuthStateChanged();
		},

		_openLoginDialog: function () {
			return this._openDialog("LoginDialog", "idFragLoginDialog", "Homepage.Homepage.view.fragments.Login");
		},

		onPressLoginDialogCancel: function () {
			this._closeDialog("LoginDialog");
		},

		onPressLoginSubmit: function () {
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
				config.setToken(oResult.data.token);
				this._setLoginErrorVisible(false);
				this.getOwnerComponent().getModel("adminModeModel").setProperty("/isAdmin", true);
				this._closeDialog("LoginDialog");
				this._onAuthStateChanged();
			}.bind(this)).catch(function (oError) {
				console.error("Login failed", oError);
				this._setLoginErrorVisible(true);
			}.bind(this));
		},

		_setLoginErrorVisible: function (bVisible) {
			var oComponent = this.getOwnerComponent();
			var oText = Fragment.byId(oComponent.createId("idFragLoginDialog"), "idTextLoginError");
			if (oText) {
				oText.setVisible(bVisible);
			}
		},

		_authHeaders: function () {
			return {
				"Content-Type": "application/json",
				"Authorization": "Bearer " + config.getToken()
			};
		},

		// Called whenever an admin-only fetch call receives a 401 (token
		// missing/expired/tampered). Drops back to logged-out state and
		// re-prompts, consistent with onPressAdminToggle's logged-out path.
		_handleUnauthorized: function () {
			config.clearToken();
			this.getOwnerComponent().getModel("adminModeModel").setProperty("/isAdmin", false);
			this._onAuthStateChanged();
			this._openLoginDialog();
		},

		// Common post-fetch gate, meant to be chained right after fetch():
		// .then(function (oResponse) { return this._checkResponse(oResponse); }.bind(this))
		// A 401 logs the admin out and re-prompts (via _handleUnauthorized),
		// then rejects. A non-ok status rejects with a generic error, UNLESS
		// bParseConflict is true and the status is 409 -- some admin-CRUD
		// endpoints (category/type save & delete) return a machine-readable
		// { error: "<code>_exists"/"<code>_in_use", count? } body on 409, so
		// that path parses the JSON and rejects with { handled: true, code,
		// count } instead, letting the caller's catch block show a specific
		// message instead of the generic one. On success, resolves to the
		// (unread) Response so the caller can still call .json() if needed.
		_checkResponse: function (oResponse, bParseConflict) {
			if (oResponse.status === 401) {
				this._handleUnauthorized();
				throw new Error("Unauthorized");
			}
			if (bParseConflict && oResponse.status === 409) {
				return oResponse.json().then(function (oData) {
					throw { handled: true, code: oData.error, count: oData.count };
				});
			}
			if (!oResponse.ok) {
				throw new Error("Request failed with status " + oResponse.status);
			}
			return oResponse;
		},

			// Shared by every row-level delete action (wiki entries, wiki
			// attachments, objectlist entries, category/type lookups): shows a
			// confirm dialog and only invokes fnOnConfirmed if the user presses
			// OK, so callers don't each re-implement the same MessageBox.confirm
			// wiring.
			_confirmDelete: function (sConfirmText, fnOnConfirmed) {
				MessageBox.confirm(sConfirmText, {
					onClose: function (sAction) {
						if (sAction === MessageBox.Action.OK) {
							fnOnConfirmed();
						}
					}
				});
			},

			// Shared DELETE-request helper: attaches the admin auth header and
			// runs the response through _checkResponse (so 401/409 handling stays
			// centralized), without dictating what a caller does after success or
			// on failure -- those differ per entity (reload a list, sync a draft,
			// show a conflict-specific message, ...).
			_deleteResource: function (sUrl, bParseConflict) {
				return fetch(sUrl, {
					method: "DELETE",
					headers: this._authHeaders()
				}).then(function (oResponse) {
					return this._checkResponse(oResponse, bParseConflict);
				}.bind(this));
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
						this._closeDialog("ContactMeDialog");
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
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeFirstName").setValueState(coreLibrary.ValueState.Error);
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeFirstName").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeFirstName").setValueState(coreLibrary.ValueState.None);
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeFirstName").setValueStateText("");
			}

			//LastName
			if (sContactMeData.NameLast === undefined || sContactMeData.NameLast === "") {
				bValid = false;
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeLastName").setValueState(coreLibrary.ValueState.Error);
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeLastName").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeLastName").setValueState(coreLibrary.ValueState.None);
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeLastName").setValueStateText("");
			}

			//Email
			if (sContactMeData.Email === undefined || sContactMeData.Email === "") {
				bValid = false;
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeEmail").setValueState(coreLibrary.ValueState.Error);
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeEmail").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeEmail").setValueState(coreLibrary.ValueState.None);
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idInputContactMeEmail").setValueStateText("");
			}

			//Text
			if (sContactMeData.Text === undefined || sContactMeData.Text === "") {
				bValid = false;
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idTextAreaContactMeText").setValueState(coreLibrary.ValueState.Error);
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idTextAreaContactMeText").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idTextAreaContactMeText").setValueState(coreLibrary.ValueState.None);
				Fragment.byId(oComponent.createId("idFragContactMeDialog"), "idTextAreaContactMeText").setValueStateText("");
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
				var oRouter = UIComponent.getRouterFor(this);
				oRouter.navTo("HomeView", {}, true);
			}
		}

	});

});
