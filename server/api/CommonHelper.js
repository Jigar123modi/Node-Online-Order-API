/**
 * Common helper module for share common functions
 */

'use strict';

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken';
import config from '../config/environment';
import moment from 'moment';
import CacheHelper  from './CacheHelper';
import db from '../sqldb';
import GyGLog from '../logging/GyGLog';
import Guid from 'guid';
import randomColor from 'randomcolor';
import {setChannelState} from './PubnubHelper';
import MailHelper from './MailHelper';
import fs from 'fs';
import UtilityHelper from './UtilityHelper';

class CommonHelper {
  static normalizeString (textValue) {
    if(textValue) {
      return textValue.replace(/[^a-zA-Z0-9]/g, '');
    }
    else {
      return textValue;
    }
  }

  static normalizeChannelName (channelName) {
    var env = config.pubnub.channelPrefix;
    return env + '_' + CommonHelper.normalizeString(channelName);
  }

  static buildStoreControlChannelName (storeName) {
    return CommonHelper.normalizeChannelName(storeName) + '_channel';
  }

  static buildOrderChannelNames (orderNumber) {
    return {
      appLocationChannelName: CommonHelper.normalizeChannelName(orderNumber) + '_appLocation',
      appListenChannelName: CommonHelper.normalizeChannelName(orderNumber) + '_appListen',
      ddsListenChannelName: CommonHelper.normalizeChannelName(orderNumber) + '_ddsListen',
      apiListenChannelName: CommonHelper.normalizeChannelName(orderNumber) + '_apiListen',
      appListenPresenceChannelName: CommonHelper.normalizeChannelName(orderNumber) + '_appListen-pnpres',
    };
  }

  static hashPassword (plainPassword) {
    const saltRounds = 10;
    var salt = bcrypt.genSaltSync(saltRounds);
    var hash = bcrypt.hashSync(plainPassword, salt);
    return {salt,hash};
  }

  static comparePassword (plainPassword,hashPassword) {
    var isValid = bcrypt.compareSync(plainPassword, hashPassword);
    return isValid;
  }

  static generateToken (data) {
    var expiresIn= 60*60*24; // expires in 24 hours
    var issued= moment(Date.now());
    var token = jwt.sign(data, config.jwtSecretKey, {
      expiresIn : expiresIn
    });

    var expires = moment(issued).add(expiresIn,'seconds');

    return {
      token,
      expiresIn,
      issued,
      expires
    };
  }

  static parseDeliveryZone(obj) {
    let emptyObj = null;
    try {
      if (obj) {
        return JSON.parse(obj);
      }
      else {
        return emptyObj;
      }
    }
    catch(err) {
      return emptyObj;
    }
  }

  static convertMinsToHrsMins (minutes) {
    let h = Math.floor(minutes / 60);
    let m = minutes % 60;
    h = h < 10 ? '0' + h : h;
    m = m < 10 ? '0' + m : m;
    return h + ':' + m;
  }

  static convertSecsToHrsMinsSecs(totalSeconds){
    let hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = Math.floor(totalSeconds % 60);

    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;

    return hours + ':' + minutes + ':' + seconds;
  }

  static convertDateToGMT(date,gmtOffset){
    try{
      if(date && gmtOffset) {
        return moment(date).utcOffset(gmtOffset);
      }
      else {
        return date;
      }
    }
    catch (err){
      return date;
    }
  }

  static getCurrentGMTDateByOffset(gmtOffset){
    try{
      if(gmtOffset) {
        return moment(Date.now()).utcOffset(gmtOffset);
      }
      else {
        return moment(Date.now());
      }
    }
    catch (err){
      return moment(Date.now());
    }
  }

  static getCurrentGMTDateByStoreId(storeId){
    return new Promise(function (resolve,reject) {
      CommonHelper.getStoreCacheByStoreId(storeId)
        .then(function (storeObj) {
          if(storeObj && storeObj.gmtOffset){
            let currentDate = CommonHelper.getCurrentGMTDateByOffset(storeObj.gmtOffset);
            return resolve(currentDate);
          }
          else {
            return resolve(moment(Date.now()));
          }
        })
        .catch(function (err) {
          return resolve(moment(Date.now()));
        });
    });
  }

