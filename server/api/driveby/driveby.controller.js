/**
 * POST     /api/driveby/request                  ->  API to insert/update driveby request to database and publish message to appropriate channel
 * PUT      /api/driveby/request                  ->  API to update existing driveby request to database and publish message to DDS channel
 * POST     /api/driveby/appUserAvatar            ->  API to upload appUserAvatar to AWS S3 and give avatar url in response
 * GET      /api/driveby/checkStore/:storeId      ->  API to check if DriveBy enable for store
 */

'use strict';

import db from '../../sqldb';
import ApiException from '../ApiException';
import {PubnubHelper} from '../PubnubHelper';
import path from 'path';
import AwsS3Helper  from '../AwsS3Helper';
import config from '../../config/environment';
import {CommonHelper} from '../CommonHelper';
import moment from 'moment';
import GyGLog from '../../logging/GyGLog';
import {processLocationChangeFrequencyForOrder} from '../JobScheduleHelper';

// Insert/Update driveByRequest in the DB
export function upsertDriveByRequest(req, res, next) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: req.body.order.orderNumber
  });
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:driveby/request]...');

    let isLatitude = false;
    let isLongitude = false;
    if (req.body.location.latitude) {
      isLatitude = true;
    }
    if (req.body.location.longitude) {
      isLongitude = true;
    }
    if (isLatitude !== isLongitude) {
      let errMessage = 'Require either both latitude and longitude or neither';
      throw new ApiException(400, errMessage, errMessage);
    }

    let pickupDate = moment(req.body.order.pickUpDate, 'YYYY-MM-DD');
    if (!pickupDate) {
      let errMessage = 'PickUpDate must be in YYYY-MM-DD format.';
      throw new ApiException(400, errMessage, errMessage);
    }

    db.DriveByRequest.find({
      where: {
        orderNumber: {
          [db.Op.eq]: req.body.order.orderNumber
        }
      }
    })
      .then(function (existingDriveByRequest) {
        if (existingDriveByRequest) {
          //Update existing record
          updateDriveByRequestMethod(req, existingDriveByRequest, uniqueId)
            .then(function (data) {
              GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:driveby/request] message: ' + JSON.stringify(data));
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/request]...success');

              res.status(200).json(data);
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/request] message: ' + JSON.stringify(err.message));
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/request]...fail');
              next(err);
            });
        }
        else {
          //Insert new record
          newDriveByRequestMethod(req, null, uniqueId)
            .then(function (data) {
              GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:driveby/request] message: ' + JSON.stringify(data));
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/request]...success');

              res.status(200).json(data);
            })
            .catch(function (err) {
              if (err.name === 'SequelizeUniqueConstraintError') {
                let errMessage = 'Validation Error: OrderNumber must be unique!';
                throw new ApiException(400, errMessage, errMessage);
              }

              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/request] message: ' + JSON.stringify(err.message));
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/request]...fail');
              next(err);
            });
        }
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
        next(err);
      });

  } catch (err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/request] message: ' + JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/request]...fail');
    next(err);
  }
}

