sap.ui.define([
	"./BaseController",
	"sap/m/MessageToast"
], function (BaseController, MessageToast) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.WikiDetailView", {

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

		// Triggers a browser download per selected attachment. A plain <a>
		// click (not window.open) avoids leaving blank tabs behind, and works
		// across origins because the backend already sends
		// Content-Disposition: attachment on this endpoint. Downloads are
		// staggered (not fired in the same tick) because Chrome silently
		// blocks every download past the first when several are triggered
		// synchronously in one go -- only a per-file user gesture or a gap
		// between requests avoids that flood protection.
		onWikiDetailAttachmentsDownload: function () {
			var aSelected = this.byId("idTableWikiDetailAttachments").getSelectedContexts();
			var oFormatter = this.formatter;
			aSelected.forEach(function (oContext, iIndex) {
				setTimeout(function () {
					var oFile = oContext.getObject();
					var oLink = document.createElement("a");
					oLink.href = oFormatter.wikiFileUrl(oFile.id);
					oLink.download = oFile.filename;
					document.body.appendChild(oLink);
					oLink.click();
					document.body.removeChild(oLink);
				}, iIndex * 400);
			});
		},

		_onObjectMatched: function (oEvent) {
			this.sWindowId = window.decodeURIComponent(oEvent.getParameter("arguments").Id);
			this._pWikiLoaded.then(function () {
				this._bindWikiDetail(this._getIndexWithId(this.sWindowId));
			}.bind(this));
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
				this._bindWikiDetail(this._getIndexWithId(this.sWindowId));
			}
		}

	});

});
