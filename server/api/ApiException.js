/**
 * Custom exception module for handle custom errors
 */

'use strict';

import util from 'util';

/**
 * Error Class ApiException
 * */
function ApiException(statusCode, errorMessage, userFriendlyMessage) {
  /*INHERITANCE*/
  Error.call(this); //super constructor
  Error.captureStackTrace(this, this.constructor); //super helper method to include stack trace in error object

  //Set the name for the ERROR
  this.name = this.constructor.name; //set our function’s name as error name.

  //Define error message
  this.message = errorMessage;
  //Define user friendly message
  if(userFriendlyMessage) {
    this.userFriendlyMessage = userFriendlyMessage;
  }

  //Define status code
  this.status = statusCode || 500;
}

// inherit from Error
util.inherits(ApiException, Error);

//Export the constructor function as the export of this module file.
exports = module.exports = ApiException;
