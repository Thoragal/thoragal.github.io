sap.ui.define([
], function () {
	"use strict";
	
	return {
		visible : function(value) {
			return !(typeof(value) === "undefined" || value === null);
		},
		device: function(value) {
			var result = value;
			if( sap.ui.Device.system.phone === true ){
				result = "";
			}
			return result;
		},
		serverAlive: async function(value){
			var fEmailServeralive = await this._getEmailServerAlive();
			return fEmailServeralive;
		}
	};
});