sap.ui.define([
], function () {
	"use strict";
	
	return {
		visible : function(value) {
			return !(typeof(value) === "undefined" || value === null);
		},
		device: function(value) {
			var result = value;
			if (value = "1111"){
			//	result = "XXXX"
			}
			else {
				result = "ABCD"
			}
			return result;
		}
	};
});