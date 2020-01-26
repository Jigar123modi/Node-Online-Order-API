/**
 * API payload validation for new driveBy request
 */

import Joi from 'joi';

export default {
  // POST /api/driveby/request
  upsertDriveByRequest: {
    body: {
      driveByDetails: {
        modeOfTransport: Joi.string().required()
      },
      order: {
        storeName: Joi.string().required(),
        pickUpTime: Joi.string().required(),
        pickUpDate: Joi.string().required(),
        orderNumber: Joi.string().required(),
        customerId: Joi.string().required()
      },
      customer: {
        emailAddress: Joi.string().required().email(),
        phoneNumber: Joi.string().required()
      }
    }
  },

  // PUT /api/driveby/request
  updateDriveByRequest: {
    body: {
      driveByDetails: {
        //status: Joi.string().required(),
        modeOfTransport: Joi.string().required()
      },
      order: {
        orderNumber: Joi.string().required(),
        customerId: Joi.string().required()
      }
    }
  },

  // GET /api/driveby/checkStore/:storeId
  checkStore: {
    params: {
      storeId: Joi.number().integer().required()
    }
  }

};
