/**
 * Sequelize initialization module
 */

'use strict';

import config from '../config/environment';
import Sequelize from 'sequelize';

const Promise = Sequelize.Promise;
//bluebird promises
Promise.config({
    // Enable warnings
    warnings: false,
    // Enable long stack traces
    longStackTraces: true,
    // Enable cancellation
    cancellation: true,
    // Enable monitoring
    monitoring: true
});

let db = {
  Sequelize,
  Op: Sequelize.Op,
  sequelize: new Sequelize(config.sequelize.dbName, config.sequelize.userName, config.sequelize.password,
      {
          host: config.sequelize.host, dialect: config.sequelize.dialect,
          port: config.sequelize.port,
          logging: false,
          pool: {
              max: 5,
              min: 0,
              idle: 20000
          },
          operatorsAliases: false
      })
};

// Insert models below
db.DriveByRequest = db.sequelize.import('../api/model/driveByRequest.model');
db.Stores = db.sequelize.import('../api/model/stores.model');
db.StoreUsers = db.sequelize.import('../api/model/storeUsers.model');
db.ForgotPassword = db.sequelize.import('../api/model/forgotPassword.model');
db.StoreUserRoles = db.sequelize.import('../api/model/storeUserRoles.model');
db.Locations = db.sequelize.import('../api/model/locations.model');

db.Thing = db.sequelize.import('../api/thing/thing.model');

module.exports = db;