  static getCurrentGMTDateByStoreName(storeName){
    return new Promise(function (resolve,reject) {
      CommonHelper.getStoreCacheByStoreName(storeName)
        .then(function (storeObj) {
          if(storeObj && storeObj.gmtOffset){
            let currentDate = CommonHelper.getCurrentGMTDateByOffset(storeObj.gmtOffset);
            return resolve(currentDate);
          }
          else {
            return resolve(moment(Date.now()));
          }
        })
        .catch(function (err) {
          return resolve(moment(Date.now()));
        });
    });
  }

  static getCurrentGMTDateByOrderNumber(orderNumber){
    return new Promise(function (resolve,reject) {
      CommonHelper.getOrderCache(orderNumber)
        .then(function (orderObj) {
          if(orderObj && orderObj.storeId) {
            CommonHelper.getStoreCacheByStoreId(orderObj.storeId)
              .then(function (storeObj) {
                if (storeObj && storeObj.gmtOffset) {
                  let currentDate = CommonHelper.getCurrentGMTDateByOffset(storeObj.gmtOffset);
                  return resolve(currentDate);
                }
                else {
                  return resolve(moment(Date.now()));
                }
              })
              .catch(function (err) {
                return resolve(moment(Date.now()));
              });
          }
          else if(orderObj && orderObj.storeName) {
            CommonHelper.getStoreCacheByStoreName(orderObj.storeName)
              .then(function (storeObj) {
                if (storeObj && storeObj.gmtOffset) {
                  let currentDate = CommonHelper.getCurrentGMTDateByOffset(storeObj.gmtOffset);
                  return resolve(currentDate);
                }
                else {
                  return resolve(moment(Date.now()));
                }
              })
              .catch(function (err) {
                return resolve(moment(Date.now()));
              });
          }
          else {
            return resolve(moment(Date.now()));
          }
        })
        .catch(function (err) {
          return resolve(moment(Date.now()));
        });
    });
  }

  static getStoreCacheByOrderNumber(orderNumber){
    return new Promise(function (resolve,reject) {
      CommonHelper.getOrderCache(orderNumber)
        .then(function (orderObj) {
          if(orderObj && orderObj.storeId) {
            CommonHelper.getStoreCacheByStoreId(orderObj.storeId)
              .then(function (storeObj) {
                return resolve(storeObj);
              })
              .catch(function (err) {
                return resolve(null);
              });
          }
          else if(orderObj && orderObj.storeName) {
            CommonHelper.getStoreCacheByStoreName(orderObj.storeName)
              .then(function (storeObj) {
                return resolve(storeObj);
              })
              .catch(function (err) {
                return resolve(null);
              });
          }
          else {
            return resolve(null);
          }
        })
        .catch(function (err) {
          return resolve(null);
        });
    });
  }

