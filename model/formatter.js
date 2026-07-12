sap.ui.define([
	"./config"
], function (config) {
	"use strict";

	return {

		// Builds the backend URL for a wiki image id (used by the editor's
		// preview). Returns "" for a missing id so the <img> stays empty.
		wikiImageUrl: function(vImageId) {
			return (vImageId === null || vImageId === undefined || vImageId === "")
				? ""
				: config.SERVICE_URL + "/wiki/images/" + vImageId;
		},
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

		// Joins a wiki entry's tag array (["ABAP","UI5"]) into "ABAP, UI5".
		joinTags: function(aTags) {
			return Array.isArray(aTags) ? aTags.join(", ") : "";
		},

		// True if the array has at least one entry (for tag visibility).
		hasItems: function(aItems) {
			return Array.isArray(aItems) && aItems.length > 0;
		},

		// Formats an ISO date ("2026-07-10") as "10.07.2026". Passes other
		// values through unchanged.
		date: function(sValue) {
			if (typeof sValue !== "string") {
				return sValue;
			}
			var aMatch = sValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
			return aMatch ? aMatch[3] + "." + aMatch[2] + "." + aMatch[1] : sValue;
		}
	};
});