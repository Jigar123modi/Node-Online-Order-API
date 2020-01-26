'use strict';

var express = require('express');
var controller = require('./driveby.controller');
import validate from 'express-validation';
import validations from './validation';

var router = express.Router();

// API to insert/update driveby request to database and publish message to appropriate channel
router.post('/request', validate(validations.upsertDriveByRequest), controller.upsertDriveByRequest);

// API to update existing driveby request to database and publish message to DDS channel
router.put('/request', validate(validations.updateDriveByRequest), controller.updateDriveByRequest);

// API to upload appUserAvatar to AWS S3 and give avatar url in response
router.post('/appUserAvatar', controller.uploadAppUserAvatar);

// API to check if DriveBy enable for store
router.get('/checkStore/:storeId', validate(validations.checkStore), controller.checkStore);

module.exports = router;