  static getStoreCacheByStoreId(storeId){
    return new Promise(function (resolve,reject) {
      let uniqueId = CommonHelper.getNewUniqueId();
      try{
        let cacheHelper = new CacheHelper();
        let storeObj = cacheHelper.getCache(storeId);
        if(!storeObj) {
          db.Stores.find({
            attributes: ['storeId', 'storeName', 'latitude', 'longitude', 'deliveryZone', 'gmtOffset', 'wideGeofenceInMeters','frequencyOutsideInSecs','frequencyInsideInSecs'],
            where: {
              storeId: storeId
            }
          })
            .then(function (existingStore) {
              if (existingStore) {
                let storeCacheObj = {
                  storeId: existingStore.storeId,
                  storeName: existingStore.storeName,
                  latitude: existingStore.latitude,
                  longitude: existingStore.longitude,
                  deliveryZone: CommonHelper.parseDeliveryZone(existingStore.deliveryZone),
                  gmtOffset: existingStore.gmtOffset,
                  wideGeofenceInMeters: existingStore.wideGeofenceInMeters,
                  frequencyOutsideInSecs: existingStore.frequencyOutsideInSecs,
                  frequencyInsideInSecs: existingStore.frequencyInsideInSecs
                };
                cacheHelper.setCache(existingStore.storeId, storeCacheObj);
                cacheHelper.setCache(CommonHelper.normalizeString(existingStore.storeName), storeCacheObj);
                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId,'getStoreCacheByStoreId store data stored in cache: ' + JSON.stringify(storeCacheObj));
                return resolve(storeCacheObj);
              }
              else {
                return resolve(null);
              }
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getStoreCacheByStoreId error: ' + err.message);
              return resolve(null);
            })
        }
        else {
          return resolve(storeObj);
        }
      }
      catch (err){
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getStoreCacheByStoreId error: '+err.message);
        return resolve(null);
      }
    });
  }

  static getStoreCacheByStoreName(storeName){
    return new Promise(function (resolve,reject) {
      let uniqueId = CommonHelper.getNewUniqueId();
      try{
        let cacheHelper = new CacheHelper();
        let cacheKey = CommonHelper.normalizeString(storeName);
        let storeObj = cacheHelper.getCache(cacheKey);
        if(!storeObj){
          db.Stores.find({
              attributes: ['storeId', 'storeName', 'latitude', 'longitude', 'deliveryZone', 'gmtOffset', 'wideGeofenceInMeters','frequencyOutsideInSecs','frequencyInsideInSecs'],
            where: {
              storeName: storeName
            }
          })
            .then(function (existingStore) {
              if(existingStore){
                let storeCacheObj = {
                  storeId: existingStore.storeId,
                  storeName: existingStore.storeName,
                  latitude: existingStore.latitude,
                  longitude: existingStore.longitude,
                  deliveryZone: CommonHelper.parseDeliveryZone(existingStore.deliveryZone),
                  gmtOffset: existingStore.gmtOffset,
                  wideGeofenceInMeters: existingStore.wideGeofenceInMeters,
                  frequencyOutsideInSecs: existingStore.frequencyOutsideInSecs,
                  frequencyInsideInSecs: existingStore.frequencyInsideInSecs
                };
                cacheHelper.setCache(existingStore.storeId, storeCacheObj);
                cacheHelper.setCache(cacheKey, storeCacheObj);
                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId,'getStoreCacheByStoreName store data stored in cache: '+JSON.stringify(storeCacheObj));
                return resolve(storeCacheObj);
              }
              else {
                return resolve(null);
              }
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getStoreCacheByStoreName error: '+err.message);
              return resolve(null);
            });
        }
        else {
          return resolve(storeObj);
        }
      }
      catch (err){
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getStoreCacheByStoreName error: '+err.message);
        return resolve(null);
      }
    });
  }

  static setStoreDetailsInCache(storeObj) {
    if(storeObj) {
      let uniqueId = CommonHelper.getNewUniqueId();
      try {
        let cacheHelper = new CacheHelper();
        let cacheKey = CommonHelper.normalizeString(storeObj.storeName);

        cacheHelper.setCache(storeObj.storeId, storeObj);
        cacheHelper.setCache(cacheKey, storeObj);
      }
      catch (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'setStoreDetailsInCache error: ' + err.message);
      }
    }
  }

  static getOrderCache(orderNumber){
    return new Promise(function (resolve,reject) {
      let uniqueId = CommonHelper.getUniqueIdFromCache({
        orderNumber: orderNumber
      });
      try{
        let cacheHelper = new CacheHelper();
        let cacheKey = CommonHelper.normalizeString(orderNumber);
        let orderObj = cacheHelper.getCache(cacheKey);
        if(!orderObj){
          db.DriveByRequest.find({
            attributes: ['orderNumber', 'storeName'],
            where: {
              orderNumber: orderNumber
            }
          })
            .then(function (existingOrder) {
              if(existingOrder){
                let orderCacheObj = {
                  orderNumber: existingOrder.orderNumber,
                  storeName: existingOrder.storeName
                };
                let res = cacheHelper.setCache(cacheKey, orderCacheObj);
                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId,'getOrderCache order data stored in cache: '+JSON.stringify(orderNumber));
                return resolve(orderCacheObj);
              }
              else {
                return resolve(null);
              }
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getOrderCache error: '+err.message);
              return resolve(null);
            });
        }
        else {
          return resolve(orderObj);
        }
      }
      catch (err){
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getOrderCache error: '+err.message);
        return resolve(null);
      }
    });
  }

  static buildCacheKeyForActiveDriveByRequests(storeName){
    let normalizeName = CommonHelper.normalizeString(storeName);
    return normalizeName + '_ActiveDriveByRequests';
  }

  static getActiveDriveByRequestsCache(storeName){
    return new Promise(function (resolve,reject) {
      let uniqueId = CommonHelper.getNewUniqueId();
      let cacheKey = CommonHelper.buildCacheKeyForActiveDriveByRequests(storeName);
      try{
        let cacheHelper = new CacheHelper();
        let activeDriveByRequestsObj = cacheHelper.getCache(cacheKey);
        if(!activeDriveByRequestsObj){
          CommonHelper.getStoreCacheByStoreName(storeName)
            .then(function (storeCache) {
              let currentDate = moment(Date.now());
              let gmtOffset = '';
              if(gmtOffset){
                currentDate = CommonHelper.getCurrentGMTDateByOffset(gmtOffset);
              }

              let currentDateString= currentDate.format('YYYY-MM-DD');
              let currentDateStart= moment(currentDateString+' 00:00:00 AM', 'YYYY-MM-DD hh:mm:ss A').toDate();
              let currentDateEnd= moment(currentDateString+' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();

              db.DriveByRequest.findAll({
                attributes: ['orderNumber', 'customerId', 'storeName', 'status', 'isRunningLate', 'requestDateTime', 'hereNowDateTime', 'actionDateTime', 'pickUpDate', 'pickUpTime', 'locationStatus'],
                where: {
                  storeName: storeName,
                  RequestDateTime:{
                    [db.Op.lt]: currentDateEnd,
                    [db.Op.gte]: currentDateStart
                  },
                  hereNowDateTime:{
                    [db.Op.eq]: null
                  },
                  status: {
                    [db.Op.notIn]: ['HereNow','Cancelled','Delivered','Completed']
                  }
                }
              })
                .then(function (driveByRequests) {
                  if(driveByRequests){
                    let activeDriveByRequestsArr = [];
                    let cnt = 0;
                    driveByRequests.map(item => {
                        let activeDriveByRequest = {
                            orderNumber: item.orderNumber,
                            customerId: item.customerId,
                            storeName: item.storeName,
                            status: item.status,
                            requestDateTime: item.requestDateTime,
                            hereNowDateTime: item.hereNowDateTime,
                            actionDateTime: item.actionDateTime,
                            pickUpDate: item.pickUpDate,
                            pickUpTime: item.pickUpTime,
                            locationStatus: item.locationStatus
                        };

                        activeDriveByRequestsArr[cnt] = activeDriveByRequest;
                        cnt += 1;
                    });

                    let res = cacheHelper.setCache(cacheKey, activeDriveByRequestsArr);
                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId,'getActiveDriveByRequestsCache order data stored in cache :'+activeDriveByRequestsArr.length);
                    return resolve(activeDriveByRequestsArr);
                  }
                  else {
                    return resolve(null);
                  }
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getActiveDriveByRequestsCache error: '+err.message);
                  return resolve(null);
                });
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getActiveDriveByRequestsCache error: '+err.message);
              return resolve(null);
            });
        }
        else {
          return resolve(activeDriveByRequestsObj);
        }
      }
      catch (err){
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId,'getActiveDriveByRequestsCache error: '+err.message);
        return resolve(null);
      }
    });
  }

  static setActiveDriveByRequestsCache(driveByRequestObj) {
        if(driveByRequestObj) {
            let uniqueId = CommonHelper.getNewUniqueId();
            let cacheKey = CommonHelper.buildCacheKeyForActiveDriveByRequests(driveByRequestObj.storeName);
            try {
                let activeDriveByRequestsArr = [];
                let cacheHelper = new CacheHelper();
                let activeDriveByRequestsObj = cacheHelper.getCache(cacheKey);
                if (activeDriveByRequestsObj && activeDriveByRequestsObj.length > 0) {
                    let newActiveDriveByRequestsObj = activeDriveByRequestsObj.filter(item => {
                        if (item.status.toLowerCase() !== 'Cancelled'.toLowerCase() && item.status.toLowerCase() !== 'Completed'.toLowerCase() && !item.hereNowDateTime) {
                            if (!(item.orderNumber === driveByRequestObj.orderNumber && item.customerId === driveByRequestObj.customerId)) {
                                return item;
                            }
                        }
                    });

                    if (driveByRequestObj.status.toLowerCase() !== 'Cancelled'.toLowerCase() && driveByRequestObj.status.toLowerCase() !== 'Completed'.toLowerCase() && !driveByRequestObj.hereNowDateTime) {
                        newActiveDriveByRequestsObj.push(driveByRequestObj);
                    }

                    activeDriveByRequestsArr = newActiveDriveByRequestsObj;
                }
                else {
                    activeDriveByRequestsArr[0] = driveByRequestObj;
                }

                cacheHelper.setCache(cacheKey, activeDriveByRequestsArr);
            }
            catch (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'setActiveDriveByRequestsCache error: ' + err.message);
            }
        }
    }

    static updateActiveDriveByRequestsCache(driveByRequestObj) {
        if(driveByRequestObj && driveByRequestObj.storeName && driveByRequestObj.orderNumber && driveByRequestObj.customerId) {
            let uniqueId = CommonHelper.getNewUniqueId();
            let cacheKey = CommonHelper.buildCacheKeyForActiveDriveByRequests(driveByRequestObj.storeName);
            try {
                let cacheHelper = new CacheHelper();
                let activeDriveByRequestsObj = cacheHelper.getCache(cacheKey);
                if (activeDriveByRequestsObj && activeDriveByRequestsObj.length > 0) {
                    let newActiveDriveByRequestsObj = activeDriveByRequestsObj.filter(item => {
                        if (item.orderNumber === driveByRequestObj.orderNumber && item.customerId === driveByRequestObj.customerId) {
                            if(driveByRequestObj.locationStatus !== null && driveByRequestObj.locationStatus !== undefined){
                                item.locationStatus = driveByRequestObj.locationStatus;
                            }
                            return item;
                        }
                        else {
                            return item;
                        }
                    });

                    cacheHelper.setCache(cacheKey, newActiveDriveByRequestsObj);
                }
            }
            catch (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateActiveDriveByRequestsCache error: ' + err.message);
            }
        }
    }

  static buildCacheKeyForActiveStores(){
    return 'ActiveStores';
  }

  static getActiveStoresFromCache(){
    return new Promise(function (resolve,reject) {
      try {
        let cacheKey = CommonHelper.buildCacheKeyForActiveStores();
        let cacheHelper = new CacheHelper();
        let activeStoresCache = cacheHelper.getCache(cacheKey);
        if (activeStoresCache) {
          return resolve(activeStoresCache);
        }
        else {
          db.Stores.findAll({
            attributes: ['storeId', 'storeName']
          })
            .then(function (stores) {
              GyGLog.writeLog(GyGLog.eLogLevel.debug, null, 'getActiveStoresFromCache message: active stores fetched from DB and stored to cache.');
              let storesArr = [];
              let cnt = 0;
              stores.map(store => {
                storesArr[cnt] = store.storeName;
                cnt += 1;
              });

              cacheHelper.setCache(cacheKey, storesArr);

              return resolve(storesArr);
            })
            .catch(function (err) {
              return resolve(null);
            });
        }
      }
      catch (err){
        return resolve(null);
      }
    });
  }

  static setActiveStoreInCache(storeName){
    try{
      if(storeName) {
        let cacheKey = CommonHelper.buildCacheKeyForActiveStores();
        let cacheHelper = new CacheHelper();
        var activeStoresCache = cacheHelper.getCache(cacheKey);
        if (activeStoresCache) {
          if (activeStoresCache instanceof Array) {
            //Check if store exists in array
            if (activeStoresCache.indexOf(storeName) < 0) {
              activeStoresCache.push(storeName);
            }
          }
          else {
            let activeStoresCache = [];
            activeStoresCache[0] = storeName;
            cacheHelper.setCache(cacheKey, activeStoresCache);
          }
          // Set new active store object to cache
          cacheHelper.setCache(cacheKey, activeStoresCache);
        }
        else {
          let activeStoresCache = [];
          activeStoresCache[0] = storeName;
          cacheHelper.setCache(cacheKey, activeStoresCache);
        }
      }
    }
    catch (err){ }
  }

  static getUniqueIdFromCache(obj){
    let newUniqueID = Guid.create();

    try{
      let cacheHelper = new CacheHelper();
      let uniqueId='';
      let uniqueIdKey='';
      if(obj.orderNumber){
        uniqueIdKey = obj.orderNumber;
      }
      else if(obj.customerId){
        uniqueIdKey = obj.customerId;
      }
      else if(obj.emailAddress){
        uniqueIdKey = obj.emailAddress;
      }

      if(uniqueIdKey){
        uniqueIdKey = CommonHelper.normalizeString(uniqueIdKey) + '_uniqueId';
        uniqueId = cacheHelper.getCache(uniqueIdKey);
      }

      if(!uniqueId){
        uniqueId = newUniqueID;
        CommonHelper.setUniqueIdToCache(obj, uniqueId);
      }

      return uniqueId;
    }
    catch (err){
      CommonHelper.setUniqueIdToCache(obj, newUniqueID);
      return newUniqueID;
    }
  }

  static setUniqueIdToCache(obj, uniqueId){
    try{
      let cacheHelper = new CacheHelper();
      if(!uniqueId){
        uniqueId = Guid.create();
      }

      if(obj.orderNumber){
        let uniqueIdKey = CommonHelper.normalizeString(obj.orderNumber) + '_uniqueId';
        cacheHelper.setCache(uniqueIdKey, uniqueId);
      }
      if(obj.customerId){
        let uniqueIdKey = CommonHelper.normalizeString(obj.customerId) + '_uniqueId';
        cacheHelper.setCache(uniqueIdKey, uniqueId);
      }
      if(obj.emailAddress){
        let uniqueIdKey = CommonHelper.normalizeString(obj.emailAddress) + '_uniqueId';
        cacheHelper.setCache(uniqueIdKey, uniqueId);
      }

      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'Associating ['+JSON.stringify(obj)+'] with uniqueId: [' + uniqueId + ']');
    }
    catch (err){ }
  }

  static getNewUniqueId(){
    return Guid.create();
  }

  static getRandomColor(){
    // a hex code for an attractive color
    let randomTileColor = randomColor({
      luminosity: 'dark'
    });

    return randomTileColor;
  }

  static calculatePickupInTimeInSeconds (pickUpTime,currentDate) {
    try {
      let pickUpTimeParts = pickUpTime.split(":");
      let currentTimeParts = currentDate.format("HH:mm:ss").split(":");
      let timeDiffHour = (parseInt(pickUpTimeParts[0]) - parseInt(currentTimeParts[0]));
      let timeDiffMinute = (parseInt(pickUpTimeParts[1]) || 0) - (parseInt(currentTimeParts[1]) || 0);
      let diffMs = (timeDiffHour * 60 * 60 * 1000) + (timeDiffMinute * 60 * 1000);
      if (diffMs < 0) {
        return 0;
      }
      return Math.floor(diffMs / 1000);
    }
    catch (err){
      return 0;
    }
  }

  static buildCacheKeyForiOSBackgroundChannels(){
    return 'iOSBackgroundChannels';
  }

  static getiOSBackgroundChannelsFromCache(){
    return new Promise(function (resolve,reject) {
      try {
        let cacheKey = CommonHelper.buildCacheKeyForiOSBackgroundChannels();
        let cacheHelper = new CacheHelper();
        let backgroundChannelsCache = cacheHelper.getCache(cacheKey);
        if (backgroundChannelsCache) {
          return resolve(backgroundChannelsCache);
        }
        else {
          CommonHelper.getActiveStoresFromCache()
            .then(function (activeStores) {
              if(activeStores && activeStores.length > 0){
                db.Stores.findAll({
                  attributes: ['storeName','gmtOffset'],
                  where:{
                    storeName:{
                      [db.Op.in]: activeStores
                    }
                  }
                })
                  .then(function (stores) {
                    db.DriveByRequest.findAll({
                      attributes: ['orderNumber', 'storeName', 'status', 'requestDateTime','deviceId','deviceType'],
                      where:{
                        appStatus: 'SleepNow',
                        deviceType: 'iOS',
                        status: {
                          [db.Op.notIn]: ['Cancelled', 'Completed','Unprocessed']
                        },
                        hereNowDateTime: {
                          [db.Op.eq]: null
                        }
                      }
                    })
                      .then(function (driveByRequests) {
                        GyGLog.writeLog(GyGLog.eLogLevel.debug, null, 'getiOSBackgroundChannelsFromCache message: background requests fetched from DB and stored to cache.');
                        let backgroundChannelsArr = [];
                        let cnt = 0;
                        driveByRequests.map(driveByRequest => {
                          let gmtOffset = '';
                          stores.map(store =>{
                            if(store.storeName === driveByRequest.storeName){
                              gmtOffset = store.gmtOffset;
                            }
                          });
                          if(gmtOffset) {
                            let currentDate = CommonHelper.getCurrentGMTDateByOffset(gmtOffset);
                            let currentDateString = currentDate.format('YYYY-MM-DD');
                            let currentDateStart = moment(currentDateString + ' 00:00:00 AM', 'YYYY-MM-DD hh:mm:ss A').toDate();
                            let currentDateEnd = moment(currentDateString + ' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();

                            if (driveByRequest.requestDateTime >= currentDateStart && driveByRequest.requestDateTime <= currentDateEnd) {
                              let orderChannelNames = CommonHelper.buildOrderChannelNames(driveByRequest.orderNumber);
                              let appListenChannelName = orderChannelNames.appListenChannelName;
                              backgroundChannelsArr[cnt] = appListenChannelName;
                              cnt += 1;

                              let deviceId = driveByRequest.deviceId;
                              let deviceType = driveByRequest.deviceType;
                              let pushGateway = '';
                              if(deviceType){
                                pushGateway = (deviceType.toLowerCase() === 'iOS'.toLowerCase() ? 'apns' : 'gcm');
                              }

                              setChannelState({
                                channelName: appListenChannelName,
                                isInBackground: true,
                                pushGateway: pushGateway,
                                deviceId: deviceId,
                                isUpdateToDB: false
                              })
                                .then(function (data) { })
                                .catch(function (err) { });
                            }
                          }
                        });

                        cacheHelper.setCache(cacheKey, backgroundChannelsArr);

                        return resolve(backgroundChannelsArr);
                      })
                      .catch(function (err) {
                        console.log(err);
                        return resolve(null);
                      });
                  })
                  .catch(function (err) {
                    console.log(err);
                    return resolve(null);
                  });
              }
            })
            .catch(function (err) {
              console.log(err);
              return resolve(null);
            });
        }
      }
      catch (err){
        console.log(err);
        return resolve(null);
      }
    });
  }

  static deleteCache(cacheKey){
    let cacheHelper = new CacheHelper();
    return cacheHelper.delCache(cacheKey);
  }

}

