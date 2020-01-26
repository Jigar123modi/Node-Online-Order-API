/**
 * Pubnub helper module for manage socket connection
 */

'use strict';

import PubNub from 'pubnub';
import config from '../config/environment';
import GyGLog from '../logging/GyGLog';
import db from '../sqldb';
import moment from 'moment';
import geoHelper from './geoHelper';
import {CommonHelper,setiOSBackgroundChannelInCache, removeiOSBackgroundChannelFromCache, removeActiveDriveByRequestsCache, updateLocationStatus} from './CommonHelper';
import appMessages from '../config/AppMessages';

//Global PubNub object
var pubnub = null;

function PubnubHelper() {
  // always initialize all instance properties
  if(!pubnub) {
    pubnub = new PubNub({
      subscribeKey: config.pubnub.subscribeKey,
      publishKey: config.pubnub.publishKey
    });

    pubnub.addListener({
      message(m) {
        try {
          // handle message
          let actualChannel = m.actualChannel;
          let channelName = m.channel; // The channel for which the message belongs
          let msg = m.message; // The Payload
          let publisher = m.publisher;
          let subscribedChannel = m.subscribedChannel;
          let channelGroup = m.subscription; // The channel group or wildcard subscription match (if exists)
          let pubTT = m.timetoken; // Publish timetoken

          GyGLog.writeLog(GyGLog.eLogLevel.debug, null, 'PubNub.getMessage data :' + JSON.stringify({
              channelName, message: msg, publisher, subscribedChannel, channelGroup
          }));

          if (msg && msg.messageType) {
            switch (msg.messageType.toLowerCase()) {
              /*
                Customer location change message
                Send from mobile app when customer geo location change
               */
              case 'updateLocation'.toLowerCase():
                PubnubHelper.prototype.customerLocationChange({
                  customerId: msg.data.order.customerId,
                  orderNumber: msg.data.order.orderNumber,
                  storeId: msg.data.store.storeId,
                  customerLatitude: msg.data.location.latitude,
                  customerLongitude: msg.data.location.longitude,
                  sequence: msg.data.location.sequence,
                  modeOfTransport: msg.data.driveByDetails.modeOfTransport
                });
                break;

              /*
               Update Status message
               Send from mobile app when customer take any action
               Send from DDS when staff take any action
              */
              case 'updateStatus'.toLowerCase():
                //PubNub Connection
                module.exports.updateStatusMessage({
                  customerId: msg.data.order.customerId,
                  orderNumber: msg.data.order.orderNumber,
                  newStatus: msg.data.newStatus
                });
                break;

              /*
               Update Customer notification message
               Send from DDS when staff take any action for customer notification
              */
              case 'updateCustomerNotification'.toLowerCase():
                updateCustomerNotificationMessage({
                  customerId: msg.data.order.customerId,
                  orderNumber: msg.data.order.orderNumber,
                  customerNotification: msg.data.customerNotification.name,
                  customerNotificationValue: msg.data.customerNotification.value
                });
                break;

              /*
               DriveBy rating message
               Send from mobile app when customer submit rating
              */
              case 'driveByRating'.toLowerCase():
                driveByRatingMessage({
                  customerId: msg.data.order.customerId,
                  orderNumber: msg.data.order.orderNumber,
                  ratingValue: msg.data.rating.value,
                  ratingText: msg.data.rating.text
                });
                break;

              /*
               DriveBy request for current status message
               Send from mobile app when mobile app move to foreground from background
              */
              case 'currentStatus'.toLowerCase():
                currentStatusMessage({
                  customerId: msg.data.order.customerId,
                  orderNumber: msg.data.order.orderNumber
                });
                break;

              /*
               Mobile app status
               Send from mobile app when mobile app move to foreground or background
              */
              case 'updateAppStatus'.toLowerCase():
                updateAppStatusMessage({
                  customerId: msg.data.order.customerId,
                  orderNumber: msg.data.order.orderNumber,
                  appStatus: msg.data.status,
                  deviceId: msg.data.device.deviceId,
                  deviceType: msg.data.device.type
                });
                break;

              default:
                GyGLog.writeLog(GyGLog.eLogLevel.debug, null, 'PubNub.getMessage message : messageType not implemented: '+msg.messageType);
            }
          }
        }
        catch (err){
          GyGLog.writeLog(GyGLog.eLogLevel.error, null, 'PubNub.getMessage error : '+JSON.stringify(err.message));
        }
      },
      presence(p) {
        // handle presence
        let action = p.action; // Can be join, leave, state-change or timeout
        let channelName = p.channel; // The channel for which the message belongs
        let channelGroup = p.subscription; //  The channel group or wildcard subscription match (if exists)
        let presenceEventTime = p.timestamp; // Presence event timetoken
        let status = p.status; // 200
        let message = p.message; // OK
        let service = p.service; // service
        let uuids = p.uuids;  // UUIDs of users who are connected with the channel with their state
        let occupancy = p.occupancy; // No. of users connected with the channel

        GyGLog.writeLog(GyGLog.eLogLevel.debug, null, 'PubNub.getPresence data :' + JSON.stringify({
          action, channelName, status, message, occupancy
        }));

        detectDeviceStatus({
          action,
          channelName
        });
      },
      status(s) {
        // handle status
        let category = s.category; // PNConnectedCategory
        let operation = s.operation; // PNSubscribeOperation
        let affectedChannels = s.affectedChannels; // The channels affected in the operation, of type array.
        let subscribedChannels = s.subscribedChannels; // All the current subscribed channels, of type array.
        let affectedChannelGroups = s.affectedChannelGroups; // The channel groups affected in the operation, of type array.
        let lastTimetoken = s.lastTimetoken; // The last timetoken used in the subscribe request, of type long.
        let currentTimetoken = s.currentTimetoken; // The current timetoken fetched in the subscribe response, which is going to be used in the next request, of type long.
      }
    });
  }
}