function newDriveByRequestMethod(req, existingDriveByRequest, uniqueId) {
  return new Promise(function (resolve, reject) {
    let status = 'Requested';
    let randomTileColor = CommonHelper.getRandomColor();
    CommonHelper.getCurrentGMTDateByStoreName(req.body.order.storeName)
      .then(function (currentDate) {
        if (req.body.order.pickUpDate !== currentDate.format('YYYY-MM-DD')) {
          let errMessage = 'PickUpDate must be today\'s date!';
          throw new ApiException(400, errMessage, errMessage);
        }

        if (existingDriveByRequest) {
          //Order Details
          existingDriveByRequest.customerId = req.body.order.customerId;
          existingDriveByRequest.storeName = req.body.order.storeName;
          existingDriveByRequest.pickUpTime = req.body.order.pickUpTime;
          existingDriveByRequest.pickUpDate = req.body.order.pickUpDate;
          //Customer Details
          existingDriveByRequest.firstName = req.body.customer.firstName;
          existingDriveByRequest.lastName = req.body.customer.lastName;
          existingDriveByRequest.emailAddress = req.body.customer.emailAddress;
          existingDriveByRequest.phoneNumber = req.body.customer.phoneNumber;
          //DriveBy Details
          existingDriveByRequest.modeOfTransport = req.body.driveByDetails.modeOfTransport;
          existingDriveByRequest.transportColor = req.body.driveByDetails.transportColor;
          existingDriveByRequest.tileColor = randomTileColor;
          existingDriveByRequest.licensePlateNumber = req.body.driveByDetails.licensePlateNumber;
          existingDriveByRequest.status = status;
          existingDriveByRequest.requestDateTime = currentDate;
          existingDriveByRequest.actionDateTime = currentDate;
          existingDriveByRequest.notes = req.body.driveByDetails.notes;
          //General Details
          existingDriveByRequest.deviceType = req.body.deviceType;
          existingDriveByRequest.appVersion = req.body.appVersion;
          existingDriveByRequest.updatedAt = currentDate;

          existingDriveByRequest
            .save()
            .then(function (updatedRecord) {
              //Add new request in active DriveByRequest cache
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

              //Call location change pubnub method to calculate and validate using google distance matrix
              callLocationChangeMethod({
                customerId: existingDriveByRequest.customerId,
                orderNumber: existingDriveByRequest.orderNumber,
                storeName: existingDriveByRequest.storeName,
                modeOfTransport: existingDriveByRequest.modeOfTransport,
                latitude: req.body.location.latitude,
                longitude: req.body.location.longitude,
                sequence: req.body.location.sequence
              });

              let ApiResponseData = newDriveByRequestResponse(existingDriveByRequest, uniqueId, currentDate);
              return resolve(ApiResponseData);
            })
            .catch(function (err) {
              return reject(err);
            });
        }
        else {
          db.DriveByRequest.build({
            //Order Details
            orderNumber: req.body.order.orderNumber,
            customerId: req.body.order.customerId,
            storeName: req.body.order.storeName,
            pickUpTime: req.body.order.pickUpTime,
            pickUpDate: req.body.order.pickUpDate,
            //Customer Details
            firstName: req.body.customer.firstName,
            lastName: req.body.customer.lastName,
            emailAddress: req.body.customer.emailAddress,
            phoneNumber: req.body.customer.phoneNumber,
            //DriveBy Details
            modeOfTransport: req.body.driveByDetails.modeOfTransport,
            transportColor: req.body.driveByDetails.transportColor,
            tileColor: randomTileColor,
            licensePlateNumber: req.body.driveByDetails.licensePlateNumber,
            status: status,
            requestDateTime: currentDate,
            actionDateTime: currentDate,
            notes: req.body.driveByDetails.notes,
            //General Details
            deviceType: req.body.deviceType,
            appVersion: req.body.appVersion,
            createdAt: currentDate,
            updatedAt: currentDate
          })
            .save()
            .then(function (response) {
              //Add new request in active DriveByRequest cache
              CommonHelper.setActiveDriveByRequestsCache({
                orderNumber: response.orderNumber,
                customerId: response.customerId,
                storeName: response.storeName,
                status: response.status,
                isRunningLate: response.isRunningLate,
                requestDateTime: response.requestDateTime,
                hereNowDateTime: response.hereNowDateTime,
                actionDateTime: response.actionDateTime,
                pickUpDate: response.pickUpDate,
                pickUpTime: response.pickUpTime,
                locationStatus: response.locationStatus
              });

              //Call location change pubnub method to calculate and validate using google distance matrix
              callLocationChangeMethod({
                customerId: response.customerId,
                orderNumber: response.orderNumber,
                storeName: response.storeName,
                modeOfTransport: response.modeOfTransport,
                latitude: req.body.location.latitude,
                longitude: req.body.location.longitude,
                sequence: req.body.location.sequence
              });

              let ApiResponseData = newDriveByRequestResponse(response, uniqueId, currentDate);
              return resolve(ApiResponseData);
            })
            .catch(function (err) {
              return reject(err);
            });
        }
      })
      .catch(function (err) {
        return reject(err);
      });
  });
}

