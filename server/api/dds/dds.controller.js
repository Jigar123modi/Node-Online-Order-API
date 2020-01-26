/**
 * GET      /api/dds/startup/:storeName                   ->  API to get startup details for DDS Board
 * GET      /api/dds/recentOrders/:storeName              ->  API to get recent orders for store
 * POST     /api/dds/login                                ->  API to validate store user authentication and give auth token
 * POST     /api/dds/changePassword                       ->  API to change store user password
 * POST     /api/dds/forgotPassword                       ->  API to manage forgot store user password
 * POST     /api/dds/checkResetPassword                   ->  API to validate reset password token
 * POST     /api/dds/resetPassword                        ->  API to store user reset password
 * POST     /api/dds/registerUser                         ->  API to register new store user
 * PUT      /api/dds/updateUser/:userId                   ->  API to update store user details
 * POST     /api/dds/storeUserAvatar                      ->  API to upload storeUserAvatar to AWS S3 and give avatar url in response
 * POST     /api/dds/getStoreUserRoles                    ->  API to get store user role list
 * POST     /api/dds/getStoreUsers/:storeId               ->  API to get store users list
 * POST     /api/dds/storeConfig                          ->  API to insert/update store config details
 * GET      /api/dds/getStores                            ->  API to get store config list
 * POST     /api/dds/updateStatus                         ->  API to update driveby request status
 * POST     /api/dds/writeLog                             ->  API to write DDS logs to server
 * POST     /api/dds/publishLocationChangeMessage         ->  API to publish location change message to appLocation channel
 * POST     /api/dds/publishMessageToApiListenChannel     ->  API to publish pubnub message to apiListen channel
 */

'use strict';

import db from '../../sqldb';
import {CommonHelper, sendForgotPasswordEmail, sendResetPasswordEmail} from '../CommonHelper';
import ApiException from '../ApiException';
import GyGLog from '../../logging/GyGLog';
import path from 'path';
import AwsS3Helper  from '../AwsS3Helper';
import config from '../../config/environment';
import {PubnubHelper,updateStatusMessage} from '../PubnubHelper';
import moment from 'moment';
import CacheHelper from '../CacheHelper';
import PushNotificationHelper from '../PushNotificationHelper';
import cryptoHelper from '../cryptoHelper';
import axios from 'axios';

// Get DDS Config Details and DriveBy order requests by storeName.
export function ddsStartup(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [GET:dds/startup]...');

    CommonHelper.getCurrentGMTDateByStoreName(req.params.storeName)
      .then(function (currentDate) {
        let currentDateString= currentDate.format('YYYY-MM-DD');
        let currentDateStart= moment(currentDateString+' 00:00:00 AM', 'YYYY-MM-DD hh:mm:ss A').toDate();
        let currentDateEnd= moment(currentDateString+' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();
        db.DriveByRequest.findAll({
          where: {
            StoreName: {
                [db.Op.eq]: req.params.storeName
            },
            RequestDateTime:{
              [db.Op.lt]: currentDateEnd,
              [db.Op.gte]: currentDateStart
            },
            status: {
              [db.Op.notIn]: ['Cancelled','Delivered','Completed']
            }
          }
        })
          .then(function (driveByRequests) {
            let orderNumberArr = new Array();
            driveByRequests.forEach(function(item) {
              orderNumberArr.push(item.orderNumber);
            });

            db.Locations.findAll({
              where: {
                orderNumber: {
                  [db.Op.in]: orderNumberArr
                }
              }
            })
              .then(function (locationsData) {
                const resObj = driveByRequests.map(item => {
                  let orderChannelNames = CommonHelper.buildOrderChannelNames(item.orderNumber);

                  //Insert/Update request in active DriveByRequest cache
                  CommonHelper.setActiveDriveByRequestsCache({
                    orderNumber: item.orderNumber,
                    customerId: item.customerId,
                    storeName: item.storeName,
                    status: item.status,
                    isRunningLate: item.isRunningLate,
                    requestDateTime: item.requestDateTime,
                    hereNowDateTime: item.hereNowDateTime,
                    actionDateTime: item.actionDateTime,
                    pickUpDate: item.pickUpDate,
                    pickUpTime: item.pickUpTime,
                    locationStatus: item.locationStatus
                  });

                  //tidy up the driveBy details in separate objects
                  return Object.assign(
                    {},
                    {
                      //tidy up the driveBy details
                      driveByDetails: Object.assign(
                        {},
                        {
                          modeOfTransport: item.modeOfTransport,
                          transportColor: item.transportColor,
                          tileColor: item.tileColor,
                          licensePlateNumber: item.licensePlateNumber,
                          userAvatar: item.userAvatar,
                          status: item.status,
                          isRunningLate: item.isRunningLate,
                          requestDateTime: item.requestDateTime,
                          actionDateTime: item.actionDateTime,
                          hereNowDateTime: item.hereNowDateTime,
                          deliveryInProgressDateTime: item.deliveryInProgressDateTime,
                          durationInSeconds: item.durationInSeconds,
                          distanceInMeters: item.distanceInMeters,
                          notes: item.notes
                        }
                      ),

                      //Customer Notification
                      customerNotification: parseCustomerNotification(item.customerNotification),

                      //tidy up the customer details
                      customer: Object.assign(
                        {},
                        {
                          firstName: item.firstName,
                          lastName: item.lastName,
                          emailAddress: item.emailAddress,
                          phoneNumber: item.phoneNumber
                        }
                      ),
                      //tidy up the order details
                      order: Object.assign(
                        {},
                        {
                          storeName: item.storeName,
                          pickUpTime: item.pickUpTime,
                          pickUpDate: item.pickUpDate,
                          orderNumber: item.orderNumber,
                          customerId: item.customerId
                        }
                      ),

                      //tidy up the location details
                      location: (locationsData.filter(location => {
                        return location.orderNumber === item.orderNumber;
                      })).map(locationItem => {
                        return {
                          latitude: locationItem.latitude,
                          longitude: locationItem.longitude,
                          sequence: locationItem.sequence,
                          locationDateTime: locationItem.createdAt
                        };
                      }),

                      //tidy up the order details
                      channels: Object.assign(
                        {},
                        {
                          appLocationChannelName: orderChannelNames.appLocationChannelName,
                          appListenChannelName: orderChannelNames.appListenChannelName,
                          ddsListenChannelName: orderChannelNames.ddsListenChannelName,
                          apiListenChannelName: orderChannelNames.apiListenChannelName,
                          appListenPresenceChannelName: orderChannelNames.appListenPresenceChannelName,
                        }
                      ),
                      appVersion: item.appVersion,
                      createdAt: item.createdAt,
                      updatedAt: item.updatedAt
                    }
                  );
                });

                //PubNub Connection
                let pubnubHelper = new PubnubHelper();
                //Subscribe all active order channels
                for(let i=0;i<resObj.length;i++) {
                  //Subscribe orderNumber_AppLocation channel
                  pubnubHelper.subscribeChannel(resObj[i].channels.appLocationChannelName, uniqueId);
                  //Subscribe orderNumber_apiListen channel
                  pubnubHelper.subscribeChannel(resObj[i].channels.apiListenChannelName, uniqueId);
                  //Subscribe orderNumber_appListenPresence channel
                  pubnubHelper.subscribeChannelWithOrderNumber(resObj[i].channels.appListenPresenceChannelName, resObj[i].order.orderNumber, uniqueId);
                }

                try {
                  let cacheHelper = new CacheHelper();
                  //Cache all active orders store details in cache
                  for(let i=0;i<resObj.length;i++) {
                    //Cache Store Config Details
                    let orderCacheObj = {
                      orderNumber: resObj[i].order.orderNumber,
                      storeName: resObj[i].order.storeName
                    };

                    cacheHelper.setCache(orderCacheObj.orderNumber, orderCacheObj);
                  }
                }
                catch (err){
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/login] storeCache error: '+ err.message);
                }

                //Remove special characters except alphabets and numbers
                let controlChannelName = CommonHelper.buildStoreControlChannelName(req.params.storeName);

                calculateAverageWaitTime(req.params.storeName)
                  .then(function (avgWaitTimeResponse) {
                    let responseData = {
                      controlChannelName,
                      driveByRequests: resObj,
                      avgWaitTime: {
                        calculatedTime: avgWaitTimeResponse.calculatedTime,
                        totalSeconds: avgWaitTimeResponse.totalSeconds,
                        totalRequests: avgWaitTimeResponse.totalRequests
                      }
                    };

                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[GET:dds/startup] message: DDS Startup details fetched successfully.');
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/startup]...success');
                    res.json(responseData);
                  })
                  .catch(function (err) {
                    let responseData = {
                      controlChannelName,
                      driveByRequests: resObj,
                      avgWaitTime: {
                        calculatedTime: '00:00:00',
                        totalSeconds: 0,
                        totalRequests: 0
                      }
                    };

                    GyGLog.writeLog(GyGLog.eLogLevel.err, uniqueId, '[GET:dds/startup] calculateAverageWaitTime err: '+ err.message);
                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[GET:dds/startup] message: DDS Startup details fetched successfully.');
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/startup]...success');
                    res.json(responseData);
                  });
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/startup] message: '+ JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/startup]...fail');
                next(err);
              });
          })
          .catch(function(err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/startup] message: '+ JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/startup]...fail');
            next(err);
          });
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/startup] message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/startup]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/startup] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/startup]...fail');
    next(err);
  }
}

