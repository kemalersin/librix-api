'use strict';

module.exports = app => {
  app.use('/v1.0', require('./api/v1.0'));
};