function callLocationChangeMethod(obj) {
  try {
    if (obj.sequence) {
      CommonHelper.getStoreCacheByStoreName(obj.storeName)
        .then(function (storeConfig) {
          if (storeConfig) {
            let pubnubHelper = new PubnubHelper();
            pubnubHelper.customerLocationChange({
              customerId: obj.customerId,
              orderNumber: obj.orderNumber,
              storeId: storeConfig.storeId,
              customerLatitude: obj.latitude,
              customerLongitude: obj.longitude,
              sequence: obj.sequence,
              modeOfTransport: obj.modeOfTransport
            });
          }
        })
        .catch(function (err) {
          console.log('callLocationChangeMethod ' + err.message);
        });
    }
  }
  catch (err) {
    console.log('callLocationChangeMethod ' + err.message);
  }
}

function newDriveByRequestResponse(response, uniqueId, currentDate) {
  //Remove special characters except alphabets and numbers
  let controlChannelName = CommonHelper.buildStoreControlChannelName(response.storeName);
  let orderChannelNames = CommonHelper.buildOrderChannelNames(response.orderNumber);

  let ApiResponseData = DriveByRequestResponse({
    status: 'success',
    message: 'DriveBy request details saved successfully!',
    currentStatus: response.status,
    pickUpTime: response.pickUpTime,
    currentDate,
    controlChannelName,
    appLocationChannelName: orderChannelNames.appLocationChannelName,
    appListenChannelName: orderChannelNames.appListenChannelName,
    ddsListenChannelName: orderChannelNames.ddsListenChannelName,
    apiListenChannelName: orderChannelNames.apiListenChannelName,
    appListenPresenceChannelName: orderChannelNames.appListenPresenceChannelName
  });

  let publishMessageObj = {
    messageType: 'newRequest',
    data: {
      driveByDetails: {
        modeOfTransport: response.modeOfTransport,
        transportColor: response.transportColor,
        tileColor: response.tileColor,
        licensePlateNumber: response.licensePlateNumber,
        userAvatar: response.userAvatar,
        status: response.status,
        requestDateTime: response.requestDateTime,
        actionDateTime: response.actionDateTime,
        notes: response.notes
      },
      location: {},
      customer: {
        firstName: response.firstName,
        lastName: response.lastName,
        emailAddress: response.emailAddress,
        phoneNumber: response.phoneNumber
      },
      order: {
        orderNumber: response.orderNumber,
        customerId: response.customerId,
        storeName: response.storeName,
        pickUpTime: response.pickUpTime,
        pickUpDate: response.pickUpDate
      },
      channels: {
        appLocationChannelName: orderChannelNames.appLocationChannelName,
        appListenChannelName: orderChannelNames.appListenChannelName,
        ddsListenChannelName: orderChannelNames.ddsListenChannelName,
        apiListenChannelName: orderChannelNames.apiListenChannelName,
        appListenPresenceChannelName: orderChannelNames.appListenPresenceChannelName
      }
    }
  };

  //PubNub Connection
  let pubnubHelper = new PubnubHelper();
  //Publish new driveBy request message to DDS control channel
  pubnubHelper.publishMessage(controlChannelName, publishMessageObj, uniqueId);
  //Subscribe orderNumber_AppLocation channel
  pubnubHelper.subscribeChannel(orderChannelNames.appLocationChannelName, uniqueId);
  //Subscribe orderNumber_apiListen channel
  pubnubHelper.subscribeChannel(orderChannelNames.apiListenChannelName, uniqueId);
  //Subscribe orderNumber_appListenPresence channel
  pubnubHelper.subscribeChannelWithOrderNumber(orderChannelNames.appListenPresenceChannelName, response.orderNumber, uniqueId);

  //Calculate and publish locationFrequency change message
  publishLocationChangeFrequencyMessage({
    storeName: response.storeName,
    orderNumber: response.orderNumber,
    customerId: response.customerId,
    currentDate: currentDate,
    readyInSeconds: ApiResponseData.readyInSeconds
  });

  return ApiResponseData;
}

