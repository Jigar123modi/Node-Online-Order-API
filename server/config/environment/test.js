'use strict';
/*eslint no-process-env:0*/

var homeDir = require('homedir');

// Test specific configuration
// ===========================
module.exports = {
  // MongoDB connection options
  mongo: {
    uri: 'mongodb://localhost/drivebyapi-test'
  },

  // Sequelize connection opions
  sequelize: {
    host: '',
    port: 3306,
    dbName: 'DriveByLocal',
    userName: 'gygadmin',
    password: '4gZ6lVAVmVDR',
    dialect: 'mysql'
  },

  //PubNub settings
  pubnub:{
    subscribeKey: '',
    publishKey: '',
    channelPrefix: 'prodtest'
  },

  //Push notification settings
  pushNotification:{
    gcm:{
      apiKey: ''
    }
  },

  //Amazon S3 Bucket Settings
  awsS3Bucket:{
    BucketName: '',
    appUserAvatarPath: 'appUserAvatar/',
    ddsUserAvatarPath: 'ddsUserAvatar/',
    accessKeyId: '',
    secretAccessKey: '',
    region: 'ap-southeast-2'
  },

  //GyG Logging Settings
  gygLogSettings: {
    //Log file settings to write log file
    logFile: {
      threshold: 'ON', //{ON | OFF} ->If set to OFF it stop log to write to file
      filePath: homeDir()+'/DriveByLogs'
    },

    //Stackify logging settings
    stackify: {
      threshold: 'OFF', //{ON | OFF} ->If set to OFF it stop upload log to stackify
      apiKey: '',
      env: 'driveby-dev'
    }
  },

  //Email settings
  mailSettings: {
    host: '',
    userName: '',
    password: '',
    port: 587,
    fromEmail: '',
    fromName: 'GyG DriveBy'
  },

  //Location Settings
  locationSettings:{
      minPickupTimeLeftInSeconds: 60 * 30,   //30 Minutes
      wideGeofenceInMeters: 1000,
      frequencyOutsideInSecs: 30,
      frequencyInsideInSecs: 10
  }

};
