/**
 * Common helper module for geo location funcations
 */

'use strict';

import geolib from 'geolib';
import distance from 'google-distance';
import config from '../config/environment';

class geoHelper {
  /*
    Calculates the distance between two geo coordinates
    Return value is always float and represents the distance in meters.
   */
  static getLocationDistanceInMeters (storeLatitude, storeLongitude, customerLatitude, customerLongitude) {
    return geolib.getDistance(
      {latitude: storeLatitude, longitude: storeLongitude},
      {latitude: customerLatitude, longitude: customerLongitude}
    );
  }

  /*
    geolib.getCenter(array coords)
    Calculates the geographical center of all points in a collection of geo coordinates
    Takes an object or array of coordinates and calculates the center of it.
    Returns an object: {"latitude": centerLat, "longitude": centerLng}
   */
  static getLocationCenterPoint (coords) {
    return geolib.getCenter(coords);
  }

  /*
    geolib.getCenterOfBounds(array coords)
    Calculates the center of the bounds of geo coordinates.
    Takes an array of coordinates, calculate the border of those, and gives back the center of that rectangle.
    Returns an object: {"latitude": centerLat, "longitude": centerLng}
   */
  static getLocationCenterOfBounds (coords) {
    return geolib.getCenterOfBounds(coords);
  }

  /*
    geolib.isPointInCircle(object latlng, object center, integer radius)
    checks whether a point is inside of a circle or not.
    Returns true or false
   */
  static isLocationPointInCircle (storeLatitude, storeLongitude, customerLatitude, customerLongitude, radiusInMeter) {
    // checks if customerLatitude, customerLongitude is within a radius of radiusInMeter value from storeLatitude, storeLongitude
    return geolib.isPointInCircle(
      {latitude: customerLatitude, longitude: customerLongitude},
      {latitude: storeLatitude, longitude: storeLongitude},
      radiusInMeter
    );
  }


  static initGoogleDistance(){
    if(config.googleMapSettings.businessClientKey){
      // Business users can omit the API key and instead specify their business client and signature keys:
      distance.businessClientKey = config.googleMapSettings.businessClientKey;
      distance.businessSignatureKey = config.googleMapSettings.businessSignatureKey;
    }
    else {
      // Specify an API key for use like this:
      distance.apiKey = config.googleMapSettings.apiKey;
    }
  }

  /*
    geolib.isPointInCircle(object latlng, object center, integer radius)
    checks whether a point is inside of a circle or not.
    Returns true or false
   */
  static getGoogleDistanceMatrix (storeLatitude, storeLongitude, customerLatitude, customerLongitude, modeOfTransport) {
    return new Promise(function (resolve, reject) {
      geoHelper.initGoogleDistance();

      let mode = 'driving';
      if (modeOfTransport.toLowerCase() === 'bicycle' || modeOfTransport.toLowerCase() === 'burro') {
        mode = 'bicycling';
      }
      else if (modeOfTransport.toLowerCase() === 'onfoot') {
        mode = 'walking';
      }

      if(storeLatitude === customerLatitude && storeLongitude === customerLongitude){
          return resolve({
              durationValue: 0,
              distanceValue: 0
          });
      }
      else {
          distance.get(
              {
                  origin: customerLatitude + ',' + customerLongitude,
                  destination: storeLatitude + ',' + storeLongitude,
                  mode: mode,
                  units: 'metric'
              },
              function (err, data) {
                  if (err) {
                      return reject(err);
                  } else {
                      return resolve(data);
                  }
              });
      }
    });
  }
}

// export the class
module.exports = geoHelper;