function publishLocationChangeFrequencyMessage(obj) {
  try {
    CommonHelper.getStoreCacheByStoreName(obj.storeName)
      .then(function (storeCache) {
        let minPickupTimeLeftInSeconds = config.locationSettings.minPickupTimeLeftInSeconds;
        let frequencyOutsideInSecs = config.locationSettings.frequencyOutsideInSecs;
        if (storeCache.frequencyOutsideInSecs) {
          frequencyOutsideInSecs = storeCache.frequencyOutsideInSecs;
        }

        let locationStatus = '';
        if (obj.readyInSeconds <= minPickupTimeLeftInSeconds) {
          locationStatus = 'InsidePickupTime';
        }
        else {
          locationStatus = 'OutsidePickupTime';
          frequencyOutsideInSecs = 0;
        }

        processLocationChangeFrequencyForOrder({
          storeName: obj.storeName,
          orderNumber: obj.orderNumber,
          customerId: obj.customerId,
          locationStatus,
          frequencyInSeconds: frequencyOutsideInSecs,
          currentDate: obj.currentDate
        });
      })
      .catch(function (err) {
        //Get store cache error
        console.log(err);
      });
  }
  catch (err) {
    console.log(err);
  }
}

function updateDriveByRequestMethod(req, existingDriveByRequest, uniqueId) {
  return new Promise(function (resolve, reject) {
    let isNewRequest = false;
    if (!existingDriveByRequest.status) {
      isNewRequest = true;
    }

    CommonHelper.getCurrentGMTDateByStoreName(req.body.order.storeName)
      .then(function (currentDate) {
        if (isNewRequest) {
          //Insert new record
          newDriveByRequestMethod(req, existingDriveByRequest, uniqueId)
            .then(function (data) {
              return resolve(data);
            })
            .catch(function (err) {
              return reject(err);
            });
        }
        else {
          if (existingDriveByRequest.status && existingDriveByRequest.status.toLowerCase() === 'Completed'.toLowerCase()) {
            let errMessage = 'Requested order: ' + req.body.order.orderNumber + ' already completed!';
            throw new ApiException(400, errMessage, errMessage);
          }

          if (req.body.order.pickUpDate !== currentDate.format('YYYY-MM-DD')) {
            let errMessage = 'PickUpDate must be today\'s date!';
            throw new ApiException(400, errMessage, errMessage);
          }

          let oldStatus = existingDriveByRequest.status;
          if (oldStatus && oldStatus.toLowerCase() === 'Cancelled'.toLowerCase()) {
            let newStatus = 'ReRequested';
            existingDriveByRequest.status = newStatus;
            existingDriveByRequest.reRequestDateTime = currentDate;
          }

          //Order Details
          existingDriveByRequest.customerId = req.body.order.customerId;
          existingDriveByRequest.storeName = req.body.order.storeName;
          existingDriveByRequest.pickUpTime = req.body.order.pickUpTime;
          existingDriveByRequest.pickUpDate = req.body.order.pickUpDate;
          //Customer Details
          existingDriveByRequest.firstName = req.body.customer.firstName;
          existingDriveByRequest.lastName = req.body.customer.lastName;
          existingDriveByRequest.emailAddress = req.body.customer.emailAddress;
          existingDriveByRequest.phoneNumber = req.body.customer.phoneNumber;
          //DriveBy Details
          existingDriveByRequest.modeOfTransport = req.body.driveByDetails.modeOfTransport;
          existingDriveByRequest.transportColor = req.body.driveByDetails.transportColor;
          existingDriveByRequest.licensePlateNumber = req.body.driveByDetails.licensePlateNumber;
          existingDriveByRequest.notes = req.body.driveByDetails.notes;
          //General Details
          existingDriveByRequest.deviceType = req.body.deviceType;
          existingDriveByRequest.appVersion = req.body.appVersion;
          existingDriveByRequest.updatedAt = currentDate;

          existingDriveByRequest
            .save()
            .then(function (updatedRecord) {
              //Insert/Update request in active DriveByRequest cache
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

              //Call location change pubnub method to calculate and validate using google distance matrix
              callLocationChangeMethod({
                customerId: existingDriveByRequest.customerId,
                orderNumber: existingDriveByRequest.orderNumber,
                storeName: existingDriveByRequest.storeName,
                modeOfTransport: existingDriveByRequest.modeOfTransport,
                latitude: req.body.location.latitude,
                longitude: req.body.location.longitude,
                sequence: req.body.location.sequence
              });

              let controlChannelName = CommonHelper.buildStoreControlChannelName(existingDriveByRequest.storeName);
              let orderChannelNames = CommonHelper.buildOrderChannelNames(req.body.order.orderNumber);
              let publishMessageObj = {
                messageType: 'updateRequest',
                data: {
                  driveByDetails: {
                    modeOfTransport: req.body.driveByDetails.modeOfTransport,
                    transportColor: req.body.driveByDetails.transportColor,
                    licensePlateNumber: req.body.driveByDetails.licensePlateNumber,
                    status: existingDriveByRequest.status,
                    notes: req.body.driveByDetails.notes,
                    isRunningLate: existingDriveByRequest.isRunningLate
                  },
                  location: {},
                  order: {
                    customerId: req.body.order.customerId,
                    orderNumber: req.body.order.orderNumber
                  }
                }
              };

              //PubNub Connection
              let pubnubHelper = new PubnubHelper();

              let ddsChannelName = orderChannelNames.ddsListenChannelName;
              if (oldStatus && oldStatus.toLowerCase() === 'Cancelled'.toLowerCase()) {
                ddsChannelName = controlChannelName;
              }
              //Publish new driveBy request message to DDS control channel
              pubnubHelper.publishMessage(ddsChannelName, publishMessageObj, uniqueId);

              let apiResponse = DriveByRequestResponse({
                status: 'success',
                message: 'DriveBy request details updated successfully!',
                currentStatus: existingDriveByRequest.status,
                pickUpTime: existingDriveByRequest.pickUpTime,
                currentDate,
                controlChannelName,
                appLocationChannelName: orderChannelNames.appLocationChannelName,
                appListenChannelName: orderChannelNames.appListenChannelName,
                ddsListenChannelName: orderChannelNames.ddsListenChannelName,
                apiListenChannelName: orderChannelNames.apiListenChannelName,
                appListenPresenceChannelName: orderChannelNames.appListenPresenceChannelName
              });

              if (existingDriveByRequest.status && existingDriveByRequest.status.toLowerCase() === 'ReRequested'.toLowerCase()) {
                //Calculate and publish locationFrequency change message
                publishLocationChangeFrequencyMessage({
                  storeName: existingDriveByRequest.storeName,
                  orderNumber: existingDriveByRequest.orderNumber,
                  customerId: existingDriveByRequest.customerId,
                  currentDate: currentDate,
                  readyInSeconds: apiResponse.readyInSeconds
                });
              }

              return resolve(apiResponse);
            })
            .catch(function (err) {
              return reject(err);
            });
        }
      })
      .catch(function (err) {
        return reject(err);
      });
  });
}

