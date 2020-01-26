'use strict';
/*eslint no-process-env:0*/

var homeDir = require('homedir');

// Development specific configuration
// ==================================
module.exports = {
  //appUrl : 'http://localhost:3000',
  appUrl : 'URL',
  ddsUrl : 'URL',
  ddsResetPasswordLink : 'http://192.168.200.88:3000/reset-password',
  ddsLoginLink : 'http://192.168.200.88/login',
  externalApi: {
    upsertDriveByAvailability : 'http://localhost:55846/v3/driveby/availability',
    getDriveByAvailability : 'http://localhost:55846/v3/driveby/availability'
  },

  // Sequelize connection options
  sequelize: {
    host: 'URL',
    port: 3306,
    dbName: 'DriveByLocal',
    userName: 'gygadmin',
    password: '4gZ6lVAVmVDR',
    dialect: 'mysql'
  },

  // Seed database on startup
  seedDB: true,

  //PubNub settings
  pubnub:{
    subscribeKey: '',
    publishKey: '',
    channelPrefix: 'prodlocal'
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
      apiKey: 'Key',
      env: 'driveby-dev'
    }
  },

  //Email settings
  mailSettings: {
    host: 'smtp.mailgun.org',
    userName: '',
    password: '',
    port: 587,
    fromEmail: '',
    fromName: 'GyG DriveBy'
  },

  //Location Settings
  locationSettings: {
      minPickupTimeLeftInSeconds: 60 * 30,   //30 Minutes
      wideGeofenceInMeters: 1000,
      frequencyOutsideInSecs: 30,
      frequencyInsideInSecs: 10
  }

};