// Private methods
function trackLocationInDatabase(obj) {
  return new Promise(function (resolve, reject) {
    let uniqueId = CommonHelper.getUniqueIdFromCache({
      orderNumber: obj.orderNumber
    });
    try{
      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'trackLocationInDatabase obj: ' + JSON.stringify(obj));
      db.Locations.findAll({
        attributes: ['sequence','latitude','longitude','distanceInMeters'],
        where: {
          orderNumber: obj.orderNumber
        }
      })
        .then(function (locations) {
          if(locations && locations.length > 0) {
              if (obj.sequence) {
                  var filterLocations = locations.filter(function (item) {
                      return item.sequence >= obj.sequence;
                  });

                  if (filterLocations.length > 0) {
                      throw new Error('LocationIgnored, Location change message come out of sequence!');
                  }
              }

              let filterLastLocations = locations.filter(function (item) {
                  return item.sequence < obj.sequence;
              });
              let lastSequence = Math.max.apply(Math, filterLastLocations.map(function (o) {
                  return o.sequence;
              }));

              let LastLocations = locations.filter(function (item) {
                  return item.sequence === lastSequence;
              });
              if (LastLocations.length > 0) {
                if (LastLocations[0].latitude === obj.customerLatitude && LastLocations[0].longitude === obj.customerLongitude) {
                  throw new Error('LocationIgnored, Last location point same as current!');
                }

                let distanceChangeInMeters = LastLocations[0].distanceInMeters - obj.distanceInMeters;
                if(obj.distanceInMeters > 1000) {
                  if (distanceChangeInMeters <= 100 && distanceChangeInMeters >= 0) {
                    throw new Error('LocationIgnored, Current location is in min radius of last location!');
                  }
                }
                else if(obj.distanceInMeters > 500) {
                  if (distanceChangeInMeters <= 50 && distanceChangeInMeters >= 0) {
                    throw new Error('LocationIgnored, Current location is in min radius of last location!');
                  }
                }
                else {
                  if (distanceChangeInMeters <= 5 && distanceChangeInMeters >= 0) {
                    throw new Error('LocationIgnored, Current location is in min radius of last location!');
                  }
                }
              }
          }

          db.DriveByRequest.find({
            attributes: ['orderNumber','customerId','storeName','status','hereNowDateTime','durationInSeconds','distanceInMeters','locationStatus','updatedAt'],
            where: {
              orderNumber: obj.orderNumber
            }
          })
            .then(function (existingDriveByRequest) {
              if(!existingDriveByRequest){
                throw new Error('DriveByRequest not found in DB, message ignored!');
              }

              let existingStatus = existingDriveByRequest.status.toLowerCase();
              if(existingStatus === 'herenow' || existingStatus === 'delivered' || existingStatus === 'completed' || existingDriveByRequest.hereNowDateTime){
                throw new Error('LocationIgnored, DriveByRequest status in [HereNow|Completed]!');
              }

              if(existingDriveByRequest.locationStatus && existingDriveByRequest.locationStatus.toLowerCase() === 'InsidePickupTime'.toLowerCase()){
                  try {
                      CommonHelper.getStoreCacheByStoreName(existingDriveByRequest.storeName)
                          .then(function (storeCache) {
                              let wideGeofenceInMeters = config.locationSettings.wideGeofenceInMeters;
                              if (storeCache.wideGeofenceInMeters) {
                                  wideGeofenceInMeters = storeCache.wideGeofenceInMeters;
                              }
                              if (obj.distanceInMeters <= wideGeofenceInMeters) {
                                  let frequencyInsideInSecs = config.locationSettings.frequencyInsideInSecs;
                                  if (storeCache.frequencyInsideInSecs) {
                                      frequencyInsideInSecs = storeCache.frequencyInsideInSecs;
                                  }

                                  let locationStatus = 'FrequencyInside';
                                  module.exports.publishLocationChangeFrequencyMessage({
                                      customerId: existingDriveByRequest.customerId,
                                      orderNumber: existingDriveByRequest.orderNumber,
                                      status: locationStatus,
                                      frequencyInSeconds: frequencyInsideInSecs
                                  })
                                      .then(function (data) {
                                          updateLocationStatus({
                                              storeName: existingDriveByRequest.storeName,
                                              customerId: existingDriveByRequest.customerId,
                                              orderNumber: existingDriveByRequest.orderNumber,
                                              locationStatus,
                                              currentDate: obj.currentDate
                                          })
                                              .then(function (data) {
                                                  //success
                                              })
                                              .catch(function (err) {
                                                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'trackLocationInDatabase message: ' + JSON.stringify(err.message));
                                              });
                                      })
                                      .catch(function (err) {
                                          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'trackLocationInDatabase message: ' + JSON.stringify(err.message));
                                      });
                              }
                          })
                          .catch(function (err) {
                              //Get store cache error
                              console.log(err);
                          });
                  }
                  catch(err) {
                      console.log(err);
                  }
              }

              db.Locations.build({
                orderNumber: obj.orderNumber,
                customerId: obj.customerId,
                latitude: obj.customerLatitude,
                longitude: obj.customerLongitude,
                sequence: obj.sequence,
                durationInSeconds: obj.durationInSeconds,
                distanceInMeters: obj.distanceInMeters,
                createdAt: obj.currentDate,
                updatedAt: obj.currentDate
              })
                .save()
                .then(function (response) {
                  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'trackLocationInDatabase message: location stored in database.');

                  existingDriveByRequest.durationInSeconds= obj.durationInSeconds;
                  existingDriveByRequest.distanceInMeters= obj.distanceInMeters;
                  existingDriveByRequest.updatedAt = obj.currentDate;

                  existingDriveByRequest
                    .save()
                    .then(function (updatedRecord) {
                      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'trackLocationInDatabase message: Distance value updated in database.');
                      return resolve(updatedRecord);
                    })
                    .catch(function (err) {
                      return reject(err);
                    });
                })
                .catch(function (err) {
                  return reject(err);
                });
            })
            .catch(function (err) {
              return reject(err);
            });
        })
        .catch(function (err) {
          return reject(err);
        });
    }
    catch (err){
      return reject(err);
    }
  });
}

function publishLocationChangeMessageToDDS(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });
  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering publishLocationChangeMessageToDDS...');
  let ddsLocationChangeMessage = {
    messageType: 'updateLocation',
    data: {
      order:{
        customerId: obj.customerId,
        orderNumber: obj.orderNumber
      },
      distance: {
        durationInSeconds: obj.durationInSeconds,
        distanceInMeters: obj.distanceInMeters
      },
      location: {
        latitude: obj.customerLatitude,
        longitude: obj.customerLongitude,
        sequence: obj.sequence,
        locationDateTime:obj.locationDateTime
      },
      store:{
        latitude: obj.storeLatitude,
        longitude: obj.storeLongitude
      }
    }
  };

  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'publishLocationChangeMessageToDDS message: '+ JSON.stringify(ddsLocationChangeMessage));

  //Publish customer location change message to DDS Listen channel
  obj.pubnubHelper.publishMessage(obj.ddsListenChannelName, ddsLocationChangeMessage, uniqueId);

  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting publishLocationChangeMessageToDDS...success');
}

function publishUpdateAvgWaitTimeMessageToDDS(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });
  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering publishUpdateAvgWaitTimeMessageToDDS...');

  let publishMessageObj = {
    messageType: 'updateAvgWaitTime',
    data: {
      diffInSeconds: obj.diffInSeconds,
      order: {
        customerId: obj.customerId,
        orderNumber: obj.orderNumber
      }
    }
  };

  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'publishUpdateAvgWaitTimeMessageToDDS message: '+ JSON.stringify(publishMessageObj));

  //Publish update status message to DDS control channel
  obj.pubnubHelper.publishMessage(obj.storeControlChannelName, publishMessageObj, uniqueId);

  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting publishUpdateAvgWaitTimeMessageToDDS...success');
}