function DriveByRequestResponse(obj) {
  let readyInSeconds = CommonHelper.calculatePickupInTimeInSeconds(obj.pickUpTime, obj.currentDate);
  return {
    status: obj.status,
    message: obj.message,
    currentStatus: obj.currentStatus,
    readyInSeconds: readyInSeconds,
    channels: {
      controlChannelName: obj.controlChannelName,
      appLocationChannelName: obj.appLocationChannelName,
      appListenChannelName: obj.appListenChannelName,
      ddsListenChannelName: obj.ddsListenChannelName,
      apiListenChannelName: obj.apiListenChannelName,
      appListenPresenceChannelName: obj.appListenPresenceChannelName
    }
  };
}

// Update driveByRequest in the DB
export function updateDriveByRequest(req, res, next) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: req.body.order.orderNumber
  });
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [PUT:driveby/request]...');

    let isLatitude = false;
    let isLongitude = false;
    if (req.body.location.latitude) {
      isLatitude = true;
    }
    if (req.body.location.longitude) {
      isLongitude = true;
    }
    if (isLatitude !== isLongitude) {
      let errMessage = 'Require either both latitude and longitude or neither';
      throw new ApiException(400, errMessage, errMessage);
    }

    CommonHelper.getCurrentGMTDateByOrderNumber(req.body.order.orderNumber)
      .then(function (currentDate) {
        db.DriveByRequest.find({
          where: {
            orderNumber: {
              [db.Op.eq]: req.body.order.orderNumber
            }
          }
        })
          .then(function (existingDriveByRequest) {
            if (!existingDriveByRequest) {
              let errMessage = 'Requested order: ' + req.body.order.orderNumber + ' not found in database!';
              throw new ApiException(400, errMessage, errMessage);
            }

            if (existingDriveByRequest.status && existingDriveByRequest.status.toLowerCase() === 'Completed'.toLowerCase()) {
              let errMessage = 'Requested order: ' + req.body.order.orderNumber + ' already completed!';
              throw new ApiException(400, errMessage, errMessage);
            }

            //DriveBy Details
            existingDriveByRequest.modeOfTransport = req.body.driveByDetails.modeOfTransport;
            existingDriveByRequest.transportColor = req.body.driveByDetails.transportColor;
            existingDriveByRequest.licensePlateNumber = req.body.driveByDetails.licensePlateNumber;

            let oldStatus = existingDriveByRequest.status;
            if (oldStatus && oldStatus.toLowerCase() === 'Cancelled'.toLowerCase()) {
              let newStatus = 'ReRequested';
              existingDriveByRequest.status = newStatus;
              existingDriveByRequest.reRequestDateTime = currentDate;
            }

            if (req.body.driveByDetails.notes) {
              existingDriveByRequest.notes = req.body.driveByDetails.notes;
            }
            //General Details
            existingDriveByRequest.appVersion = req.body.appVersion;
            existingDriveByRequest.updatedAt = currentDate;

            existingDriveByRequest
              .save()
              .then(function (updatedRecord) {
                //Insert/Update request in active DriveByRequest cache
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

                //Call location change pubnub method to calculate and validate using google distance matrix
                callLocationChangeMethod({
                  customerId: existingDriveByRequest.customerId,
                  orderNumber: existingDriveByRequest.orderNumber,
                  storeName: existingDriveByRequest.storeName,
                  modeOfTransport: existingDriveByRequest.modeOfTransport,
                  latitude: req.body.location.latitude,
                  longitude: req.body.location.longitude,
                  sequence: req.body.location.sequence
                });

                let controlChannelName = CommonHelper.buildStoreControlChannelName(existingDriveByRequest.storeName);
                let orderChannelNames = CommonHelper.buildOrderChannelNames(req.body.order.orderNumber);
                let publishMessageObj = {
                  messageType: 'updateRequest',
                  data: {
                    driveByDetails: {
                      modeOfTransport: req.body.driveByDetails.modeOfTransport,
                      transportColor: req.body.driveByDetails.transportColor,
                      licensePlateNumber: req.body.driveByDetails.licensePlateNumber,
                      status: existingDriveByRequest.status,
                      notes: existingDriveByRequest.notes,
                      isRunningLate: existingDriveByRequest.isRunningLate
                    },
                    location: {},
                    order: {
                      customerId: req.body.order.customerId,
                      orderNumber: req.body.order.orderNumber
                    }
                  }
                };

                //PubNub Connection
                let pubnubHelper = new PubnubHelper();
                let ddsChannelName = orderChannelNames.ddsListenChannelName;
                if (oldStatus && oldStatus.toLowerCase() === 'Cancelled'.toLowerCase()) {
                  ddsChannelName = controlChannelName;
                }
                //Publish new driveBy request message to DDS control channel
                pubnubHelper.publishMessage(ddsChannelName, publishMessageObj, uniqueId);

                let apiResponse = DriveByRequestResponse({
                  status: 'success',
                  message: 'DriveBy request details updated successfully!',
                  currentStatus: existingDriveByRequest.status,
                  pickUpTime: existingDriveByRequest.pickUpTime,
                  currentDate,
                  controlChannelName,
                  appLocationChannelName: orderChannelNames.appLocationChannelName,
                  appListenChannelName: orderChannelNames.appListenChannelName,
                  ddsListenChannelName: orderChannelNames.ddsListenChannelName,
                  apiListenChannelName: orderChannelNames.apiListenChannelName,
                  appListenPresenceChannelName: orderChannelNames.appListenPresenceChannelName
                });

                if (existingDriveByRequest.status && existingDriveByRequest.status.toLowerCase() === 'ReRequested'.toLowerCase()) {
                  //Calculate and publish locationFrequency change message
                  publishLocationChangeFrequencyMessage({
                    storeName: existingDriveByRequest.storeName,
                    orderNumber: existingDriveByRequest.orderNumber,
                    customerId: existingDriveByRequest.customerId,
                    currentDate: currentDate,
                    readyInSeconds: apiResponse.readyInSeconds
                  });
                }

                GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[PUT:driveby/request] message: ' + JSON.stringify(apiResponse));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [PUT:driveby/request]...success');

                res.status(200).json(apiResponse);
              })
              .catch(function (err) {
                GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[PUT:driveby/request] message: ' + JSON.stringify(err.message));
                GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [PUT:driveby/request]...fail');
                next(err);
              });
          })
          .catch(function (err) {
            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[PUT:driveby/request] message: ' + JSON.stringify(err.message));
            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [PUT:driveby/request]...fail');
            next(err);
          });
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[PUT:driveby/request] message: ' + JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [PUT:driveby/request]...fail');
        next(err);
      });
  } catch (err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[PUT:driveby/request] message: ' + JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [PUT:driveby/request]...fail');
    next(err);
  }
}

