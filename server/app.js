'use strict';

import express from 'express';
import mongoose from 'mongoose';
import config from './config/environment';
import http from 'http';

mongoose.connect(config.mongo.uri, config.mongo.options);
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error: ' + err);
  process.exit(-1);
});

var app = express();
var server = http.createServer(app);

require('./config/express')(app);
require('./routes')(app);

function startServer() {
  server.listen(config.port, config.ip, () => {
    console.log('Express server listening on %d, in %s mode', config.port, app.get('env'));
  });
}

setImmediate(startServer);

exports = module.exports = app;