function publishStatusChangeMessage(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });
  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering publishStatusChangeMessage...');

  let publishMessageObj = {
    messageType: 'updateStatus',
    data: {
      newStatus: obj.newStatus,
      actionDateTime: obj.currentDate,
      order: {
        customerId: obj.customerId,
        orderNumber: obj.orderNumber
      }
    }
  };

  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'publishStatusChangeMessage message: '+ JSON.stringify(publishMessageObj));

  //Publish update status message to DDS control channel
  obj.pubnubHelper.publishMessage(obj.ddsListenChannelName, publishMessageObj, uniqueId);
  //Publish update status message to mobile app listen channel
  obj.pubnubHelper.publishMessage(obj.appListenChannelName, publishMessageObj, uniqueId);

  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting publishStatusChangeMessage...success');
}

function publishCurrentStatusMessageToMobileApp(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });

  try {
    let orderChannelNames = CommonHelper.buildOrderChannelNames(obj.orderNumber);
    let appListenChannelName = orderChannelNames.appListenChannelName;
    let pubnubHelper = new PubnubHelper();

    let publishMessageObj = {
      messageType: 'updateStatus',
      data: {
        newStatus: obj.status,
        actionDateTime: obj.actionDateTime,
        order: {
          customerId: obj.customerId,
          orderNumber: obj.orderNumber
        }
      }
    };

    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'publishCurrentStatusMessageToMobileApp message: ' + JSON.stringify(publishMessageObj));

    //Publish update status message to mobile app listen channel
    pubnubHelper.publishMessage(appListenChannelName, publishMessageObj, uniqueId);
  }
  catch (err){
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'publishCurrentStatusMessageToMobileApp message: ' + err.message);
  }
}

function updateCustomerNotificationMessage(obj) {
  return new Promise(function (resolve, reject) {
    let uniqueId = CommonHelper.getUniqueIdFromCache({
      orderNumber: obj.orderNumber
    });
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering updateCustomerNotificationMessage...');

    try{
      db.DriveByRequest.find({
        attributes: ['orderNumber','customerId','storeName','status','isRunningLate','actionDateTime','requestDateTime','hereNowDateTime','pickUpDate','pickUpTime','durationInSeconds','distanceInMeters','customerNotification','updatedAt'],
        where: {
          orderNumber: obj.orderNumber
        }
      })
        .then(function (existingDriveByRequest) {
          if(existingDriveByRequest)
          {
            CommonHelper.getCurrentGMTDateByOrderNumber(obj.orderNumber)
              .then(function (currentDate) {
                if(obj.customerNotification.toLowerCase() === 'ComeIn'.toLowerCase()){
                  let newStatus = 'Cancelled';
                  existingDriveByRequest.status = newStatus;
                  existingDriveByRequest.actionDateTime = currentDate;
                  existingDriveByRequest.updatedAt = currentDate;

                  existingDriveByRequest
                    .save()
                    .then(function (saveResult) {
                      //Insert/Update new request in active DriveByRequest cache
                      CommonHelper.setActiveDriveByRequestsCache({
                        orderNumber: existingDriveByRequest.orderNumber,
                        customerId: existingDriveByRequest.customerId,
                        storeName: existingDriveByRequest.storeName,
                        status: existingDriveByRequest.status,
                        isRunningLate: existingDriveByRequest.isRunningLate,
                        requestDateTime: existingDriveByRequest.requestDateTime,
                        hereNowDateTime: existingDriveByRequest.hereNowDateTime,
                        actionDateTime: existingDriveByRequest.actionDateTime,
                        pickUpDate: existingDriveByRequest.pickUpDate,
                        pickUpTime: existingDriveByRequest.pickUpTime,
                        locationStatus: existingDriveByRequest.locationStatus
                      });

                      let orderChannelNames = CommonHelper.buildOrderChannelNames(obj.orderNumber);
                      let ddsListenChannelName = orderChannelNames.ddsListenChannelName;
                      let appListenChannelName = orderChannelNames.appListenChannelName;

                      //PubNub Connection
                      let pubnubHelper = new PubnubHelper();

                      publishStatusChangeMessage({
                        customerId: obj.customerId,
                        orderNumber: obj.orderNumber,
                        newStatus: newStatus,
                        ddsListenChannelName,
                        appListenChannelName,
                        pubnubHelper,
                        currentDate
                      });

                      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'updateCustomerNotificationMessage message: driveby request has been cancelled.');
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateCustomerNotificationMessage...success');
                      return resolve({message: 'success'});
                    })
                    .catch(function (err) {
                      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateCustomerNotificationMessage message: '+ JSON.stringify(err.message));
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateCustomerNotificationMessage...fail');
                      return reject(err);
                    });
                }
                else {
                  let currentDateString = currentDate.format("YYYY-MM-DD hh:mm:ss A");
                  let customerNotificationValue = 'Waiting';
                  if(obj.customerNotificationValue){
                    customerNotificationValue = obj.customerNotificationValue;
                  }
                  let newCustomerNotification = {
                    'name': obj.customerNotification,
                    'value': customerNotificationValue,
                    'notificationDateTime': currentDateString
                  };

                  var customerNotificationObj = [];
                  if (existingDriveByRequest.customerNotification) {
                    let customerNotificationObjResult = JSON.parse(existingDriveByRequest.customerNotification);

                    if (customerNotificationObjResult instanceof Array) {
                      let filerObj = customerNotificationObjResult.filter(item => {
                        return item.name && item.name.toLowerCase() !== obj.customerNotification.toLowerCase();
                      });

                      filerObj[filerObj.length] = newCustomerNotification;
                      customerNotificationObj = filerObj;
                    }
                    else {
                      var newCustomerNotificationObj = [];
                      newCustomerNotificationObj[0] = newCustomerNotification;
                      customerNotificationObj = newCustomerNotificationObj;
                    }
                  }
                  else {
                    var newCustomerNotificationObj = [];
                    newCustomerNotificationObj[0] = newCustomerNotification;
                    customerNotificationObj = newCustomerNotificationObj;
                  }

                  existingDriveByRequest.customerNotification = JSON.stringify(customerNotificationObj);
                  existingDriveByRequest.updatedAt = currentDate;

                  existingDriveByRequest
                    .save()
                    .then(function (saveResult) {
                      let orderChannelNames = CommonHelper.buildOrderChannelNames(obj.orderNumber);
                      let ddsListenChannelName = orderChannelNames.ddsListenChannelName;
                      let appListenChannelName = orderChannelNames.appListenChannelName;

                      //PubNub Connection
                      let pubnubHelper = new PubnubHelper();

                      publishUpdateCustomerNotificationMessage({
                        customerId: obj.customerId,
                        orderNumber: obj.orderNumber,
                        customerNotification: customerNotificationObj,
                        ddsListenChannelName,
                        appListenChannelName,
                        pubnubHelper
                      });

                      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'updateCustomerNotificationMessage message: Status updated in database.');
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateCustomerNotificationMessage...success');
                      return resolve({message: 'success'});
                    })
                    .catch(function (err) {
                      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateCustomerNotificationMessage message: ' + JSON.stringify(err.message));
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateCustomerNotificationMessage...fail');
                      return reject(err);
                    });
                }
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateCustomerNotificationMessage message: '+ JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateCustomerNotificationMessage...fail');
                return reject(err);
              });
          }
          else {
            let errorMessage = "DriveByRequest not exists for orderNumber:" + obj.orderNumber;
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateCustomerNotificationMessage message: '+errorMessage);
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateCustomerNotificationMessage...fail');
            return resolve({message: errorMessage});
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateCustomerNotificationMessage message: '+ JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateCustomerNotificationMessage...fail');
          return reject(err);
        });
    }
    catch (err){
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateCustomerNotificationMessage message: '+ JSON.stringify(err.message));
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateCustomerNotificationMessage...fail');
      return reject(err);
    }
  });
}

