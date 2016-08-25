'use strict';

var mongoose = require('bluebird').promisifyAll(require('mongoose'));
var Schema = mongoose.Schema;

var LicenseSchema = new Schema({
  licenseKey: String,
  used: Boolean
});

var RegisteredAppSchema = new Schema({
  appKey: String
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
    unlinkDate: Date,
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
  License: mongoose.model('License', LicenseSchema),
  RegisteredApp: mongoose.model('RegisteredApp', LicenseSchema),
  Corporation: mongoose.model('Corporation', CorporationSchema)
};

module.exports = models;