// export the class
module.exports.CommonHelper = CommonHelper;

module.exports.setiOSBackgroundChannelInCache = function(channelName) {
  CommonHelper.getiOSBackgroundChannelsFromCache()
    .then(function (backgoundChannelsCache) {
      let cacheHelper = new CacheHelper();
      let cacheKey = CommonHelper.buildCacheKeyForiOSBackgroundChannels();
      let backgroundChannelsArr = [];
      if (backgoundChannelsCache && backgoundChannelsCache.length > 0) {
        if (backgoundChannelsCache.indexOf(channelName) <= -1) {
          backgroundChannelsArr = backgoundChannelsCache;
          backgroundChannelsArr.push(channelName);
        }
      }
      else {
        backgroundChannelsArr[0] = channelName;
      }

      cacheHelper.setCache(cacheKey, backgroundChannelsArr);
    })
    .catch(function (err) {

    });
};

module.exports.removeiOSBackgroundChannelFromCache = function(channelName) {
  CommonHelper.getiOSBackgroundChannelsFromCache()
    .then(function (backgroundChannelsCache) {
      let cacheHelper = new CacheHelper();
      let cacheKey = CommonHelper.buildCacheKeyForiOSBackgroundChannels();

      if (backgroundChannelsCache && backgroundChannelsCache.length > 0) {
        let index = backgroundChannelsCache.indexOf(channelName);
        if (index > -1) {
          backgroundChannelsCache.splice(index, 1);
          cacheHelper.setCache(cacheKey, backgroundChannelsCache);
        }
      }
    })
    .catch(function (err) {

    });
};

