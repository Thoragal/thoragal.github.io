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

	var NOTIZBLOCK_DRAFT_MODEL = "notizblockEntryDraft";
	var NOTIZBLOCK_ENTRY_DIALOG = "NotizblockEntryDialog";
	// Tags, normalized into their own table (see backend/schema.sql), mirroring
	// WikiController's own tag model split -- a separate notizblock_tags table
	// from wiki_tags, not a shared pool (Notizblock is kept parallel-but-
	// independent from Wiki throughout this codebase).
	var NOTIZBLOCK_TAGS_MODEL = "notizblockTagsModel";
	var NOTIZBLOCK_TAG_PICKER_MODEL = "notizblockTagPickerModel";
	var NOTIZBLOCK_TAG_MANAGER_MODEL = "NotizblockTagManagerModel";
	var NOTIZBLOCK_TAG_ENTRY_MODEL = "localDataModelNotizblockTagEntry";
	var NOTIZBLOCK_TAGS_DIALOG = "NotizblockTagsDialog";
	var NOTIZBLOCK_TAG_ENTRY_DIALOG = "NotizblockTagEntryDialog";

	// Shared by NotizblockView (standard + list views) and NotizblockDetailView --
	// structurally a mirror of WikiController, minus is_private (the whole
	// feature is admin-only already -- see _guardAdminRoute) and every
	// /notizblock/* backend route requires admin auth, including reads.
	return BaseController.extend("Homepage.Homepage.controller.NotizblockController", {

		// Prompts a non-admin (or an admin whose session just expired) to log
		// in, then sends them back to the Notizblock URL they actually asked
		// for (see BaseController._promptLoginForRoute) -- declining lands on
		// Home instead. Called first thing in onInit of both NotizblockView
		// and NotizblockDetailView controllers, and again from
		// _onAuthStateChanged so a logout while already on a Notizblock page
		// immediately re-prompts instead of leaving a half-loaded,
		// now-401'ing page on screen.
		_guardAdminRoute: function () {
			if (!this.getOwnerComponent().getModel("adminModeModel").getProperty("/isAdmin")) {
				this._promptLoginForRoute("HomeView");
				return false;
			}
			return true;
		},

		// Loads all notizblock entries from the backend into a "NotizblockModel"
		// kept on the component (not the view) -- same rationale as WikiModel:
		// the standard, overview and detail views are separate, independently
		// cached view instances, so a single shared model keeps them all in
		// sync immediately after any create/edit/delete.
		_loadNotizblockModel: function () {
			var oComponent = this.getOwnerComponent();
			var oModel = oComponent.getModel("NotizblockModel");
			if (!oModel) {
				oModel = new JSONModel({ loadError: false });
				oComponent.setModel(oModel, "NotizblockModel");
			}
			this._iNotizblockLoadRequestId = (this._iNotizblockLoadRequestId || 0) + 1;
			var iRequestId = this._iNotizblockLoadRequestId;
			return fetch(config.SERVICE_URL + "/notizblock", { headers: this._authHeaders() }).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				if (iRequestId !== this._iNotizblockLoadRequestId) {
					return;
				}
				oModel.setData(oData);
				oModel.setProperty("/loadError", false);
				this._onNotizblockModelReloaded();
			}.bind(this)).catch(function (oError) {
				console.error("Notizblock could not be loaded", oError);
				if (iRequestId === this._iNotizblockLoadRequestId) {
					oModel.setProperty("/loadError", true);
				}
			}.bind(this));
		},

		// No-op by default; the detail view overrides this to re-anchor its
		// index-based bindings to the entry it's showing after a reload.
		_onNotizblockModelReloaded: function () {},

		// Overrides BaseController's no-op hook. Unlike WikiController's
		// version, this must NOT blindly reload on every auth change: GET
		// /notizblock requires admin auth, so reloading right after a logout
		// would 401 -> _handleUnauthorized -> _onAuthStateChanged again, an
		// infinite loop. _guardAdminRoute short-circuits that: a logout (or an
		// expired token discovered mid-session) fails the guard and navigates
		// away before any reload is attempted.
		_onAuthStateChanged: function () {
			if (!this._guardAdminRoute()) {
				return;
			}
			if (this.getOwnerComponent().getModel("NotizblockModel")) {
				this._loadNotizblockModel();
			}
		},

		// Same pattern as WikiController._htmlControl -- see there for why
		// .setContent() is used post-construction instead of a constructor
		// setting.
		_htmlControl: function (sId, sContent, bSanitize) {
			var oHtml = sId ? new HTML(sId) : new HTML();
			if (bSanitize) {
				oHtml.setSanitizeContent(true);
			}
			oHtml.setContent(sContent);
			return oHtml;
		},

		createNotizblockBlock: function (sId, oContext) {
			var oBlock = oContext.getObject();

			if (oBlock.type === "code") {
				return this._htmlControl(sId, "<div class=\"wikiBlock\">" + wikiRenderer.renderCode(oBlock.content, oBlock.language) + "</div>");
			}

			if (oBlock.type === "html") {
				return this._htmlControl(sId, "<div class=\"wikiBlock wikiHtml\">" + (oBlock.content || "") + "</div>", true);
			}

			if (oBlock.type === "image") {
				var sSrc = config.SERVICE_URL + "/notizblock/images/" + oBlock.image_id;
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

		// -------------------- notizblock admin: entry create/edit/delete --------------------

		_initNotizblockEntryDraftModel: function () {
			var oComponent = this.getOwnerComponent();
			if (!oComponent.getModel(NOTIZBLOCK_DRAFT_MODEL)) {
				oComponent.setModel(new JSONModel(this._emptyDraft()), NOTIZBLOCK_DRAFT_MODEL);
			}
			if (!oComponent.getModel(NOTIZBLOCK_TAGS_MODEL)) {
				oComponent.setModel(new JSONModel({ Tags: [] }), NOTIZBLOCK_TAGS_MODEL);
			}
			if (!oComponent.getModel(NOTIZBLOCK_TAG_PICKER_MODEL)) {
				oComponent.setModel(new JSONModel({ items: [] }), NOTIZBLOCK_TAG_PICKER_MODEL);
			}
			if (!oComponent.getModel(NOTIZBLOCK_TAG_MANAGER_MODEL)) {
				oComponent.setModel(new JSONModel({ Tags: [] }), NOTIZBLOCK_TAG_MANAGER_MODEL);
			}
			if (!oComponent.getModel(NOTIZBLOCK_TAG_ENTRY_MODEL)) {
				oComponent.setModel(new JSONModel({ id: null, label: "" }), NOTIZBLOCK_TAG_ENTRY_MODEL);
			}
		},

		_emptyDraft: function () {
			var oNow = new Date();
			var sToday = oNow.getFullYear() + "-"
				+ String(oNow.getMonth() + 1).padStart(2, "0") + "-"
				+ String(oNow.getDate()).padStart(2, "0");
			return { id: null, title: "", entry_date: sToday, tags: [], blocks: [], files: [], uploadUrl: "" };
		},

		onNotizblockEntryAdd: function () {
			this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL).setData(this._emptyDraft());
			this._openNotizblockEntryDialog();
		},

		onNotizblockEntryEdit: function (oEvent) {
			this._editEntry(oEvent.getSource().getBindingContext("NotizblockModel").getObject());
		},

		onNotizblockDetailEntryEdit: function () {
			this._editEntry(this.byId("idObjectHeaderNotizblock").getBindingContext("NotizblockModel").getObject());
		},

		_editEntry: function (oEntry) {
			this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL).setData({
				id: oEntry.id,
				title: oEntry.title || "",
				entry_date: oEntry.date || null,
				// deep copy, same reasoning as blocks/files below: edits (add/
				// remove via the picker) must not mutate the list model before
				// saving
				tags: JSON.parse(JSON.stringify(oEntry.tags || [])),
				blocks: JSON.parse(JSON.stringify(oEntry.blocks || [])),
				files: JSON.parse(JSON.stringify(oEntry.files || [])),
				uploadUrl: config.SERVICE_URL + "/notizblock/" + oEntry.id + "/files"
			});
			this._openNotizblockEntryDialog();
		},

		_openNotizblockEntryDialog: function () {
			return this._openDialog(NOTIZBLOCK_ENTRY_DIALOG, "idFragNotizblockEntryDialog", "Homepage.Homepage.view.fragments.NotizblockEntryDialog").then(function () {
				var oTitleInput = this._byIdInNotizblockEntryDialog("idInputNotizblockEntryTitle");
				oTitleInput.setValueState(coreLibrary.ValueState.None);
				oTitleInput.setValueStateText("");
			}.bind(this));
		},

		onNotizblockEntryCancel: function () {
			this._closeDialog(NOTIZBLOCK_ENTRY_DIALOG);
		},

		onNotizblockEntrySave: function () {
			if (this._bSavingNotizblockEntry) {
				return;
			}

			var oResourceBundle = this.getResourceBundle();
			var oDraft = this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL).getData();
			var oTitleInput = this._byIdInNotizblockEntryDialog("idInputNotizblockEntryTitle");

			if (!oDraft.title || !oDraft.title.trim()) {
				oTitleInput.setValueState(coreLibrary.ValueState.Error);
				oTitleInput.setValueStateText(oResourceBundle.getText("NotizblockEntryTitleMandatory"));
				oTitleInput.focus();
				return;
			}
			oTitleInput.setValueState(coreLibrary.ValueState.None);
			oTitleInput.setValueStateText("");

			this._bSavingNotizblockEntry = true;
			var oSaveButton = this._byIdInNotizblockEntryDialog("idBtnNotizblockEntrySave");
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
			var sUrl = config.SERVICE_URL + "/notizblock" + (bUpdate ? "/" + oDraft.id : "");

			fetch(sUrl, {
				method: bUpdate ? "PUT" : "POST",
				headers: this._authHeaders(),
				body: JSON.stringify({
					title: oDraft.title,
					entry_date: oDraft.entry_date || null,
					tag_ids: (oDraft.tags || []).map(function (t) { return t.id; }),
					blocks: aBlocks
				})
			}).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				this._closeDialog(NOTIZBLOCK_ENTRY_DIALOG);
				return this._loadNotizblockModel().then(function () {
					MessageToast.show(oResourceBundle.getText("NotizblockEntryDialogTitle"));
					this._onNotizblockEntrySaved(oData.id);
				}.bind(this));
			}.bind(this)).catch(function (oError) {
				console.error("Notizblock entry could not be saved", oError);
				MessageBox.error(oResourceBundle.getText("NotizblockSaveError"));
			}.bind(this)).finally(function () {
				this._bSavingNotizblockEntry = false;
				oSaveButton.setEnabled(true);
			}.bind(this));
		},

		// Hook called with the saved entry's id after a successful save. No-op
		// by default; the detail view overrides this to rebind to the saved
		// entry.
		_onNotizblockEntrySaved: function (iId) {},

		onNotizblockEntryDelete: function (oEvent) {
			this._deleteEntry(oEvent.getSource().getBindingContext("NotizblockModel").getObject());
		},

		onNotizblockDetailEntryDelete: function () {
			this._deleteEntry(this.byId("idObjectHeaderNotizblock").getBindingContext("NotizblockModel").getObject());
		},

		_deleteEntry: function (oEntry) {
			var oResourceBundle = this.getResourceBundle();

			this._confirmDelete(oResourceBundle.getText("NotizblockDeleteConfirm", [oEntry.title]), function () {
				this._deleteResource(config.SERVICE_URL + "/notizblock/" + oEntry.id).then(function () {
					return this._loadNotizblockModel();
				}.bind(this)).then(function () {
					this._onNotizblockEntryDeleted();
				}.bind(this)).catch(function (oError) {
					console.error("Notizblock entry could not be deleted", oError);
					MessageBox.error(oResourceBundle.getText("NotizblockDeleteError"));
				}.bind(this));
			}.bind(this));
		},

		// Hook called after a successful delete. No-op by default; the detail
		// view overrides this to navigate away.
		_onNotizblockEntryDeleted: function () {},

		// -------------------- notizblock admin: tags --------------------
		// Tags are normalized into notizblock_tags/notizblock_entry_tags (see
		// backend/schema.sql), edited via a "+"-icon picker (pick an existing
		// tag or create one on the fly) plus a separate gear-icon manage
		// dialog for renaming/deleting tags globally. Both are fed by the
		// same component-level NOTIZBLOCK_TAGS_MODEL lookup list. Structurally
		// a mirror of WikiController's own tag sections, just against
		// /notizblock/tags and its own, separate notizblock_tags table.

		// Fetches the full tag list from the backend into NOTIZBLOCK_TAGS_MODEL.
		// Called directly by the manage dialog's add/edit/delete flows (which
		// always want the latest data); the picker instead goes through the
		// memoized _ensureNotizblockTagsLoaded/_reloadNotizblockTags pair
		// below, since it's opened far more often and shouldn't re-fetch on
		// every "+" press.
		_fetchNotizblockTags: function () {
			var oModel = this.getOwnerComponent().getModel(NOTIZBLOCK_TAGS_MODEL);
			return fetch(config.SERVICE_URL + "/notizblock/tags", { headers: this._authHeaders() }).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				oModel.setData({ Tags: oData.Tags });
			}).catch(function (oError) {
				console.error("Notizblock tags could not be loaded", oError);
			});
		},

		_ensureNotizblockTagsLoaded: function () {
			var oComponent = this.getOwnerComponent();
			if (!oComponent._pNotizblockTagsLoaded) {
				oComponent._pNotizblockTagsLoaded = this._fetchNotizblockTags();
			}
			return oComponent._pNotizblockTagsLoaded;
		},

		// Bypasses the memoization above so the picker and manage dialog pick
		// up a create/rename/delete immediately, same reasoning as
		// ListView's _reloadLookups.
		_reloadNotizblockTags: function () {
			this.getOwnerComponent()._pNotizblockTagsLoaded = null;
			return this._ensureNotizblockTagsLoaded();
		},

		// Recomputes the picker popover's filtered list: known tags not
		// already on the draft, matching the current search text, plus a
		// trailing synthetic "create '<text>'" row when nothing existing
		// matches it exactly (case-insensitive, so typing an existing tag's
		// label in a different case still resolves to it rather than
		// offering to create a near-duplicate).
		_updateNotizblockTagPickerList: function (sQuery) {
			var oComponent = this.getOwnerComponent();
			var sText = (sQuery || "").trim();
			var sLowerText = sText.toLowerCase();
			var aAllTags = oComponent.getModel(NOTIZBLOCK_TAGS_MODEL).getProperty("/Tags") || [];
			var aDraftIds = (oComponent.getModel(NOTIZBLOCK_DRAFT_MODEL).getProperty("/tags") || []).map(function (t) { return t.id; });

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
					label: this.getResourceBundle().getText("NotizblockTagCreateNew", [sText]),
					icon: "sap-icon://add",
					isCreate: true,
					createLabel: sText
				});
			}

			oComponent.getModel(NOTIZBLOCK_TAG_PICKER_MODEL).setProperty("/items", aItems);
		},

		onNotizblockTagAddPress: function (oEvent) {
			var oButton = oEvent.getSource();
			this._ensureNotizblockTagsLoaded().then(function () {
				this._byIdInNotizblockEntryDialog("idSearchNotizblockTagPicker").setValue("");
				this._updateNotizblockTagPickerList("");
				this._byIdInNotizblockEntryDialog("idPopoverNotizblockTagPicker").openBy(oButton);
			}.bind(this)).catch(function () {});
		},

		onNotizblockTagSearchLiveChange: function (oEvent) {
			this._updateNotizblockTagPickerList(oEvent.getParameter("newValue"));
		},

		onNotizblockTagPickerItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext(NOTIZBLOCK_TAG_PICKER_MODEL).getObject();
			if (oItem.isCreate) {
				this._createAndAttachNotizblockTag(oItem.createLabel);
			} else {
				this._attachNotizblockTagToDraft({ id: oItem.id, label: oItem.label });
				this._byIdInNotizblockEntryDialog("idPopoverNotizblockTagPicker").close();
			}
		},

		_attachNotizblockTagToDraft: function (oTag) {
			var oDraftModel = this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL);
			var aTags = oDraftModel.getProperty("/tags") || [];
			aTags.push({ id: oTag.id, label: oTag.label });
			oDraftModel.setProperty("/tags", aTags);
		},

		// Upsert-on-label-conflict server-side (see POST /notizblock/tags), so
		// typing an already-existing label here just resolves to and attaches
		// that tag rather than erroring.
		_createAndAttachNotizblockTag: function (sLabel) {
			var oResourceBundle = this.getResourceBundle();
			return fetch(config.SERVICE_URL + "/notizblock/tags", {
				method: "POST",
				headers: this._authHeaders(),
				body: JSON.stringify({ label: sLabel })
			}).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				this._attachNotizblockTagToDraft(oData);
				return this._reloadNotizblockTags();
			}.bind(this)).then(function () {
				this._byIdInNotizblockEntryDialog("idPopoverNotizblockTagPicker").close();
			}.bind(this)).catch(function (oError) {
				console.error("Notizblock tag could not be created", oError);
				MessageBox.error(oResourceBundle.getText("NotizblockTagSaveError"));
			});
		},

		onNotizblockTagRemove: function (oEvent) {
			var oContext = oEvent.getSource().getBindingContext(NOTIZBLOCK_DRAFT_MODEL);
			var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);
			var oDraftModel = this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL);
			var aTags = oDraftModel.getProperty("/tags") || [];
			aTags.splice(iIndex, 1);
			oDraftModel.setProperty("/tags", aTags);
		},

		// -------------------- notizblock admin: tag management dialog --------------------
		// Reachable via the gear icon next to the "+" picker. Same shape as
		// WikiController's tag manager, written directly against
		// /notizblock/tags and the single label field rather than
		// generalizing a shared helper (see the plan for the full reasoning).

		_loadNotizblockTagManagerModel: function () {
			var oModel = this.getOwnerComponent().getModel(NOTIZBLOCK_TAG_MANAGER_MODEL);
			return fetch(config.SERVICE_URL + "/notizblock/tags", { headers: this._authHeaders() }).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				oModel.setData({ Tags: oData.Tags });
			}).catch(function (oError) {
				console.error("Notizblock tags could not be loaded", oError);
			});
		},

		onPressManageNotizblockTags: function () {
			this._loadNotizblockTagManagerModel();
			this._openDialog(NOTIZBLOCK_TAGS_DIALOG, "idFragNotizblockTagsDialog", "Homepage.Homepage.view.fragments.NotizblockTagsDialog");
		},

		onPressNotizblockTagsClose: function () {
			this._closeDialog(NOTIZBLOCK_TAGS_DIALOG);
		},

		onPressNotizblockTagAdd: function () {
			this.getOwnerComponent().getModel(NOTIZBLOCK_TAG_ENTRY_MODEL).setData({ id: null, label: "" });
			this._openDialog(NOTIZBLOCK_TAG_ENTRY_DIALOG, "idFragNotizblockTagEntryDialog", "Homepage.Homepage.view.fragments.NotizblockTagEntryDialog");
		},

		onPressNotizblockTagEdit: function (oEvent) {
			var oRow = oEvent.getSource().getBindingContext(NOTIZBLOCK_TAG_MANAGER_MODEL).getObject();
			this.getOwnerComponent().getModel(NOTIZBLOCK_TAG_ENTRY_MODEL).setData({ id: oRow.id, label: oRow.label });
			this._openDialog(NOTIZBLOCK_TAG_ENTRY_DIALOG, "idFragNotizblockTagEntryDialog", "Homepage.Homepage.view.fragments.NotizblockTagEntryDialog");
		},

		onPressNotizblockTagEntryCancel: function () {
			this._closeDialog(NOTIZBLOCK_TAG_ENTRY_DIALOG);
		},

		onPressNotizblockTagEntrySave: function () {
			var oResourceBundle = this.getResourceBundle();
			var oEntryData = this.getOwnerComponent().getModel(NOTIZBLOCK_TAG_ENTRY_MODEL).getData();
			var bIsUpdate = !!oEntryData.id;
			var sUrl = config.SERVICE_URL + "/notizblock/tags" + (bIsUpdate ? "/" + oEntryData.id : "");

			fetch(sUrl, {
				method: bIsUpdate ? "PUT" : "POST",
				headers: this._authHeaders(),
				body: JSON.stringify({ label: oEntryData.label })
			}).then(function (oResponse) {
				return this._checkResponse(oResponse, true);
			}.bind(this)).then(function () {
				this._closeDialog(NOTIZBLOCK_TAG_ENTRY_DIALOG);
				return this._reloadNotizblockTags();
			}.bind(this)).then(function () {
				this._loadNotizblockTagManagerModel();
				// Renaming changes labels already showing in the (cached)
				// NotizblockModel entry list -- reload so they update
				// immediately.
				return this._loadNotizblockModel();
			}.bind(this)).catch(function (oError) {
				console.error("Notizblock tag could not be saved", oError);
				if (oError && oError.handled && oError.code === "tag_label_exists") {
					MessageBox.error(oResourceBundle.getText("NotizblockTagLabelExistsError"));
					return;
				}
				MessageBox.error(oResourceBundle.getText("NotizblockTagSaveError"));
			});
		},

		// Removes a just-deleted tag from the currently open (unsaved) entry
		// draft, if present. The backend's in-use check only sees tags
		// already persisted in notizblock_entry_tags, so a tag can still be
		// sitting attached to an open-but-not-yet-saved draft when it's
		// deleted here -- without this, Save would send a now-dangling
		// tag_id and fail with a 400 FK-violation error.
		_pruneNotizblockTagFromDraft: function (iTagId) {
			var oDraftModel = this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL);
			var aTags = oDraftModel.getProperty("/tags") || [];
			var aFiltered = aTags.filter(function (t) { return t.id !== iTagId; });
			if (aFiltered.length !== aTags.length) {
				oDraftModel.setProperty("/tags", aFiltered);
			}
		},

		onPressNotizblockTagDelete: function (oEvent) {
			var oRow = oEvent.getSource().getBindingContext(NOTIZBLOCK_TAG_MANAGER_MODEL).getObject();
			var oResourceBundle = this.getResourceBundle();

			this._confirmDelete(oResourceBundle.getText("NotizblockTagDeleteConfirm", [oRow.label]), function () {
				this._deleteResource(config.SERVICE_URL + "/notizblock/tags/" + oRow.id, true).then(function () {
					this._pruneNotizblockTagFromDraft(oRow.id);
					return this._reloadNotizblockTags();
				}.bind(this)).then(function () {
					this._loadNotizblockTagManagerModel();
					return this._loadNotizblockModel();
				}.bind(this)).catch(function (oError) {
					console.error("Notizblock tag could not be deleted", oError);
					if (oError && oError.handled && oError.code === "tag_in_use") {
						MessageBox.error(oResourceBundle.getText("NotizblockTagInUseError", [oError.count]));
						return;
					}
					MessageBox.error(oResourceBundle.getText("NotizblockTagDeleteError"));
				});
			}.bind(this));
		},

		// -------------------- notizblock admin: block manipulation --------------------

		_getBlocks: function () {
			return this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL).getProperty("/blocks") || [];
		},

		_setBlocks: function (aBlocks) {
			this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL).setProperty("/blocks", aBlocks);
		},

		_blockIndex: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext(NOTIZBLOCK_DRAFT_MODEL);
			return parseInt(oCtx.getPath().split("/").pop(), 10);
		},

		onNotizblockAddTextBlock: function () {
			var a = this._getBlocks();
			a.push({ type: "text", content: "" });
			this._setBlocks(a);
		},

		onNotizblockAddCodeBlock: function () {
			var a = this._getBlocks();
			a.push({ type: "code", content: "", language: "" });
			this._setBlocks(a);
		},

		onNotizblockAddImageBlock: function () {
			var a = this._getBlocks();
			a.push({ type: "image", image_id: null, description: "" });
			this._setBlocks(a);
		},

		onNotizblockAddHtmlBlock: function () {
			var a = this._getBlocks();
			a.push({ type: "html", content: "" });
			this._setBlocks(a);
		},

		onNotizblockBlockMoveUp: function (oEvent) {
			var i = this._blockIndex(oEvent);
			if (i <= 0) { return; }
			var a = this._getBlocks();
			var oTmp = a[i - 1]; a[i - 1] = a[i]; a[i] = oTmp;
			this._setBlocks(a);
		},

		onNotizblockBlockMoveDown: function (oEvent) {
			var i = this._blockIndex(oEvent);
			var a = this._getBlocks();
			if (i >= a.length - 1) { return; }
			var oTmp = a[i + 1]; a[i + 1] = a[i]; a[i] = oTmp;
			this._setBlocks(a);
		},

		onNotizblockBlockDelete: function (oEvent) {
			var i = this._blockIndex(oEvent);
			var a = this._getBlocks();
			a.splice(i, 1);
			this._setBlocks(a);
		},

		onNotizblockImageSelected: function (oEvent) {
			var oResourceBundle = this.getResourceBundle();
			var oFileUploader = oEvent.getSource();
			var sPath = oFileUploader.getBindingContext(NOTIZBLOCK_DRAFT_MODEL).getPath();
			var oModel = this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL);
			var aFiles = oEvent.getParameter("files");
			var oFile = aFiles && aFiles[0];
			if (!oFile) { return; }

			var oFormData = new FormData();
			oFormData.append("file", oFile);

			fetch(config.SERVICE_URL + "/notizblock/images", {
				method: "POST",
				headers: { "Authorization": "Bearer " + config.getToken() },
				body: oFormData
			}).then(function (oResponse) {
				return this._checkResponse(oResponse).json();
			}.bind(this)).then(function (oData) {
				oModel.setProperty(sPath + "/image_id", oData.id);
			}).catch(function (oError) {
				console.error("Notizblock image could not be uploaded", oError);
				MessageBox.error(oResourceBundle.getText("NotizblockImageUploadError"));
			});

			oFileUploader.clear();
		},

		// -------------------- notizblock admin: attachments --------------------

		_syncNotizblockEntryDraftFilesFromNotizblockModel: function () {
			var oComponent = this.getOwnerComponent();
			var oDraftModel = oComponent.getModel(NOTIZBLOCK_DRAFT_MODEL);
			var iId = oDraftModel.getProperty("/id");
			if (!iId) { return; }
			var aNotizblock = oComponent.getModel("NotizblockModel").getProperty("/Notizblock") || [];
			var oEntry = aNotizblock.filter(function (o) { return o.id === iId; })[0];
			var aServerFiles = (oEntry && oEntry.files) || [];
			var aPending = (oDraftModel.getProperty("/files") || []).filter(function (o) { return o.pending; });
			oDraftModel.setProperty("/files", aServerFiles.concat(aPending));
		},

		onNotizblockFileBeforeUploadStarts: function (oEvent) {
			var oPlugin = oEvent.getSource();
			oPlugin.removeAllHeaderFields();
			oPlugin.addHeaderField(new Item({ key: "Authorization", text: "Bearer " + config.getToken() }));
		},

		onNotizblockFileUploadStarted: function (oEvent) {
			var oItem = oEvent.getParameter("item");
			var oDraftModel = this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL);
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

		onNotizblockFileUploadProgressed: function (oEvent) {
			var oItem = oEvent.getParameter("item");
			if (!oItem) { return; }
			var iLoaded = oEvent.getParameter("loaded");
			var iTotal = oEvent.getParameter("total");
			var iPercent = iTotal ? Math.round((iLoaded / iTotal) * 100) : 0;
			var oDraftModel = this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL);
			var aFiles = oDraftModel.getProperty("/files") || [];
			var oPending = aFiles.filter(function (o) { return o.pendingId === oItem.getId(); })[0];
			if (oPending) {
				oPending.progress = iPercent;
				oDraftModel.setProperty("/files", aFiles);
			}
		},

		onNotizblockFileUploadCompleted: function (oEvent) {
			var oResourceBundle = this.getResourceBundle();
			var oItem = oEvent.getParameter("item");
			if (oItem) {
				var oDraftModel = this.getOwnerComponent().getModel(NOTIZBLOCK_DRAFT_MODEL);
				var aFiles = (oDraftModel.getProperty("/files") || []).filter(function (o) { return o.pendingId !== oItem.getId(); });
				oDraftModel.setProperty("/files", aFiles);
			}
			var oResponseXHR = oEvent.getParameter("responseXHR");
			var iStatus = oResponseXHR ? oResponseXHR.status : 0;
			if (iStatus === 401) {
				this._handleUnauthorized();
				return;
			}
			if (iStatus < 200 || iStatus >= 300) {
				MessageBox.error(oResourceBundle.getText("NotizblockAttachmentsUploadError"));
				return;
			}
			this._loadNotizblockModel().then(function () {
				this._syncNotizblockEntryDraftFilesFromNotizblockModel();
			}.bind(this));
		},

		onNotizblockFileDelete: function (oEvent) {
			var oResourceBundle = this.getResourceBundle();
			var oFile = oEvent.getSource().getBindingContext(NOTIZBLOCK_DRAFT_MODEL).getObject();

			this._confirmDelete(oResourceBundle.getText("NotizblockAttachmentsDeleteConfirm", [oFile.filename]), function () {
				this._deleteResource(config.SERVICE_URL + "/notizblock/files/" + oFile.id).then(function () {
					return this._loadNotizblockModel();
				}.bind(this)).then(function () {
					this._syncNotizblockEntryDraftFilesFromNotizblockModel();
				}.bind(this)).catch(function (oError) {
					console.error("Notizblock attachment could not be deleted", oError);
					MessageBox.error(oResourceBundle.getText("NotizblockAttachmentsDeleteError"));
				}.bind(this));
			}.bind(this));
		},

		_byIdInNotizblockEntryDialog: function (sId) {
			return Fragment.byId(this.getOwnerComponent().createId("idFragNotizblockEntryDialog"), sId);
		},

		// Same rationale as WikiController._downloadWikiFile: a plain <a href>
		// can't carry the admin bearer token, so this fetches the bytes with
		// auth and triggers a client-side blob download instead.
		_downloadNotizblockFile: function (oFile) {
			return fetch(this.formatter.notizblockFileUrl(oFile.id), { headers: this._authHeaders() })
				.then(function (oResponse) {
					if (oResponse.status === 401) {
						this._handleUnauthorized();
						throw new Error("Unauthorized");
					}
					if (!oResponse.ok) {
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

		_showNotizblockDownloadError: function (oError) {
			console.error("Notizblock attachment could not be downloaded", oError);
			MessageBox.error(this.getResourceBundle().getText("NotizblockAttachmentsDownloadError", [oError.message]));
		},

		_downloadNotizblockFilesStaggered: function (aContexts) {
			aContexts.forEach(function (oContext, iIndex) {
				setTimeout(function () {
					this._downloadNotizblockFile(oContext.getObject()).catch(this._showNotizblockDownloadError.bind(this));
				}.bind(this), iIndex * 400);
			}.bind(this));
		},

		onNotizblockAttachmentsSelectionChange: function (oEvent) {
			var aSelected = oEvent.getSource().getSelectedContexts();
			this._byIdInNotizblockEntryDialog("idBtnNotizblockAttachmentsDownloadSelected").setEnabled(aSelected.length > 0);
			this._byIdInNotizblockEntryDialog("idBtnNotizblockAttachmentsDeleteSelected").setEnabled(aSelected.length > 0);
		},

		onNotizblockAttachmentsDownloadSelected: function () {
			var aSelected = this._byIdInNotizblockEntryDialog("idTableNotizblockAttachments").getSelectedContexts();
			this._downloadNotizblockFilesStaggered(aSelected);
		},

		onNotizblockAttachmentsDeleteSelected: function () {
			var oResourceBundle = this.getResourceBundle();
			var oTable = this._byIdInNotizblockEntryDialog("idTableNotizblockAttachments");
			var aFiles = oTable.getSelectedContexts().map(function (oContext) { return oContext.getObject(); });
			if (aFiles.length === 0) {
				return;
			}

			this._confirmDelete(oResourceBundle.getText("NotizblockAttachmentsDeleteSelectedConfirm", [aFiles.length]), function () {
				Promise.all(aFiles.map(function (oFile) {
					return this._deleteResource(config.SERVICE_URL + "/notizblock/files/" + oFile.id);
				}.bind(this))).then(function () {
					return this._loadNotizblockModel();
				}.bind(this)).then(function () {
					oTable.removeSelections();
					this._byIdInNotizblockEntryDialog("idBtnNotizblockAttachmentsDownloadSelected").setEnabled(false);
					this._byIdInNotizblockEntryDialog("idBtnNotizblockAttachmentsDeleteSelected").setEnabled(false);
					this._syncNotizblockEntryDraftFilesFromNotizblockModel();
				}.bind(this)).catch(function (oError) {
					console.error("Notizblock attachments could not be deleted", oError);
					MessageBox.error(oResourceBundle.getText("NotizblockAttachmentsDeleteError"));
				}.bind(this));
			}.bind(this));
		}

	});

});
