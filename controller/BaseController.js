sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/library",
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/Fragment",
	"sap/base/i18n/Localization",
	"sap/ui/core/HTML",
	"sap/m/Image",
	"sap/m/VBox",
	"sap/m/FlexItemData",
	"sap/m/LightBox",
	"sap/m/LightBoxItem",
	"../model/formatter",
	"../model/config",
	"../model/wikiRenderer"
], function (Controller, UIComponent, mobileLibrary, History, JSONModel, MessageBox, MessageToast, Fragment, Localization, HTML, Image, VBox, FlexItemData, LightBox, LightBoxItem, formatter, config, wikiRenderer) {
	"use strict";

	var EMAIL_SERVICE_TIMEOUT_MS = 8000;
	var TOKEN_STORAGE_KEY = "adminAuthToken";
	var WIKI_DRAFT_MODEL = "wikiEntryDraft";
	var WIKI_ENTRY_DIALOG = "WikiEntryDialog";

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

		// Loads all wiki entries from the backend into a "WikiModel" kept on
		// the component (not the view): the standard, overview and detail
		// wiki views are separate, independently cached view instances, so a
		// per-view model would only refresh whichever view triggered the
		// reload -- e.g. marking an entry private in the standard view
		// wouldn't show its lock icon in the (already-cached) list view
		// until that view's own onInit happened to re-run. A single shared
		// model keeps every view in sync immediately.
		_loadWikiModel: function () {
			var oComponent = this.getOwnerComponent();
			var oModel = oComponent.getModel("WikiModel");
			if (!oModel) {
				oModel = new JSONModel();
				oComponent.setModel(oModel, "WikiModel");
			}
			// GET /wiki is public (never rejects), but sending the admin token
			// when present -- via the same header used for admin-only calls --
			// is what makes it also include private entries for a logged-in
			// admin. A missing/expired token just fails verification quietly
			// server-side and falls back to the public-only result.
			return fetch(config.SERVICE_URL + "/wiki", { headers: this._authHeaders() }).then(function (oResponse) {
				if (!oResponse.ok) {
					throw new Error("Request failed with status " + oResponse.status);
				}
				return oResponse.json();
			}).then(function (oData) {
				oModel.setData(oData);
				this._onWikiModelReloaded();
			}.bind(this)).catch(function (oError) {
				console.error("Wiki could not be loaded", oError);
			});
		},

		// No-op by default; the detail view overrides this to re-anchor its
		// index-based bindings to the entry it's showing, since a reload can
		// shift positions (e.g. private entries appearing/disappearing when
		// the admin logs in/out changes which entries sort before it).
		_onWikiModelReloaded: function () {},

		// Re-fetches the wiki if the current view has it loaded, so a
		// login/logout while already viewing the wiki immediately reflects
		// the new private-entry visibility without needing to navigate away.
		_refreshWikiModelIfPresent: function () {
			if (this.getOwnerComponent().getModel("WikiModel")) {
				this._loadWikiModel();
			}
		},

		// Aggregation factory: turns one wiki block (bound via WikiModel) into
		// the right control for its type. text -> rendered Markdown, code ->
		// highlighted code, image -> Image with LightBox + optional caption.
		// All HTML fed to sap.ui.core.HTML is produced safely by wikiRenderer.
		// Builds a plain-HTML string into an HTML control via .setContent()
		// *after* construction, never as a constructor setting. Curly braces
		// are UI5's binding syntax, and ManagedObject#applySettings scans any
		// string passed in the constructor's settings map for "{...}" -- an
		// admin-authored block containing a lone "{" (unbalanced, so not a
		// real binding) makes that scan throw a SyntaxError and aborts the
		// whole wiki load. Setters bypass applySettings entirely, so the
		// content is stored as a literal value regardless of what it contains.
		_htmlControl: function (sId, sContent, bSanitize) {
			var oHtml = sId ? new HTML(sId) : new HTML();
			if (bSanitize) {
				oHtml.setSanitizeContent(true);
			}
			oHtml.setContent(sContent);
			return oHtml;
		},

		createWikiBlock: function (sId, oContext) {
			var oBlock = oContext.getObject();

			if (oBlock.type === "code") {
				return this._htmlControl(sId, "<div class=\"wikiBlock\">" + wikiRenderer.renderCode(oBlock.content, oBlock.language) + "</div>");
			}

			if (oBlock.type === "html") {
				// Admin-authored raw HTML. sanitizeContent strips scripts and
				// event handlers (defence in depth even though only the admin
				// can create blocks), keeping tables/formatting/links.
				return this._htmlControl(sId, "<div class=\"wikiBlock wikiHtml\">" + (oBlock.content || "") + "</div>", true);
			}

			if (oBlock.type === "image") {
				var sSrc = config.SERVICE_URL + "/wiki/images/" + oBlock.image_id;
				var oLightBoxItem = new LightBoxItem({ imageSrc: sSrc });
				oLightBoxItem.setTitle(oBlock.description || "");
				var oImage = new Image({
					src: sSrc,
					densityAware: false,
					detailBox: new LightBox({ imageContent: [ oLightBoxItem ] })
				});
				oImage.setLayoutData(new sap.m.FlexItemData({ growFactor: 0, shrinkFactor: 0 }));
				var aItems = [ oImage ];
				if (oBlock.description) {
					aItems.push(this._htmlControl(null, "<div class=\"wikiCaption\">" + wikiRenderer.renderInline(oBlock.description) + "</div>"));
				}
				return new VBox(sId, { items: aItems }).addStyleClass("wikiBlock");
			}

			// text (default)
			return this._htmlControl(sId, "<div class=\"wikiBlock wikiText\">" + wikiRenderer.renderMarkdown(oBlock.content) + "</div>");
		},

		// -------------------- wiki admin: entry create/edit/delete --------------------
		// Shared by all three wiki views (standard, list, detail) since they
		// all extend this controller. Row-based entry points (onWikiEntryEdit/
		// Delete) read the entry from the pressed control's binding context;
		// the detail screen has no row, so it reads the single entry bound to
		// its ObjectHeader instead (onWikiDetailEntryEdit/Delete).

		// Component-level (not per-view): the WikiEntryDialog fragment is
		// cached on the component (see _openDialog) and stays attached to
		// whichever view first opened it, so its bindings must resolve
		// against a model that's visible from every wiki view -- a per-view
		// model would leave the dialog reading stale data whenever a
		// different view (e.g. the list) triggers the edit.
		_initWikiEntryDraftModel: function () {
			var oComponent = this.getOwnerComponent();
			if (!oComponent.getModel(WIKI_DRAFT_MODEL)) {
				oComponent.setModel(new JSONModel(this._emptyDraft()), WIKI_DRAFT_MODEL);
			}
		},

		_emptyDraft: function () {
			// Pre-fill today's date (YYYY-MM-DD, matching the DatePicker's
			// valueFormat) so the admin doesn't have to set it manually for
			// the common case of logging today's entry.
			var oNow = new Date();
			var sToday = oNow.getFullYear() + "-"
				+ String(oNow.getMonth() + 1).padStart(2, "0") + "-"
				+ String(oNow.getDate()).padStart(2, "0");
			return { id: null, title: "", entry_date: sToday, tagsText: "", is_private: false, blocks: [] };
		},

		onWikiEntryAdd: function () {
			this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL).setData(this._emptyDraft());
			this._openWikiEntryDialog();
		},

		onWikiEntryEdit: function (oEvent) {
			this._editEntry(oEvent.getSource().getBindingContext("WikiModel").getObject());
		},

		onWikiDetailEntryEdit: function () {
			this._editEntry(this.byId("idObjectHeader").getBindingContext("WikiModel").getObject());
		},

		_editEntry: function (oEntry) {
			this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL).setData({
				id: oEntry.id,
				title: oEntry.title || "",
				entry_date: oEntry.date || null,
				tagsText: (oEntry.tags || []).join(", "),
				is_private: !!oEntry.is_private,
				// deep copy so edits don't mutate the list model before saving
				blocks: JSON.parse(JSON.stringify(oEntry.blocks || []))
			});
			this._openWikiEntryDialog();
		},

		_openWikiEntryDialog: function () {
			return this._openDialog(WIKI_ENTRY_DIALOG, "idFragWikiEntryDialog", "Homepage.Homepage.view.fragments.WikiEntryDialog");
		},

		onWikiEntryCancel: function () {
			this._closeDialog(WIKI_ENTRY_DIALOG);
		},

		onWikiEntrySave: function () {
			var oResourceBundle = this.getResourceBundle();
			var oDraft = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL).getData();

			var aTags = (oDraft.tagsText || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
			var aBlocks = (oDraft.blocks || []).map(function (oBlock) {
				return {
					type: oBlock.type,
					content: (oBlock.type === "text" || oBlock.type === "code" || oBlock.type === "html") ? (oBlock.content || "") : null,
					language: oBlock.type === "code" ? (oBlock.language || null) : null,
					image_id: oBlock.type === "image" ? (oBlock.image_id != null ? oBlock.image_id : null) : null,
					description: oBlock.type === "image" ? (oBlock.description || null) : null
				};
			});

			var bUpdate = !!oDraft.id;
			var sUrl = config.SERVICE_URL + "/wiki" + (bUpdate ? "/" + oDraft.id : "");

			fetch(sUrl, {
				method: bUpdate ? "PUT" : "POST",
				headers: this._authHeaders(),
				body: JSON.stringify({
					title: oDraft.title,
					entry_date: oDraft.entry_date || null,
					tags: aTags,
					is_private: !!oDraft.is_private,
					blocks: aBlocks
				})
			}).then(function (oResponse) {
				if (oResponse.status === 401) {
					this._handleUnauthorized();
					throw new Error("Unauthorized");
				}
				if (!oResponse.ok) {
					throw new Error("Request failed with status " + oResponse.status);
				}
				return oResponse.json();
			}.bind(this)).then(function (oData) {
				this._closeDialog(WIKI_ENTRY_DIALOG);
				return this._loadWikiModel().then(function () {
					MessageToast.show(oResourceBundle.getText("WikiEntryDialogTitle"));
					this._onWikiEntrySaved(oData.id);
				}.bind(this));
			}.bind(this)).catch(function (oError) {
				console.error("Wiki entry could not be saved", oError);
				MessageBox.error(oResourceBundle.getText("WikiSaveError"));
			}.bind(this));
		},

		// Hook called with the saved entry's id after a successful save (once
		// the wiki model has been reloaded). No-op by default; the detail
		// view overrides this to rebind itself to the saved entry (which
		// covers both "edited the entry you're viewing" and "created a new
		// entry from the detail screen" -- both land on that entry's page).
		_onWikiEntrySaved: function (iId) {},

		onWikiEntryDelete: function (oEvent) {
			this._deleteEntry(oEvent.getSource().getBindingContext("WikiModel").getObject());
		},

		onWikiDetailEntryDelete: function () {
			this._deleteEntry(this.byId("idObjectHeader").getBindingContext("WikiModel").getObject());
		},

		_deleteEntry: function (oEntry) {
			var oResourceBundle = this.getResourceBundle();

			MessageBox.confirm(oResourceBundle.getText("WikiDeleteConfirm", [oEntry.title]), {
				onClose: function (sAction) {
					if (sAction !== MessageBox.Action.OK) {
						return;
					}
					fetch(config.SERVICE_URL + "/wiki/" + oEntry.id, {
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
						return this._loadWikiModel();
					}.bind(this)).then(function () {
						this._onWikiEntryDeleted();
					}.bind(this)).catch(function (oError) {
						console.error("Wiki entry could not be deleted", oError);
						MessageBox.error(oResourceBundle.getText("WikiDeleteError"));
					}.bind(this));
				}.bind(this)
			});
		},

		// Hook called after a successful delete (once the wiki model has been
		// reloaded). No-op by default (the standard/list views already show
		// the updated list); the detail view overrides this to navigate away,
		// since the entry it was showing no longer exists.
		_onWikiEntryDeleted: function () {},

		// -------------------- wiki admin: block manipulation --------------------

		_getBlocks: function () {
			return this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL).getProperty("/blocks") || [];
		},

		_setBlocks: function (aBlocks) {
			this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL).setProperty("/blocks", aBlocks);
		},

		_blockIndex: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext(WIKI_DRAFT_MODEL);
			return parseInt(oCtx.getPath().split("/").pop(), 10);
		},

		onWikiAddTextBlock: function () {
			var a = this._getBlocks();
			a.push({ type: "text", content: "" });
			this._setBlocks(a);
		},

		onWikiAddCodeBlock: function () {
			var a = this._getBlocks();
			a.push({ type: "code", content: "", language: "" });
			this._setBlocks(a);
		},

		onWikiAddImageBlock: function () {
			var a = this._getBlocks();
			a.push({ type: "image", image_id: null, description: "" });
			this._setBlocks(a);
		},

		onWikiAddHtmlBlock: function () {
			var a = this._getBlocks();
			a.push({ type: "html", content: "" });
			this._setBlocks(a);
		},

		onWikiBlockMoveUp: function (oEvent) {
			var i = this._blockIndex(oEvent);
			if (i <= 0) { return; }
			var a = this._getBlocks();
			var oTmp = a[i - 1]; a[i - 1] = a[i]; a[i] = oTmp;
			this._setBlocks(a);
		},

		onWikiBlockMoveDown: function (oEvent) {
			var i = this._blockIndex(oEvent);
			var a = this._getBlocks();
			if (i >= a.length - 1) { return; }
			var oTmp = a[i + 1]; a[i + 1] = a[i]; a[i] = oTmp;
			this._setBlocks(a);
		},

		onWikiBlockDelete: function (oEvent) {
			var i = this._blockIndex(oEvent);
			var a = this._getBlocks();
			a.splice(i, 1);
			this._setBlocks(a);
		},

		// Uploads the picked image to the backend and stores the returned id
		// on the block. Uses a bare Authorization header (no Content-Type) so
		// the browser sets the multipart boundary for the FormData body.
		onWikiImageSelected: function (oEvent) {
			var oResourceBundle = this.getResourceBundle();
			var oFileUploader = oEvent.getSource();
			var sPath = oFileUploader.getBindingContext(WIKI_DRAFT_MODEL).getPath();
			var oModel = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL);
			var aFiles = oEvent.getParameter("files");
			var oFile = aFiles && aFiles[0];
			if (!oFile) { return; }

			var oFormData = new FormData();
			oFormData.append("file", oFile);

			fetch(config.SERVICE_URL + "/wiki/images", {
				method: "POST",
				headers: { "Authorization": "Bearer " + sessionStorage.getItem("adminAuthToken") },
				body: oFormData
			}).then(function (oResponse) {
				if (oResponse.status === 401) {
					this._handleUnauthorized();
					throw new Error("Unauthorized");
				}
				if (!oResponse.ok) {
					throw new Error("Upload failed with status " + oResponse.status);
				}
				return oResponse.json();
			}.bind(this)).then(function (oData) {
				oModel.setProperty(sPath + "/image_id", oData.id);
			}).catch(function (oError) {
				console.error("Wiki image could not be uploaded", oError);
				MessageBox.error(oResourceBundle.getText("WikiImageUploadError"));
			});

			oFileUploader.clear();
		},

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
			this._openDialog("LanguageDialog", "idFragLanguageDialog", "Homepage.Homepage.view.fragments.Language");
		},

		onPressLanguageDialogCancel: function (oEvent){
			this._closeDialog("LanguageDialog");
		},
		
		onPressLanguageDialogApply: function (oEvent){
			var oComponent = this.getOwnerComponent();
			var oRadioButtonGroup = sap.ui.core.Fragment.byId(oComponent.createId("idFragLanguageDialog"), "rbg1");
			var iSelectedIndex = oRadioButtonGroup ? oRadioButtonGroup.getSelectedIndex() : 0;

			var sLanguage;
			switch (iSelectedIndex) {
				case 1: sLanguage = "en"; break;
				case 2: sLanguage = "es"; break;
				default: sLanguage = "de";
			}

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
			this._refreshWikiModelIfPresent();
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
				sessionStorage.setItem(TOKEN_STORAGE_KEY, oResult.data.token);
				this._setLoginErrorVisible(false);
				this.getOwnerComponent().getModel("adminModeModel").setProperty("/isAdmin", true);
				this._closeDialog("LoginDialog");
				this._refreshWikiModelIfPresent();
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
			this._refreshWikiModelIfPresent();
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