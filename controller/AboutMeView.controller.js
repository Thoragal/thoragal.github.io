sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/library"
], function (BaseController, JSONModel, mobileLibrary) {
	"use strict";

	return BaseController.extend("Homepage.Homepage.controller.AboutMeView", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf Homepage.Homepage.view.AboutMeView
		 */
		onInit: function () {
			this.getView().byId("idPageAboutMe").setBusy(true);
			
			// set header button Emphasized
			this.getView().byId("idButtonNavToAboutMe").setType("Emphasized");	
			
			// set MeModel
			var sPath = sap.ui.require.toUrl("Homepage/Homepage/model/MeData.json");
			var oModel = new JSONModel(sPath);
			this.getView().setModel(oModel, "MeModel");
			
			this.getView().byId("idPageAboutMe").setBusy(false);
			this._setVisibilityContactMeHeaderButton();
			this._setVisibilityAboutMeContactMe();
		},

		onAfterRendering: function () {
			// sap.m.Link has no "rel" property; target="_blank" links to external
			// certificate providers need rel="noopener noreferrer" to prevent the
			// opened page from accessing window.opener (reverse tabnabbing).
			["idAboutMeCertificateUI5ProofLink", "idAboutMeCertificateRAPProofLink"].forEach(function (sId) {
				var oDomRef = this.byId(sId) && this.byId(sId).getDomRef();
				if (oDomRef) {
					oDomRef.setAttribute("rel", "noopener noreferrer");
				}
			}.bind(this));
		},

		_setVisibilityAboutMeContactMe: async function () {
			var fEmailServeralive = await this._getEmailServerAlive(); 
			this.getView().byId("idAboutMeContactMeLabel").setVisible(fEmailServeralive);
			this.getView().byId("idAboutMeContactMeButton").setVisible(fEmailServeralive);
		},
		
		onGitHubPressed: function() {
			var GitHubUrl = this.getModel("MeModel").getData().General.GitHub;
			var URLHelper = mobileLibrary.URLHelper;
			URLHelper.redirect( GitHubUrl, true);
		},
		
		onXingPressed: function() {
			var XingUrl = this.getModel("MeModel").getData().General.Xing;
			var URLHelper = mobileLibrary.URLHelper;
			URLHelper.redirect( XingUrl, true);
		},
		
		onLinkedInPressed: function() {
			var LinkedInUrl = this.getModel("MeModel").getData().General.LinkedIn;
			var URLHelper = mobileLibrary.URLHelper;
			URLHelper.redirect( LinkedInUrl, true);
		},
		
		onEmailPressed: function(){
			var URLHelper = mobileLibrary.URLHelper;
			var sEmail = this.getModel("MeModel").getData().General.Email;
			var sSubject = this.getModel("i18n").getResourceBundle().getText("AboutMeRequest");
			URLHelper.triggerEmail(sEmail, sSubject, false, false, false, true);
		}

	});

});