// Get DDS recent orders by storeName.
export function getRecentOrders(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [GET:dds/recentOrders]...');

    CommonHelper.getCurrentGMTDateByStoreName(req.params.storeName)
      .then(function (currentDate) {
        let currentDateString= currentDate.format('YYYY-MM-DD');
        let currentDateStart= moment(currentDateString+' 00:00:00 AM', 'YYYY-MM-DD hh:mm:ss A').toDate();
        let currentDateEnd= moment(currentDateString+' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();
        db.DriveByRequest.findAll({
          where: {
              StoreName: {
                  [db.Op.eq]: req.params.storeName
              },
              RequestDateTime: {
                  [db.Op.lt]: currentDateEnd,
                  [db.Op.gte]: currentDateStart
              },
              status: {
                  [db.Op.in]: ['Cancelled', 'Delivered', 'Completed']
              }
          }
        })
          .then(function (driveByRequests) {
            let orderNumberArr = new Array();
            driveByRequests.forEach(function(item) {
              orderNumberArr.push(item.orderNumber);
            });

            db.Locations.findAll({
              attributes: ['orderNumber','latitude','longitude','sequence','createdAt'],
              where: {
                orderNumber: {
                  [db.Op.in]: orderNumberArr
                }
              }
            })
              .then(function (locationsData) {
                const recentOrdersObj = driveByRequests.map(item => {
                  let orderChannelNames = CommonHelper.buildOrderChannelNames(item.orderNumber);

                  //tidy up the driveBy details in separate objects
                  return Object.assign(
                    {},
                    {
                      //tidy up the driveBy details
                      driveByDetails: Object.assign(
                        {},
                        {
                          modeOfTransport: item.modeOfTransport,
                          transportColor: item.transportColor,
                          tileColor: item.tileColor,
                          licensePlateNumber: item.licensePlateNumber,
                          userAvatar: item.userAvatar,
                          status: item.status,
                          isRunningLate: item.isRunningLate,
                          requestDateTime: item.requestDateTime,
                          actionDateTime: item.actionDateTime,
                          hereNowDateTime: item.hereNowDateTime,
                          deliveryInProgressDateTime: item.deliveryInProgressDateTime,
                          durationInSeconds: item.durationInSeconds,
                          distanceInMeters: item.distanceInMeters,
                          ratingValue: item.ratingValue,
                          ratingText: item.ratingText
                        }
                      ),

                      //Customer Notification
                      customerNotification: parseCustomerNotification(item.customerNotification),

                      //tidy up the customer details
                      customer: Object.assign(
                        {},
                        {
                          firstName: item.firstName,
                          lastName: item.lastName,
                          emailAddress: item.emailAddress,
                          phoneNumber: item.phoneNumber
                        }
                      ),
                      //tidy up the order details
                      order: Object.assign(
                        {},
                        {
                          storeName: item.storeName,
                          pickUpTime: item.pickUpTime,
                          pickUpDate: item.pickUpDate,
                          orderNumber: item.orderNumber,
                          customerId: item.customerId
                        }
                      ),

                      //tidy up the location details
                      location: (locationsData.filter(location => {
                        return location.orderNumber === item.orderNumber;
                      })).map(locationItem => {
                        return {
                          latitude: locationItem.latitude,
                          longitude: locationItem.longitude,
                          sequence: locationItem.sequence,
                          locationDateTime: locationItem.createdAt
                        };
                      }),

                      //tidy up the channels details
                      channels: Object.assign(
                        {},
                        {
                          appLocationChannelName: orderChannelNames.appLocationChannelName,
                          appListenChannelName: orderChannelNames.appListenChannelName,
                          ddsListenChannelName: orderChannelNames.ddsListenChannelName,
                          apiListenChannelName: orderChannelNames.apiListenChannelName,
                          appListenPresenceChannelName: orderChannelNames.appListenPresenceChannelName
                        }
                      )
                    }
                  );
                });

                let responseData = {
                  storeName: req.params.storeName,
                  recentOrders: recentOrdersObj
                };

                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[GET:dds/recentOrders] message: recent orders fetched successfully. count: '+ recentOrdersObj.length);
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/recentOrders]...success');
                res.status(200).json(responseData);
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/recentOrders] message: '+ JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/recentOrders]...fail');
                next(err);
              });
          })
          .catch(function(err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/recentOrders] message: '+ JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/recentOrders]...fail');
            next(err);
          });


      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/recentOrders] message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/recentOrders]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/recentOrders] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/recentOrders]...fail');
    next(err);
  }
}

function parseCustomerNotification(obj) {
  let objEmptyArr = [];
  try {
    if (obj) {
      let parsedObj= JSON.parse(obj);
      if(parsedObj instanceof Array){
        return parsedObj;
      }
      else {
        return objEmptyArr;
      }
    }
    else {
      return objEmptyArr;
    }
  }
  catch(err) {
    return objEmptyArr;
  }
}

