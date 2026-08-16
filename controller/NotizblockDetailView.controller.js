sap.ui.define([
	"./NotizblockController",
	"sap/m/MessageToast"
], function (NotizblockController, MessageToast) {
	"use strict";

	return NotizblockController.extend("Homepage.Homepage.controller.NotizblockDetailView", {

		// The guard + one-time init can't live directly in onInit, and
		// attachPatternMatched can't be gated behind the guard either --
		// onInit only runs once, the first time this view is constructed. If
		// that first-ever visit is blocked (not admin yet) and the guard
		// check (or the attachPatternMatched call) is skipped, this cached
		// view instance would never get another chance to attach it, since
		// onInit never runs again. Attaching unconditionally in onInit and
		// re-checking the guard on every match instead (see
		// _onObjectMatched/_ensureInitialized below) makes this robust
		// regardless of caching -- see NotizblockView.controller.js for the
		// same reasoning.
		onInit: function () {
			this.getOwnerComponent().getRouter()
				.getRoute("NotizblockDetailView").attachPatternMatched(this._onObjectMatched, this);
		},

		// Loads the notizblock once (cached via _pNotizblockLoaded) and does
		// the one-time page setup -- called from every _onObjectMatched, but
		// only does real work the first time it's reached past the guard.
		_ensureInitialized: function () {
			if (this._pNotizblockLoaded) {
				return this._pNotizblockLoaded;
			}
			this.getView().byId("idPageNotizblockDetail").setBusy(true);
			this.getView().byId("idButtonNavToNotizblock").setType("Emphasized");
			this._initNotizblockEntryDraftModel();
			this._setVisibilityContactMeHeaderButton();
			this._pNotizblockLoaded = this._loadNotizblockModel().then(function () {
				this.getView().byId("idPageNotizblockDetail").setBusy(false);
			}.bind(this));
			return this._pNotizblockLoaded;
		},

		onAfterRendering: function () {
			this._observeFooterVisibility("idNotizblockDetailScrollEndMarker");
		},

		onExit: function () {
			this._disconnectFooterVisibilityObserver();
		},

		onNavToNotizblockDetailNext: function () {
			var iNext = this._getConfirmedIndex(this._getIndexWithId(this.sWindowId) + 1);
			this.getRouter().navTo("NotizblockDetailView", { Id: this._getIdWithIndex(iNext) });
		},

		onNavToNotizblockDetailPrevious: function () {
			var iPrev = this._getConfirmedIndex(this._getIndexWithId(this.sWindowId) - 1);
			this.getRouter().navTo("NotizblockDetailView", { Id: this._getIdWithIndex(iPrev) });
		},

		_getNotizblockData: function () {
			return this.getView().getModel("NotizblockModel").getProperty("/Notizblock") || [];
		},

		_getIndexWithId: function (sId) {
			var aNotizblock = this._getNotizblockData();
			for (var i = 0; i < aNotizblock.length; i++) {
				if (String(aNotizblock[i].id) === String(sId)) {
					return i;
				}
			}
			return 0;
		},

		_getIdWithIndex: function (iIndex) {
			var aNotizblock = this._getNotizblockData();
			return aNotizblock.length ? aNotizblock[iIndex].id : null;
		},

		// Wraps the index around and toasts when jumping past either end.
		_getConfirmedIndex: function (iIndex) {
			var aNotizblock = this._getNotizblockData();
			if (aNotizblock.length === 0) {
				return 0;
			}
			if (iIndex < 0) {
				MessageToast.show(this.getResourceBundle().getText("NotizblockDetailLoadLast"));
				return aNotizblock.length - 1;
			}
			if (iIndex > aNotizblock.length - 1) {
				MessageToast.show(this.getResourceBundle().getText("NotizblockDetailLoadFirst"));
				return 0;
			}
			return iIndex;
		},

		_bindNotizblockDetail: function (iIndex) {
			this.byId("idObjectHeaderNotizblock").bindElement("NotizblockModel>/Notizblock/" + iIndex + "/");
			this.byId("idBlocksNotizblockDetail").bindAggregation("items", {
				path: "NotizblockModel>/Notizblock/" + iIndex + "/blocks",
				factory: this.createNotizblockBlock.bind(this)
			});
			this.byId("idTableNotizblockDetailAttachments").bindElement("NotizblockModel>/Notizblock/" + iIndex + "/");
			this.byId("idBtnNotizblockDetailAttachmentsDownload").setEnabled(false);
		},

		onNotizblockDetailAttachmentSelectionChange: function () {
			var aSelected = this.byId("idTableNotizblockDetailAttachments").getSelectedContexts();
			this.byId("idBtnNotizblockDetailAttachmentsDownload").setEnabled(aSelected.length > 0);
		},

		onNotizblockDetailFileDownload: function (oEvent) {
			var oFile = oEvent.getSource().getBindingContext("NotizblockModel").getObject();
			this._downloadNotizblockFile(oFile).catch(this._showNotizblockDownloadError.bind(this));
		},

		onNotizblockDetailAttachmentsDownloadIndividually: function () {
			var aSelected = this.byId("idTableNotizblockDetailAttachments").getSelectedContexts();
			this._downloadNotizblockFilesStaggered(aSelected);
		},

		onNotizblockDetailAttachmentsDownloadZipped: function () {
			var oTable = this.byId("idTableNotizblockDetailAttachments");
			var aFileIds = oTable.getSelectedContexts().map(function (oContext) { return oContext.getObject().id; });
			var oEntry = oTable.getBindingContext("NotizblockModel").getObject();
			// See WikiController#onWikiAttachmentsDownloadSelectedZipped for
			// why this is looked up by id instead of via the MenuItem's own
			// ancestor chain.
			this._downloadNotizblockFilesZipped(oEntry.id, aFileIds, oEntry.title, this.byId("idBtnNotizblockDetailAttachmentsDownload"));
		},

		_onObjectMatched: function (oEvent) {
			if (!this._guardAdminRoute()) {
				return;
			}
			this.sWindowId = window.decodeURIComponent(oEvent.getParameter("arguments").Id);
			this._ensureInitialized().then(function () {
				this._bindNotizblockDetail(this._getIndexWithId(this.sWindowId));
			}.bind(this));
		},

		// The entry being viewed no longer exists after a delete -- go back
		// to the notizblock list rather than showing a stale/empty detail page.
		_onNotizblockEntryDeleted: function () {
			this.getRouter().navTo("NotizblockView");
		},

		// A reload can shift positions in the index-bound NotizblockModel
		// array. Re-anchor to the same entry id. Guarded on sWindowId being
		// set already, since a reload could in principle fire before the
		// first route match has set it.
		_onNotizblockModelReloaded: function () {
			if (this.sWindowId) {
				this._bindNotizblockDetail(this._getIndexWithId(this.sWindowId));
			}
		}

	});

});
