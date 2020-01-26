/**
 * crypto helper module for share common useful functions
 */

'use strict';
var crypto = require('crypto'), algorithm = 'aes-256-ctr', password = 'd6F3Efeq';

class cryptoHelper {
  static encrypt (plainText) {
    try {
      var cipher = crypto.createCipher(algorithm, password)
      var crypted = cipher.update(plainText, 'utf8', 'hex')
      crypted += cipher.final('hex');
      return crypted;
    }
    catch (err){
      return plainText;
    }
  }

  static decrypt (encryptedText) {
    try {
      var decipher = crypto.createDecipher(algorithm, password)
      var dec = decipher.update(encryptedText, 'hex', 'utf8')
      dec += decipher.final('utf8');
      return dec;
    }
    catch (err){
      return null;
    }
  }
}

// export the class
module.exports = cryptoHelper;