function calculateAverageWaitTime(storeName) {
  return new Promise(function (resolve,reject) {
    try{
      CommonHelper.getCurrentGMTDateByStoreName(storeName)
        .then(function (currentDate) {
          let currentDateString= currentDate.format('YYYY-MM-DD');
          let currentDateStart= moment(currentDateString+' 00:00:00 AM', 'YYYY-MM-DD hh:mm:ss A').toDate();
          let currentDateEnd= moment(currentDateString+' 11:59:59 PM', 'YYYY-MM-DD hh:mm:ss A').toDate();
          db.DriveByRequest.findAll({
            attributes: ['hereNowDateTime','actionDateTime'],
            where: {
                StoreName: {
                    [db.Op.eq]: storeName
                },
                RequestDateTime: {
                    [db.Op.lt]: currentDateEnd,
                    [db.Op.gte]: currentDateStart
                },
                status: {
                    [db.Op.in]: ['Delivered', 'Completed']
                },
                hereNowDateTime: {
                    [db.Op.ne]: null
                }
            }
          })
            .then(function (completedRequests) {
              CommonHelper.getStoreCacheByStoreName(storeName)
                .then(function (storeCache) {
                  let gmtOffset = '';
                  if(storeCache && storeCache.gmtOffset){
                    gmtOffset = storeCache.gmtOffset;
                  }

                  let totalSecsDiff = 0;
                  let totalRequests = 0;
                  completedRequests.forEach(function(item) {
                    let hereNowDateTime = CommonHelper.convertDateToGMT(item.hereNowDateTime,gmtOffset);
                    let actionDateTime = CommonHelper.convertDateToGMT(item.actionDateTime,gmtOffset);
                    if(hereNowDateTime && actionDateTime){
                      let duration = moment.duration(actionDateTime.diff(hereNowDateTime));
                      totalSecsDiff += duration.asSeconds();
                      totalRequests += 1;
                    }
                  });

                  if(totalRequests > 0){
                    let avgSecsDiff = Math.floor(totalSecsDiff / totalRequests);
                    let avgWaitTime = CommonHelper.convertSecsToHrsMinsSecs(avgSecsDiff);
                    return resolve({
                      calculatedTime: avgWaitTime,
                      totalSeconds: totalSecsDiff,
                      totalRequests: totalRequests
                    });
                  }
                  else {
                    return resolve({
                      calculatedTime: '00:00:00',
                      totalSeconds: 0,
                      totalRequests: 0
                    });
                  }
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
    catch(err) {
      return reject(err);
    }
  });
}

// Register store user for store
export function registerStoreUser(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/registerUser]...');

    //Check if role is valid
    db.StoreUserRoles.find({
      attributes: ['roleId','roleName','roleOrder'],
      where: {
          roleName: {
              [db.Op.eq]: req.body.role
          }
      }
    })
      .then(function (storeUserRole) {
        var loginUser = req.decoded;
        if(!storeUserRole){
          let errMessage = 'Invalid user role!';
          throw new ApiException(400, errMessage, errMessage);
        }
        else if(loginUser.roleOrder >= storeUserRole.roleOrder){
          let errMessage = 'Not allowed to register user with same or higher security role as authenticated user.';
          throw new ApiException(400, errMessage, errMessage);
        }

        db.StoreUsers.findAll({
          attributes: ['userName','emailAddress'],
          where: {
            [db.Op.or]: [
              {userName: req.body.userName},
              {emailAddress: req.body.emailAddress}
            ]
          }
        })
          .then(function (storeUsers) {
            if (storeUsers && storeUsers.length > 0) {
              let isUserNameAvailable = true;
              let isEmailAvailable = true;
              storeUsers.map(item => {
                if(item.userName === req.body.userName){
                  isUserNameAvailable = false;
                }

                if(item.emailAddress === req.body.emailAddress){
                  isEmailAvailable = false;
                }
              });

              if(!isUserNameAvailable) {
                let errMessage = 'UserName not available! Try with different UserName.';
                throw new ApiException(400, errMessage, errMessage);
              }
              if(!isEmailAvailable) {
                let errMessage = 'Email already in use! Try with different email.';
                throw new ApiException(400, errMessage, errMessage);
              }
            }

            CommonHelper.getCurrentGMTDateByStoreId(req.body.storeId)
              .then(function (currentDate) {
                let passwordHash = CommonHelper.hashPassword(req.body.password);

                db.StoreUsers.build({
                  storeId: req.body.storeId,
                  userName: req.body.userName,
                  emailAddress: req.body.emailAddress,
                  roleId: storeUserRole.roleId,
                  password: passwordHash.hash,
                  firstName: req.body.firstName,
                  lastName: req.body.lastName,
                  isActive: req.body.isActive,
                  createdAt: currentDate,
                  updatedAt: currentDate
                })
                  .save()
                  .then(function (response) {
                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/registerUser] message: storeUser registered successfully!');
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/registerUser]...success');

                    let apiResponse = {
                      userId: response.userId,
                      storeId: response.storeId,
                      userName: response.userName,
                      emailAddress: response.emailAddress,
                      roleId: response.roleId,
                      roleName: storeUserRole.roleName,
                      firstName: response.firstName,
                      lastName: response.lastName,
                      userAvatar: response.userAvatar,
                      isActive: response.isActive
                    };

                    res.status(200).json(apiResponse);
                  })
                  .catch(function (err) {
                    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/registerUser] message: '+ JSON.stringify(err.message));
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/registerUser]...fail');
                    next(err);
                  });
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/registerUser] message: '+ JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/registerUser]...fail');
              });
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/registerUser] message: '+ JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/registerUser]...fail');
            next(err);
          });
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/registerUser] message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/registerUser]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/registerUser] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/registerUser]...fail');
    next(err);
  }
}

// Update store user details
export function updateStoreUser(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/updateUser]...');

    //Check if role is valid
    db.StoreUserRoles.find({
      attributes: ['roleId','roleName','roleOrder'],
      where: {
          roleName: {
              [db.Op.eq]: req.body.role
          }
      }
    })
      .then(function (storeUserRole) {
        var loginUser = req.decoded;
        if(!storeUserRole){
          let errMessage = 'Invalid user role!';
          throw new ApiException(400, errMessage, errMessage);
        }
        else if(loginUser.roleOrder >= storeUserRole.roleOrder){
          let errMessage = 'Not allowed to register user with same or higher security role as authenticated user.';
          throw new ApiException(400, errMessage, errMessage);
        }

        let userId = parseInt(req.params.userId);

        db.StoreUsers.findAll({
          where: {
            [db.Op.or]: [
              {userId: userId},
              {userName: req.body.userName},
              {emailAddress: req.body.emailAddress}
            ]
          }
        })
          .then(function (storeUsers) {
            let isUserAvailable = false;
            let isUserNameAvailable = true;
            let isEmailAvailable = true;
            storeUsers.map(item => {
              if (item.userId === userId) {
                isUserAvailable = true;
              }

              if (item.userName === req.body.userName && item.userId !== userId) {
                isUserNameAvailable = false;
              }

              if (item.emailAddress === req.body.emailAddress && item.userId !== userId) {
                isEmailAvailable = false;
              }
            });

            if (!isUserAvailable) {
              let errMessage = 'User not available! Please contact system administrator.';
              throw new ApiException(400, errMessage, errMessage);
            }

            if (!isUserNameAvailable) {
              let errMessage = 'UserName not available! Try with different UserName.';
              throw new ApiException(400, errMessage, errMessage);
            }

            if (!isEmailAvailable) {
              let errMessage = 'Email already in use! Try with different email.';
              throw new ApiException(400, errMessage, errMessage);
            }

            CommonHelper.getCurrentGMTDateByStoreId(req.body.storeId)
              .then(function (currentDate) {
                let storeUserFilter = storeUsers.filter(item => {
                  return item.userId === userId;
                });

                let storeUser = storeUserFilter[0];
                storeUser.storeId = req.body.storeId;
                storeUser.userName = req.body.userName;
                storeUser.emailAddress = req.body.emailAddress;
                storeUser.roleId = storeUserRole.roleId;
                storeUser.firstName = req.body.firstName;
                storeUser.lastName = req.body.lastName;
                storeUser.isActive = req.body.isActive;
                storeUser.updatedAt = currentDate;

                if (req.body.password) {
                  let passwordHash = CommonHelper.hashPassword(req.body.password);
                  storeUser.password = passwordHash.hash;
                }

                storeUser
                  .save()
                  .then(function (response) {
                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/updateUser] message: storeUser updated successfully!');
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/updateUser]...success');

                    let apiResponse = {
                      userId: response.userId,
                      storeId: response.storeId,
                      userName: response.userName,
                      emailAddress: response.emailAddress,
                      roleId: response.roleId,
                      roleName: storeUserRole.roleName,
                      firstName: response.firstName,
                      lastName: response.lastName,
                      userAvatar: response.userAvatar,
                      isActive: response.isActive
                    };

                    res.status(200).json(apiResponse);
                  })
                  .catch(function (err) {
                    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/updateUser] message: ' + JSON.stringify(err.message));
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/updateUser]...fail');
                    next(err);
                  });
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/updateUser] message: ' + JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/updateUser]...fail');
              });
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/updateUser] message: '+ JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/updateUser]...fail');
            next(err);
          });
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/updateUser] message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/updateUser]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/updateUser] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/updateUser]...fail');
    next(err);
  }
}

