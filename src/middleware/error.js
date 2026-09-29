'use strict';
const config = require('../config');
const { fail } = require('../utils/helpers');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  let status = err.statusCode || err.status || 500;
  let message = err.message || '服务器内部错误';

  // multer 上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = `文件过大，超过限制（${config.csvMaxSizeKb} KB）`;
  } else if (err.code && String(err.code).startsWith('LIMIT_')) {
    status = 400;
  } else if (/仅支持|csv/i.test(message) && status === 500) {
    status = 400;
  }

  if (status >= 500) console.error('[error]', err);
  else console.warn(`[warn] ${status} ${req.method} ${req.originalUrl}: ${message}`);

  return fail(res, message, status, status);
};
