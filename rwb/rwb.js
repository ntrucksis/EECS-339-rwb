/* jshint strict: false */
/* global $: false, google: false */
//
// Red, White, and Blue JavaScript 
// for EECS 339 Project A at Northwestern University
//
// Originally by Peter Dinda
// Sanitized and improved by Ben Rothman
// Assorted updates for 2018 by Peter Dinda
//
// Global state
//
// html          - the document itself ($. or $(document).)
// map           - the map object
// usermark      - marks the user's position on the map
// markers       - list of markers on the current map (not including the user position)
// curpos        - current user position by geolocation interface
// cliplimit     - geolimit (in degrees) around map center to be queried
//                 <0 => no clipping is done
// amclipped     - Does current map zoom level trigger clipping?
// clipbounds    - current bounds of clipping rectangle for easy access
//                 region is min of map region and cliplimit
// cliprect      - clipping rectangle for the map (if used)
// vsthrottle    - min delay between viewshift requests
//                 to limit update rate and query rate back to server
// vsoutstanding - number of ignored view shift requests
//

//
// When the document has finished loading, the browser
// will invoke the function supplied here.  This
// is an anonymous function that simply requests that the 
// brower determine the current position, and when it's
// done, call the "Start" function  (which is at the end
// of this file)
// 
//
$(document).ready(function() {
	navigator.geolocation.getCurrentPosition(Start);
});

// Global variables

var map, usermark, markers = [], curpos,
    cliplimit = 1, amclipped=false, clipbounds=null, cliprect, 
    vsthrottle = 100,  vsoutstanding = 0;

// Clip bounds for a request to avoid overloading the server
// only makes sense for US, possibly not some possessions
// Note that this changes the global clipping state
ClipBounds = function(bounds) {
    if (cliplimit<=0) {
	amclipped=false;
	return bounds;
    } else {
	var ne = bounds.getNorthEast();
	var sw = bounds.getSouthWest();
	var oldheight = Math.abs(ne.lat()-sw.lat());
	var oldwidth = Math.abs(sw.lng()-ne.lng());
	var height = Math.min(oldheight,cliplimit);
	var width = Math.min(oldwidth,cliplimit);
	var centerlat = (ne.lat()+sw.lat())/2.0;
	var centerlng = (ne.lng()+sw.lng())/2.0;
	var newne = new google.maps.LatLng(centerlat+height/2.0,centerlng+width/2.0);
	var newsw = new google.maps.LatLng(centerlat-height/2.0,centerlng-width/2.0);
	amclipped = (height<oldheight || width<oldwidth);
	clipbounds = new google.maps.LatLngBounds(newsw,newne);
	return clipbounds;
    }
}

// UpdateMapById draws markers of a given category (id)
// onto the map using the data for that id stashed within 
// the document.
UpdateMapById = function(id, tag) {
// the document division that contains our data is #committees 
// if id=committees, and so on..
// We previously placed the data into that division as a string where
// each line is a separate data item (e.g., a committee) and
// tabs within a line separate fields (e.g., committee name, committee id, etc)
// 
// first, we slice the string into an array of strings, one per 
// line / data item
	var rows  = $("#"+id).html().split("\n");

// then, for each line / data item
	for (var i=0; i<rows.length; i++) {
// we slice it into tab-delimited chunks (the fields)
		var cols = rows[i].split("\t"),
// grab specific fields like lat and long
			lat = cols[0],
			long = cols[1];

			if (id=="opinion_data") {
			  color = cols[2];
			if (color == 1 ){
			  markers.push(new google.maps.Marker({
				  map: map,
				  position: new google.maps.LatLng(lat,long),
				  title: tag+"\n"+cols.join("\n"),
				  icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
			  }));
		        } 
			if (color == -1) {
			   markers.push(new google.maps.Marker({
                                  map: map,
                                  position: new google.maps.LatLng(lat,long),
                                  title: tag+"\n"+cols.join("\n"),
                                  icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
			   }));
			}				
			if (color == 0) {
			   markers.push(new google.maps.Marker({
                                  map: map,
                                  position: new google.maps.LatLng(lat,long),
                                  title: tag+"\n"+cols.join("\n"),
                                  icon: 'http://labs.google.com/ridefinder/images/mm_20_white.png'
                           }));
			} 	
			} else { 

// then add them to the map.   Here the "new google.maps.Marker"
// creates the marker and adds it to the map at the lat/long position
// and "markers.push" adds it to our list of markers so we can
// delete it later 
		markers.push(new google.maps.Marker({
			map: map,
			position: new google.maps.LatLng(lat,long),
			title: tag+"\n"+cols.join("\n")
		}));
	
	    }
	}
},

