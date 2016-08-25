'use strict';

const LICENSE_DURATION = 365;
const CORPORATION_SAFE_KEYS =
  ['code', 'description', 'town', 'city'];

const messages = {
  APP_NOT_FOUND: 'App not found.',
  CODE_UNSPECIFIED: 'Code unspecified.',
  CODE_ALREADY_USED: 'Code already used.',
  CORPORATION_NOT_FOUND: 'Corporation not found.',
  LICENSE_KEY_NOT_FOUND: 'License key not found.',
  CLIENT_NOT_FOUND: 'Client not found.',
  CLIENT_ALREADY_LINKED: 'Client already linked to another corporation.'
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

  return err => {
    res.status(statusCode).send(err);
  };
}

function handleEntityNotFound(res, err) {
  return entity => {
    if (!entity) {
      res.status(404).send(err);
      return null;
    }

    return entity;
  };
}

function saveUpdates(updates) {
  return entity => {
    var updated = _.merge(entity, updates);

    return updated.saveAsync()
      .spread(updated => { return updated; });
  };
}

function checkCorporationData(req) {
  return new Promise((resolve, reject) => {
    var data = _.pick(req.body, CORPORATION_SAFE_KEYS);

    data.code ?
      resolve(data) :
      reject(messages.CODE_UNSPECIFIED);
  });
}

module.exports = {
  authenticate: function (req, res) {
    RegisteredApp.findOneAsync({
      '_id': req.body.appId,
      'appKey': req.body.appKey
    })
      .then(handleEntityNotFound(res, messages.APP_NOT_FOUND))
      .then(app => {
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
      .then(corporation => {
        if (corporation) {
          var clients = _.filter(corporation.clients, client => {
            return !client.disabled;
          });

          res.json(
            _.chain(corporation)
              .pick(CORPORATION_SAFE_KEYS)
              .assign({
                banned: corporation.banned,
                activeClients: clients.length
              })
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
      .then(corporation => {
        if (corporation) {
          var client = _.first(corporation.clients);
          var period = _.last(client.licensePeriods);

          res.json(
            _.chain(corporation)
              .pick(CORPORATION_SAFE_KEYS)
              .assignIn({
                banned: corporation.banned,
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

  linkClient: function (req, res) {
    var code = req.body.code;
    var licenseKey = req.body.licenseKey;

    if (!code || !licenseKey) {
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
      .then(client => {
        if (client) {
          return res.status(403)
            .send(messages.CLIENT_ALREADY_LINKED);
        }

        Corporation.findOneAsync({code, 'banned': {'$ne': true}})
          .then(handleEntityNotFound(res, messages.CORPORATION_NOT_FOUND))
          .then(corporation => {
            if (!corporation) return;

            License.findOneAndUpdateAsync(
              {licenseKey, 'used': {'$ne': true}},
              {'$set': {'used': true}}
            )
              .then(handleEntityNotFound(res, messages.LICENSE_KEY_NOT_FOUND))
              .then(license => {
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
                  .then(entity => {
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
                      .then(() => { res.sendStatus(200); })
                      .catch(handleError(res));
                  });
              })
              .catch(handleError(res));
          })
          .catch(handleError(res));
      })
      .catch(handleError(res));
  },

  unlinkClient: function (req, res) {
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
      .then(updated => {
        if (updated) {
          var client = _.find(updated.clients, c => {
            return !c.disabled && c.consumerKey === req.consumerKey
          });

          License.updateAsync(
            {'licenseKey': client.licenseKey},
            {'used': false})
            .then(() => { res.sendStatus(200); })
            .catch(handleError(res));
        }

      })
      .catch(handleError(res));
  },

  createCorporation: function (req, res) {
    checkCorporationData(req)
      .then(data => {
        Corporation.findOneAsync({
          'code': data.code
        })
          .then(entity => {
            if (entity) {
              return res.status(403)
                .send(messages.CODE_ALREADY_USED);
            }

            var corporation = new Corporation(data);

            corporation.saveAsync()
              .then(() => { res.sendStatus(200); })
              .catch(handleError(res));
          })
          .catch(handleError(res));
      })
      .catch(handleError(res, 400));
  },

  updateCorporation: function (req, res) {
    checkCorporationData(req)
      .then(data => {
        Corporation.findOneAsync({
          'clients': {
            '$elemMatch': {
              'disabled': {'$ne': true},
              'consumerKey': req.consumerKey
            }
          }
        })
          .then(handleEntityNotFound(res, messages.CLIENT_NOT_FOUND))
          .then(corporation => {
            if (corporation) {
              Corporation.findOneAsync({
                'code': data.code,
                '_id': {'$ne': corporation._id}
              })
                .then(entity => {
                  if (entity) {
                    throw(messages.CODE_ALREADY_USED);
                  }

                  return corporation;
                })
                .then(saveUpdates(data))
                .then(() => { res.sendStatus(200); })
                .catch(handleError(res));
            }
          })
          .catch(handleError(res));
      })
      .catch(() => { res.sendStatus(400); });
  }
}
