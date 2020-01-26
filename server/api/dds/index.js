'use strict';

var express = require('express');
var controller = require('./dds.controller');
import validate from 'express-validation';
import validations from './validation';

var router = express.Router();

// API to get startup details for DDS Board
// API needs authorization token to validate
router.get('/startup/:storeName',validations.validateAuthorization, controller.ddsStartup);

// API to get recent orders for store
// API needs authorization token to validate
router.get('/recentOrders/:storeName',validations.validateAuthorization, controller.getRecentOrders);

// API to validate store user authentication and give auth token
router.post('/login', controller.login);

// API to change store user password
// API needs authorization token to validate
router.post('/changePassword',validations.validateAuthorization,validate(validations.changePasswordValidate), controller.changePassword);

// API to manage forgot store user password
router.post('/forgotPassword',validate(validations.forgotPasswordValidate), controller.forgotPassword);

// API to validate reset password token
router.post('/checkResetPassword',validate(validations.checkResetPasswordValidate), controller.checkResetPassword);

// API to store user reset password
router.post('/resetPassword',validate(validations.resetPasswordValidate), controller.resetPassword);

// API to register new store user
// API needs authorization token to validate
router.post('/registerUser',validations.validateAuthorization,validate(validations.registerStoreUserValidate), controller.registerStoreUser);

// API to update store user details
// API needs authorization token to validate
router.put('/updateUser/:userId',validations.validateAuthorization,validate(validations.updateStoreUserValidate), controller.updateStoreUser);

// API to upload storeUserAvatar to AWS S3 and give avatar url in response
// API needs authorization token to validate
router.post('/storeUserAvatar',validations.validateAuthorization,validate(validations.storeUserAvatarValidate), controller.uploadStoreUserAvatar);

// API to get store user role list
// API needs authorization token to validate
router.get('/getStoreUserRoles',validations.validateAuthorization, controller.getStoreUserRoles);

// API to get store users list
// API needs authorization token to validate
router.get('/getStoreUsers/:storeId',validations.validateAuthorization, controller.getStoreUsers);

// API to insert/update store config details
// API needs authorization token to validate
router.post('/storeConfig',validations.validateAuthorization,validate(validations.storeConfigValidate), controller.upsertStoreConfigDetails);

// API to get store config list
// API needs authorization token to validate
router.get('/getStores',validations.validateAuthorization, controller.getStores);

// API to update DriveBy request status
// API needs authorization token to validate
router.post('/updateStatus',validations.validateAuthorization,validate(validations.updateStatusValidate), controller.updateDriveByRequestStatus);

// API to write DDS logs to server
// API needs authorization token to validate
router.post('/writeLog',validations.validateAuthorization,validate(validations.writeLogValidate), controller.writeLogToServer);

// API to publish location change message to appLocation channel
router.post('/publishLocationChangeMessage', controller.publishLocationChangeMessage);

// API to publish PubNub message to apiListen channel
router.post('/publishMessageToApiListenChannel', controller.publishMessageToApiListenChannel);

router.post('/testPushNotification', controller.testPushNotification);

module.exports = router;