module.exports.removeActiveDriveByRequestsCache = function(storeName, orderNumber) {
    if(orderNumber) {
        let uniqueId = CommonHelper.getNewUniqueId();
        let cacheKey = CommonHelper.buildCacheKeyForActiveDriveByRequests(storeName);
        try {
            let activeDriveByRequestsArr = [];
            let cacheHelper = new CacheHelper();
            let activeDriveByRequestsObj = cacheHelper.getCache(cacheKey);
            if (activeDriveByRequestsObj && activeDriveByRequestsObj.length > 0) {
                let newActiveDriveByRequestsObj = activeDriveByRequestsObj.filter(item => {
                    if (!item.orderNumber !== orderNumber) {
                        return item;
                    }
                });

                activeDriveByRequestsArr = newActiveDriveByRequestsObj;
                cacheHelper.setCache(cacheKey, activeDriveByRequestsArr);
            }
        }
        catch (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'removeActiveDriveByRequestsCache error: ' + err.message);
        }
    }
};

module.exports.sendForgotPasswordEmail = function(emailAddress, userName, fullName, encryptedToken) {
  return new Promise(function (resolve, reject) {
    try {
      let appUrl = config.appUrl;
      let ddsResetPasswordLink = config.ddsResetPasswordLink;
      let filePath = config.root + '/server/htmlTemplates/forgotPassword.html';
      fs.readFile(filePath, 'utf8', function (err, html) {
        if (err) {
          //Error
          return reject(err);
        } else {
          //Read file success
          let mailHelper = new MailHelper();
          let subject = 'Password Reset Request for GyG-DriveBy';
          let mailBody = html;
          let actionUrl = ddsResetPasswordLink + '?d=' + encryptedToken;

          //Replace token with values
          mailBody = UtilityHelper.replaceAll(mailBody, '{{fullName}}', fullName);
          mailBody = UtilityHelper.replaceAll(mailBody, '{{userName}}', userName);
          mailBody = UtilityHelper.replaceAll(mailBody, '{{appUrl}}', appUrl);
          mailBody = UtilityHelper.replaceAll(mailBody, '{{actionUrl}}', actionUrl);
          mailBody = UtilityHelper.replaceAll(mailBody, '{{senderName}}', 'GyG DriveBy Team');

          mailHelper.sendEmail(emailAddress, subject, mailBody)
            .then(function (result) {
              return resolve(result);
            })
            .catch(function (err) {
              return reject(err);
            });
        }
      });
    }
    catch (err){
      return reject(err);
    }
  });
};

