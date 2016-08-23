'use strict';

const TOKEN_DURATION = 20;

const messages = {
  CODE_ALREADY_USED: 'Code already used.',
  CLIENT_NOT_FOUND: 'Client not found.',
  TOKEN_NOT_FOUND: 'Token not found.'
}

var _ = require('lodash');
var moment = require('moment');
var uuid = require('node-uuid');
var models = require('./v1.0.model');

var LicenseKey = models.LicenseKey;
var Corporation = models.Corporation;

function handleError(res, statusCode) {
  statusCode = statusCode || 500;

  return function (err) {
    res.status(statusCode).send(err);
  };
}

function handleEntityNotFound(res, err) {
  return function (entity) {
    if (!entity) {
      res.status(404).send(err);
      return null;
    }
    return entity;
  };
}

function saveUpdates(updates) {
  return function (entity) {
    var updated = _.merge(entity, updates);

    return updated.saveAsync()
      .spread(function (updated) {
        return updated;
      });
  };
}

module.exports = {
  getClient: function (req, res) {
    var consumerKey = req.params.consumerKey;

    Corporation.findOneAsync({
      'clients.consumerKey': consumerKey,
      'clients.disabled': {'$ne': true}
    })
      .then(handleEntityNotFound(res, messages.CLIENT_NOT_FOUND))
      .then(function (corporation) {
        if (corporation) {
          var client = _.find(corporation.clients, { consumerKey });
          var period = _.last(client.licensePeriods);

          res.status(200).json(
            _.chain(corporation)
              .pick(['code', 'description', 'town', 'city', 'banned'])
              .assignIn({
                licenseKey: client.licenseKey,
                begDate: period.begDate,
                endDate: period.endDate,
                remainDays: moment(period.endDate).diff(moment(), 'days')
              }).value()
          );
        }
      })
      .catch(handleError(res));
  },

  getToken: function (req, res) {
    var consumerKey = req.params.consumerKey;

    Corporation.findOneAsync({
      'banned': {'$ne': true},
      'clients.disabled': {'$ne': true},
      'clients.consumerKey': consumerKey,
      'clients.licensePeriods.endDate': {'$gte': moment()}
    })
      .then(handleEntityNotFound(res, messages.CLIENT_NOT_FOUND))
      .then(function (corporation) {
        if (corporation) {
          var token = uuid.v4();
          var tokenGivenDate = moment();
          var tokenEndDate = moment(tokenGivenDate).add(TOKEN_DURATION, 'minutes');

          var data = {token, tokenGivenDate, tokenEndDate};
          var client = _.find(corporation.clients, { consumerKey });

          _.merge(client, data);

          corporation.saveAsync()
            .then(function () {
              res.status(200).json(data);
            })
            .catch(handleError(res));
        }
      });
  },

  createClient: function (req, res) {

  },

  updateClient: function (req, res) {
    var data = req.body;
    var code = data.code;
    var token = data.token;

    if (!code || !token) {
      res.status(400).end();
    }
    else {
      Corporation.findOneAsync({
        'clients.token': token,
        'clients.tokenEndDate': {'$gte': moment()}
      })
        .then(handleEntityNotFound(res, messages.TOKEN_NOT_FOUND))
        .then(function (corporation) {
          if (corporation) {
            Corporation.findOneAsync({
              code,
              'clients.token': {'$ne': token}
            })
              .then(function (entity) {
                if (entity) {
                  throw(messages.CODE_ALREADY_USED);
                }

                return corporation;
              })
              .then(saveUpdates(data))
              .then(function () {
                res.status(200).end();
              })
              .catch(handleError(res));
          }
        });
    }
  }
}
