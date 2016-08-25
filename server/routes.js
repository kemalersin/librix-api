'use strict';

module.exports = function(app) {
  app.use('/v1.0', require('./api/v1.0'));
};
