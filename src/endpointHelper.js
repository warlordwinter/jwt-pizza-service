const Logger = require("./logger");
class StatusCodeError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.logger = new Logger();
    this.logger.unhandledErrorLogger(this);
    this.statusCode = statusCode;
  }
}

const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  asyncHandler,
  StatusCodeError,
};
