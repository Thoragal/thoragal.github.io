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
	// Tags, normalized into their own table (see backend/schema.sql): a
	// component-level lookup model (all known tags, feeds both the entry
	// dialog's "+" picker and the manage dialog's table), the picker's own
	// transient filtered-list model, and the manage dialog's table + entry-
	// form models -- same split as ListView's AdminLookupModel/
	// CategoryManagerModel/localDataModelCategoryEntry trio, kept separate
	// here (see _makeLookupManager) since that factory is hard-wired to
	// 3-language labels and the /objectlist/ URL prefix.
	var WIKI_TAGS_MODEL = "wikiTagsModel";
	var WIKI_TAG_PICKER_MODEL = "wikiTagPickerModel";
	var WIKI_TAG_MANAGER_MODEL = "WikiTagManagerModel";
	var WIKI_TAG_ENTRY_MODEL = "localDataModelWikiTagEntry";
	var WIKI_TAGS_DIALOG = "WikiTagsDialog";
	var WIKI_TAG_ENTRY_DIALOG = "WikiTagEntryDialog";

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
			if (!oComponent.getModel(WIKI_TAGS_MODEL)) {
				oComponent.setModel(new JSONModel({ Tags: [] }), WIKI_TAGS_MODEL);
			}
			if (!oComponent.getModel(WIKI_TAG_PICKER_MODEL)) {
				oComponent.setModel(new JSONModel({ items: [] }), WIKI_TAG_PICKER_MODEL);
			}
			if (!oComponent.getModel(WIKI_TAG_MANAGER_MODEL)) {
				oComponent.setModel(new JSONModel({ Tags: [] }), WIKI_TAG_MANAGER_MODEL);
			}
			if (!oComponent.getModel(WIKI_TAG_ENTRY_MODEL)) {
				oComponent.setModel(new JSONModel({ id: null, label: "" }), WIKI_TAG_ENTRY_MODEL);
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
			return { id: null, title: "", entry_date: sToday, tags: [], is_private: false, blocks: [], files: [], uploadUrl: "" };
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
				// deep copy, same reasoning as blocks/files below: edits (add/
				// remove via the picker) must not mutate the list model before
				// saving
				tags: JSON.parse(JSON.stringify(oEntry.tags || [])),
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
					tag_ids: (oDraft.tags || []).map(function (t) { return t.id; }),
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

		// -------------------- wiki admin: tags --------------------
		// Tags are normalized into wiki_tags/wiki_entry_tags (see
		// backend/schema.sql), edited via a "+"-icon picker (pick an
		// existing tag or create one on the fly) plus a separate gear-icon
		// manage dialog for renaming/deleting tags globally. Both are fed
		// by the same component-level WIKI_TAGS_MODEL lookup list.

		// Fetches the full tag list from the backend into WIKI_TAGS_MODEL.
		// Called directly by the manage dialog's add/edit/delete flows
		// (which always want the latest data); the picker instead goes
		// through the memoized _ensureWikiTagsLoaded/_reloadWikiTags pair
		// below, since it's opened far more often and shouldn't re-fetch
		// on every "+" press.
		_fetchWikiTags: function () {
			var oModel = this.getOwnerComponent().getModel(WIKI_TAGS_MODEL);
			return fetch(config.SERVICE_URL + "/wiki/tags", { headers: this._authHeaders() }).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				oModel.setData({ Tags: oData.Tags });
			}).catch(function (oError) {
				console.error("Wiki tags could not be loaded", oError);
			});
		},

		_ensureWikiTagsLoaded: function () {
			var oComponent = this.getOwnerComponent();
			if (!oComponent._pWikiTagsLoaded) {
				oComponent._pWikiTagsLoaded = this._fetchWikiTags();
			}
			return oComponent._pWikiTagsLoaded;
		},

		// Bypasses the memoization above so the picker and manage dialog
		// pick up a create/rename/delete immediately, same reasoning as
		// ListView's _reloadLookups.
		_reloadWikiTags: function () {
			this.getOwnerComponent()._pWikiTagsLoaded = null;
			return this._ensureWikiTagsLoaded();
		},

		// Recomputes the picker popover's filtered list: known tags not
		// already on the draft, matching the current search text, plus a
		// trailing synthetic "create '<text>'" row when nothing existing
		// matches it exactly (case-insensitive, so typing an existing
		// tag's label in a different case still resolves to it rather
		// than offering to create a near-duplicate).
		_updateWikiTagPickerList: function (sQuery) {
			var oComponent = this.getOwnerComponent();
			var sText = (sQuery || "").trim();
			var sLowerText = sText.toLowerCase();
			var aAllTags = oComponent.getModel(WIKI_TAGS_MODEL).getProperty("/Tags") || [];
			var aDraftIds = (oComponent.getModel(WIKI_DRAFT_MODEL).getProperty("/tags") || []).map(function (t) { return t.id; });

			var aItems = aAllTags.filter(function (oTag) {
				return aDraftIds.indexOf(oTag.id) === -1
					&& (!sLowerText || oTag.label.toLowerCase().indexOf(sLowerText) !== -1);
			}).map(function (oTag) {
				return { id: oTag.id, label: oTag.label, icon: "sap-icon://tag", isCreate: false, createLabel: null };
			});

			var bExactMatch = aAllTags.some(function (oTag) { return oTag.label.toLowerCase() === sLowerText; });
			if (sText && !bExactMatch) {
				aItems.push({
					id: null,
					label: this.getResourceBundle().getText("WikiTagCreateNew", [sText]),
					icon: "sap-icon://add",
					isCreate: true,
					createLabel: sText
				});
			}

			oComponent.getModel(WIKI_TAG_PICKER_MODEL).setProperty("/items", aItems);
		},

		onWikiTagAddPress: function (oEvent) {
			var oButton = oEvent.getSource();
			this._ensureWikiTagsLoaded().then(function () {
				this._byIdInWikiEntryDialog("idSearchWikiTagPicker").setValue("");
				this._updateWikiTagPickerList("");
				this._byIdInWikiEntryDialog("idPopoverWikiTagPicker").openBy(oButton);
			}.bind(this)).catch(function () {});
		},

		onWikiTagSearchLiveChange: function (oEvent) {
			this._updateWikiTagPickerList(oEvent.getParameter("newValue"));
		},

		onWikiTagPickerItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext(WIKI_TAG_PICKER_MODEL).getObject();
			if (oItem.isCreate) {
				this._createAndAttachWikiTag(oItem.createLabel);
			} else {
				this._attachWikiTagToDraft({ id: oItem.id, label: oItem.label });
				this._byIdInWikiEntryDialog("idPopoverWikiTagPicker").close();
			}
		},

		_attachWikiTagToDraft: function (oTag) {
			var oDraftModel = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL);
			var aTags = oDraftModel.getProperty("/tags") || [];
			aTags.push({ id: oTag.id, label: oTag.label });
			oDraftModel.setProperty("/tags", aTags);
		},

		// Upsert-on-label-conflict server-side (see POST /wiki/tags), so
		// typing an already-existing label here just resolves to and
		// attaches that tag rather than erroring.
		_createAndAttachWikiTag: function (sLabel) {
			var oResourceBundle = this.getResourceBundle();
			return fetch(config.SERVICE_URL + "/wiki/tags", {
				method: "POST",
				headers: this._authHeaders(),
				body: JSON.stringify({ label: sLabel })
			}).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				this._attachWikiTagToDraft(oData);
				return this._reloadWikiTags();
			}.bind(this)).then(function () {
				this._byIdInWikiEntryDialog("idPopoverWikiTagPicker").close();
			}.bind(this)).catch(function (oError) {
				console.error("Wiki tag could not be created", oError);
				MessageBox.error(oResourceBundle.getText("WikiTagSaveError"));
			});
		},

		onWikiTagRemove: function (oEvent) {
			var oContext = oEvent.getSource().getBindingContext(WIKI_DRAFT_MODEL);
			var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);
			var oDraftModel = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL);
			var aTags = oDraftModel.getProperty("/tags") || [];
			aTags.splice(iIndex, 1);
			oDraftModel.setProperty("/tags", aTags);
		},

		// -------------------- wiki admin: tag management dialog --------------------
		// Reachable via the gear icon next to the "+" picker. Deliberately
		// not built on ListView's _makeLookupManager factory (see the
		// plan): that factory is hard-wired to 3-language label_de/en/es
		// shapes and the /objectlist/ URL prefix, so a single-label,
		// /wiki/tags-backed entity is simpler as its own small set of
		// handlers following the same 7-step shape.

		_loadWikiTagManagerModel: function () {
			var oModel = this.getOwnerComponent().getModel(WIKI_TAG_MANAGER_MODEL);
			return fetch(config.SERVICE_URL + "/wiki/tags", { headers: this._authHeaders() }).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				oModel.setData({ Tags: oData.Tags });
			}).catch(function (oError) {
				console.error("Wiki tags could not be loaded", oError);
			});
		},

		onPressManageWikiTags: function () {
			this._loadWikiTagManagerModel();
			this._openDialog(WIKI_TAGS_DIALOG, "idFragWikiTagsDialog", "Homepage.Homepage.view.fragments.WikiTagsDialog");
		},

		onPressWikiTagsClose: function () {
			this._closeDialog(WIKI_TAGS_DIALOG);
		},

		onPressWikiTagAdd: function () {
			this.getOwnerComponent().getModel(WIKI_TAG_ENTRY_MODEL).setData({ id: null, label: "" });
			this._openDialog(WIKI_TAG_ENTRY_DIALOG, "idFragWikiTagEntryDialog", "Homepage.Homepage.view.fragments.WikiTagEntryDialog");
		},

		onPressWikiTagEdit: function (oEvent) {
			var oRow = oEvent.getSource().getBindingContext(WIKI_TAG_MANAGER_MODEL).getObject();
			this.getOwnerComponent().getModel(WIKI_TAG_ENTRY_MODEL).setData({ id: oRow.id, label: oRow.label });
			this._openDialog(WIKI_TAG_ENTRY_DIALOG, "idFragWikiTagEntryDialog", "Homepage.Homepage.view.fragments.WikiTagEntryDialog");
		},

		onPressWikiTagEntryCancel: function () {
			this._closeDialog(WIKI_TAG_ENTRY_DIALOG);
		},

		onPressWikiTagEntrySave: function () {
			var oResourceBundle = this.getResourceBundle();
			var oEntryData = this.getOwnerComponent().getModel(WIKI_TAG_ENTRY_MODEL).getData();
			var bIsUpdate = !!oEntryData.id;
			var sUrl = config.SERVICE_URL + "/wiki/tags" + (bIsUpdate ? "/" + oEntryData.id : "");

			fetch(sUrl, {
				method: bIsUpdate ? "PUT" : "POST",
				headers: this._authHeaders(),
				body: JSON.stringify({ label: oEntryData.label })
			}).then(function (oResponse) {
				return this._checkResponse(oResponse, true);
			}.bind(this)).then(function () {
				this._closeDialog(WIKI_TAG_ENTRY_DIALOG);
				return this._reloadWikiTags();
			}.bind(this)).then(function () {
				this._loadWikiTagManagerModel();
				// Renaming changes labels already showing in the (cached)
				// WikiModel entry list -- reload so they update immediately.
				return this._loadWikiModel();
			}.bind(this)).catch(function (oError) {
				console.error("Wiki tag could not be saved", oError);
				if (oError && oError.handled && oError.code === "tag_label_exists") {
					MessageBox.error(oResourceBundle.getText("WikiTagLabelExistsError"));
					return;
				}
				MessageBox.error(oResourceBundle.getText("WikiTagSaveError"));
			});
		},

		// Removes a just-deleted tag from the currently open (unsaved)
		// entry draft, if present. The backend's in-use check only sees
		// tags already persisted in wiki_entry_tags, so a tag can still be
		// sitting attached to an open-but-not-yet-saved draft when it's
		// deleted here -- without this, Save would send a now-dangling
		// tag_id and fail with a 400 FK-violation error.
		_pruneWikiTagFromDraft: function (iTagId) {
			var oDraftModel = this.getOwnerComponent().getModel(WIKI_DRAFT_MODEL);
			var aTags = oDraftModel.getProperty("/tags") || [];
			var aFiltered = aTags.filter(function (t) { return t.id !== iTagId; });
			if (aFiltered.length !== aTags.length) {
				oDraftModel.setProperty("/tags", aFiltered);
			}
		},

		onPressWikiTagDelete: function (oEvent) {
			var oRow = oEvent.getSource().getBindingContext(WIKI_TAG_MANAGER_MODEL).getObject();
			var oResourceBundle = this.getResourceBundle();

			this._confirmDelete(oResourceBundle.getText("WikiTagDeleteConfirm", [oRow.label]), function () {
				this._deleteResource(config.SERVICE_URL + "/wiki/tags/" + oRow.id, true).then(function () {
					this._pruneWikiTagFromDraft(oRow.id);
					return this._reloadWikiTags();
				}.bind(this)).then(function () {
					this._loadWikiTagManagerModel();
					return this._loadWikiModel();
				}.bind(this)).catch(function (oError) {
					console.error("Wiki tag could not be deleted", oError);
					if (oError && oError.handled && oError.code === "tag_in_use") {
						MessageBox.error(oResourceBundle.getText("WikiTagInUseError", [oError.count]));
						return;
					}
					MessageBox.error(oResourceBundle.getText("WikiTagDeleteError"));
				});
			}.bind(this));
		},

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