// Authenticate store user
export function login(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/login]...');
    db.StoreUsers.find({
      attributes: ['userId','userName','storeId','emailAddress','roleId','password','firstName','lastName','userAvatar','isActive'],
      where: {
          userName: {
              [db.Op.eq]: req.body.userName
          }
      }
    })
      .then(storeUser => {
        if(storeUser === null || storeUser === undefined){
          let errMessage = 'Authentication failed. Wrong username.';
          throw new ApiException(400, errMessage, errMessage);
        }

        var isValid = CommonHelper.comparePassword(req.body.password,storeUser.password);
        if(!isValid){
          let errMessage = 'Authentication failed. Wrong password.';
          throw new ApiException(400, errMessage, errMessage);
        }

        if(!storeUser.isActive){
          let errMessage = 'Your account is disabled! Please contact system administrator.';
          throw new ApiException(400, errMessage, errMessage);
        }

        db.StoreUserRoles.find({
          attributes: ['roleName','roleOrder'],
          where: {
              roleId: {
                  [db.Op.eq]: storeUser.roleId
              }
          }
        })
          .then(function (storeUserRole) {
            if(!storeUserRole){
              let errMessage = 'User role: '+storeUser.roleId+' not found! Please contact system administrator.';
              throw new ApiException(400, errMessage, errMessage);
            }

            db.Stores.find({
              attributes: ['storeId','storeName','latitude','longitude','deliveryZone','gmtOffset','isActive'],
              where: {
                  storeId: {
                      [db.Op.eq]: storeUser.storeId
                  }
              }
            })
              .then(function (store) {
                if(!store){
                  let errMessage = 'DriveBy not configured for store: '+storeUser.storeId+'! Please contact system administrator.';
                  throw new ApiException(400, errMessage, errMessage);
                }

                if(!store.isActive){
                  let errMessage = 'DriveBy not activated for store: '+store.storeName+'! Please contact system administrator.';
                  throw new ApiException(400, errMessage, errMessage);
                }

                let storeName = store.storeName;
                let storeLatitude = store.latitude;
                let storeLongitude = store.longitude;
                let gmtOffset = store.gmtOffset;
                let deliveryZone = CommonHelper.parseDeliveryZone(store.deliveryZone);
                let isActive = store.isActive;

                let storeUserObj = {
                  userId: storeUser.userId,
                  userName: storeUser.userName,
                  emailAddress: storeUser.emailAddress,
                  role: storeUserRole.roleName,
                  roleOrder: storeUserRole.roleOrder,
                  firstName:  storeUser.firstName,
                  lastName:  storeUser.lastName,
                  userAvatar:  storeUser.userAvatar,
                  store: {
                    storeId: storeUser.storeId,
                    storeName: storeName,
                    latitude: storeLatitude,
                    longitude: storeLongitude,
                    gmtOffset: gmtOffset,
                    deliveryZone: deliveryZone,
                    isActive: isActive
                  }
                };

                // create a token
                let tokenObj = CommonHelper.generateToken(storeUserObj);

                try {
                  //Cache Store Config Details
                  let storeCacheObj = {
                    storeId: storeUser.storeId,
                    storeName: storeName,
                    latitude: storeLatitude,
                    longitude: storeLongitude,
                    gmtOffset: gmtOffset,
                    deliveryZone: deliveryZone,
                    isActive: isActive
                  };

                  let cacheHelper = new CacheHelper();
                  cacheHelper.setCache(storeCacheObj.storeId, storeCacheObj);
                  cacheHelper.setCache(storeCacheObj.storeName, storeCacheObj);
                }
                catch (err){
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/login] storeCache error: '+ err.message);
                }

                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/login] message: Store user authenticated successfully.');
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/login]...success');

                // return the information including token as JSON
                res.status(200).json({
                  accessToken: tokenObj.token,
                  tokenType: 'bearer',
                  expiresIn: tokenObj.expiresIn,
                  issued: tokenObj.issued,
                  expires: tokenObj.expires,
                  userProfile: storeUserObj
                });
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/login] message: '+ JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/login]...fail');
                next(err);
              });
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/login] message: '+ JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/login]...fail');
            next(err);
          });
      })
      .catch(function(err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/login] message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/login]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/login] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/login]...fail');
    next(err);
  }
}

// change store user password
export function changePassword(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/changePassword]...');
    var storeUser = req.decoded;

    db.StoreUsers.find({
      attributes: ['userId','password'],
      where: {
          userName: {
              [db.Op.eq]: storeUser.userName
          }
      }
    })
      .then(storeUser => {
        if(storeUser === null || storeUser === undefined){
          let errMessage = 'StoreUser not found.';
          throw new ApiException(400, errMessage, errMessage);
        }

        var isValid = CommonHelper.comparePassword(req.body.oldPassword,storeUser.password);
        if(!isValid){
          let errMessage = 'Old password not matched.';
          throw new ApiException(400, errMessage, errMessage);
        }

        let newPasswordHash = CommonHelper.hashPassword(req.body.newPassword);
        storeUser.update({
          password: newPasswordHash.hash
        })
          .then(function (updatedRecord) {
            var apiResponse = {status: 'success',message: 'Password changed successfully!'};
            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/changePassword] message: ', JSON.stringify(apiResponse));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/changePassword]...success');
            res.status(200).json(apiResponse);
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/changePassword] message: '+ JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/changePassword]...fail');
            next(err);
          });
      })
      .catch(function(err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/changePassword] message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/changePassword]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/changePassword] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/changePassword]...fail');
    next(err);
  }
}