//
// ClearMarkers just removes the existing data markers from
// the map and from the list of markers.
//
ClearMarkers = function() {
	// clear the markers
	while (markers.length>0) {
		markers.pop().setMap(null);
	}
},

// draw / erase clipping rect
UpdateClipRect = function() {
    if (cliprect != null) { 
	cliprect.setMap(null); // erase
	cliprect = null;
    }
    if (amclipped) { 
	cliprect = new google.maps.Rectangle({
		strokeColor: '#FFFFFF',
		strokeOpacity: 0.8,
		strokeWeight: 4,
		fillColor: '#000000',
		fillOpacity: 0,
		map: map,
		bounds: clipbounds}); 
    }
},

// UpdateMap takes data sitting in the hidden data division of 
// the document and it draws it appropriately on the map
//
UpdateMap = function() {
// We're consuming the data, so we'll reset the "color"
// division to white and to indicate that we are updating
	var color = $("#color");
	color.css("background-color", "white")
		.html("<b><blink>Updating Display...</blink></b>");

// Remove any existing data markers from the map
	ClearMarkers();

// Then we'll draw any new markers onto the map, by category
// Note that there additional categories here that are 
// commented out...  Those might help with the project...
//	
	if ($('#committee_data').length > 0) {
		UpdateMapById("committee_data","COMMITTEE");
	}
	if ($('#candidate_data').length > 0) {
		UpdateMapById("candidate_data","CANDIDATE");
	}
	if ($('#individual_data').length > 0) {
		UpdateMapById("individual_data", "INDIVIDUAL");
	}
	if ($('#opinion_data').length > 0) {
		UpdateMapById("opinion_data","OPINION");
	}

	UpdateClipRect();

// When we're done with the map update, we mark the color division as
// Ready.
	color.html("Ready");

// The hand-out code doesn't actually set the color according to the data
// (that's the student's job), so we'll just assign it a random color for now
	if (Math.random()>0.5) {
		color.css("background-color", "blue");
	} else {
		color.css("background-color", "red");
	}

},

//
// NewData is called by the browser after any request
// for data we have initiated completes
//
NewData = function(data) {
// All it does is copy the data that came back from the server
// into the data division of the document.   This is a hidden 
// division we use to cache it locally
	$("#data").html(data);
// Now that the new data is in the document, we use it to
// update the map
	UpdateMap();
},

