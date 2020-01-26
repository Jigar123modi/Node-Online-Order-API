/**
 * Mail helper module for send emails
 */

'use strict';

import nodemailer from 'nodemailer';
import config from '../config/environment';

var transporter = null;
function MailHelper() {
  if(!transporter){
    // create reusable transporter object using the default SMTP transport
    transporter = nodemailer.createTransport({
      host: config.mailSettings.host,
      port: config.mailSettings.port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: config.mailSettings.userName,
        pass: config.mailSettings.password
      }
    });
  }
}

MailHelper.prototype.sendEmail = function(toEmail, subject, body){
  return new Promise(function (resolve, reject) {
    // setup email data with unicode symbols
    let mailOptions = {
      from: '"'+config.mailSettings.fromName+'" <'+config.mailSettings.fromEmail+'>', // sender address
      to: toEmail, // list of receivers
      subject: subject, // Subject line
      text: body, // plain text body
      html: body // html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return reject(error);
      }

      return resolve(info);
    });
  });
};

// export the class
module.exports = MailHelper;
