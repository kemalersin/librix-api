'use strict';

import express from 'express';
import jwt from 'jsonwebtoken';
import controller from './v1.0.controller';

var router = express.Router();

router.post('/auth', controller.authenticate);

router.use(function (req, res, next) {
  var token = req.headers['x-access-token'];
  var consumerKey = req.headers['consumer-key'];

  if (token && consumerKey) {
    jwt.verify(token, process.env.APP_SECRET, function (err) {
      if (err) {
        return res.sendStatus(401);
      }
      else {
        req.consumerKey = consumerKey;
        next();
      }
    });
  }
  else {
    return res.sendStatus(403);
  }
});

router.get('/corporation/:code', controller.getCorporation);
router.get('/client', controller.getClient);
router.post('/client', controller.createClient);
router.put('/client', controller.updateClient);
router.post('/link', controller.linkLicense);
router.post('/unlink', controller.unlinkLicense);

module.exports = router;