// manage store user forgot password
export function forgotPassword(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/forgotPassword]...');

    db.StoreUsers.find({
      where: {
          userName: {
              [db.Op.eq]: req.body.userName
          }
      }
    })
      .then(storeUser => {
        if(storeUser === null || storeUser === undefined){
          let errMessage = 'Invalid UserName!';
          throw new ApiException(400, errMessage, errMessage);
        }

        if(storeUser.emailAddress !== req.body.emailAddress){
          let errMessage = 'EmailAddress mismatch with register email address!';
          throw new ApiException(400, errMessage, errMessage);
        }

        CommonHelper.getCurrentGMTDateByStoreId(storeUser.storeId)
          .then(function (currentDate) {
            let forgotPasswordId = (CommonHelper.getNewUniqueId()).toString();
            db.ForgotPassword.build({
              forgotPasswordId: forgotPasswordId,
              userId: storeUser.userId,
              requestDateTime: currentDate,
              createdAt: currentDate,
              updatedAt: currentDate
            })
              .save()
              .then(function (savedRecord) {
                let encryptedToken = cryptoHelper.encrypt(forgotPasswordId);

                let fullName = storeUser.firstName+' '+ storeUser.lastName;
                sendForgotPasswordEmail(storeUser.emailAddress, storeUser.userName, fullName, encryptedToken)
                  .then(function (status) {
                      let apiResponse = {
                        message: 'Forgot password email sent successfully.'
                      };

                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/forgotPassword] message: '+ JSON.stringify(apiResponse));
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/forgotPassword]...success');
                    res.status(200).json(apiResponse);
                  })
                  .catch(function (err) {
                    let friendlyMessage = 'Forgot password email sending failed! Please try again later.';
                    let errMessage = err.message;
                    throw new ApiException(400, errMessage, friendlyMessage);
                  });
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/forgotPassword] message: '+ JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/forgotPassword]...fail');
                next(err);
              });
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/forgotPassword] message: '+ JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/forgotPassword]...fail');
            next(err);
          });
      })
      .catch(function(err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/forgotPassword] message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/forgotPassword]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/forgotPassword] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/forgotPassword]...fail');
    next(err);
  }
}

// API to validate reset password token
export function checkResetPassword(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/checkResetPassword]...');

    let apiResponse = {
      status:'ValidToken',
      message: 'Token is valid',
      data:{}
    };

    let token = cryptoHelper.decrypt(req.body.token);
    if(!token){
      apiResponse.status = 'InvalidToken';
      apiResponse.message = 'Invalid Token! Try with valid token.';

      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/checkResetPassword] message: '+ JSON.stringify(apiResponse));
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/checkResetPassword]...success');
      res.status(200).json(apiResponse);
    }
    else {
      db.ForgotPassword.find({
        where: {
            forgotPasswordId: {
                [db.Op.eq]: token
            }
        }
      })
        .then(forgotPassword => {
          if (!forgotPassword) {
            apiResponse.status = 'InvalidToken';
            apiResponse.message = 'Invalid Token! Try with valid token.';

            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/checkResetPassword] message: ' + JSON.stringify(apiResponse));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/checkResetPassword]...success');
            res.status(200).json(apiResponse);
          }
          else {
            if (!forgotPassword.isPasswordReset) {
              let requestDateTime = moment(forgotPassword.requestDateTime).add(24, 'hours');
              let currentDate = moment(Date.now());
              if (requestDateTime < currentDate) {
                apiResponse.status = 'TokenExpired';
                apiResponse.message = 'Token expired! Try with valid token.';
              }
            }
            else {
              apiResponse.status = 'PasswordAlreadyReset';
              apiResponse.message = 'Your password has already been Reset.';
            }

            db.StoreUsers.find({
              attributes: ['firstName','lastName','userName','userAvatar'],
              where: {
                  userId: {
                      [db.Op.eq]: forgotPassword.userId
                  }
              }
            })
              .then(function (storeUser) {
                if (storeUser) {
                  apiResponse.data = {
                    firstName: storeUser.firstName,
                    lastName: storeUser.lastName,
                    userName: storeUser.userName,
                    userAvatar: storeUser.userAvatar
                  };
                }

                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/checkResetPassword] message: ' + JSON.stringify(apiResponse));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/checkResetPassword]...success');
                res.status(200).json(apiResponse);
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/checkResetPassword] message: ' + JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/checkResetPassword]...fail');
                next(err);
              });
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/checkResetPassword] message: ' + JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/checkResetPassword]...fail');
          next(err);
        });
    }
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/checkResetPassword] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/checkResetPassword]...fail');
    next(err);
  }
}

// API to reset store user password
export function resetPassword(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/resetPassword]...');

    let apiResponse = {
      status:'ValidToken',
      message: 'Token is valid'
    };

    let token = cryptoHelper.decrypt(req.body.token);
    if(!token){
      apiResponse.status = 'InvalidToken';
      apiResponse.message = 'Invalid Token! Try with valid token.';

      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/resetPassword] message: '+ JSON.stringify(apiResponse));
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...success');
      res.status(200).json(apiResponse);
    }
    else {
      db.ForgotPassword.find({
        where: {
            forgotPasswordId: {
                [db.Op.eq]: token
            }
        }
      })
        .then(forgotPassword => {
          if (!forgotPassword) {
            apiResponse.status = 'InvalidToken';
            apiResponse.message = 'Invalid Token! Try with valid token.';

            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(apiResponse));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...success');
            res.status(200).json(apiResponse);
          }

          if (!forgotPassword.isPasswordReset) {
            let requestDateTime = moment(forgotPassword.requestDateTime).add(24, 'hours');
            let currentDate = moment(Date.now());
            if (requestDateTime < currentDate) {
              apiResponse.status = 'TokenExpired';
              apiResponse.message = 'Token expired! Try with valid token.';

              GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(apiResponse));
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...success');
              res.status(200).json(apiResponse);
            }
            else {
              db.StoreUsers.find({
                attributes: ['userId','storeId','userName','firstName','lastName','emailAddress','password','updatedAt'],
                where: {
                    userId: {
                        [db.Op.eq]: forgotPassword.userId
                    }
                }
              })
                .then(function (storeUser) {
                  if (!storeUser) {
                    apiResponse.status = 'InvalidToken';
                    apiResponse.message = 'Invalid Token! Try with valid token.';

                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(apiResponse));
                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...success');
                    res.status(200).json(apiResponse);
                  }
                  else {
                    CommonHelper.getCurrentGMTDateByStoreId(storeUser.storeId)
                      .then(function (currentDate) {
                        let passwordHashObj = CommonHelper.hashPassword(req.body.newPassword);
                        storeUser.password = passwordHashObj.hash;
                        storeUser.updatedAt = currentDate;

                        storeUser
                          .save()
                          .then(function (data) {
                            forgotPassword.isPasswordReset = true;
                            forgotPassword.resetDateTime = currentDate;
                            forgotPassword.updatedAt = currentDate;

                            forgotPassword
                              .save()
                              .then(function (data) {
                                let fullName = storeUser.firstName + ' ' + storeUser.lastName;
                                sendResetPasswordEmail(storeUser.emailAddress, storeUser.userName, fullName)
                                  .then(function (result) {
                                    apiResponse.status = 'success';
                                    apiResponse.message = 'Password has been reset.';

                                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(apiResponse));
                                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...success');
                                    res.status(200).json(apiResponse);
                                  })
                                  .catch(function (err) {
                                    apiResponse.status = 'success';
                                    apiResponse.message = 'Password has been reset but email sent failed.';

                                    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/resetPassword] error message: ' + err.message);
                                    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(apiResponse));
                                    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...success');
                                    res.status(200).json(apiResponse);
                                  });
                              })
                              .catch(function (err) {
                                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(err.message));
                                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...fail');
                                next(err);
                              });
                          })
                          .catch(function (err) {
                            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(err.message));
                            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...fail');
                            next(err);
                          });
                      })
                      .catch(function (err) {
                        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(err.message));
                        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...fail');
                        next(err);
                      });
                  }
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(err.message));
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...fail');
                  next(err);
                });
            }
          }
          else {
            apiResponse.status = 'PasswordAlreadyReset';
            apiResponse.message = 'Your password has already been Reset.';

            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(apiResponse));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...success');
            res.status(200).json(apiResponse);
          }
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/resetPassword] message: ' + JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...fail');
          next(err);
        });
    }
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/resetPassword] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/resetPassword]...fail');
    next(err);
  }
}