// Upload user avatar to Amazon S3 Bucket
export function uploadAppUserAvatar(req, res, next) {
  let uniqueId = CommonHelper.getUniqueIdFromCache({
    orderNumber: req.body.orderNumber
  });
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [POST:driveby/appUserAvatar]...');

    if (req.files) {
      let avatarFile = req.files.appUserAvatar;
      let originalFileName = avatarFile.name;

      if (!(/\.(gif|jpg|jpeg|tiff|png)$/i).test(originalFileName)) {
        let errMessage = 'Only gif|jpg|jpeg|tiff|png file allowed!';
        throw new ApiException(400, errMessage, errMessage);
      }

      let fileExt = path.extname(originalFileName);
      let avatarFileName = req.body.customerId + '_' + req.body.orderNumber + fileExt;
      let avatarThumbFileName = req.body.customerId + '_' + req.body.orderNumber + '_thumb' + fileExt;

      let bucketName = config.awsS3Bucket.BucketName;
      let appUserAvatarPath = config.awsS3Bucket.appUserAvatarPath;
      let avatarFileNamePath = appUserAvatarPath + avatarFileName;
      let avatarThumbFileNamePath = appUserAvatarPath + avatarThumbFileName;

      CommonHelper.getCurrentGMTDateByOrderNumber(req.body.orderNumber)
        .then(function (currentDate) {
          let awsS3Helper = new AwsS3Helper();
          awsS3Helper.createAndUploadThumbnail(bucketName, avatarThumbFileNamePath, avatarFile)
            .then(function (uploadResponse) {
              //Upload original image
              awsS3Helper.UploadFile(bucketName, avatarFileNamePath, avatarFile)
                .then(function (data) {
                  //Original Image save success
                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
                });

              awsS3Helper.getFileUrl(bucketName, avatarThumbFileNamePath)
                .then(function (urlResponse) {

                  db.DriveByRequest.find({
                    attributes: ['orderNumber', 'customerId', 'userAvatarS3Key', 'userAvatar', 'userAvatarUrlExpiration', 'originalUserAvatarS3Key', 'updatedAt'],
                    where: {
                      orderNumber: {
                        [db.Op.eq]: req.body.orderNumber
                      }
                    }
                  })
                    .then(function (existingDriveByRequest) {
                      if (existingDriveByRequest) {
                        //Update existing record
                        existingDriveByRequest.userAvatarS3Key = avatarThumbFileNamePath;
                        existingDriveByRequest.userAvatar = urlResponse.url;
                        existingDriveByRequest.userAvatarUrlExpiration = urlResponse.urlExpiration;
                        existingDriveByRequest.originalUserAvatarS3Key = avatarFileNamePath;
                        existingDriveByRequest.updatedAt = currentDate;

                        existingDriveByRequest
                          .save()
                          .then(function (updatedRecord) {
                            publishAppUserAvatarMessage({
                              customerId: req.body.customerId,
                              orderNumber: req.body.orderNumber,
                              userAvatar: urlResponse.url,
                              uniqueId
                            });

                            let apiResponse = {message: 'File uploaded successfully!', appUserAvatar: urlResponse.url};

                            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(apiResponse));
                            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...success');
                            res.status(200).json(apiResponse);
                          })
                          .catch(function (err) {
                            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
                            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
                            next(err);
                          });
                      }
                      else {
                        //Insert new record
                        db.DriveByRequest.build({
                          orderNumber: req.body.orderNumber,
                          customerId: req.body.customerId,
                          userAvatarS3Key: avatarThumbFileNamePath,
                          userAvatar: urlResponse.url,
                          userAvatarUrlExpiration: urlResponse.urlExpiration,
                          originalUserAvatarS3Key: avatarFileNamePath,
                          createdAt: currentDate,
                          updatedAt: currentDate
                        })
                          .save()
                          .then(function (newRecord) {
                            let apiResponse = {message: 'File uploaded successfully!', appUserAvatar: urlResponse.url};

                            GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(apiResponse));
                            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...success');
                            res.status(200).json(apiResponse);
                          })
                          .catch(function (err) {
                            GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
                            GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
                            next(err);
                          });
                      }
                    })
                    .catch(function (err) {
                      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
                      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
                      next(err);
                    });

                })
                .catch(function (err) {
                  GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
                  GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
                  next(err);
                });
            })
            .catch(function (err) {
              GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
              GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
              next(err);
            });
        })
        .catch(function (err) {
          GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
          GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
          next(err);
        });
    }
    else {
      let errMessage = 'UserAvatar image file must be required!';
      GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(errMessage));
      GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
      next(new ApiException(400, errMessage, errMessage));
    }
  } catch (err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[POST:driveby/appUserAvatar] message: ' + JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [POST:driveby/appUserAvatar]...fail');
    next(err);
  }
}


