'use strict';

var mongoose = require('bluebird').promisifyAll(require('mongoose'));
var Schema = mongoose.Schema;

var LicenseKeySchema = new Schema({
  key: String,
  used: Boolean
});

var CorporationSchema = new Schema({
  code: String,
  description: String,
  town: String,
  city: String,
  banned: Boolean,
  clients: [{
    consumerKey: String,
    licenseKey: String,
    disabled: Boolean,
    token: String,
    tokenGivenDate: Date,
    tokenEndDate: Date,
    licensePeriods: [{
      begDate: Date,
      endDate: Date
    }]
  }]
}, {
  timestamps: true
});

var models = {
  LicenseKey: mongoose.model('LicenseKey', LicenseKeySchema),
  Corporation: mongoose.model('Corporation', CorporationSchema)
};

module.exports = models;