// Get store user roles
export function getStoreUserRoles(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [GET:dds/getStoreUserRoles]...');

    let loginUser = req.decoded;
    if(loginUser.roleOrder > 2){
      let errMessage = 'Insufficient Permission! you are not allowed to get role details';
      throw new ApiException(400, errMessage, errMessage);
    }

    db.StoreUserRoles.findAll({
      attributes: ['roleId','roleName','roleOrder'],
      where:{
        roleOrder:{
          [db.Op.gt]: loginUser.roleOrder
        }
      }
    })
      .then(function (storeUserRoles) {
        const storeUserRolesObj = storeUserRoles.map(item => {
          return Object.assign(
            {},
             {
              roleId: item.roleId,
              roleName: item.roleName,
              roleOrder: item.roleOrder
            });
        });

        GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[GET:dds/getStoreUserRoles] message: stores user roles fetched successfully. count: ' + storeUserRolesObj.length);
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStoreUserRoles]...success');

        let apiResponseData = {
          roles: storeUserRolesObj
        };
        res.status(200).json(apiResponseData);
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/getStoreUserRoles] message: ' + JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStoreUserRoles]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/getStoreUserRoles] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStoreUserRoles]...fail');
    next(err);
  }
}

// Get store users list
export function getStoreUsers(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [GET:dds/getStoreUsers]...');

    let loginUser = req.decoded;
    if(loginUser.roleOrder > 2){
      let errMessage = 'Insufficient Permission! you are not allowed to get store user list.';
      throw new ApiException(400, errMessage, errMessage);
    }

    db.StoreUsers.findAll({
      where:{
          storeId: {
              [db.Op.eq]: req.params.storeId
          }
      }
    })
      .then(function (storeUsers) {
        let roleIdArr = new Array();
        storeUsers.forEach(function(item) {
          if(roleIdArr.indexOf(item.roleId) < 0)
          roleIdArr.push(item.roleId);
        });

        db.StoreUserRoles.findAll({
          attributes: ['roleId','roleName'],
          where: {
            roleId: {
              [db.Op.in]: roleIdArr
            },
            roleOrder:{
              [db.Op.gt]: loginUser.roleOrder
            }
          }
        })
          .then(function (storeUserRoles) {
            const storeUsersObj = storeUsers
              .filter(item => {
                let isRoleExists = false;
                storeUserRoles.map(storeUserRoleItem => {
                  if (item.roleId === storeUserRoleItem.roleId) {
                    isRoleExists = true;
                  }
                });

                if (isRoleExists) {
                  return item;
                }
              })
              .map(item => {
                let roleName = '';
                storeUserRoles.map(role => {
                  if (role.roleId === item.roleId) {
                    roleName = role.roleName;
                  }
                });

                //tidy up the store details in separate objects
                return Object.assign(
                  {},
                  {
                    userId: item.userId,
                    userName: item.userName,
                    storeId: item.storeId,
                    emailAddress: item.emailAddress,
                    roleId: item.roleId,
                    roleName: roleName,
                    userAvatar: item.userAvatar,
                    firstName: item.firstName,
                    lastName: item.lastName,
                    isActive: item.isActive
                  });
              });

            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[GET:dds/getStoreUsers] message: store users fetched successfully. count: ' + storeUsersObj.length);
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStoreUsers]...success');

            let apiResponseData = {
              storeId: req.params.storeId,
              users: storeUsersObj
            };
            res.status(200).json(apiResponseData);
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/getStoreUsers] message: ' + JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStoreUsers]...fail');
            next(err);
          });
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/getStoreUsers] message: ' + JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStoreUsers]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/getStoreUsers] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStoreUsers]...fail');
    next(err);
  }
}

// Get stores list
export function getStores(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [GET:dds/getStores]...');

    let loginUser = req.decoded;
    if(loginUser.roleOrder !== 1){
      let errMessage = 'Insufficient Permission! Only system admin user can allow to get stores.';
      throw new ApiException(400, errMessage, errMessage);
    }

    db.Stores.findAll({
      attributes:['storeId','storeName','latitude','longitude','deliveryZone','gmtOffset','wideGeofenceInMeters','frequencyOutsideInSecs','frequencyInsideInSecs','isActive']
    })
      .then(function (stores) {
        axios.get(config.externalApi.getDriveByAvailability)
          .then(function (storeAvailabilityResult) {
            var storeAvailability = null;
            if(storeAvailabilityResult){
              storeAvailability = storeAvailabilityResult.data;
            }
            let storesObj = mapStoreObject(stores, storeAvailability);

            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[GET:dds/getStores] message: stores fetched successfully. count: ' + storesObj.length);
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStores]...success');
            res.status(200).json(storesObj);
          })
          .catch(function (err) {
            let storesObj = mapStoreObject(stores, null);

            var errorMessage = err.message;
            if (err.response){
              errorMessage = err.response.data;
            }

            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/getStores] getDriveByAvailability error: '+ JSON.stringify(errorMessage));
            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[GET:dds/getStores] message: stores fetched successfully. count: ' + storesObj.length);
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStores]...success');
            res.status(200).json(storesObj);
          });
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/getStores] message: ' + JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStores]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/getStores] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/getStores]...fail');
    next(err);
  }
}

function mapStoreObject(stores, storeAvailability) {
  const storesObj = stores.map(item => {
    let throttle = null;
    let leanplumAttribute = null;
    let availability = null;
    if(storeAvailability) {
      storeAvailability.map(store => {
        if (store.storeId === item.storeId) {
          throttle = store.throttle;
          leanplumAttribute = store.leanplumAttribute;
          availability = store.availability;
        }
      });
    }

    //tidy up the store details in separate objects
    return Object.assign(
      {},
      {
        storeId: item.storeId,
        storeName: item.storeName,
        latitude: item.latitude,
        longitude: item.longitude,
        deliveryZone: CommonHelper.parseDeliveryZone(item.deliveryZone),
        gmtOffset: item.gmtOffset,
        wideGeofenceInMeters: item.wideGeofenceInMeters,
        frequencyOutsideInSecs: item.frequencyOutsideInSecs,
        frequencyInsideInSecs: item.frequencyInsideInSecs,
        isActive: item.isActive,
        throttle,
        leanplumAttribute,
        availability
      });
  });

  return storesObj;
}