module.exports.sendResetPasswordEmail = function(emailAddress, userName, fullName) {
  return new Promise(function (resolve, reject) {
    try{
      let appUrl = config.appUrl;
      let ddsLoginLink = config.ddsLoginLink;
      let filePath = config.root + '/server/htmlTemplates/resetPassword.html';
      fs.readFile(filePath, 'utf8', function(err, html){
        if (err) {
          //Error
          return reject(err);
        } else {
          //Read file success
          let mailHelper = new MailHelper();
          let subject = 'Password has been reset for GyG-DriveBy';
          let mailBody = html;

          //Replace token with values
          mailBody = UtilityHelper.replaceAll(mailBody, '{{fullName}}', fullName);
          mailBody = UtilityHelper.replaceAll(mailBody, '{{userName}}', userName);
          mailBody = UtilityHelper.replaceAll(mailBody, '{{appUrl}}', appUrl);
          mailBody = UtilityHelper.replaceAll(mailBody, '{{actionUrl}}', ddsLoginLink);
          mailBody = UtilityHelper.replaceAll(mailBody, '{{senderName}}', 'GyG DriveBy Team');

          mailHelper.sendEmail(emailAddress, subject, mailBody)
            .then(function (result) {
              return resolve(result);
            })
            .catch(function (err) {
              return reject(err);
            });
        }
      });
    }
    catch (err){
      return reject(err);
    }
  });
};

module.exports.updateLocationStatus = function(obj) {
    return new Promise(function (resolve, reject) {
        let uniqueId = CommonHelper.getUniqueIdFromCache({orderNumber: obj.orderNumber});
        try {
            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, 'updateLocationStatus obj: ' + JSON.stringify(obj));

            CommonHelper.updateActiveDriveByRequestsCache({
                storeName: obj.storeName,
                orderNumber: obj.orderNumber,
                customerId: obj.customerId,
                locationStatus: obj.locationStatus
            });

            //success
            db.DriveByRequest.update({
                    locationStatus: obj.locationStatus,
                    updatedAt: obj.currentDate
                },
                {
                    where: {
                        orderNumber: obj.orderNumber
                    }
                })
                .then(function (updatedDriveByRequest) {
                    //update success in db
                    return resolve(updatedDriveByRequest);
                })
                .catch(function (err) {
                    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateLocationStatus message: ' + err.message);
                    return reject(err);
                });
        }
        catch (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, 'updateLocationStatus message: ' + err.message);
            return reject(err);
        }
    });
};
