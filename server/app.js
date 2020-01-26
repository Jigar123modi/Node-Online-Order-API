/**
 * Main application file
 */

'use strict';

import express from 'express';
import sqldb from './sqldb';
import config from './config/environment';
import http from 'http';
import seedDatabaseIfNeeded from './config/seed';
import appMessages from './config/AppMessages';
import GyGLog from './logging/GyGLog';
import JobScheduleHelper from './api/JobScheduleHelper';

// Setup server
var app = express();
var server = http.createServer(app);
require('./config/express').default(app);
require('./routes').default(app);

// Start server
function startServer() {
  app.angularFullstack = server.listen(config.port, config.ip, function() {
    let message = 'Express server listening on '+ config.port+', in '+app.get('env')+' mode';
    console.log(message);

    // Call init method to initialize stackify log and log file settings
    GyGLog.logInit();
    GyGLog.writeLog(GyGLog.eLogLevel.debug, null, message);

    //Init Schedule Job
    JobScheduleHelper.InitJobSchedule();
  });
}

sqldb.sequelize.sync()
  .then(seedDatabaseIfNeeded)
  .then(startServer)
  .catch(function(err) {
    let message = 'Server failed to start due to error: ' + err;
    console.log(message);
    GyGLog.writeLog(GyGLog.eLogLevel.error, null, message);
  });

function grabErrorMessagesFromErrorResponse(err) {
  let errorMessages = err.message;
  try {
    let errorMessagesArr = [];
    if(errorMessages.indexOf('validation error') > -1) {
      for(let i = 0; i < err.errors.length; i++) {
        errorMessagesArr[i] = err.errors[i].messages.join(',');
      }
    }
    if(errorMessagesArr.length > 0) {
      errorMessages = errorMessagesArr.join(',');
    }
  } catch(ex) {
    console.log(ex);
  }

  return errorMessages;
}

function grabErrorObjectFromErrorStack(err) {
  try {
    let name;
    if(err.name){
      name = err.name;
    }

    let message;
    if(err.message){
      message = err.message;
    }

    let errors;
    if(err.errors){
      errors = err.errors;
    }

    return {
      name,
      message,
      errors
    };
  } catch(ex) {
    console.log(ex);
    return err;
  }
}

app.use(function(err, req, res, next) {
  // Do logging and user-friendly error message display
  let statusCode = err.status || 500;
  let errorMessage = grabErrorMessagesFromErrorResponse(err);
  let dev_msg = errorMessage;
  let user_msg = '';
  let dialog_title = '';
  let more_info = grabErrorObjectFromErrorStack(err);

  if(statusCode === 400) {
    dialog_title = appMessages.code_400_title;
    user_msg = appMessages.code_400_user_message;
    if(err.message.indexOf('validation error') > -1) {
      user_msg = errorMessage;
    }
    else if(err.name === "ApiException" && err.userFriendlyMessage){
      user_msg = err.userFriendlyMessage;
    }
  } else if(statusCode === 401) {
    dialog_title = appMessages.code_401_title;
    user_msg = appMessages.code_401_user_message;
  } else if(statusCode === 404) {
    dialog_title = appMessages.code_404_title;
    user_msg = appMessages.code_404_user_message;
  } else {
    dialog_title = appMessages.code_500_title;
    user_msg = appMessages.code_500_user_message;

    if(err.name === 'SequelizeUniqueConstraintError'){
      statusCode = 400;
      dialog_title = appMessages.code_400_title;
      user_msg = appMessages.code_400_user_message;
    }
  }

  let errResponse = {
    code: statusCode,
    dialog_title,
    user_msg,
    dev_msg,
    more_info: more_info
  };

  res.status(statusCode);
  res.send(errResponse);
});

// Expose app
exports = module.exports = app;