// Insert/Update StoreConfig Details
export function upsertStoreConfigDetails(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/storeConfig]...');

    let loginUser = req.decoded;
    if(loginUser.roleOrder !== 1){
      let errMessage = 'Insufficient Permission! Only system admin user can allow to configure store details.';
      throw new ApiException(400, errMessage, errMessage);
    }

    if(req.body.deliveryZone.type.toLowerCase() === "radius" && !req.body.deliveryZone.radiusInMeter){
      let errMessage = 'radiusInMeter field value must be required when type is radius.';
      throw new ApiException(400, errMessage, errMessage);
    }
    else if(req.body.deliveryZone.type.toLowerCase() === "polygon" && !req.body.deliveryZone.polygon){
      let errMessage = 'polygon field value must be required when type is polygon.';
      throw new ApiException(400, errMessage, errMessage);
    }

    let polygon= req.body.deliveryZone.polygon;
    let polygonArr=[];
    if(polygon){
      for(let i=0;i<polygon.length;i++){
        polygonArr[i]={
          latitude: polygon[i].latitude,
          longitude: polygon[i].longitude
        }
      }
    }

    let deliveryZone = {
      type: req.body.deliveryZone.type,
      radiusInMeter: req.body.deliveryZone.radiusInMeter,
      polygon: polygonArr
    };

    CommonHelper.getCurrentGMTDateByStoreId(req.body.storeId)
      .then(function (currentDate) {
        db.Stores.find({
          where: {
              storeId: {
                  [db.Op.eq]: req.body.storeId
              }
          }
        })
          .then(function (storeResult) {
            if(storeResult){
              //Update existing record
              storeResult.storeName = req.body.storeName;
              storeResult.latitude = req.body.latitude;
              storeResult.longitude = req.body.longitude;
              storeResult.deliveryZone = JSON.stringify(deliveryZone);
              storeResult.gmtOffset = req.body.gmtOffset;
              storeResult.wideGeofenceInMeters = req.body.wideGeofenceInMeters;
              storeResult.frequencyOutsideInSecs = req.body.frequencyOutsideInSecs;
              storeResult.frequencyInsideInSecs = req.body.frequencyInsideInSecs;
              storeResult.isActive = req.body.availability;
              storeResult.updatedAt = currentDate;

              storeResult
                .save()
                .then(function (response) {
                  var apiResponse = {
                    storeId: response.storeId,
                    storeName: response.storeName,
                    latitude: response.latitude,
                    longitude: response.longitude,
                    deliveryZone: CommonHelper.parseDeliveryZone(response.deliveryZone),
                    gmtOffset: response.gmtOffset,
                    wideGeofenceInMeters: response.wideGeofenceInMeters,
                    frequencyOutsideInSecs: response.frequencyOutsideInSecs,
                    frequencyInsideInSecs: response.frequencyInsideInSecs,
                    isActive: response.isActive
                  };


                  //Update store details in cache
                  CommonHelper.setStoreDetailsInCache({
                    storeId: response.storeId,
                    storeName: response.storeName,
                    latitude: response.latitude,
                    longitude: response.longitude,
                    deliveryZone: CommonHelper.parseDeliveryZone(response.deliveryZone),
                    gmtOffset: response.gmtOffset,
                    wideGeofenceInMeters: response.wideGeofenceInMeters,
                    frequencyOutsideInSecs: response.frequencyOutsideInSecs,
                    frequencyInsideInSecs: response.frequencyInsideInSecs
                  });

                  upsertDriveByAvailability({
                    storeId: req.body.storeId,
                    storeName: req.body.storeName,
                    throttle: req.body.throttle,
                    leanplumAttribute: req.body.leanplumAttribute,
                    availability: req.body.availability
                  })
                    .then(function (data) {
                      apiResponse.throttle = req.body.throttle;
                      apiResponse.leanplumAttribute = req.body.leanplumAttribute;
                      apiResponse.availability = req.body.availability;

                      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(apiResponse));
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...success');
                      res.status(200).json(apiResponse);
                    })
                    .catch(function (err) {
                      apiResponse.throttle = null;
                      apiResponse.leanplumAttribute = null;
                      apiResponse.availability = null;
                      apiResponse.message = 'DriveBy availability failed to save at sql database';
                      var errorMessage = err.message;
                      if (err.response){
                        apiResponse.moreinfo = err.response.data;
                        errorMessage = err.response.data;
                      }

                      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeConfig] upsertDriveByAvailability error: '+ JSON.stringify(errorMessage));
                      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(apiResponse));
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...success');
                      res.status(200).json(apiResponse);
                    });
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(err.message));
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...fail');
                  next(err);
                });
            }
            else {
              //Insert new record
              db.Stores.build({
                storeId: req.body.storeId,
                storeName: req.body.storeName,
                latitude: req.body.latitude,
                longitude: req.body.longitude,
                deliveryZone: JSON.stringify(deliveryZone),
                gmtOffset: req.body.gmtOffset,
                wideGeofenceInMeters: req.body.wideGeofenceInMeters,
                frequencyOutsideInSecs: req.body.frequencyOutsideInSecs,
                frequencyInsideInSecs: req.body.frequencyInsideInSecs,
                isActive: req.body.availability,
                createdAt: currentDate,
                updatedAt: currentDate
              })
                .save()
                .then(function (storeResponse) {
                  var apiResponse = {
                    storeId: storeResponse.storeId,
                    storeName: storeResponse.storeName,
                    latitude: storeResponse.latitude,
                    longitude: storeResponse.longitude,
                    deliveryZone: CommonHelper.parseDeliveryZone(storeResponse.deliveryZone),
                    gmtOffset: storeResponse.gmtOffset,
                    wideGeofenceInMeters: storeResponse.wideGeofenceInMeters,
                    frequencyOutsideInSecs: storeResponse.frequencyOutsideInSecs,
                    frequencyInsideInSecs: storeResponse.frequencyInsideInSecs,
                    isActive: storeResponse.isActive
                  };

                  //Add store in ActiveStore cache
                  CommonHelper.setActiveStoreInCache(storeResponse.storeName);

                  //Add store details in cache
                  CommonHelper.setStoreDetailsInCache({
                    storeId: storeResponse.storeId,
                    storeName: storeResponse.storeName,
                    latitude: storeResponse.latitude,
                    longitude: storeResponse.longitude,
                    deliveryZone: CommonHelper.parseDeliveryZone(storeResponse.deliveryZone),
                    gmtOffset: storeResponse.gmtOffset,
                    wideGeofenceInMeters: storeResponse.wideGeofenceInMeters,
                    frequencyOutsideInSecs: storeResponse.frequencyOutsideInSecs,
                    frequencyInsideInSecs: storeResponse.frequencyInsideInSecs
                  });

                  upsertDriveByAvailability({
                    storeId: req.body.storeId,
                    storeName: req.body.storeName,
                    throttle: req.body.throttle,
                    leanplumAttribute: req.body.leanplumAttribute,
                    availability: req.body.availability
                  })
                    .then(function (data) {
                      apiResponse.throttle = req.body.throttle;
                      apiResponse.leanplumAttribute = req.body.leanplumAttribute;
                      apiResponse.availability = req.body.availability;
                      apiResponse.message = 'DriveBy availability saved successfully.';

                      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(apiResponse));
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...success');
                      res.status(200).json(apiResponse);
                    })
                    .catch(function (err) {
                      apiResponse.throttle = null;
                      apiResponse.leanplumAttribute = null;
                      apiResponse.availability = null;
                      apiResponse.message = 'DriveBy availability failed to save at sql database';
                      var errorMessage = err.message;
                      if (err.response){
                        apiResponse.moreinfo = err.response.data;
                        errorMessage = err.response.data;
                      }

                      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeConfig] upsertDriveByAvailability error: '+ JSON.stringify(errorMessage));
                      GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(apiResponse));
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...success');
                      res.status(200).json(apiResponse);
                    });
                })
                .catch(function (errResponse) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(errResponse.message));
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...fail');
                  next(errResponse);
                });
            }
          })
          .catch(function (storeErr) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(storeErr));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...fail');
            next(storeErr);
          });
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeConfig] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeConfig]...fail');
    next(err);
  }
}

