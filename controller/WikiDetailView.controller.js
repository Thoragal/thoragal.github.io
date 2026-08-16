sap.ui.define([
	"./WikiController",
	"sap/m/MessageToast"
], function (WikiController, MessageToast) {
	"use strict";

	return WikiController.extend("Homepage.Homepage.controller.WikiDetailView", {

		onInit: function () {
			this.getView().byId("idPageWikiDetail").setBusy(true);
			this.getView().byId("idButtonNavToWiki").setType("Emphasized");

			// Load the wiki once; the pattern-matched handler waits for it.
			this._pWikiLoaded = this._loadWikiModel();
			this._initWikiEntryDraftModel();

			this.getOwnerComponent().getRouter()
				.getRoute("WikiDetailView").attachPatternMatched(this._onObjectMatched, this);

			this._setVisibilityContactMeHeaderButton();

			this._pWikiLoaded.then(function () {
				this.getView().byId("idPageWikiDetail").setBusy(false);
			}.bind(this));
		},

		onAfterRendering: function () {
			this._observeFooterVisibility("idWikiDetailScrollEndMarker");
		},

		onExit: function () {
			this._disconnectFooterVisibilityObserver();
		},

		onNavToWikiDetailNext: function () {
			var iNext = this._getConfirmedIndex(this._getIndexWithId(this.sWindowId) + 1);
			this.getRouter().navTo("WikiDetailView", { Id: this._getIdWithIndex(iNext) });
		},

		onNavToWikiDetailPrevious: function () {
			var iPrev = this._getConfirmedIndex(this._getIndexWithId(this.sWindowId) - 1);
			this.getRouter().navTo("WikiDetailView", { Id: this._getIdWithIndex(iPrev) });
		},

		_getWikiData: function () {
			return this.getView().getModel("WikiModel").getProperty("/Wiki") || [];
		},

		_getIndexWithId: function (sId) {
			var aWiki = this._getWikiData();
			for (var i = 0; i < aWiki.length; i++) {
				if (String(aWiki[i].id) === String(sId)) {
					return i;
				}
			}
			return 0;
		},

		_getIdWithIndex: function (iIndex) {
			var aWiki = this._getWikiData();
			return aWiki.length ? aWiki[iIndex].id : null;
		},

		// GET /wiki silently omits private entries for a non-admin -- there's
		// no 403/404 to react to, the id just isn't in WikiModel. This can't
		// distinguish "private" from "never existed", so it errs toward
		// "private": prompt a login rather than claim the entry is missing.
		_hasEntryWithId: function (sId) {
			return this._getWikiData().some(function (o) { return String(o.id) === String(sId); });
		},

		// Wraps the index around and toasts when jumping past either end.
		_getConfirmedIndex: function (iIndex) {
			var aWiki = this._getWikiData();
			if (aWiki.length === 0) {
				return 0;
			}
			if (iIndex < 0) {
				MessageToast.show(this.getResourceBundle().getText("WikiDetailLoadLast"));
				return aWiki.length - 1;
			}
			if (iIndex > aWiki.length - 1) {
				MessageToast.show(this.getResourceBundle().getText("WikiDetailLoadFirst"));
				return 0;
			}
			return iIndex;
		},

		_bindWikiDetail: function (iIndex) {
			this.byId("idObjectHeader").bindElement("WikiModel>/Wiki/" + iIndex + "/");
			this.byId("idBlocksWikiDetail").bindAggregation("items", {
				path: "WikiModel>/Wiki/" + iIndex + "/blocks",
				factory: this.createWikiBlock.bind(this)
			});
			this.byId("idTableWikiDetailAttachments").bindElement("WikiModel>/Wiki/" + iIndex + "/");
			this.byId("idBtnWikiDetailAttachmentsDownload").setEnabled(false);
		},

		onWikiDetailAttachmentSelectionChange: function () {
			var aSelected = this.byId("idTableWikiDetailAttachments").getSelectedContexts();
			this.byId("idBtnWikiDetailAttachmentsDownload").setEnabled(aSelected.length > 0);
		},

		onWikiDetailFileDownload: function (oEvent) {
			var oFile = oEvent.getSource().getBindingContext("WikiModel").getObject();
			this._downloadWikiFile(oFile).catch(this._showWikiDownloadError.bind(this));
		},

		onWikiDetailAttachmentsDownloadIndividually: function () {
			var aSelected = this.byId("idTableWikiDetailAttachments").getSelectedContexts();
			this._downloadWikiFilesStaggered(aSelected);
		},

		onWikiDetailAttachmentsDownloadZipped: function () {
			var oTable = this.byId("idTableWikiDetailAttachments");
			var aFileIds = oTable.getSelectedContexts().map(function (oContext) { return oContext.getObject().id; });
			var oEntry = oTable.getBindingContext("WikiModel").getObject();
			// See WikiController#onWikiAttachmentsDownloadSelectedZipped for
			// why this is looked up by id instead of via the MenuItem's own
			// ancestor chain.
			this._downloadWikiFilesZipped(oEntry.id, aFileIds, oEntry.title, this.byId("idBtnWikiDetailAttachmentsDownload"));
		},

		_onObjectMatched: function (oEvent) {
			this.sWindowId = window.decodeURIComponent(oEvent.getParameter("arguments").Id);
			this._pWikiLoaded.then(function () {
				this._showEntryOrPromptLogin();
			}.bind(this));
		},

		// A requested id that isn't in the (possibly private-entry-filtered)
		// WikiModel prompts a login instead of silently falling back to
		// index 0 (see _getIndexWithId) and showing the wrong entry. Once
		// logged in, _onWikiModelReloaded re-runs this against the
		// now-admin-inclusive model and binds the real entry.
		_showEntryOrPromptLogin: function () {
			var bIsAdmin = this.getOwnerComponent().getModel("adminModeModel").getProperty("/isAdmin");
			if (!this._hasEntryWithId(this.sWindowId) && !bIsAdmin) {
				this._promptLoginForRoute("WikiView");
				return;
			}
			this._bindWikiDetail(this._getIndexWithId(this.sWindowId));
		},

		// The entry being viewed no longer exists after a delete -- go back
		// to the wiki list rather than showing a stale/empty detail page.
		_onWikiEntryDeleted: function () {
			this.getRouter().navTo("WikiView");
		},

		// A reload (e.g. triggered by logging in/out while already viewing
		// the wiki) can shift positions in the index-bound WikiModel array
		// -- most notably, private entries appearing/disappearing changes
		// how many entries sort before the one being viewed. Re-anchor to
		// the same entry id. Guarded on sWindowId being set already, since
		// the initial onInit load happens before the route match runs.
		_onWikiModelReloaded: function () {
			if (this.sWindowId) {
				this._showEntryOrPromptLogin();
			}
		}

	});

});