function publishAppUserAvatarMessage(obj) {
  let orderChannelNames = CommonHelper.buildOrderChannelNames(obj.orderNumber);
  let publishMessageObj = {
    messageType: 'updateUserAvatar',
    data: {
      driveByDetails: {
        userAvatar: obj.userAvatar
      },
      order: {
        customerId: obj.customerId,
        orderNumber: obj.orderNumber
      }
    }
  };

  //PubNub Connection
  let pubnubHelper = new PubnubHelper();
  //Publish update user avatar message to DDS control channel
  pubnubHelper.publishMessage(orderChannelNames.ddsListenChannelName, publishMessageObj, obj.uniqueId);
}


// API to check if DriveBy enable for store
export function checkStore(req, res, next) {
  let uniqueId = CommonHelper.getNewUniqueId();
  try {
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Entering [GET:dds/checkStore]...');

    db.Stores.find({
      attributes: ['isActive'],
      where: {
        storeId: {
          [db.Op.eq]: req.params.storeId
        }
      }
    })
      .then(function (store) {
        let apiResponse = {};
        if (!store) {
          apiResponse = {
            isDriveByEnable: false,
            message: 'DriveBy store configuration not found for store. Please contact system administrator.'
          };
        }
        else {
          if (!store.isActive) {
            apiResponse = {
              isDriveByEnable: false,
              message: 'DriveBy feature is disabled for store. Please contact system administrator.'
            };
          }
          else {
            apiResponse = {
              isDriveByEnable: true,
              message: 'DriveBy feature is enable for store.'
            };
          }
        }

        GyGLog.writeLog(GyGLog.eLogLevel.debug, uniqueId, '[GET:dds/checkStore] message: ' + JSON.stringify(apiResponse));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/checkStore]...success');
        res.status(200).json(apiResponse);
      })
      .catch(function (err) {
        GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/checkStore] message: ' + JSON.stringify(err.message));
        GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/checkStore]...fail');
        next(err);
      });
  } catch (err) {
    GyGLog.writeLog(GyGLog.eLogLevel.error, uniqueId, '[GET:dds/checkStore] message: ' + JSON.stringify(err.message));
    GyGLog.writeLog(GyGLog.eLogLevel.info, uniqueId, 'Exiting [GET:dds/checkStore]...fail');
    next(err);
  }
}