function publishUpdateCustomerNotificationMessage(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });
  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering publishUpdateCustomerNotificationMessage...');

  let publishMessageObj = {
    messageType: 'updateCustomerNotification',
    data: {
      customerNotification: obj.customerNotification,
      order: {
        customerId: obj.customerId,
        orderNumber: obj.orderNumber
      }
    }
  };

  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'publishUpdateCustomerNotificationMessage message: '+ JSON.stringify(publishMessageObj));

  //Publish update status message to DDS control channel
  obj.pubnubHelper.publishMessage(obj.ddsListenChannelName, publishMessageObj, uniqueId);
  //Publish update status message to mobile app listen channel
  obj.pubnubHelper.publishMessage(obj.appListenChannelName, publishMessageObj, uniqueId);

  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting publishUpdateCustomerNotificationMessage...success');
}

function driveByRatingMessage(obj) {
  return new Promise(function (resolve, reject) {
    let uniqueId = CommonHelper.getUniqueIdFromCache({
      orderNumber: obj.orderNumber
    });
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering driveByRatingMessage...');

    try{
      db.DriveByRequest.find({
        attributes: ['storeName','orderNumber','customerId','ratingValue','ratingText','ratingDateTime','updatedAt'],
        where: {
          orderNumber: obj.orderNumber
        }
      })
        .then(function (existingDriveByRequest) {
          if(existingDriveByRequest)
          {
            CommonHelper.getCurrentGMTDateByStoreName(existingDriveByRequest.storeName)
              .then(function (currentDate) {
                if(!obj.ratingValue){
                  throw new Error('DriveBy rating value must be required, message ignored!');
                }

                existingDriveByRequest.ratingValue = obj.ratingValue;
                if(obj.ratingText) {
                  existingDriveByRequest.ratingText = obj.ratingText;
                }
                existingDriveByRequest.ratingDateTime = obj.currentDate;
                existingDriveByRequest.updatedAt = currentDate;

                existingDriveByRequest
                  .save()
                  .then(function (saveResult) {
                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'driveByRatingMessage message: driveBy rating stored in database.');
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting driveByRatingMessage...success');

                    let pubnubHelper = new PubnubHelper();
                    var storeControlChannelName = CommonHelper.buildStoreControlChannelName(existingDriveByRequest.storeName);

                    publishDriveByRatingMessageToDDS({
                      orderNumber: existingDriveByRequest.orderNumber,
                      customerId: existingDriveByRequest.customerId,
                      ratingValue: existingDriveByRequest.ratingValue,
                      ratingText: existingDriveByRequest.ratingText,
                      storeControlChannelName: storeControlChannelName,
                      pubnubHelper
                    });

                    return resolve({message: 'success'});
                  })
                  .catch(function (err) {
                    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'driveByRatingMessage message: '+ JSON.stringify(err.message));
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting driveByRatingMessage...fail');
                    return reject(err);
                  });
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'driveByRatingMessage message: '+ JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting driveByRatingMessage...fail');
                return reject(err);
              });
          }
          else {
            let errorMessage = "DriveByRequest not exists for orderNumber:" + obj.orderNumber;
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'driveByRatingMessage message: '+errorMessage);
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting driveByRatingMessage...fail');
            return resolve({message: errorMessage});
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'driveByRatingMessage message: '+ JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting driveByRatingMessage...fail');
          return reject(err);
        });
    }
    catch (err){
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'driveByRatingMessage message: '+ JSON.stringify(err.message));
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting driveByRatingMessage...fail');
      return reject(err);
    }
  });
}

function publishDriveByRatingMessageToDDS(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });
  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering publishDriveByRatingMessageToDDS...');

  let publishMessageObj = {
    messageType: 'driveByRating',
    data: {
      rating: {
        value: obj.ratingValue,
        text: obj.ratingText
      },
      order: {
        customerId: obj.customerId,
        orderNumber: obj.orderNumber
      }
    }
  };

  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'publishDriveByRatingMessageToDDS message: '+ JSON.stringify(publishMessageObj));

  //Publish driveby rating message to DDS control channel
  obj.pubnubHelper.publishMessage(obj.storeControlChannelName, publishMessageObj, uniqueId);

  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting publishDriveByRatingMessageToDDS...success');
}

function currentStatusMessage(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });

  try{
    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'currentStatusMessage obj: '+ JSON.stringify(obj));
    db.DriveByRequest.find({
      attributes: ['status','actionDateTime'],
      where:{
        orderNumber: obj.orderNumber
      }
    })
      .then(function (existingDriveByRequest) {
        if(existingDriveByRequest){
          publishCurrentStatusMessageToMobileApp({
            orderNumber: obj.orderNumber,
            customerId: obj.customerId,
            status: existingDriveByRequest.status,
            actionDateTime: existingDriveByRequest.actionDateTime
          });
        }
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'currentStatusMessage message: '+ JSON.stringify(err.message));
      });
  }
  catch (err){
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'currentStatusMessage message: '+ JSON.stringify(err.message));
  }
}

function updateAppStatusMessage(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });

  try{
    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'updateAppStatusMessage obj: '+ JSON.stringify(obj));
    db.DriveByRequest.update({
        appStatus: obj.appStatus,
        deviceId: obj.deviceId,
        deviceType: obj.deviceType
      },
      {
        where: {
          orderNumber: obj.orderNumber
        }
      })
      .then(function (updatedRecords) {
        let orderChannelNames = CommonHelper.buildOrderChannelNames(obj.orderNumber);
        let appListenChannelName = orderChannelNames.appListenChannelName;

        let pushGateway = (obj.deviceType.toLowerCase() === 'iOS'.toLowerCase() ? 'apns' : 'gcm');

        let isValidAppState = false;
        let isInBackground = false;
        if(obj.appStatus.toLowerCase() === 'SleepNow'.toLowerCase()) {
          isInBackground = true;
          isValidAppState = true;
        }
        else if(obj.appStatus.toLowerCase() === 'ActiveNow'.toLowerCase()) {
          isInBackground = false;
          isValidAppState = true;
        }

        if(isValidAppState) {
          module.exports.setChannelState({
            channelName: appListenChannelName,
            isSubscribed: true,
            isInBackground: isInBackground,
            pushGateway: pushGateway,
            deviceId: obj.deviceId,
            isUpdateToDB: true
          })
            .then(function (data) {
              let message = 'Channel: '+appListenChannelName+' set to send push notification.';
              if(!isInBackground){
                message = 'Channel: '+appListenChannelName+' set to stop send push notification.';
              }
              GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'updateAppStatusMessage message: ' + message);
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateAppStatusMessage message: '+ JSON.stringify(err.message));
            });
        }
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateAppStatusMessage message: '+ JSON.stringify(err.message));
      });
  }
  catch (err){
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateAppStatusMessage message: '+ JSON.stringify(err.message));
  }
}

