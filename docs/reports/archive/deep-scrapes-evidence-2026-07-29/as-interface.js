/**
 * 
 */

function AppStatusAjax(api) {
	this.apiUrl = api;

	this.getApiUrl = function() {
		return this.apiUrl;
	},

	this.doSearch = function(XMin, XMax, YMin, YMax, filter, success, error) {
		
		if(filter.mapX!=null && filter.mapY!=null){
			var transformedMapXY =  MapUtility.convertFromWebMtoNad27(filter.mapX,filter.mapY);
			
			filter.mapX = transformedMapXY[0];
			filter.mapY = transformedMapXY[1];
		}
		
		var transformedCoordinatesMin = [0,0];
		var transformedCoordinatesMax = [0,0];
		
		if( XMin != 0 && XMax != 0 && YMin!= 0 && YMax!= 0 ){
			
			 transformedCoordinatesMin = MapUtility.convertFromWebMtoNad27(XMin,YMin);
			 transformedCoordinatesMax = MapUtility.convertFromWebMtoNad27(XMax,YMax);
		}
		var json = filter;// json.concat(filter);
		json["propX_min"] = String(transformedCoordinatesMin[0]);
		json["propX_max"] = String(transformedCoordinatesMax[0]);
		json["propY_min"] = String(transformedCoordinatesMin[1]);
		json["propY_max"] = String(transformedCoordinatesMax[1]);

		$.ajax({
			type : "post",
			url : this.apiUrl + "/jaxrs/search/properties",
			dataType : "json",
			data : JSON.stringify(json),
			contentType : 'application/json',
			// crossDomain: true,
			cache : false,
			success : function(data) {
				if (typeof success === "function")
					success(data);
			},
			error : function(xhr, ajaxOptions, thrownError) {
				if (typeof error === "function")
					error(xhr);
			}
		});
	};

	this.doViewFolderlistInProperty = function(propertyrsn, filter, success,
			error) {
		var json = filter;
		json["propertyRsn"] = "" + propertyrsn; // convert to string

		$.ajax({
			type : "post",
			url : this.apiUrl + "/jaxrs/search/folders",
			dataType : "json",
			data : JSON.stringify(json),
			contentType : 'application/json',
			// crossDomain: true,
			cache : false,
			success : function(data) {
				if (typeof success === "function")
					success(data);
			},
			error : function(exception) {
				if (typeof error === "function")
					error(exception);
			}
		});
	};

	this.doViewFolderDetail = function(folderrsn, success, error) {
		$.ajax({
			type : "GET",
			url : this.apiUrl + "/jaxrs/search/detail/" + folderrsn,
			dataType : "json",
			crossDomain : true,
			success : function(data) {
				if (typeof success === "function")
					success(data);
			},
			error : function(exception) {
				if (typeof error === "function")
					error(exception);
			}
		});
	};
	
	//2.21 support sign variance
	this.doViewSignDetail = function(folderrsn, success, error) {
		$.ajax({
			type : "GET",
			url : this.apiUrl + "/jaxrs/search/sign/" + folderrsn,
			dataType : "json",
			crossDomain : true,
			success : function(data) {
				if (typeof success === "function")
					success(data);
			},
			error : function(exception) {
				if (typeof error === "function")
					error(exception);
			}
		});
	};
	
	//nsolank Zoning Review
	
	this.doViewZoningDetail = function(folderrsn, success, error) {
		$.ajax({
			type : "GET",
			url : this.apiUrl + "/jaxrs/search/zoning/" + folderrsn,
			dataType : "json",
			crossDomain : true,
			success : function(data) {
				if (typeof success === "function")
					success(data);
			},
			error : function(exception) {
				if (typeof error === "function")
					error(exception);
			}
		});
	};
	
	this.doViewViolationDetail = function(folderrsn, success, error) {
		$.ajax({
			type : "GET",
			url : this.apiUrl + "/jaxrs/search/violation/" + folderrsn,
			dataType : "json",
			crossDomain : true,
			success : function(data) {
				if (typeof success === "function")
					success(data);
			},
			error : function(exception) {
				if (typeof error === "function")
					error(exception);
			}
		});
	};
	
	//2.1 HLIU
	this.doViewStatus = function(folderrsn, processRsn, success, error) {
		$.ajax({
			type : "GET",
			url : this.apiUrl + "/jaxrs/search/status/" + folderrsn + "/" + processRsn,
			dataType : "json",
			crossDomain : true,
			success : function(data) {
				if (typeof success === "function")
					success(data);
			},
			error : function(exception) {
				if (typeof error === "function")
					error(exception);
			}
		});
	};
	
}