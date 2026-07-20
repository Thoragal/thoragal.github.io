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
	"sap/ui/core/library",
	"../model/config",
	"../model/wikiRenderer"
], function (BaseController, JSONModel, MessageBox, MessageToast, Fragment, HTML, Item, Image, VBox, FlexItemData, LightBox, LightBoxItem, coreLibrary, config, wikiRenderer) {
	"use strict";

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
				oModel = new JSONModel({ loadError: false });
				oComponent.setModel(oModel, "WikiModel");
			}
			// _loadWikiModel is called from many places (save, delete, upload,
			// login/logout, onInit...) and responses aren't guaranteed to
			// arrive in the order their requests were sent. A request counter
			// makes only the most-recently-*started* call ever win: if a
			// newer load has been kicked off by the time this one resolves,
			// its (now-stale) data is discarded instead of overwriting the
			// model with older state.
			this._iWikiLoadRequestId = (this._iWikiLoadRequestId || 0) + 1;
			var iRequestId = this._iWikiLoadRequestId;
			// GET /wiki is public (never rejects), but sending the admin token
			// when present -- via the same header used for admin-only calls --
			// is what makes it also include private entries for a logged-in
			// admin. A missing/expired token just fails verification quietly
			// server-side and falls back to the public-only result.
			return fetch(config.SERVICE_URL + "/wiki", { headers: this._authHeaders() }).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				if (iRequestId !== this._iWikiLoadRequestId) {
					return;
				}
				oModel.setData(oData);
				oModel.setProperty("/loadError", false);
				this._onWikiModelReloaded();
			}.bind(this)).catch(function (oError) {
				console.error("Wiki could not be loaded", oError);
				// Only the most-recently-started load may flip the flag, for the
				// same reason the success path is guarded above -- an older,
				// already-superseded request failing must not blank out a newer
				// one's already-successful data.
				if (iRequestId === this._iWikiLoadRequestId) {
					oModel.setProperty("/loadError", true);
				}
			}.bind(this));
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
			// The dialog is cached and reused (see _openDialog), so a red
			// error state left over from a previous failed save attempt would
			// otherwise still be showing the next time it's opened, even for
			// an unrelated entry.
			return this._openDialog(WIKI_ENTRY_DIALOG, "idFragWikiEntryDialog", "Homepage.Homepage.view.fragments.WikiEntryDialog").then(function () {
				var oTitleInput = this._byIdInWikiEntryDialog("idInputWikiEntryTitle");
				oTitleInput.setValueState(coreLibrary.ValueState.None);
				oTitleInput.setValueStateText("");
			}.bind(this));
		},

		onWikiEntryCancel: function () {
			this._closeDialog(WIKI_ENTRY_DIALOG);
		},

		onWikiEntrySave: function () {
			// Guards against a double-click (or any other double-fire of this
			// handler) submitting the same new entry twice: a new entry's
			// draft has no id yet, and nothing sets one until this request's
			// own success handler runs, so a second call before that happens
			// would see the same "no id -> POST" state and create a second,
			// duplicate entry instead of updating the first.
			if (this._bSavingWikiEntry) {
				return;
			}

			var oResourceBundle = this.getResourceBundle();
			var oDraft = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL).getData();
			var oTitleInput = this._byIdInWikiEntryDialog("idInputWikiEntryTitle");

			if (!oDraft.title || !oDraft.title.trim()) {
				oTitleInput.setValueState(coreLibrary.ValueState.Error);
				oTitleInput.setValueStateText(oResourceBundle.getText("WikiEntryTitleMandatory"));
				// The valueStateText popup only shows while the control has
				// focus (it's not just a static tooltip) -- Save left focus on
				// the button, so without this the red border would appear
				// with no visible explanation of why.
				oTitleInput.focus();
				return;
			}
			oTitleInput.setValueState(coreLibrary.ValueState.None);
			oTitleInput.setValueStateText("");

			this._bSavingWikiEntry = true;
			var oSaveButton = this._byIdInWikiEntryDialog("idBtnWikiEntrySave");
			oSaveButton.setEnabled(false);

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
			}.bind(this)).finally(function () {
				this._bSavingWikiEntry = false;
				oSaveButton.setEnabled(true);
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

			this._confirmDelete(oResourceBundle.getText("WikiDeleteConfirm", [oEntry.title]), function () {
				this._deleteResource(config.SERVICE_URL + "/wiki/" + oEntry.id).then(function () {
					return this._loadWikiModel();
				}.bind(this)).then(function () {
					this._onWikiEntryDeleted();
				}.bind(this)).catch(function (oError) {
					console.error("Wiki entry could not be deleted", oError);
					MessageBox.error(oResourceBundle.getText("WikiDeleteError"));
				}.bind(this));
			}.bind(this));
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
				headers: { "Authorization": "Bearer " + config.getToken() },
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
		// Preserves any still-uploading placeholder rows (see
		// onWikiFileUploadStarted below) -- this sync can be triggered by a
		// *different*, already-finished upload while another one in the same
		// multi-select batch is still in flight, and a plain overwrite would
		// wipe that still-running row's progress bar off the screen.
		_syncWikiEntryDraftFilesFromWikiModel: function () {
			var oComponent = this.getOwnerComponent();
			var oDraftModel = oComponent.getModel(WIKI_DRAFT_MODEL);
			var iId = oDraftModel.getProperty("/id");
			if (!iId) { return; }
			var aWiki = oComponent.getModel("WikiModel").getProperty("/Wiki") || [];
			var oEntry = aWiki.filter(function (o) { return o.id === iId; })[0];
			var aServerFiles = (oEntry && oEntry.files) || [];
			var aPending = (oDraftModel.getProperty("/files") || []).filter(function (o) { return o.pending; });
			oDraftModel.setProperty("/files", aServerFiles.concat(aPending));
		},

		// UploadSetwithTable posts directly to uploadUrl itself, so the admin
		// bearer token has to be attached per-upload via a header field
		// rather than through _authHeaders() (which is only used for plain
		// fetch() calls elsewhere in this controller).
		onWikiFileBeforeUploadStarts: function (oEvent) {
			var oPlugin = oEvent.getSource();
			oPlugin.removeAllHeaderFields();
			oPlugin.addHeaderField(new Item({ key: "Authorization", text: "Bearer " + config.getToken() }));
		},

		// Appends a placeholder row for a file that just started uploading --
		// the real row only appears once the server confirms the upload (see
		// onWikiFileUploadCompleted), so without this there is no visible
		// feedback at all while a large file is in transit. Keyed by the
		// uploader's own item id (stable across started/progressed/completed
		// for that one file) so concurrent uploads from a multi-select don't
		// interfere with each other.
		onWikiFileUploadStarted: function (oEvent) {
			var oItem = oEvent.getParameter("item");
			var oDraftModel = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL);
			var aFiles = oDraftModel.getProperty("/files") || [];
			aFiles.push({
				pendingId: oItem.getId(),
				pending: true,
				filename: oItem.getFileName(),
				size_bytes: oItem.getFileSize(),
				progress: 0
			});
			oDraftModel.setProperty("/files", aFiles);
		},

		onWikiFileUploadProgressed: function (oEvent) {
			var oItem = oEvent.getParameter("item");
			if (!oItem) { return; }
			var iLoaded = oEvent.getParameter("loaded");
			var iTotal = oEvent.getParameter("total");
			var iPercent = iTotal ? Math.round((iLoaded / iTotal) * 100) : 0;
			var oDraftModel = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL);
			var aFiles = oDraftModel.getProperty("/files") || [];
			var oPending = aFiles.filter(function (o) { return o.pendingId === oItem.getId(); })[0];
			if (oPending) {
				oPending.progress = iPercent;
				oDraftModel.setProperty("/files", aFiles);
			}
		},

		onWikiFileUploadCompleted: function (oEvent) {
			var oResourceBundle = this.getResourceBundle();
			var oItem = oEvent.getParameter("item");
			if (oItem) {
				var oDraftModel = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL);
				var aFiles = (oDraftModel.getProperty("/files") || []).filter(function (o) { return o.pendingId !== oItem.getId(); });
				oDraftModel.setProperty("/files", aFiles);
			}
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

			this._confirmDelete(oResourceBundle.getText("WikiAttachmentsDeleteConfirm", [oFile.filename]), function () {
				this._deleteResource(config.SERVICE_URL + "/wiki/files/" + oFile.id).then(function () {
					return this._loadWikiModel();
				}.bind(this)).then(function () {
					this._syncWikiEntryDraftFilesFromWikiModel();
				}.bind(this)).catch(function (oError) {
					console.error("Wiki attachment could not be deleted", oError);
					MessageBox.error(oResourceBundle.getText("WikiAttachmentsDeleteError"));
				}.bind(this));
			}.bind(this));
		},

		// The dialog fragment is loaded with an id prefixed by the component
		// (see _openDialog), not the current view, so plain this.byId can't
		// find its controls -- Fragment.byId with that same prefix is needed.
		_byIdInWikiEntryDialog: function (sId) {
			return Fragment.byId(this.getOwnerComponent().createId("idFragWikiEntryDialog"), sId);
		},

		// Downloads one attachment via an authenticated fetch() rather than a
		// plain <a href> or programmatic anchor click -- browsers don't (and
		// can't) attach custom headers to those, so a private entry's admin
		// bearer token would never reach the server and every download would
		// 404 as if the file didn't exist, even for the admin themselves. The
		// response is turned into a blob: URL purely to trigger the browser's
		// normal "save file" behaviour with the right filename; that final
		// click needs no auth of its own since the bytes are already local.
		_downloadWikiFile: function (oFile) {
			return fetch(this.formatter.wikiFileUrl(oFile.id), { headers: this._authHeaders() })
				.then(function (oResponse) {
					if (oResponse.status === 401) {
						this._handleUnauthorized();
						throw new Error("Unauthorized");
					}
					if (!oResponse.ok) {
						// Unlike _checkResponse (which discards the body so callers
						// can safely re-read it), downloads have no second reader --
						// the body is parsed here to recover the server's message
						// (e.g. a B2 bandwidth cap) so the UI can show it verbatim.
						return oResponse.json().catch(function () { return {}; }).then(function (oData) {
							throw new Error(oData.error || ("Request failed with status " + oResponse.status));
						});
					}
					return oResponse;
				}.bind(this))
				.then(function (oResponse) { return oResponse.blob(); })
				.then(function (oBlob) {
					var sObjectUrl = URL.createObjectURL(oBlob);
					var oLink = document.createElement("a");
					oLink.href = sObjectUrl;
					oLink.download = oFile.filename;
					document.body.appendChild(oLink);
					oLink.click();
					document.body.removeChild(oLink);
					URL.revokeObjectURL(sObjectUrl);
				});
		},

		_showWikiDownloadError: function (oError) {
			console.error("Wiki attachment could not be downloaded", oError);
			MessageBox.error(this.getResourceBundle().getText("WikiAttachmentsDownloadError", [oError.message]));
		},

		// Shared by the editor's and the detail view's multi-select download
		// buttons. Staggered -- firing all downloads in the same tick makes
		// Chrome silently drop every one past the first (its multi-download
		// flood protection).
		_downloadWikiFilesStaggered: function (aContexts) {
			aContexts.forEach(function (oContext, iIndex) {
				setTimeout(function () {
					this._downloadWikiFile(oContext.getObject()).catch(this._showWikiDownloadError.bind(this));
				}.bind(this), iIndex * 400);
			}.bind(this));
		},

		onWikiAttachmentsSelectionChange: function (oEvent) {
			var aSelected = oEvent.getSource().getSelectedContexts();
			this._byIdInWikiEntryDialog("idBtnWikiAttachmentsDownloadSelected").setEnabled(aSelected.length > 0);
			this._byIdInWikiEntryDialog("idBtnWikiAttachmentsDeleteSelected").setEnabled(aSelected.length > 0);
		},

		onWikiAttachmentsDownloadSelected: function () {
			var aSelected = this._byIdInWikiEntryDialog("idTableWikiAttachments").getSelectedContexts();
			this._downloadWikiFilesStaggered(aSelected);
		},

		onWikiAttachmentsDeleteSelected: function () {
			var oResourceBundle = this.getResourceBundle();
			var oTable = this._byIdInWikiEntryDialog("idTableWikiAttachments");
			var aFiles = oTable.getSelectedContexts().map(function (oContext) { return oContext.getObject(); });
			if (aFiles.length === 0) {
				return;
			}

			this._confirmDelete(oResourceBundle.getText("WikiAttachmentsDeleteSelectedConfirm", [aFiles.length]), function () {
				Promise.all(aFiles.map(function (oFile) {
					return this._deleteResource(config.SERVICE_URL + "/wiki/files/" + oFile.id);
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
			}.bind(this));
		}

	});

});
