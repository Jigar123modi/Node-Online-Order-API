
import jwt from 'jsonwebtoken';
import config from '../../config/environment';
import appMessages from '../../config/AppMessages';
import Joi from 'joi';

export default {
  // route middleware to verify a token
  validateAuthorization: function(req, res, next) {
    // check header or url parameters or post parameters for token
    var authorizationHeader = req.headers['authorization'];

    var token='';
    if(authorizationHeader){
      var headerParts = authorizationHeader.trim().split(' ');
      if(headerParts[0].toLowerCase() === 'bearer'){
        token = headerParts[headerParts.length-1];
      }
      else {
        var statusCode=401;
        return res.status(statusCode).json({
          code: statusCode,
          dialog_title: appMessages.code_401_title,
          user_msg: appMessages.code_401_user_message,
          dev_msg: 'Failed to authenticate token.',
          more_info: null
        });
      }
    }

    // decode token
    if (token) {
      // verifies secret and checks exp
      jwt.verify(token, config.jwtSecretKey, function (err, decoded) {
        if (err) {
          var statusCode=401;
          return res.status(statusCode).json({
            code: statusCode,
            dialog_title: appMessages.code_401_title,
            user_msg: appMessages.code_401_user_message,
            dev_msg: 'Failed to authenticate token.',
            more_info: err
          });
        } else {
          // if everything is good, save to request for use in other routes
          req.decoded = decoded;
          next();
        }
      });
    } else {
      // if there is no token
      // return an error
      var statusCode=401;
      return res.status(statusCode).json({
        code: statusCode,
        dialog_title: appMessages.code_401_title,
        user_msg: appMessages.code_401_user_message,
        dev_msg: 'No token provided.',
        more_info: null
      });
    }
  },

  // POST /api/dds/changePassword
  changePasswordValidate: {
    body: {
      oldPassword: Joi.string().required(),
      newPassword: Joi.string().required()
    }
  },

  // POST /api/dds/forgotPassword
  forgotPasswordValidate: {
    body: {
      userName: Joi.string().required(),
      emailAddress: Joi.string().required().email()
    }
  },

  // POST /api/dds/checkForgotPassword
  checkResetPasswordValidate: {
    body: {
      token: Joi.string().required()
    }
  },

  // POST /api/dds/resetPassword
  resetPasswordValidate: {
    body: {
      token: Joi.string().required(),
      newPassword: Joi.string().required().min(5).max(30)
    }
  },

  // POST /api/dds/registerUser
  registerStoreUserValidate: {
    body: {
      storeId: Joi.number().integer().required(),
      userName: Joi.string().required().regex(/^[a-zA-Z0-9.\-_]{5,30}$/).options({
        language: {
          string: {
            regex: {
              base: 'only allow alphabets, numbers and character like dot,hyphen,underscore'
            }
          }
        }
      }),
      emailAddress: Joi.string().required().email(),
      role: Joi.string().required(),
      password: Joi.string().required().min(5).max(30),
      firstName: Joi.string().required(),
      lastName: Joi.string().required(),
      isActive: Joi.boolean().required()
    }
  },

  // PUT /api/dds/updateUser
  updateStoreUserValidate: {
    params: {
      userId: Joi.number().integer().required()
    },
    body: {
      storeId: Joi.number().integer().required(),
      userName: Joi.string().required().regex(/^[a-zA-Z0-9.\-_]{5,30}$/).options({
        language: {
          string: {
            regex: {
              base: 'only allow alphabets, numbers and character like dot,hyphen,underscore'
            }
          }
        }
      }),
      emailAddress: Joi.string().required().email(),
      role: Joi.string().required(),
      password: Joi.string().min(5).max(30),
      firstName: Joi.string().required(),
      lastName: Joi.string().required(),
      isActive: Joi.boolean().required()
    }
  },

  // POST /api/dds/storeConfig
  storeConfigValidate: {
    body: {
      storeId: Joi.number().integer().required(),
      storeName: Joi.string().required(),
      latitude: Joi.string().required(),
      longitude: Joi.string().required(),
      gmtOffset: Joi.string().required(),
      wideGeofenceInMeters: Joi.number().integer().required(),
      frequencyOutsideInSecs: Joi.number().integer().required(),
      frequencyInsideInSecs: Joi.number().integer().required(),
      deliveryZone: Joi.object({
        type: Joi.string().valid(['radius','polygon','both']).required(),
        radiusInMeter: Joi.number().integer(),
        polygon: Joi.array().items(
          Joi.object({
            latitude: Joi.string().required(),
            longitude: Joi.string().required()
          })
        )
      }).required(),
      throttle: Joi.number().integer().required(),
      leanplumAttribute: Joi.string().required(),
      availability: Joi.boolean().required()
    }
  },

  // POST /api/dds/storeUserAvatar
  storeUserAvatarValidate: {
    body: {
      userId: Joi.number().integer().required()
    }
  },

  // POST /api/dds/updateStatus
  updateStatusValidate: {
    body: {
      customerId: Joi.number().integer().required(),
      orderNumber: Joi.string().required(),
      status: Joi.string().required()
    }
  },

  // POST /api/dds/writeLog
  writeLogValidate: {
    body: {
      logLevel: Joi.string().valid(['error','warn','info','verbose','debug','silly']).required(),
      message: Joi.string().required()
    }
  }

};