function detectDeviceStatus(obj) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try{
    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'detectDeviceStatus obj: '+ JSON.stringify(obj));

    if(obj.action) {
      let channelName = obj.channelName;
      if (channelName.indexOf('_appListen') > -1) {
        let isInBackground = false;
        let isSubscribed = null;

        if (obj.action.toLowerCase() === 'join' || obj.action.toLowerCase() === 'leave' || obj.action.toLowerCase() === 'timeout') {
          if (obj.action.toLowerCase() === 'join') {
            isSubscribed = true;
            isInBackground = false;
          }
          else if (obj.action.toLowerCase() === 'leave' || obj.action.toLowerCase() === 'timeout') {
            isInBackground = true;
          }

          module.exports.setChannelState({
            channelName: channelName,
            isSubscribed: isSubscribed,
            isInBackground: isInBackground,
            isUpdateToDB: true
          })
            .then(function (data) {
              let message = 'Channel: '+channelName+' set to send push notification.';
              if(!isInBackground){
                message = 'Channel: '+channelName+' set to stop send push notification.';
              }

              GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'detectDeviceStatus message: ' + message);
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'detectDeviceStatus message: ' + JSON.stringify(err.message));
            });
        }
      }
    }
  }
  catch (err){
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'detectDeviceStatus message: '+ JSON.stringify(err.message));
  }
}

function getPushNotificationMessageByStatus(message) {
  let friendlyMessage = '';
  try{
    if(message){
      if(message.messageType){
        if(message.messageType.toLowerCase() === 'updateStatus'.toLowerCase()){
          if(message.data && message.data.newStatus){
            if(message.data.newStatus.toLowerCase() === 'HereNow'.toLowerCase()){
              friendlyMessage = appMessages.HereNow;
            }
            else if(message.data.newStatus.toLowerCase() === 'RunningLate'.toLowerCase()){
              friendlyMessage = appMessages.RunningLate;
            }
            else if(message.data.newStatus.toLowerCase() === 'DeliveryInProgress'.toLowerCase()){
              friendlyMessage = appMessages.DeliveryInProgress;
            }
            else if(message.data.newStatus.toLowerCase() === 'Delivered'.toLowerCase() || message.data.newStatus.toLowerCase() === 'Completed'.toLowerCase()){
              friendlyMessage = appMessages.Delivered;
            }
            else if(message.data.newStatus.toLowerCase() === 'Cancelled'.toLowerCase()){
              friendlyMessage = appMessages.ComeInOrCancelled;
            }
          }
        }
        else if(message.messageType.toLowerCase() === 'updateCustomerNotification'.toLowerCase()){
          if(message.data && message.data.customerNotification && message.data.customerNotification.name){
            if(message.data.customerNotification.name.toLowerCase() === 'ShowOrderNumber'.toLowerCase()){
              friendlyMessage = appMessages.ShowOrderNumber;
            }
            else if(message.data.customerNotification.name.toLowerCase() === 'AdjustMapPosition'.toLowerCase()){
              friendlyMessage = appMessages.AdjustMapPosition;
            }
            else if(message.data.customerNotification.name.toLowerCase() === 'FlashLights'.toLowerCase()){
              friendlyMessage = appMessages.FlashLights;
            }
            else if(message.data.customerNotification.name.toLowerCase() === 'HonkHorn'.toLowerCase()){
              friendlyMessage = appMessages.HonkHorn;
            }
            else if(message.data.customerNotification.name.toLowerCase() === 'TakePhoto'.toLowerCase()){
              friendlyMessage = appMessages.TakePhoto;
            }
            else if(message.data.customerNotification.name.toLowerCase() === 'MessageGuest'.toLowerCase()){
              friendlyMessage = appMessages.MessageGuest;
            }
            else if(message.data.customerNotification.name.toLowerCase() === 'ComeIn'.toLowerCase()){
              friendlyMessage = appMessages.ComeInOrCancelled;
            }
          }
        }
      }
    }
    return friendlyMessage;
  }
  catch (err){
    return friendlyMessage;
  }
}

// class methods
PubnubHelper.prototype.subscribeChannel = function(channelName, uniqueId) {
  //GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.subscribeChannel channelName :'+ channelName);

  pubnub.getState({
      channels: [channelName]
    },
    function (status, response) {
      // handle status, response
      let isSubscribed = false;
      if (response && response.channels && response.channels[channelName].isSubscribed) {
        isSubscribed = true;
      }

      if (!isSubscribed) {
        pubnub.setState({
          state: {isSubscribed:true},
          channels: [channelName]
        }).then((response) => {
          pubnub.subscribe({
            channels: [channelName],
            withPresence: true
          });
        }).catch((err) => {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'PubNub.subscribeChannel message :'+ err.message);
        });
      }
    });
};

// class methods
PubnubHelper.prototype.subscribeChannelWithOrderNumber = function(channelName, orderNumber, uniqueId) {
  //GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.subscribeChannel channelName :'+ channelName);

  pubnub.getState({
      channels: [channelName]
    },
    function (status, response) {
      // handle status, response
      let isSubscribed = false;
      if (response && response.channels && response.channels[channelName].isSubscribed) {
        isSubscribed = true;
      }

      if (!isSubscribed) {
        pubnub.setState({
          state: {
            isSubscribed:true,
            orderNumber: orderNumber
          },
          channels: [channelName]
        }).then((response) => {
          pubnub.subscribe({
            channels: [channelName],
            withPresence: true
          });
        }).catch((err) => {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'PubNub.subscribeChannelWithOrderNumber message :'+ err.message);
        });
      }
    });
};

PubnubHelper.prototype.unsubscribeChannel = function(channelName, uniqueId) {
  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.unsubscribeChannel channelName :'+ channelName);
  pubnub.unsubscribe({
    channels: [channelName]
  });
};

