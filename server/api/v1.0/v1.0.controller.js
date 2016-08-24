'use strict';

const TOKEN_DURATION = 20;
const LICENSE_DURATION = 365;
const CORPORATION_SAFE_KEYS =
  ['code', 'description', 'town', 'city', 'banned'];

const messages = {
  CODE_ALREADY_USED: 'Code already used.',
  CORPORATION_NOT_FOUND: 'Corporation not found',
  CLIENT_NOT_FOUND: 'Client not found.',
  TOKEN_NOT_FOUND: 'Token not found.',
  LICENSE_KEY_NOT_FOUND: 'License key not found.'
}

var _ = require('lodash');
var moment = require('moment');
var uuid = require('node-uuid');
var models = require('./v1.0.model');

var License = models.License;
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
  getCorporation: function (req, res) {
    var code = req.params.code;

    Corporation.findOneAsync({code})
      .then(handleEntityNotFound(res, messages.CORPORATION_NOT_FOUND))
      .then(function (corporation) {
        if (corporation) {
          res.status(200).json(
            _.pick(
              corporation,
              CORPORATION_SAFE_KEYS
            )
          );
        }
      });
  },

  getClient: function (req, res) {
    var consumerKey = req.params.consumerKey;

    Corporation.findOneAsync({
      'clients': {
        '$elemMatch': {
          'consumerKey': consumerKey,
          'disabled': {'$ne': true}
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
          var client = _.head(corporation.clients);
          var period = _.last(client.licensePeriods);

          res.status(200).json(
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
    var data = req.body;
    var code = data.code;
    var licenseKey = data.licenseKey;
    var consumerKey = data.consumerKey;

    if (!code || !licenseKey) {
      res.status(400).end();
    }

    Corporation.findOneAsync({code, 'banned': {'$ne': true}})
      .then(handleEntityNotFound(res, messages.CORPORATION_NOT_FOUND))
      .then(function (corporation) {
        if (!corporation) return;

        License.findOneAsync({licenseKey, 'used': {'$ne': true}})
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

                license.used = true;

                license.saveAsync()
                  .then(function () {
                    corporation.clients.push({
                      consumerKey,
                      licenseKey,
                      licensePeriods: [{begDate, endDate}]
                    });

                    corporation.saveAsync()
                      .then(function () {
                        res.status(200).send();
                      })
                      .catch(function (err) {
                        throw(err);
                      });
                  })
                  .catch(handleError(res));
              });
          });
      });
  },

  unlinkLicense: function (req, res) {
    var token = req.body.token;

    if (!token) {
      res.status(400).end();
    }

    Corporation.findOneAndUpdateAsync(
      {
        'clients': {
          '$elemMatch': {
            'disabled': {'$ne': true},
            'token': token,
            'tokenEndDate': {'$gte': moment()}
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
      .then(handleEntityNotFound(res, messages.TOKEN_NOT_FOUND))
      .then(function (updated) {
        if (updated) {
          var licenseKey = _.head(updated.clients).licenseKey;

          License.updateAsync({licenseKey}, {'used': false})
            .then(function () {
              res.status(200).send();
            })
            .catch(function (err) {
              throw(err);
            });
        }

      })
      .catch(handleError(res));
  },

  getToken: function (req, res) {
    var consumerKey = req.params.consumerKey;

    var token = uuid.v4();
    var tokenGivenDate = moment();
    var tokenEndDate = moment(tokenGivenDate).add(TOKEN_DURATION, 'minutes');

    var data = {token, tokenGivenDate, tokenEndDate};

    Corporation.findOneAndUpdateAsync(
      {
        'banned': {'$ne': true},
        'clients': {
          '$elemMatch': {
            'consumerKey': consumerKey,
            'disabled': {'$ne': true},
            'licensePeriods.endDate': {'$gte': moment()}
          }
        }
      },
      {
        '$set': {
          'clients.$.token': token,
          'clients.$.tokenGivenDate': tokenGivenDate,
          'clients.$.tokenEndDate': tokenEndDate
        }
      }
    )
      .then(handleEntityNotFound(res, messages.CLIENT_NOT_FOUND))
      .then(function (updated) {
        if (updated) {
          res.status(200).json(data);
        }
      })
      .catch(handleError(res));
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
