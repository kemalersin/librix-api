'use strict';

const LICENSE_DURATION = 365;
const CORPORATION_SAFE_KEYS =
  ['code', 'description', 'town', 'city', 'banned'];

const messages = {
  APP_NOT_FOUND: 'App not found.',
  CODE_ALREADY_USED: 'Code already used.',
  CORPORATION_NOT_FOUND: 'Corporation not found',
  CLIENT_NOT_FOUND: 'Client not found.',
  LICENSE_KEY_NOT_FOUND: 'License key not found.'
}

import _ from 'lodash';
import moment from 'moment';
import jwt from 'jsonwebtoken';
import models from './v1.0.model';


var License = models.License;
var RegisteredApp = models.RegisteredApp;
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
  authenticate: function (req, res) {
    RegisteredApp.findOneAsync({
      '_id': req.body.appId,
      'appKey': req.body.appKey
    })
      .then(handleEntityNotFound(res, messages.APP_NOT_FOUND))
      .then(function (app) {
        if (app) {
          var token = jwt.sign(app, process.env.APP_SECRET, {
            expiresIn: '24h'
          });

          res.json({token});
        }
      })
      .catch(handleError(res));
  },

  getCorporation: function (req, res) {
    Corporation.findOneAsync({'code': req.params.code})
      .then(handleEntityNotFound(res, messages.CORPORATION_NOT_FOUND))
      .then(function (corporation) {
        if (corporation) {
          var clients = _.filter(corporation.clients, function (client) {
            return !client.disabled;
          });

          res.json(
            _.chain(corporation)
              .pick(CORPORATION_SAFE_KEYS)
              .assign({activeClients: clients.length})
          );
        }
      })
      .catch(handleError(res));
  },

  getClient: function (req, res) {
    Corporation.findOneAsync({
      'clients': {
        '$elemMatch': {
          'disabled': {'$ne': true},
          'consumerKey': req.consumerKey
        }
      }
    }, {
      'code': 1,
      'description': 1,
      'town': 1,
      'city': 1,
      'banned': 1,
      'clients.$': 1
    })
      .then(handleEntityNotFound(res, messages.CLIENT_NOT_FOUND))
      .then(function (corporation) {
        if (corporation) {
          var client = _.first(corporation.clients);
          var period = _.last(client.licensePeriods);

          res.json(
            _.chain(corporation)
              .pick(CORPORATION_SAFE_KEYS)
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

  linkLicense: function (req, res) {
    var code = req.body.code;
    var licenseKey = req.body.licenseKey;

    if (!code || !licenseKey) {
      return res.sendStatus(400);
    }

    Corporation.findOneAsync({code, 'banned': {'$ne': true}})
      .then(handleEntityNotFound(res, messages.CORPORATION_NOT_FOUND))
      .then(function (corporation) {
        if (!corporation) return;

        License.findOneAndUpdateAsync(
          {licenseKey, 'used': {'$ne': true}},
          {'$set': {'used': true}}
        )
          .then(handleEntityNotFound(res, messages.LICENSE_KEY_NOT_FOUND))
          .then(function (license) {
            if (!license) return;

            Corporation.aggregateAsync(
              {
                '$match': {
                  'clients': {
                    '$elemMatch': {
                      'licenseKey': licenseKey,
                      'unlinkDate': {'$exists': true, '$ne': null}
                    }
                  }
                }
              },
              {'$unwind': '$clients'},
              {'$sort': {'clients.unlinkDate': -1}},
              {'$limit': 1}
            )
              .then(function (entity) {
                var data = entity[0],
                  begDate = moment(),
                  endDate = moment(begDate).add(LICENSE_DURATION, 'days');

                if (data) {
                  var period = _.last(data.clients.licensePeriods);

                  begDate = period.begDate;
                  endDate = period.endDate;
                }

                corporation.clients.push({
                  'consumerKey': req.consumerKey,
                  'licenseKey': licenseKey,
                  'licensePeriods': [{begDate, endDate}]
                });

                corporation.saveAsync()
                  .then(function () {
                    res.sendStatus(200);
                  })
                  .catch(handleError(res));
              });
          })
          .catch(handleError(res));
      })
      .catch(handleError(res));
  },

  unlinkLicense: function (req, res) {
    Corporation.findOneAndUpdateAsync(
      {
        'clients': {
          '$elemMatch': {
            'disabled': {'$ne': true},
            'consumerKey': req.consumerKey
          }
        }
      },
      {
        '$set': {
          'clients.$.disabled': true,
          'clients.$.unlinkDate': moment()
        }
      }
    )
      .then(handleEntityNotFound(res, messages.CLIENT_NOT_FOUND))
      .then(function (updated) {
        if (updated) {
          var licenseKey = updated.clients[0].licenseKey;

          License.updateAsync({licenseKey}, {'used': false})
            .then(function () {
              res.sendStatus(200);
            })
            .catch(handleError(res));
        }

      })
      .catch(handleError(res));
  },

  createClient: function (req, res) {

  },

  updateClient: function (req, res) {
    var data = req.body;

    if (!data.code) {
      return res.sendStatus(400);
    }

    Corporation.findOneAsync({
      'clients': {
        '$elemMatch': {
          'disabled': {'$ne': true},
          'consumerKey': req.consumerKey
        }
      }
    })
      .then(handleEntityNotFound(res, messages.CLIENT_NOT_FOUND))
      .then(function (corporation) {
        if (corporation) {
          Corporation.findOneAsync({
            'code': data.code,
            '_id': {'$ne': corporation._id}
          })
            .then(function (entity) {
              if (entity) {
                throw(messages.CODE_ALREADY_USED);
              }

              return corporation;
            })
            .then(saveUpdates(data))
            .then(function () {
              res.sendStatus(200);
            })
            .catch(handleError(res));
        }
      })
      .catch(handleError(res));
  }
}