PubnubHelper.prototype.addChannels = function (channelName,deviceId, deviceType, uniqueId) {
  let pushGateway = (deviceType.toLowerCase() === 'iOS'.toLowerCase() ? 'apns' : 'gcm');
  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.addChannels request obj:'+ JSON.stringify({channelName,deviceId,deviceType,pushGateway}));
  pubnub.push.addChannels(
    {
      channels: [channelName],
      device: deviceId,
      pushGateway: pushGateway // apns, gcm, mpns
    },
    function(status) {
      if (status.error) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'PubNub.addChannels message :'+ JSON.stringify(status));
      } else {
        module.exports.setChannelState({
          channelName: channelName,
          isInBackground: true,
          pushGateway: pushGateway,
          deviceId: deviceId,
          isUpdateToDB: true
        })
          .then(function (data) {

          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'PubNub.addChannels message: ' + JSON.stringify(err.message));
          });
      }
    }
  );
};

PubnubHelper.prototype.listChannels = function (deviceId, deviceType) {
  let pushGateway = (deviceType.toLowerCase() === 'iOS'.toLowerCase() ? 'apns' : 'gcm');
  pubnub.push.listChannels(
    {
      device: deviceId,
      pushGateway: pushGateway // apns, gcm, mpns
    },
    function (status, response) {
      if (status.error) {
        console.log("operation failed w/ error:", status);
        return;
      }

      console.log("listing push channel for device");
      response.channels.forEach( function (channel) {
        console.log(channel)
      })
    }
  );
};

PubnubHelper.prototype.removeChannels = function (channelName, deviceId, deviceType,uniqueId) {
  let pushGateway = (deviceType.toLowerCase() === 'iOS'.toLowerCase() ? 'apns' : 'gcm');
  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.removeChannels request obj:'+ JSON.stringify({channelName,deviceId,deviceType,pushGateway}));
  pubnub.push.removeChannels(
    {
      channels: [channelName],
      device: deviceId,
      pushGateway: pushGateway // apns, gcm, mpns
    },
    function(status) {
      if (status.error) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'PubNub.removeChannels message:'+ JSON.stringify(status));
      } else {
        module.exports.setChannelState({
          channelName: channelName,
          isInBackground: false,
          pushGateway: pushGateway,
          deviceId: deviceId,
          isUpdateToDB: true
        })
          .then(function (data) {

          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'PubNub.removeChannels message: ' + JSON.stringify(err.message));
          });
      }
    }
  );
};

PubnubHelper.prototype.deleteDevice = function (channelName, deviceId, deviceType,uniqueId) {
  let pushGateway = (deviceType.toLowerCase() === 'iOS'.toLowerCase() ? 'apns' : 'gcm');
  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.deleteDevice request obj:'+ JSON.stringify({channelName,deviceId,deviceType,pushGateway}));
  pubnub.push.deleteDevice(
    {
      device: deviceId,
      pushGateway: pushGateway // apns, gcm, mpns
    },
    function (status) {
      if (status.error) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'PubNub.deleteDevice message:'+ JSON.stringify(status));
      } else {
        module.exports.setChannelState({
          channelName: channelName,
          isInBackground: false,
          pushGateway: pushGateway,
          deviceId: deviceId,
          isUpdateToDB: true
        })
          .then(function (data) {

          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'PubNub.deleteDevice message: ' + JSON.stringify(err.message));
          });
      }
    }
  );
};

PubnubHelper.prototype.publishMessage = function(channelName, message, uniqueId) {
  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.PublishMessage channelName :'+ channelName);

  pubnub.getState({
      channels: [channelName]
    },
    function (status, response) {
      // handle status, response
      let pushGateway ='';
      let isInBackground = false;
      if (response && response.channels) {
        if (response.channels[channelName].isInBackground) {
          isInBackground = true;
        }
        if (response.channels[channelName].pushGateway) {
          pushGateway = response.channels[channelName].pushGateway;
        }
      }

      var messageObj = message;
      if (isInBackground) {
        if(pushGateway){
          let friendlyMessage = getPushNotificationMessageByStatus(message);
          if(pushGateway.toLowerCase() === 'APNS'.toLowerCase()){
            messageObj = {
              pn_apns: {
                aps: {
                  alert: friendlyMessage,
                  badge: 2,
                  topic: 'com.gruden.gygmicros',
                  message: message
                }
              },
              pn_debug: true
            };
          }
          else if(pushGateway.toLowerCase() === 'GCM'.toLowerCase()){
            messageObj = {
              pn_gcm: {
                data : {
                  summary: friendlyMessage,
                  message: message
                }
              },
              pn_debug: true
            };
          }
          else {
            messageObj = {
              pn_apns: {
                aps: {
                  alert: friendlyMessage,
                  badge: 2,
                  topic: 'com.gruden.gygmicros',
                  message: message
                }
              },
              pn_gcm: {
                data : {
                  summary: friendlyMessage,
                  message: message
                }
              },
              pn_debug: true
            };
          }

          let pubnubHelper = new PubnubHelper();
          pubnubHelper.subscribeChannel(channelName+'-pndebug');
        }
      }

      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.PublishMessage message: '+ JSON.stringify(messageObj));

      pubnub.publish({
          message:messageObj,
          channel: channelName,
          sendByPost: false, // true to send via post
          storeInHistory: false //override default storage options
        },
        function (status, response) {
          // handle status, response
          GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.PublishMessage status: '+ JSON.stringify(status));
        });
    });
};

