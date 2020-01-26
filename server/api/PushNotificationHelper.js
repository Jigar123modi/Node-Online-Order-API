/**
 * Push notification helper module for send notification to mobile device
 */

'use strict';

import config from '../config/environment';
const PushNotifications = require('node-pushnotifications');

//Global push object
var push = null;

function PushNotificationHelper() {
  // always initialize all instance properties
  if(!push) {
    const settings = {
      gcm: {
        id: config.pushNotification.gcm.apiKey
      },
      apn: {
        //cert: 'server/Certs/cert.pem',
        //key: 'server/Certs/key.pem',
        cert: 'server/Certs/prod-cert.pem',
        key: 'server/Certs/prod-key.pem',
        production: true
      }
    };

    push = new PushNotifications(settings);
  }
}

// class methods
PushNotificationHelper.prototype.sendPushNotification = function(deviceType,devicePushToken, message, badge) {
  return new Promise(function (resolve, reject) {
    try {
      var data = {};
      if (deviceType.toLowerCase() === 'iOS'.toLowerCase()) {
        if(!badge){
          badge = 2;
        }

        data = {
          title: 'GYG DriveBy', // REQUIRED
          body: 'GYG DriveBy apple push notification', // REQUIRED
          custom: {
            message: message
          },
          priority: 'high', // gcm, apn. Supported values are 'high' or 'normal' (gcm). Will be translated to 10 and 5 for apn. Defaults to 'high'
          badge: badge, // gcm for ios, apn
          alert: 'GYG DriveBy',
          topic: 'com.gruden.gygmicros', // apn and gcm for ios
          contentAvailable: '1', // apn and gcm for ios
          truncateAtWordEnd: true, // apn and gcm for ios
          expiry: Math.floor(Date.now() / 1000) + 28 * 86400, // seconds
          timeToLive: 28 * 86400, // if both expiry and timeToLive are given, expiry will take precedency
        };
      }
      else {
        data = {
          title: 'GYG DriveBy', // REQUIRED
          body: 'GYG DriveBy google push notification', // REQUIRED
          custom: {
            message: message
          },
          priority: 'high', // gcm, apn. Supported values are 'high' or 'normal' (gcm). Will be translated to 10 and 5 for apn. Defaults to 'high'
          contentAvailable: true, // gcm for android
          delayWhileIdle: true, // gcm for android
          expiry: Math.floor(Date.now() / 1000) + 28 * 86400, // seconds
          timeToLive: 28 * 86400, // if both expiry and timeToLive are given, expiry will take precedency
        };
      }

      push.send(devicePushToken, data)
        .then((results) => {
          return resolve(results);
        })
        .catch((err) => {
          return reject(err);
        });
    }
    catch (err){
      return reject(err);
    }
  });
};

// export the class
module.exports = PushNotificationHelper;
