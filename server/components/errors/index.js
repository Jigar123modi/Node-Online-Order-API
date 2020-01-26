/**
 * Error responses
 */

'use strict';

import appMessages from '../../config/AppMessages';

module.exports[404] = function pageNotFound(req, res) {
  var viewFilePath = '404';
  var statusCode = 404;
  var result = {
    code: statusCode,
    dialog_title: appMessages.code_404_title,
    user_msg: appMessages.code_404_user_message,
    dev_msg: appMessages.code_404_user_message,
    more_info: null
  };

  res.status(result.code);
  res.render(viewFilePath, {}, function(err, html) {
    if(err) {
      return res.status(result.code).json(result);
    }

    res.send(html);
  });
};