PubnubHelper.prototype.customerLocationChange = function(obj) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: obj.orderNumber
  });
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering customerLocationChange...');
    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'customerLocationChange request: '+ JSON.stringify(obj));

    CommonHelper.getStoreCacheByStoreId(obj.storeId)
      .then(function (storeConfigObj) {
        if(!storeConfigObj){
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'customerLocationChange error: store config not found for storeId: ' + obj.storeId);
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting customerLocationChange...fail');
        }
        else {
          let storeLatitude = storeConfigObj.latitude;
          let storeLongitude = storeConfigObj.longitude;
          let deliveryZone = storeConfigObj.deliveryZone;
          let gmtOffset = storeConfigObj.gmtOffset;

          geoHelper.getGoogleDistanceMatrix(storeLatitude, storeLongitude, obj.customerLatitude, obj.customerLongitude, obj.modeOfTransport)
            .then(function (data) {
              let currentDate = CommonHelper.getCurrentGMTDateByOffset(gmtOffset);
              //Update customer location to database
              trackLocationInDatabase({
                customerId: obj.customerId,
                orderNumber: obj.orderNumber,
                customerLatitude: obj.customerLatitude,
                customerLongitude: obj.customerLongitude,
                sequence: obj.sequence,
                durationInSeconds: data.durationValue,
                distanceInMeters: data.distanceValue,
                currentDate: currentDate
              })
                .then(function (locationResponse) {
                  let distanceInMeters = data.distanceValue;
                  let orderChannelNames = CommonHelper.buildOrderChannelNames(obj.orderNumber);
                  let ddsListenChannelName = orderChannelNames.ddsListenChannelName;
                  let appListenChannelName = orderChannelNames.appListenChannelName;

                  //PubNub Connection
                  let pubnubHelper = new PubnubHelper();

                  //Publish customer location change message to DDS Listen channel
                  publishLocationChangeMessageToDDS({
                    customerId: obj.customerId,
                    orderNumber: obj.orderNumber,
                    customerLatitude: obj.customerLatitude,
                    customerLongitude: obj.customerLongitude,
                    sequence: obj.sequence,
                    storeLatitude: storeLatitude,
                    storeLongitude: storeLongitude,
                    durationInSeconds: data.durationValue,
                    distanceInMeters: data.distanceValue,
                    locationDateTime: currentDate,
                    ddsListenChannelName,
                    pubnubHelper
                  });

                  if (deliveryZone) {
                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'customerLocationChange deliveryZone: ' + JSON.stringify(deliveryZone));
                    if (deliveryZone.type) {
                      if (deliveryZone.type.toLowerCase() === 'radius') {
                        if (deliveryZone.radiusInMeter) {
                          let radiusInMeter = deliveryZone.radiusInMeter;
                          //If customer location is in circle of store location then update driveby request status to HereNow
                          if (distanceInMeters <= radiusInMeter) {
                            let newStatus = 'HereNow';
                            module.exports.updateStatusMessage({
                              customerId: obj.customerId,
                              orderNumber: obj.orderNumber,
                              newStatus
                            });
                          }
                          //let isCustomerInStore = geoHelper.isLocationPointInCircle(storeLatitude, storeLongitude, obj.customerLatitude, obj.customerLongitude, radiusInMeter);
                          //if (isCustomerInStore) { }
                        }
                      }
                      else if (deliveryZone.type.toLowerCase() === 'polygon') {
                        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'customerLocationChange message: Polygon deliveryZone not implemented.');
                      }
                    }
                  }

                  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'customerLocationChange message: Customer location change successfully.');
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting customerLocationChange...success');
                })
                .catch(function (err) {
                  if(err && err.message && err.message.indexOf('LocationIgnored') > -1) {
                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'customerLocationChange message: ' + JSON.stringify(err.message));
                  }
                  else {
                    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'customerLocationChange error: ' + JSON.stringify(err.message));
                  }
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting customerLocationChange...fail');
                });
            })
            .catch(function (err) {
              if(err && err.message && err.message.indexOf('ZERO_RESULTS') > -1) {
                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'customerLocationChange message: ' + JSON.stringify(err.message));
              }
              else {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'customerLocationChange error: ' + JSON.stringify(err.message));
              }
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting customerLocationChange...fail');
            });
        }
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'customerLocationChange error: ' + JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting customerLocationChange...fail');
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'customerLocationChange message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting customerLocationChange...fail');
  }
};


// export the class
module.exports.PubnubHelper = PubnubHelper;

module.exports.setChannelState = function(obj) {
  return new Promise(function (resolve, reject) {
    let uniqueId = obj.uniqueId;
    try{
      if(!pubnub) {
        let pubnubHelper = new PubnubHelper();
      }
      let channelName = obj.channelName;
      pubnub.getState({
          channels: [channelName]
        },
        function (status, response) {
          // handle status, response
          let deviceId = '';
          let isInBackground = false;
          let isSubscribed = false;
          let pushGateway = '';
          let orderNumber = '';

          if (response && response.channels) {
            if (response.channels[channelName].isSubscribed) {
              isSubscribed = true;
            }

            if (response.channels[channelName].isInBackground) {
              isInBackground = true;
            }

            if (response.channels[channelName].deviceId) {
              deviceId = response.channels[channelName].deviceId;
            }

            if (response.channels[channelName].pushGateway) {
              pushGateway = response.channels[channelName].pushGateway;
            }

            if (response.channels[channelName].orderNumber) {
              orderNumber = response.channels[channelName].orderNumber;
            }
          }

          if(obj.isSubscribed !== undefined && obj.isSubscribed !== null){
            isSubscribed = obj.isSubscribed;
          }
          if(obj.isInBackground !== undefined && obj.isInBackground !== null){
            isInBackground = obj.isInBackground;
          }
          if(obj.deviceId !== undefined && obj.deviceId !== null){
            deviceId = obj.deviceId;
          }
          if(obj.pushGateway !== undefined && obj.pushGateway !== null){
            pushGateway = obj.pushGateway;
          }

          let appStatus = isInBackground ? 'SleepNow' : 'ActiveNow';

          let channelState = {
            isSubscribed: isSubscribed,
            isInBackground: isInBackground,
            deviceId: deviceId,
            pushGateway: pushGateway,
            orderNumber: orderNumber
          };
          GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'setChannelState obj: '+ JSON.stringify(channelState));

          pubnub.setState({
            state: channelState,
            channels: [channelName]
          }).then((response) => {
            if(obj.isUpdateToDB && pushGateway && pushGateway.toLowerCase() === 'APNS'.toLowerCase()) {
              if (isInBackground) {
                setiOSBackgroundChannelInCache(channelName);
              }
              else {
                removeiOSBackgroundChannelFromCache(channelName);
              }
            }

            if(orderNumber && obj.isUpdateToDB){
              db.DriveByRequest.update({
                  appStatus: appStatus
                },
                {
                  where: {
                    orderNumber: obj.orderNumber
                  }
                })
                .then(function (updatedRecord) {
                  return resolve(updatedRecord);
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'setChannelState message :' + err.message);
                  return reject(err);
                });
            }
            else {
              // set status success
              return resolve(response);
            }
          }).catch((err) => {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'setChannelState message :' + err.message);
            return reject(err);
          });
        });
    }
    catch (err){
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'setChannelState message :' + err.message);
      return reject(err);
    }
  });
};

