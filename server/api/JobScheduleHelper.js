/**
 * Job Schedule helper module for call functions automatically by particular duration
 */

'use strict';

import schedule from 'node-schedule';
import db from '../sqldb';
import moment from 'moment';
import AwsS3Helper from './AwsS3Helper';
import config from '../config/environment';
import GyGLog from '../logging/GyGLog';
import {CommonHelper, removeiOSBackgroundChannelFromCache, updateLocationStatus} from './CommonHelper';
import geoTz  from 'geo-tz';
import {updateStatusMessage,publishSilentNotificationMessage,publishLocationChangeFrequencyMessage} from './PubnubHelper';
import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';

//Global Job Object
var jobEveryTenSeconds;
var jobEveryOneMinute;
var jobEveryThreeMinutes;
var jobEveryFiveMinutes;
var jobEveryThreeHours;
var jobEveryOneHour;
var jobEveryOneDay;

class JobScheduleHelper {
  static InitJobSchedule() {
    try {
      JobScheduleHelper.CallMethodEveryTenSeconds();
      JobScheduleHelper.CallMethodEveryOneMinute();
      JobScheduleHelper.CallMethodEveryThreeMinutes();
      JobScheduleHelper.CallMethodEveryFiveMinutes();
      JobScheduleHelper.CallMethodEveryOneHour();
      JobScheduleHelper.CallMethodEveryThreeHours();
      JobScheduleHelper.CallMethodEveryOneDay();
    }
    catch (err) {
    }
  }

  static CallMethodEveryTenSeconds() {
    try {
      if (jobEveryTenSeconds) {
        jobEveryTenSeconds.cancel();
      }

      //Call method every 10 seconds
      jobEveryTenSeconds = schedule.scheduleJob('*/10 * * * * *', function () {
        JobScheduleHelper.calculateRunningLateForAllStore();
      });
    }
    catch (err) {
    }
  }

  static CallMethodEveryOneMinute() {
    try {
      if (jobEveryOneMinute) {
        jobEveryOneMinute.cancel();
      }

      //Call method every 1 minute
      jobEveryOneMinute = schedule.scheduleJob('*/1 * * * *', function () {
        //Method Calling
        JobScheduleHelper.locationChangeFrequencyForAllStore();
      });
    }
    catch (err) {
    }
  }

  static CallMethodEveryThreeMinutes() {
    try {
      if (jobEveryThreeMinutes) {
        jobEveryThreeMinutes.cancel();
      }

      //Call method every 3 minutes
      jobEveryThreeMinutes = schedule.scheduleJob('*/3 * * * *', function () {
        //Method Calling
        JobScheduleHelper.sendSilentPushNotificationToiOSDevice();
      });
    }
    catch (err) {
    }
  }

  static CallMethodEveryFiveMinutes() {
    try {
      if (jobEveryFiveMinutes) {
        jobEveryFiveMinutes.cancel();
      }

      //Call method every 5 minutes
      jobEveryFiveMinutes = schedule.scheduleJob('*/5 * * * *', function () {
        //Method Calling
      });
    }
    catch (err) {
    }
  }

  static CallMethodEveryOneHour() {
    try {
      if (jobEveryOneHour) {
        jobEveryOneHour.cancel();
      }

      //Call method every 1 hour
      jobEveryOneHour = schedule.scheduleJob('0 */1 * * *', function () {
        JobScheduleHelper.clearCacheForAllStore();
        JobScheduleHelper.checkUnprocessedRequestsForAllStore();
      });
    }
    catch (err) {
    }
  }

  static CallMethodEveryThreeHours() {
    try {
      if (jobEveryThreeHours) {
        jobEveryThreeHours.cancel();
      }

      //Call method every 3 hour
      jobEveryThreeHours = schedule.scheduleJob('0 */3 * * *', function () {
        JobScheduleHelper.updateAppUserAvatarUrlExpiration();
      });
    }
    catch (err) {
    }
  }

  static CallMethodEveryOneDay() {
    try {
      if (jobEveryOneDay) {
        jobEveryOneDay.cancel();
      }

      //Call method every 1 day at 1 AM
      let rule = new schedule.RecurrenceRule();
      rule.hour = 1;
      rule.minute = 0;

      jobEveryOneDay = schedule.scheduleJob(rule, function () {
        JobScheduleHelper.updateGMTOffsetOfStore();
        JobScheduleHelper.updateStoreUserAvatarUrlExpiration();
        JobScheduleHelper.removeOldLogs();
      });
    }
    catch (err) {
    }
  }

