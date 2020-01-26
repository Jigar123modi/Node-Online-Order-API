'use strict';
/*eslint no-process-env:0*/

var homeDir = require('homedir');

// Production specific configuration
// =================================
module.exports = {
  // Server IP
  ip: process.env.OPENSHIFT_NODEJS_IP
    || process.env.ip
    || undefined,

  // Server port
  port: process.env.OPENSHIFT_NODEJS_PORT
    || process.env.PORT
    || 8181,

  appUrl : 'URL',
  ddsUrl : 'URL',
  ddsResetPasswordLink : 'URL',
  ddsLoginLink : 'URL',
  externalApi: {
    upsertDriveByAvailability : 'URL',
    getDriveByAvailability : 'URL'
  },


  // Sequelize connection opions
  sequelize: {
    host: 'URL',
    port: 3306,
    dbName: 'DriveByProd',
    userName: 'gygadmin',
    password: '4gZ6lVAVmVDR',
    dialect: 'mysql'
  },

  //PubNub settings
  pubnub:{
    subscribeKey: '',
    publishKey: '',
    channelPrefix: 'prod'
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
      threshold: 'ON', //{ON | OFF} ->If set to OFF it stop upload log to stackify
      apiKey: '',
      env: 'driveby-prod'
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
  locationSettings:{
      minPickupTimeLeftInSeconds: 60 * 30,   //30 Minutes
      wideGeofenceInMeters: 1000,
      frequencyOutsideInSecs: 30,
      frequencyInsideInSecs: 10
  }

};