module.exports.updateStatusMessage = function(obj) {
  return new Promise(function (resolve, reject) {
    let uniqueId = CommonHelper.getUniqueIdFromCache({
      orderNumber: obj.orderNumber
    });
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering updateStatusMessage...');

    CommonHelper.getStoreCacheByOrderNumber(obj.orderNumber)
      .then(function (storeConfig) {
        try{
          let storeName = '';
          let gmtOffset = '';
          var currentDate = moment(Date.now());
          if(storeConfig && storeConfig.gmtOffset){
            gmtOffset = storeConfig.gmtOffset;
            currentDate = CommonHelper.getCurrentGMTDateByOffset(gmtOffset);
            storeName = storeConfig.storeName;
          }

          let newStatus = obj.newStatus;
          if(newStatus.toLowerCase() === 'Delivered'.toLowerCase()){
            newStatus = 'Completed';
          }

          db.DriveByRequest.find({
            attributes: ['orderNumber','customerId','storeName','status','isRunningLate','actionDateTime','requestDateTime','hereNowDateTime','pickUpDate','pickUpTime','deliveryInProgressDateTime','updatedAt'],
            where: {
              orderNumber: obj.orderNumber
            }
          })
            .then(function (existingDriveByRequest) {
              if(!existingDriveByRequest){
                //Remove order from ActiveDriveByRequest cache
                removeActiveDriveByRequestsCache(storeName, obj.orderNumber);
                throw new Error('DriveByRequest not found in DB for OrderNumber :' + obj.orderNumber);
              }

              if(newStatus.toLowerCase() === "HereNow".toLowerCase()){
                existingDriveByRequest.hereNowDateTime = currentDate;
              }

              if(newStatus.toLowerCase() === "DeliveryInProgress".toLowerCase()){
                existingDriveByRequest.deliveryInProgressDateTime = currentDate;
              }

              let diffInSeconds = 0;
              if(newStatus.toLowerCase() === "Completed".toLowerCase()){
                if(existingDriveByRequest.hereNowDateTime){
                  var hereNowDateTime = existingDriveByRequest.hereNowDateTime;
                  if(gmtOffset){
                    hereNowDateTime = CommonHelper.convertDateToGMT(existingDriveByRequest.hereNowDateTime,gmtOffset);
                  }
                  let duration = moment.duration(currentDate.diff(hereNowDateTime));
                  diffInSeconds = duration.asSeconds();
                }
              }

              if(newStatus.toLowerCase() === "RunningLate".toLowerCase()){
                existingDriveByRequest.isRunningLate = true;
              }

              existingDriveByRequest.status = newStatus;
              existingDriveByRequest.actionDateTime = currentDate;
              existingDriveByRequest.updatedAt = currentDate;

              existingDriveByRequest
                .save()
                .then(function (updatedRecord) {
                  //Insert/Update new request in active DriveByRequest cache
                  CommonHelper.setActiveDriveByRequestsCache({
                    orderNumber: existingDriveByRequest.orderNumber,
                    customerId: existingDriveByRequest.customerId,
                    storeName: existingDriveByRequest.storeName,
                    status: existingDriveByRequest.status,
                    isRunningLate: existingDriveByRequest.isRunningLate,
                    requestDateTime: existingDriveByRequest.requestDateTime,
                    hereNowDateTime: existingDriveByRequest.hereNowDateTime,
                    actionDateTime: existingDriveByRequest.actionDateTime,
                    pickUpDate: existingDriveByRequest.pickUpDate,
                    pickUpTime: existingDriveByRequest.pickUpTime,
                    locationStatus: existingDriveByRequest.locationStatus
                  });

                  let storeControlChannelName = CommonHelper.buildStoreControlChannelName(existingDriveByRequest.storeName);
                  let orderChannelNames = CommonHelper.buildOrderChannelNames(obj.orderNumber);
                  let ddsListenChannelName = orderChannelNames.ddsListenChannelName;
                  let appListenChannelName = orderChannelNames.appListenChannelName;
                  let appListenPresenceChannelName = orderChannelNames.appListenPresenceChannelName;
                  let appLocationChannelName = orderChannelNames.appLocationChannelName;

                  //PubNub Connection
                  let pubnubHelper = new PubnubHelper();

                  publishStatusChangeMessage({
                    customerId: obj.customerId,
                    orderNumber: obj.orderNumber,
                    newStatus: newStatus,
                    ddsListenChannelName,
                    appListenChannelName,
                    pubnubHelper,
                    currentDate
                  });

                  //When order completed unsubscribe mobile app channels
                  if(existingDriveByRequest.status && existingDriveByRequest.status.toLowerCase() === 'Completed'.toLowerCase()){
                      pubnubHelper.unsubscribeChannel(appListenPresenceChannelName, uniqueId);
                      pubnubHelper.unsubscribeChannel(appLocationChannelName, uniqueId);
                  }

                  if(diffInSeconds > 0) {
                    publishUpdateAvgWaitTimeMessageToDDS({
                      customerId: obj.customerId,
                      orderNumber: obj.orderNumber,
                      diffInSeconds,
                      pubnubHelper,
                      ddsListenChannelName,
                      storeControlChannelName
                    });
                  }

                  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'updateStatusMessage message: Status updated in database.');
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateStatusMessage...success');
                  return resolve(updatedRecord);
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateStatusMessage message: '+ JSON.stringify(err.message));
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateStatusMessage...fail');
                  return reject(err);
                });
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateStatusMessage message: '+ JSON.stringify(err.message));
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateStatusMessage...fail');
              return reject(err);
            });
        }
        catch (err){
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateStatusMessage message: '+ JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateStatusMessage...fail');
          return reject(err);
        }
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateStatusMessage message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateStatusMessage...fail');
        return reject(err);
      });
  });
};

module.exports.publishSilentNotificationMessage = function(channelName) {
  let uniqueId = channelName;
  if(!pubnub) {
    let pubnubHelper = new PubnubHelper();
  }
  pubnub.getState({
      channels: [channelName]
    },
    function (status, response) {
      // handle status, response
      let pushGateway ='';
      let isInBackground = false;
      if (response && response.channels) {
        if (response.channels[channelName].isInBackground) {
          isInBackground = true;
        }
        if (response.channels[channelName].pushGateway) {
          pushGateway = response.channels[channelName].pushGateway;
        }
      }

      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.publishSilentNotificationMessage obj: '+ JSON.stringify({channelName, isInBackground, pushGateway}));

      if (isInBackground) {
        if(pushGateway){
          if(pushGateway.toLowerCase() === 'APNS'.toLowerCase()){
            let messageObj = {
              pn_apns: {
                aps: {
                  badge: 0,
                  topic: 'com.gruden.gygmicros',
                  message: {
                    messageType: "updateLocationRequest"
                  }
                }
              },
              pn_debug: true
            };

            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.publishSilentNotificationMessage message: '+ JSON.stringify(messageObj));

            pubnub.publish({
                message:messageObj,
                channel: channelName,
                sendByPost: false, // true to send via post
                storeInHistory: false //override default storage options
              },
              function (status, response) {
                // handle status, response
                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'PubNub.publishSilentNotificationMessage status: '+ JSON.stringify(status));
              });
          }
        }
      }
    });
};

module.exports.publishLocationChangeFrequencyMessage = function(obj) {
  return new Promise(function (resolve, reject) {
      let uniqueId = CommonHelper.getUniqueIdFromCache({
          orderNumber: obj.orderNumber
      });
      try {
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering publishLocationChangeFrequencyMessage...');

          let orderChannelNames = CommonHelper.buildOrderChannelNames(obj.orderNumber);
          let pubnubHelper = new PubnubHelper();
          let publishMessageObj = {
              messageType: 'locationChangeFrequency',
              data: {
                  status: obj.status,
                  locationSettings: {
                      frequencyInSeconds: obj.frequencyInSeconds
                  },
                  order: {
                      customerId: obj.customerId,
                      orderNumber: obj.orderNumber
                  }
              }
          };

          GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'publishLocationChangeFrequencyMessage message: ' + JSON.stringify(publishMessageObj));

          //Publish update status message to mobile app listen channel
          pubnubHelper.publishMessage(orderChannelNames.appListenChannelName, publishMessageObj, uniqueId);

          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting publishLocationChangeFrequencyMessage...success');

          return resolve({status: 'success'});
      }
      catch (err){
          return reject(err);
      }
  });
};
