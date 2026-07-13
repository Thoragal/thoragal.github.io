sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/core/Fragment",
	"sap/ui/core/HTML",
	"sap/ui/core/Item",
	"sap/m/Image",
	"sap/m/VBox",
	"sap/m/FlexItemData",
	"sap/m/LightBox",
	"sap/m/LightBoxItem",
	"../model/config",
	"../model/wikiRenderer"
], function (BaseController, JSONModel, MessageBox, MessageToast, Fragment, HTML, Item, Image, VBox, FlexItemData, LightBox, LightBoxItem, config, wikiRenderer) {
	"use strict";

	var TOKEN_STORAGE_KEY = "adminAuthToken";
	var WIKI_DRAFT_MODEL = "wikiEntryDraft";
	var WIKI_ENTRY_DIALOG = "WikiEntryDialog";

	// Shared by WikiView (standard + list views) and WikiDetailView -- all
	// wiki entry create/edit/delete, block-editor, and attachment logic
	// lives here rather than in BaseController, since only these two
	// controllers need it. See _onAuthStateChanged for the one piece that
	// has to hook back into BaseController's generic login/logout flow
	// (which runs for every controller, wiki or not).
	return BaseController.extend("Homepage.Homepage.controller.WikiController", {

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
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
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

		// Overrides BaseController's no-op _onAuthStateChanged hook: re-fetches
		// the wiki if the current view has it loaded, so a login/logout while
		// already viewing the wiki immediately reflects the new private-entry
		// visibility without needing to navigate away.
		_onAuthStateChanged: function () {
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
				// Admin-authored HTML, produced by the RichTextEditor.
				// sanitizeContent strips scripts and event handlers (defence
				// in depth even though only the admin can create blocks),
				// keeping tables/formatting/links.
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
				oImage.setLayoutData(new FlexItemData({ growFactor: 0, shrinkFactor: 0 }));
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
			return { id: null, title: "", entry_date: sToday, tagsText: "", is_private: false, blocks: [], files: [], uploadUrl: "" };
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
				blocks: JSON.parse(JSON.stringify(oEntry.blocks || [])),
				files: JSON.parse(JSON.stringify(oEntry.files || [])),
				uploadUrl: config.SERVICE_URL + "/wiki/" + oEntry.id + "/files"
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
				return this._checkResponse(oResponse).json();
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
						this._checkResponse(oResponse);
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
				headers: { "Authorization": "Bearer " + sessionStorage.getItem(TOKEN_STORAGE_KEY) },
				body: oFormData
			}).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				oModel.setProperty(sPath + "/image_id", oData.id);
			}).catch(function (oError) {
				console.error("Wiki image could not be uploaded", oError);
				MessageBox.error(oResourceBundle.getText("WikiImageUploadError"));
			});

			oFileUploader.clear();
		},

		// -------------------- wiki admin: attachments --------------------
		// Attachments are a separate, decoupled list per entry (not a content
		// block), uploaded via their own endpoint through
		// sap.m.plugins.UploadSetwithTable rather than the plain FileUploader
		// used for image blocks above.

		// Re-reads the current entry's files from the just-reloaded WikiModel
		// back into the draft, so the editor's attachment table reflects the
		// latest upload/delete without a separate local patch (same
		// single-source-of-truth approach as onWikiEntrySave/_deleteEntry).
		_syncWikiEntryDraftFilesFromWikiModel: function () {
			var oComponent = this.getOwnerComponent();
			var oDraftModel = oComponent.getModel(WIKI_DRAFT_MODEL);
			var iId = oDraftModel.getProperty("/id");
			if (!iId) { return; }
			var aWiki = oComponent.getModel("WikiModel").getProperty("/Wiki") || [];
			var oEntry = aWiki.filter(function (o) { return o.id === iId; })[0];
			oDraftModel.setProperty("/files", (oEntry && oEntry.files) || []);
		},

		// UploadSetwithTable posts directly to uploadUrl itself, so the admin
		// bearer token has to be attached per-upload via a header field
		// rather than through _authHeaders() (which is only used for plain
		// fetch() calls elsewhere in this controller).
		onWikiFileBeforeUploadStarts: function (oEvent) {
			var oPlugin = oEvent.getSource();
			oPlugin.removeAllHeaderFields();
			oPlugin.addHeaderField(new Item({ key: "Authorization", text: "Bearer " + sessionStorage.getItem(TOKEN_STORAGE_KEY) }));
		},

		onWikiFileUploadCompleted: function (oEvent) {
			var oResourceBundle = this.getResourceBundle();
			// Attached on the custom UploaderTableItem (see the fragment), not
			// on the plugin itself -- with a custom uploader the plugin
			// doesn't relay this event, and its parameter shape is
			// { item, responseXHR, id } rather than a plain "status".
			var oResponseXHR = oEvent.getParameter("responseXHR");
			var iStatus = oResponseXHR ? oResponseXHR.status : 0;
			if (iStatus === 401) {
				this._handleUnauthorized();
				return;
			}
			if (iStatus < 200 || iStatus >= 300) {
				MessageBox.error(oResourceBundle.getText("WikiAttachmentsUploadError"));
				return;
			}
			this._loadWikiModel().then(function () {
				this._syncWikiEntryDraftFilesFromWikiModel();
			}.bind(this));
		},

		onWikiFileDelete: function (oEvent) {
			var oResourceBundle = this.getResourceBundle();
			var oFile = oEvent.getSource().getBindingContext(WIKI_DRAFT_MODEL).getObject();

			MessageBox.confirm(oResourceBundle.getText("WikiAttachmentsDeleteConfirm", [oFile.filename]), {
				onClose: function (sAction) {
					if (sAction !== MessageBox.Action.OK) {
						return;
					}
					fetch(config.SERVICE_URL + "/wiki/files/" + oFile.id, {
						method: "DELETE",
						headers: this._authHeaders()
					}).then(function (oResponse) {
						this._checkResponse(oResponse);
						return this._loadWikiModel();
					}.bind(this)).then(function () {
						this._syncWikiEntryDraftFilesFromWikiModel();
					}.bind(this)).catch(function (oError) {
						console.error("Wiki attachment could not be deleted", oError);
						MessageBox.error(oResourceBundle.getText("WikiAttachmentsDeleteError"));
					}.bind(this));
				}.bind(this)
			});
		},

		// The dialog fragment is loaded with an id prefixed by the component
		// (see _openDialog), not the current view, so plain this.byId can't
		// find its controls -- Fragment.byId with that same prefix is needed.
		_byIdInWikiEntryDialog: function (sId) {
			return Fragment.byId(this.getOwnerComponent().createId("idFragWikiEntryDialog"), sId);
		},

		onWikiAttachmentsSelectionChange: function (oEvent) {
			var aSelected = oEvent.getSource().getSelectedContexts();
			this._byIdInWikiEntryDialog("idBtnWikiAttachmentsDownloadSelected").setEnabled(aSelected.length > 0);
			this._byIdInWikiEntryDialog("idBtnWikiAttachmentsDeleteSelected").setEnabled(aSelected.length > 0);
		},

		// Staggered like the detail view's download -- firing all <a> clicks
		// in the same tick makes Chrome silently drop every download past
		// the first (its multi-download flood protection).
		onWikiAttachmentsDownloadSelected: function () {
			var aSelected = this._byIdInWikiEntryDialog("idTableWikiAttachments").getSelectedContexts();
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

		onWikiAttachmentsDeleteSelected: function () {
			var oResourceBundle = this.getResourceBundle();
			var oTable = this._byIdInWikiEntryDialog("idTableWikiAttachments");
			var aFiles = oTable.getSelectedContexts().map(function (oContext) { return oContext.getObject(); });
			if (aFiles.length === 0) {
				return;
			}

			MessageBox.confirm(oResourceBundle.getText("WikiAttachmentsDeleteSelectedConfirm", [aFiles.length]), {
				onClose: function (sAction) {
					if (sAction !== MessageBox.Action.OK) {
						return;
					}
					Promise.all(aFiles.map(function (oFile) {
						return fetch(config.SERVICE_URL + "/wiki/files/" + oFile.id, {
							method: "DELETE",
							headers: this._authHeaders()
						}).then(this._checkResponse.bind(this));
					}.bind(this))).then(function () {
						return this._loadWikiModel();
					}.bind(this)).then(function () {
						oTable.removeSelections();
						this._byIdInWikiEntryDialog("idBtnWikiAttachmentsDownloadSelected").setEnabled(false);
						this._byIdInWikiEntryDialog("idBtnWikiAttachmentsDeleteSelected").setEnabled(false);
						this._syncWikiEntryDraftFilesFromWikiModel();
					}.bind(this)).catch(function (oError) {
						console.error("Wiki attachments could not be deleted", oError);
						MessageBox.error(oResourceBundle.getText("WikiAttachmentsDeleteError"));
					}.bind(this));
				}.bind(this)
			});
		}

	});

});
