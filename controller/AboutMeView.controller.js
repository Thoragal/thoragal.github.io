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
			var sPath = jQuery.sap.getModulePath("Homepage.Homepage", "/model/MeData.json"); 
			var oModel = new JSONModel(sPath);
			this.getView().setModel(oModel, "MeModel");
			
			this.getView().byId("idPageAboutMe").setBusy(false);
			this._setVisibilityContactMeHeaderButton();
			this._setVisibilityAboutMeContactMe();
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
		/**
		 * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
		 * (NOT before the first rendering! onInit() is used for that one!).
		 * @memberOf Homepage.Homepage.view.AboutMeView
		 */
		//	onBeforeRendering: function() {
		//
		//	},

		/**
		 * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
		 * This hook is the same one that SAPUI5 controls get after being rendered.
		 * @memberOf Homepage.Homepage.view.AboutMeView
		 */
		//	onAfterRendering: function() {
		//
		//	},

		/**
		 * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
		 * @memberOf Homepage.Homepage.view.AboutMeView
		 */
		//	onExit: function() {
		//
		//	}

	});

});