  /// Get records with expired appUserAvatar url
  /// Get new aws url for it and update to database
  static updateAppUserAvatarUrlExpiration() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering updateAppUserAvatarUrlExpiration...');

      let dateString = moment(Date.now()).add(1, 'days').format('YYYY-MM-DD');
      let dateEnd = moment(dateString + ' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();

      db.DriveByRequest.findAll({
        attributes: ['orderNumber', 'customerId', 'storeName', 'userAvatar', 'userAvatarS3Key', 'userAvatarUrlExpiration'],
        limit: 100,
        where: {
          userAvatar: {
            [db.Op.ne]: null
          },
          userAvatarUrlExpiration: {
            [db.Op.lt]: dateEnd
          }
        }
      })
        .then(function (driveByRequests) {
          GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'updateAppUserAvatarUrlExpiration message: appUserAvatar found expired url records: ' + driveByRequests.length);

          let awsS3Helper = new AwsS3Helper();
          let bucketName = config.awsS3Bucket.BucketName;

          driveByRequests.map(driveByRequestItem => {
            let avatarFileNamePath = driveByRequestItem.userAvatarS3Key;
            awsS3Helper.getFileUrl(bucketName, avatarFileNamePath)
              .then(function (urlResponse) {
                driveByRequestItem.userAvatar = urlResponse.url;
                driveByRequestItem.userAvatarUrlExpiration = urlResponse.urlExpiration;

                driveByRequestItem
                  .save()
                  .then(function (data) {
                    //update url to database success
                  })
                  .catch(function (err) {
                    //update url to database error
                    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateAppUserAvatarUrlExpiration message: ' + JSON.stringify(err.message));
                  });
              })
              .catch(function (err) {
                //getFileUrl error
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateAppUserAvatarUrlExpiration message: ' + JSON.stringify(err.message));
              });
          });

          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateAppUserAvatarUrlExpiration...success');
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateAppUserAvatarUrlExpiration message: ' + JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateAppUserAvatarUrlExpiration...fail');
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateAppUserAvatarUrlExpiration message: ' + JSON.stringify(err.message));
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateAppUserAvatarUrlExpiration...fail');
    }
  }

  /// Get records with expired store UserAvatar url
  /// Get new aws url for it and update to database
  static updateStoreUserAvatarUrlExpiration() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering updateStoreUserAvatarUrlExpiration...');

      let dateString = moment(Date.now()).add(1, 'days').format('YYYY-MM-DD');
      let dateEnd = moment(dateString + ' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();

      db.StoreUsers.findAll({
        attributes: ['userId', 'userAvatar', 'userAvatarS3Key', 'userAvatarUrlExpiration'],
        limit: 100,
        where: {
          userAvatar: {
            [db.Op.ne]: null
          },
          userAvatarUrlExpiration: {
            [db.Op.lt]: dateEnd
          }
        }
      })
        .then(function (storeUsers) {
          GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'updateStoreUserAvatarUrlExpiration message: Store UserAvatar found expired url records: ' + storeUsers.length);

          let awsS3Helper = new AwsS3Helper();
          let bucketName = config.awsS3Bucket.BucketName;

          storeUsers.map(storeUserItem => {
            let avatarFileNamePath = storeUserItem.userAvatarS3Key;
            awsS3Helper.getFileUrl(bucketName, avatarFileNamePath)
              .then(function (urlResponse) {
                storeUserItem.userAvatar = urlResponse.url;
                storeUserItem.userAvatarUrlExpiration = urlResponse.urlExpiration;

                storeUserItem
                  .save()
                  .then(function (data) {
                    //update url to database success
                  })
                  .catch(function (err) {
                    //update url to database error
                    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateStoreUserAvatarUrlExpiration message: ' + JSON.stringify(err.message));
                  });
              })
              .catch(function (err) {
                //getFileUrl error
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateStoreUserAvatarUrlExpiration message: ' + JSON.stringify(err.message));
              });
          });

          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateStoreUserAvatarUrlExpiration...success');
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateStoreUserAvatarUrlExpiration message: ' + JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateStoreUserAvatarUrlExpiration...fail');
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateStoreUserAvatarUrlExpiration message: ' + JSON.stringify(err.message));
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting updateStoreUserAvatarUrlExpiration...fail');
    }
  }

  static calculateRunningLateForAllStore() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      CommonHelper.getActiveStoresFromCache()
        .then(function (activeStores) {
          if (activeStores && activeStores.length > 0) {
            activeStores.map(store => {
              JobScheduleHelper.calculateRunningLate(store);
            });
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'calculateRunningLateForAllStore message: ' + JSON.stringify(err.message));
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'calculateRunningLateForAllStore message: ' + JSON.stringify(err.message));
    }
  }

  /// Calculate RunningLate status if pickup time passes away
  static calculateRunningLate(storeName) {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      CommonHelper.getStoreCacheByStoreName(storeName)
        .then(function (storeCache) {
          let gmtOffset = '';
          if (storeCache && storeCache.gmtOffset) {
            gmtOffset = storeCache.gmtOffset;
          }

          let currentDate = moment(Date.now());
          if (gmtOffset) {
            currentDate = CommonHelper.getCurrentGMTDateByOffset(gmtOffset);
          }

          CommonHelper.getActiveDriveByRequestsCache(storeName)
            .then(function (driveByRequestsCacheObj) {
              if (driveByRequestsCacheObj) {
                driveByRequestsCacheObj.map(item => {
                  if (item.status.toLowerCase() !== 'RunningLate'.toLowerCase() && !item.isRunningLate && !item.hereNowDateTime) {
                    let pickupInTimeInSeconds = CommonHelper.calculatePickupInTimeInSeconds(item.pickUpTime, currentDate);
                    if (pickupInTimeInSeconds <= 0) {
                      var messageObj = {
                        orderNumber: item.orderNumber,
                        pickUpTime: item.pickUpTime,
                        currentTime: currentDate.format('HH:mm:ss')
                      };
                      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'calculateRunningLate message: ' + JSON.stringify(messageObj));
                      //Move to RunningLate
                      let newStatus = 'RunningLate';

                      updateStatusMessage({
                        customerId: item.customerId,
                        orderNumber: item.orderNumber,
                        newStatus: newStatus
                      })
                        .then(function (updatedRecords) {
                          //Move to RunningLate success
                        })
                        .catch(function (err) {
                          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'calculateRunningLate message: ' + JSON.stringify(err.message));
                        });
                    }
                  }
                });
              }
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'calculateRunningLate message: ' + JSON.stringify(err.message));
            });
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'calculateRunningLate message: ' + JSON.stringify(err.message));
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'calculateRunningLate message: ' + JSON.stringify(err.message));
    }
  }

  //Update timezone offset in store configuration
  static updateGMTOffsetOfStore() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      db.Stores.findAll({
        attributes: ['storeId', 'latitude', 'longitude', 'gmtOffset', 'updatedAt']
      })
        .then(function (stores) {
          stores.map(store => {
            if (store.latitude && store.longitude) {
              let now = geoTz.tzMoment(store.latitude, store.longitude);
              if (now) {
                let gmtOffset = now.format('ZZ');

                if (store.gmtOffset !== gmtOffset) {
                  //Assign new gmtOffset
                  store.gmtOffset = gmtOffset;
                  store.updatedAt = now;

                  store
                    .save()
                    .then(function (saveResult) {
                      //GMT Offset update success
                    })
                    .catch(function (err) {
                      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateGMTOffsetOfStore message: ' + JSON.stringify(err.message));
                    });
                }
              }
            }
          });
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateGMTOffsetOfStore message: ' + JSON.stringify(err.message));
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateGMTOffsetOfStore message: ' + JSON.stringify(err.message));
    }
  }

  //Send silent push notification to iOS mobile device
  static sendSilentPushNotificationToiOSDevice() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      CommonHelper.getiOSBackgroundChannelsFromCache()
        .then(function (backgroundChannels) {
          if (backgroundChannels) {
            backgroundChannels.map(channel => {
              publishSilentNotificationMessage(channel);
            });
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'sendSilentPushNotificationToiOSDevice message: ' + JSON.stringify(err.message));
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'sendSilentPushNotificationToiOSDevice message: ' + JSON.stringify(err.message));
    }
  }

  static clearCacheForAllStore() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      CommonHelper.getActiveStoresFromCache()
        .then(function (activeStores) {
          if (activeStores && activeStores.length > 0) {
            activeStores.map(store => {
              JobScheduleHelper.clearCacheForStore(store);
            });
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'clearCacheForAllStore message: ' + JSON.stringify(err.message));
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'clearCacheForAllStore message: ' + JSON.stringify(err.message));
    }
  }

  static clearCacheForStore(storeName) {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      if (storeName) {
        CommonHelper.getCurrentGMTDateByStoreName(storeName)
          .then(function (currentDate) {
            GyGLog.writeLog('clearCacheForStore storeName: ' + storeName + ' HH:' + currentDate.format('HH'));
            if (currentDate.format('HH') === '00') {
              //Remove Active DriveBy requests cache
              let cacheKey1 = CommonHelper.buildCacheKeyForActiveDriveByRequests(storeName);
              CommonHelper.deleteCache(cacheKey1);

              //Remove iOS background channels from cache
              let currentDateString = currentDate.add(-1, 'days').format('YYYY-MM-DD');
              let currentDateStart = moment(currentDateString + ' 00:00:00 AM', 'YYYY-MM-DD hh:mm:ss A').toDate();
              let currentDateEnd = moment(currentDateString + ' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();

              db.DriveByRequest.findAll({
                attributes: ['orderNumber'],
                where: {
                  storeName: storeName,
                  appStatus: 'SleepNow',
                  deviceType: 'iOS',
                  status: {
                    [db.Op.notIn]: ['Cancelled', 'Completed']
                  },
                  hereNowDateTime: {
                    [db.Op.eq]: null
                  },
                  RequestDateTime: {
                    [db.Op.lt]: currentDateEnd,
                    [db.Op.gte]: currentDateStart
                  },
                }
              })
                .then(function (driveByRequests) {
                  driveByRequests.map(driveByRequest => {
                    let orderChannelNames = CommonHelper.buildOrderChannelNames(driveByRequest.orderNumber);
                    removeiOSBackgroundChannelFromCache(orderChannelNames.appListenChannelName);
                  });
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'clearCacheForStore message: ' + JSON.stringify(err.message));
                });
            }
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'clearCacheForStore message: ' + JSON.stringify(err.message));
          });
      }
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'clearCacheForStore message: ' + JSON.stringify(err.message));
    }
  }

  static checkUnprocessedRequestsForAllStore() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      CommonHelper.getActiveStoresFromCache()
        .then(function (activeStores) {
          if (activeStores && activeStores.length > 0) {
            activeStores.map(store => {
              JobScheduleHelper.checkUnprocessedRequestsForStore(store);
            });
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'checkUnprocessedRequestsForAllStore message: ' + JSON.stringify(err.message));
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'checkUnprocessedRequestsForAllStore message: ' + JSON.stringify(err.message));
    }
  }

  static checkUnprocessedRequestsForStore(storeName) {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      if (storeName) {
        CommonHelper.getCurrentGMTDateByStoreName(storeName)
          .then(function (currentDate) {
            GyGLog.writeLog('checkUnprocessedRequestsForStore storeName: ' + storeName + ' HH:' + currentDate.format('HH'));
            if (currentDate.format('HH') === '00') {
              //Find all unprocessed driveby requests
              let currentDateString = currentDate.add(-1, 'days').format('YYYY-MM-DD');
              let currentDateStart = moment(currentDateString + ' 00:00:00 AM', 'YYYY-MM-DD hh:mm:ss A').toDate();
              let currentDateEnd = moment(currentDateString + ' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();

              db.DriveByRequest.findAll({
                attributes: ['orderNumber', 'customerId', 'status', 'updatedAt'],
                where: {
                  storeName: storeName,
                  status: {
                    [db.Op.notIn]: ['Cancelled', 'Completed']
                  },
                  RequestDateTime: {
                    [db.Op.lt]: currentDateEnd,
                    [db.Op.gte]: currentDateStart
                  }
                }
              })
                .then(function (driveByRequests) {
                  driveByRequests.map(driveByRequest => {
                    driveByRequest.status = 'Unprocessed';
                    driveByRequest.updatedAt = currentDate;

                    driveByRequest
                      .save()
                      .then(function (savedRecord) {
                        //Record updated

                      })
                      .catch(function (err) {
                        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'checkUnprocessedRequestsForStore message: ' + JSON.stringify(err.message));
                      });
                  });
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'checkUnprocessedRequestsForStore message: ' + JSON.stringify(err.message));
                });
            }
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'checkUnprocessedRequestsForStore message: ' + JSON.stringify(err.message));
          });
      }
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'checkUnprocessedRequestsForStore message: ' + JSON.stringify(err.message));
    }
  }

  static removeOldLogs() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      let uploadsDir = config.gygLogSettings.logFile.filePath;
      let milliSeconds = 1000 * 60 * 60 * 24 * 7; //7 days old

      fs.readdir(uploadsDir, function (err, files) {
        files.forEach(function (file, index) {
          fs.stat(path.join(uploadsDir, file), function (err, stat) {
            var endTime, now;
            if (err) {
              return console.error(err);
            }
            now = new Date().getTime();
            endTime = new Date(stat.ctime).getTime() + milliSeconds;
            if (now > endTime) {
              return rimraf(path.join(uploadsDir, file), function (err) {
                if (err) {
                  return console.error(err);
                }
              });
            }
          });
        });
      });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'RemoveOldLogs message: ' + JSON.stringify(err.message));
    }
  }

  static locationChangeFrequencyForAllStore() {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      CommonHelper.getActiveStoresFromCache()
        .then(function (activeStores) {
          if (activeStores && activeStores.length > 0) {
            activeStores.map(store => {
              JobScheduleHelper.locationChangeFrequencyForStore(store);
            });
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'locationChangeFrequencyForAllStore message: ' + JSON.stringify(err.message));
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'locationChangeFrequencyForAllStore message: ' + JSON.stringify(err.message));
    }
  }

  /// send locationChangeFrequency pubnub message if pickup time less than 30 minutes
  static locationChangeFrequencyForStore(storeName) {
    let uniqueId = CommonHelper.getNewUniqueId();
    try {
      CommonHelper.getStoreCacheByStoreName(storeName)
        .then(function (storeCache) {
          if (storeCache) {
            let gmtOffset = '';
            if (storeCache.gmtOffset) {
              gmtOffset = storeCache.gmtOffset;
            }

            let minPickupTimeLeftInSeconds = config.locationSettings.minPickupTimeLeftInSeconds;
            let frequencyOutsideInSecs = config.locationSettings.frequencyOutsideInSecs;
            if (storeCache.frequencyOutsideInSecs) {
              frequencyOutsideInSecs = storeCache.frequencyOutsideInSecs;
            }

            let currentDate = moment(Date.now());
            if (gmtOffset) {
              currentDate = CommonHelper.getCurrentGMTDateByOffset(gmtOffset);
            }

            CommonHelper.getActiveDriveByRequestsCache(storeName)
              .then(function (driveByRequestsCacheObj) {
                if (driveByRequestsCacheObj) {
                  driveByRequestsCacheObj.map(item => {
                    if (!item.hereNowDateTime) {
                      let isInsidePickupTime = true;
                      if (!item.locationStatus || item.locationStatus.toLowerCase() === 'OutsidePickupTime'.toLowerCase()) {
                        isInsidePickupTime = false;
                      }
                      if (!isInsidePickupTime) {
                        let pickupInTimeInSeconds = CommonHelper.calculatePickupInTimeInSeconds(item.pickUpTime, currentDate);
                        if (pickupInTimeInSeconds <= minPickupTimeLeftInSeconds) {
                          var messageObj = {
                            orderNumber: item.orderNumber,
                            pickUpTime: item.pickUpTime,
                            currentTime: currentDate.format('HH:mm:ss')
                          };
                          GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'locationChangeFrequencyForStore message: ' + JSON.stringify(messageObj));

                          let locationStatus = 'InsidePickupTime';
                          module.exports.processLocationChangeFrequencyForOrder({
                            storeName: item.storeName,
                            customerId: item.customerId,
                            orderNumber: item.orderNumber,
                            locationStatus,
                            frequencyInSeconds: frequencyOutsideInSecs,
                            currentDate
                          })
                            .then(function (data) {
                              //success
                            })
                            .catch(function (err) {
                              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'locationChangeFrequencyForStore message: ' + JSON.stringify(err.message));
                            });
                        }
                      }
                    }
                  });
                }
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'locationChangeFrequencyForStore message: ' + JSON.stringify(err.message));
              });
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'locationChangeFrequencyForStore message: ' + JSON.stringify(err.message));
        });
    }
    catch (err) {
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'locationChangeFrequencyForStore message: ' + JSON.stringify(err.message));
    }
  }

}

// export the class
module.exports = JobScheduleHelper;

module.exports.processLocationChangeFrequencyForOrder = function (obj) {
  return new Promise(function (resolve, reject) {
    let uniqueId = CommonHelper.getUniqueIdFromCache({orderNumber: obj.orderNumber});
    publishLocationChangeFrequencyMessage({
      customerId: obj.customerId,
      orderNumber: obj.orderNumber,
      status: obj.locationStatus,
      frequencyInSeconds: obj.frequencyInSeconds
    })
      .then(function (data) {
        updateLocationStatus({
          storeName: obj.storeName,
          customerId: obj.customerId,
          orderNumber: obj.orderNumber,
          locationStatus: obj.locationStatus,
          currentDate: obj.currentDate
        })
          .then(function (data) {
            //success
            return resolve(data);
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'processLocationChangeFrequencyForOrder message: ' + JSON.stringify(err.message));
            return reject(err);
          });
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'processLocationChangeFrequencyForOrder message: ' + JSON.stringify(err.message));
        return reject(err);
      });
  });
};