function upsertDriveByAvailability(obj) {
  return new Promise(function (resolve, reject) {
    axios.post(config.externalApi.upsertDriveByAvailability, {
      storeId: obj.storeId,
      storeName: obj.storeName,
      throttle: obj.throttle,
      leanplumAttribute: obj.leanplumAttribute,
      availability: obj.availability
    })
      .then(function (response) {
        return resolve(response);
      })
      .catch(function (err) {
        return reject(err);
      });
  });
}

// Upload store user avatar
export function uploadStoreUserAvatar(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/storeUserAvatar]...');

    if (req.files) {
      let loginUser = req.decoded;
      if (loginUser.userId !== req.body.userId) {
        let errMessage = 'UserId not matched with requested userId!';
        throw new ApiException(400, errMessage, errMessage);
      }

      let avatarFile = req.files.storeUserAvatar;
      var originalFileName = avatarFile.name;

      if (!(/\.(gif|jpg|jpeg|tiff|png)$/i).test(originalFileName)) {
        let errMessage = 'Only gif|jpg|jpeg|tiff|png file allowed!';
        throw new ApiException(400, errMessage, errMessage);
      }

      let fileExt = path.extname(originalFileName);
      let avatarFileName = req.body.userId + fileExt;
      let avatarThumbFileName = req.body.userId + '_thumb' + fileExt;

      let bucketName = config.awsS3Bucket.BucketName;
      let ddsUserAvatarPath = config.awsS3Bucket.ddsUserAvatarPath;
      let avatarFileNamePath = ddsUserAvatarPath + avatarFileName;
      let avatarThumbFileNamePath = ddsUserAvatarPath + avatarThumbFileName;

      let awsS3Helper = new AwsS3Helper();
      awsS3Helper.createAndUploadThumbnail(bucketName, avatarThumbFileNamePath, avatarFile)
        .then(function (uploadResponse) {
          awsS3Helper.getFileUrl(bucketName, avatarThumbFileNamePath)
            .then(function (urlResponse) {
              //Upload original image
              awsS3Helper.UploadFile(bucketName, avatarFileNamePath, avatarFile)
                .then(function (data) {
                  //Original Image save success
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeUserAvatar] message: '+ JSON.stringify(err.message));
                });

              db.StoreUsers.update({
                userAvatarS3Key: avatarThumbFileNamePath,
                userAvatar: urlResponse.url,
                userAvatarUrlExpiration: urlResponse.urlExpiration,
                originalUserAvatarS3Key: avatarFileNamePath
              }, {
                where: {
                    userId: {
                        [db.Op.eq]: req.body.userId
                    }
                }
              })
                .then(function (response) {
                  let apiResponse = {message: 'File uploaded successfully!', appUserAvatar: urlResponse.url};

                  GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/storeUserAvatar] message: '+ JSON.stringify(apiResponse));
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeUserAvatar]...success');
                  res.status(200).json(apiResponse);
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeUserAvatar] message: '+ JSON.stringify(err.message));
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeUserAvatar]...fail');
                  next(err);
                });
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeUserAvatar] message: '+ JSON.stringify(err.message));
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeUserAvatar]...fail');
              next(err);
            });
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeUserAvatar] message: '+ JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeUserAvatar]...fail');
          next(err);
        });
    }
    else {
      let errMessage = 'UserAvatar image file must be required!';
      throw new ApiException(400, errMessage, errMessage);
    }
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/storeUserAvatar] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/storeUserAvatar]...fail');
    next(err);
  }
}

// Update driveByRequest Status in the DB
export function updateDriveByRequestStatus(req, res, next) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber:req.body.orderNumber
  });
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/updateStatus]...');

    //PubNub Connection
    let pubnubHelper = new PubnubHelper();
    //Publish update status message
    updateStatusMessage({
      customerId: req.body.customerId,
      orderNumber:req.body.orderNumber,
      newStatus: req.body.status
    });

    let apiResponse = {status: 'success', message: 'DriveBy request status updated successfully!'};

    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/updateStatus] message: '+ JSON.stringify(apiResponse));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/updateStatus]...success');

    res.status(200).json(apiResponse);
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/updateStatus] message: '+ JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/updateStatus]...fail');
    next(err);
  }
}

// API to write DDS logs to server
export function writeLogToServer(req, res, next) {
  try {
    let uniqueId = 'DDS-FrontEnd-Logs';
    let logLevel = req.body.logLevel;
    let message = req.body.message;
    GyGLog.writeLog(logLevel, uniqueId, message);
    res.status(200).json({status:'success'});
  } catch(err) {
    next(err);
  }
}

//Publish location change message to appLocation channel
export function publishLocationChangeMessage(req, res, next) {
  let publishMessageObj = req.body.pubnubMessage;
  let uniqueId = CommonHelper.getNewUniqueId();
  if(publishMessageObj && publishMessageObj.data && publishMessageObj.data.order){
    uniqueId = CommonHelper.getUniqueIdFromCache({
      orderNumber: publishMessageObj.data.order.orderNumber
    });
  }
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:dds/publishLocationChangeMessage]...');

    let orderChannelNames = CommonHelper.buildOrderChannelNames(publishMessageObj.data.order.orderNumber);
    //PubNub Connection
    let pubnubHelper = new PubnubHelper();

    pubnubHelper.publishMessage(orderChannelNames.appLocationChannelName, publishMessageObj, uniqueId);

    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/publishLocationChangeMessage] message: success');
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/publishLocationChangeMessage]...success');
    res.status(200).json({status:'success'});
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/publishLocationChangeMessage] message: '+err.message);
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/publishLocationChangeMessage]...fail');
    next(err);
  }
}

//Publish pubnub message to apiListen channel
export function publishMessageToApiListenChannel(req, res, next) {
  let publishMessageObj = req.body.pubnubMessage;
  let uniqueId = CommonHelper.getNewUniqueId();
  if(publishMessageObj && publishMessageObj.data && publishMessageObj.data.order){
    uniqueId = CommonHelper.getUniqueIdFromCache({
      orderNumber: publishMessageObj.data.order.orderNumber
    });
  }
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, null, 'Entering [POST:dds/publishMessageToApiListenChannel]...');

    let orderChannelNames = CommonHelper.buildOrderChannelNames(publishMessageObj.data.order.orderNumber);
    //PubNub Connection
    let pubnubHelper = new PubnubHelper();

    pubnubHelper.publishMessage(orderChannelNames.apiListenChannelName, publishMessageObj, uniqueId);

    GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/publishMessageToApiListenChannel] message: success');
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/publishMessageToApiListenChannel]...success');
    res.status(200).json({status:'success'});
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/publishMessageToApiListenChannel] message'+ err.message);
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/publishMessageToApiListenChannel]...fail');
    next(err);
  }
}


//Publish pubnub message to apiListen channel
export function testPushNotification(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, null, 'Entering [POST:dds/testPushNotification]...');

    let deviceType = req.body.deviceType;
    let devicePushToken = req.body.devicePushToken;
    let badge = req.body.badge;
    let message = req.body.message;

    let pushNotificationHelper= new PushNotificationHelper();
    pushNotificationHelper.sendPushNotification(deviceType, devicePushToken, message, badge)
      .then(function (data) {
        GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:dds/testPushNotification] message: '+JSON.stringify(data));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/testPushNotification]...success');
        res.status(200).json(data);
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/testPushNotification] message'+ err.message);
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/testPushNotification]...fail');
        next(err);
      });
  } catch(err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:dds/testPushNotification] message'+ err.message);
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:dds/testPushNotification]...fail');
    next(err);
  }
}