//
// The Google Map calls us back at ViewShift when some aspect
// of the map changes (for example its bounds, zoom, etc)
//
ViewShift = function() {

// viewshift is throttled so that trains of calls (for example,
// from rapid UI or GPS input) collapses into one or two calls
       if (vsoutstanding>0) {
	   // we are in a train, lengthen it
	   vsoutstanding++;
	   return;
       } else {
	   // we are about to start a train
	   vsoutstanding=1;
	   // call us back at the end of the throttle interval
	   setTimeout(function() {
		    if (vsoutstanding>1) {
			vsoutstanding=0;
			ViewShift();
		    } else {
			vsoutstanding=0;
		    }
		}, vsthrottle);
       }

// We determine the new bounds of the map
// the bounds are clipped to limit the query size
// Queries SHOULD also be constrained within the application layer
// (rwb.pl) and, most importantly, within the database itself
        var bounds = ClipBounds(map.getBounds()),
		ne = bounds.getNorthEast(),
		sw = bounds.getSouthWest();


// Now we need to update our data based on those bounds
// first step is to mark the color division as white and to say "Querying"
	$("#color").css("background-color","white")
		.html("<b><blink>Querying...("+ne.lat()+","+ne.lng()+") to ("+sw.lat()+","+sw.lng()+")</blink></b>");
	
	var whichData = $('.checkbox-fec-type');
	var filteredData = [];
	for (var i = 0; i < whichData.length; i++) {
		if (whichData[i].checked) {
			filteredData.push(whichData[i]);
		}
	}	
	
	var newWhat = "";
	for (var i = 0; i < filteredData.length; i++) {
		newWhat += filteredData[i].name;
		if (i < filteredData.length - 1) {
			newWhat += ",";
		}
	}

	var cycles = $('.checkbox-cycle');
	var filteredCycles = "";
	for (var i = 0; i < cycles.length; i++) {
		if (cycles[i].checked) {
			filteredCycles += (filteredCycles ? "," : '') + cycles[i].name; 
 		}
	}
	console.log('YERR',filteredCycles);
		
// Now we make a web request.   Here we are invoking rwb.pl on the 
// server, passing it the act, latne, etc, parameters for the current
// map info, requested data, etc.
// the browser will also automatically send back the cookie so we keep
// any authentication state
// 
// This *initiates* the request back to the server.  When it is done,
// the browser will call us back at the function NewData (given above)
	$.get("rwb.pl",
		{
			act:	"near",
			latne:	ne.lat(),
			longne:	ne.lng(),
			latsw:	sw.lat(),
			longsw:	sw.lng(),
			format:	"raw",
			cycle:	(filteredCycles ? filteredCycles : undefined),
			what:	newWhat
		}, NewData);
},


//
// If the browser determines the current location has changed, it 
// will call us back via this function, giving us the new location
//
Reposition = function(pos) {
// We parse the new location into latitude and longitude
	var lat = pos.coords.latitude,
            long = pos.coords.longitude; 

	if (lat == curpos.coords.latitude && long == curpos.coords.longitude) { 
	    // we haven't moved, no need to change the map or get new data
	    return;
	} else {
	    // we have moved, update position ...
	    curpos = pos;
	}

// ... and scroll the map to be centered at that position
// this should trigger the map to call us back at ViewShift()
	map.setCenter(new google.maps.LatLng(lat,long));
// ... and set our user's marker on the map to the new position
	usermark.setPosition(new google.maps.LatLng(lat,long));

}


//
// The start function is called back once the document has 
// been loaded and the browser has determined the current location
//
Start = function(location) {
// Parse the current location into latitude and longitude        
	var lat = location.coords.latitude,
	    long = location.coords.longitude,
	    acc = location.coords.accuracy,
// Get a pointer to the "map" division of the document
// We will put a google map into that division
	    mapc = $("#map");


	curpos = location;

// Create a new google map centered at the current location
// and place it into the map division of the document
	map = new google.maps.Map(mapc[0],
		{
			zoom: 16,
			center: new google.maps.LatLng(lat,long),
			mapTypeId: google.maps.MapTypeId.HYBRID
		});

// create a marker for the user's location and place it on the map
	usermark = new google.maps.Marker({ map:map,
		position: new google.maps.LatLng(lat,long),
		title: "You are here"});

// clear list of markers we added to map (none yet)
// these markers are committees, candidates, etc
	markers = [];

// set the color for "color" division of the document to white
// And change it to read "waiting for first position"
	$("#color").css("background-color", "white")
		.html("<b><blink>Waiting for first position</blink></b>");

//
// These lines register callbacks.   If the user scrolls the map, 
// zooms the map, etc, then our function "ViewShift" (defined above
// will be called after the map is redrawn
//
	google.maps.event.addListener(map,"bounds_changed",ViewShift);
	google.maps.event.addListener(map,"center_changed",ViewShift);
	google.maps.event.addListener(map,"zoom_changed",ViewShift);
	var checkboxes = $('.checkboxes');

	for (var i = 0; i < checkboxes.length; i++) {
		checkboxes[i].addEventListener('change', function() {
			console.log('checked');
			ViewShift();
		});
	}
//
// Finally, tell the browser that if the current location changes, it
// should call back to our "Reposition" function (defined above)
//
	navigator.geolocation.watchPosition(Reposition);
};
