sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/m/library",
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/syncStyleClass",
	"sap/m/MessageBox",
	"sap/ui/core/Fragment",
	"../model/formatter"
], function (Controller, UIComponent, mobileLibrary, History, JSONModel, syncStyleClass, MessageBox, Fragment, formatter) {
	"use strict";
	
	// shortcut for sap.m.URLHelper
	//var URLHelper = mobileLibrary.URLHelper;
	var gvWikiView;

	return Controller.extend("Homepage.Homepage.controller.BaseController", {
		
		// set formatter
    	formatter: formatter,

		onNavToHome: function (oEvent) {
			this.getRouter().navTo("HomeView");
		},
		onNavToWiki: function (oEvent) {
			if (gvWikiView==="Overview") {
				this.onNavToWikiOverview(oEvent);
			}
			else {
				this.onNavToWikiStandard(oEvent);
			}
		},
		onNavToWikiStandard: function (oEvent) {
			gvWikiView="Standard";
			this.getRouter().navTo("WikiView");
		},
		onNavToWikiOverview: function (oEvent) {
			gvWikiView="Overview";
			this.getRouter().navTo("WikiOverviewView");
		},
		onNavToList: function (oEvent) {
			this.getRouter().navTo("ListView");
		},
		onNavToAboutMe: function (oEvent) {
			this.getRouter().navTo("AboutMeView");
		},
		
		onNavToContactMe: function (oEvent) {
			
			//TODO: Test Coding
//			var onewModel = new sap.ui.model.json.JSONModel();
//			onewModel.loadData("https://http-nodejs.production-c8a5.up.railway.app","","false");
//			sap.ui.core().setModel(onewModel);
			
			//Dialog öffnen
			if (!this.ContactMeDialog) {
				this.refDateDialog = sap.ui.core.Fragment.load({
					id: "idFragContactMeDialog",
					name: "Homepage.Homepage.view.fragments.ContactMe",
					controller: this
				}).then(function (oDialog) {
					this.ContactMeDialog = oDialog;
					// connect dialog to the root view of this component
					this.getView().addDependent(oDialog);
					// forward compact/cozy style into dialog
					//syncStyleClass(this.getView().getController().getOwnerComponent().getContentDensityClass(), this.getView(), oDialog);
					oDialog.open();
				}.bind(this));
			} else {
				this.ContactMeDialog.open();
			}
		},
		
		onPressContactMeDialogCancel: function (oEvent){
			this.ContactMeDialog.close();
		},
		
		onPressContactMeDialogOk: function (oEvent){
			if (!this._checkValidityContactMeData(oEvent)){
				return;
			}
		
			/*Send Message*/
			var sUrlEmailServer = "https://nodejs-production-1b56.up.railway.app/email";
			var sContactMeData = this.getView().getModel("localDataModelContactMe").getData();

			$.ajax({ 
			    type: "POST",
			    url: sUrlEmailServer,
			    //dataType: "json",
			    data: JSON.stringify(sContactMeData),
			    async: true,
			    contentType: 'application/json',
			    success: function(data, textStatus, xhr){        
			        this._displayMessageContactMeSend(true);
			        this._clearContactMeData();
			    }.bind(this),
			    error: function (e,xhr,textStatus,err,data) {
					this._displayMessageContactMeSend(false);
			    }.bind(this)
			}); 
		},
		
		onNavToLanguage: function (oEvent) {
			var oComponent = this.getOwnerComponent();
			//Dialog öffnen
			if (!oComponent.LanguageDialog) {
				oComponent.refDateDialog = sap.ui.core.Fragment.load({
					id: oComponent.createId("idFragLanguageDialog"),
					name: "Homepage.Homepage.view.fragments.Language",
					controller: this
				}).then(function (oDialog) {
					oComponent.LanguageDialog = oDialog;
					// connect dialog to the root view of this component
					this.getView().addDependent(oDialog);
					// forward compact/cozy style into dialog
					//syncStyleClass(this.getView().getController().getOwnerComponent().getContentDensityClass(), this.getView(), oDialog);
					oDialog.open();
				}.bind(this));
			} else {
				oComponent.LanguageDialog.open();
			}
		},

		onPressLanguageDialogCancel: function (oEvent){
			var oComponent = this.getOwnerComponent();
			oComponent.LanguageDialog.close();
		},
		
		onPressLanguageDialogApply: function (oEvent){
			var oComponent = this.getOwnerComponent();
			var oDialog = oComponent.LanguageDialog;
			
		    if (oDialog) {
		        var oRadioButtonGroup = sap.ui.core.Fragment.byId(oComponent.createId("idFragLanguageDialog"), "rbg1");
		
		        if (oRadioButtonGroup) {
		            var iSelectedIndex = oRadioButtonGroup.getSelectedIndex();
				};
		    };
		    var sLanguage;    
		    switch (iSelectedIndex) { case 0: sLanguage="de"; break;
									  case 1: sLanguage="en"; break;
									  default: sLanguage="de";
									};

			/*Change language*/
			sap.ui.getCore().getConfiguration().setLanguage(sLanguage);
			
			/*Close window*/
			this.onPressLanguageDialogCancel(oEvent);
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
			return new Promise(function(resolve){
				$.ajax({ 
				    type: "GET",
				    url: "https://nodejs-production-1b56.up.railway.app/",
				    async: true,
				    contentType: 'application/json',
				    success: function(data, textStatus, xhr){        
				        resolve(true);
				    }.bind(this),
				    error: function (e,xhr,textStatus,err,data) {
						resolve(false);
				    }.bind(this)
				});
			}.bind(this));
		},
		
		_displayMessageContactMeSend: function(fSuccess){
			if (fSuccess === true){
			/*Success Message*/
				MessageBox.success(this.getResourceBundle().getText("txtMessageSendSuccess"), {
							onClose: function (oAction) {
							this.ContactMeDialog.close();
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
			
			/*Check if mandatory Data is supplied*/
			//FirstName
			if (sContactMeData.NameFirst === undefined || sContactMeData.NameFirst === "") {
				bValid = false;
				Fragment.byId("idFragContactMeDialog", "idInputContactMeFirstName").setValueState(sap.ui.core.ValueState.Error);
				Fragment.byId("idFragContactMeDialog", "idInputContactMeFirstName").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				Fragment.byId("idFragContactMeDialog", "idInputContactMeFirstName").setValueState(sap.ui.core.ValueState.None);
				Fragment.byId("idFragContactMeDialog", "idInputContactMeFirstName").setValueStateText("");
			}
			
			//LastName
			if (sContactMeData.NameLast === undefined || sContactMeData.NameLast === "") {
				bValid = false;
				Fragment.byId("idFragContactMeDialog", "idInputContactMeLastName").setValueState(sap.ui.core.ValueState.Error);
				Fragment.byId("idFragContactMeDialog", "idInputContactMeLastName").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				Fragment.byId("idFragContactMeDialog", "idInputContactMeLastName").setValueState(sap.ui.core.ValueState.None);
				Fragment.byId("idFragContactMeDialog", "idInputContactMeLastName").setValueStateText("");
			}
			
			//Email
			if (sContactMeData.Email === undefined || sContactMeData.Email === "") {
				bValid = false;
				Fragment.byId("idFragContactMeDialog", "idInputContactMeEmail").setValueState(sap.ui.core.ValueState.Error);
				Fragment.byId("idFragContactMeDialog", "idInputContactMeEmail").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				Fragment.byId("idFragContactMeDialog", "idInputContactMeEmail").setValueState(sap.ui.core.ValueState.None);
				Fragment.byId("idFragContactMeDialog", "idInputContactMeEmail").setValueStateText("");
			}
			
			//Text
			if (sContactMeData.Text === undefined || sContactMeData.Text === "") {
				bValid = false;
				Fragment.byId("idFragContactMeDialog", "idTextAreaContactMeText").setValueState(sap.ui.core.ValueState.Error);
				Fragment.byId("idFragContactMeDialog", "idTextAreaContactMeText").setValueStateText(this.getResourceBundle().getText("txtContactMeMandatory"));
			} else {
				Fragment.byId("idFragContactMeDialog", "idTextAreaContactMeText").setValueState(sap.ui.core.ValueState.None);
				Fragment.byId("idFragContactMeDialog", "idTextAreaContactMeText").setValueStateText("");
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