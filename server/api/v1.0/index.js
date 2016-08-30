'use strict';

import express from 'express';
import jwt from 'jsonwebtoken';
import controller from './v1.0.controller';

var router = express.Router();

router.post('/auth', controller.authenticate);

router.use((req, res, next) => {
  var token = req.headers['x-access-token'];
  var consumerKey = req.headers['consumer-key'];

  if (token && consumerKey) {
    jwt.verify(token, process.env.APP_SECRET, err => {
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

router.get('/client', controller.getClient);
router.post('/client/demo', controller.setDemo);
router.post('/client/link', controller.linkClient);
router.post('/client/unlink', controller.unlinkClient);
router.get('/corporation/:code', controller.getCorporation);
router.post('/corporation', controller.createCorporation);
router.put('/corporation', controller.updateCorporation);

module.exports = router;
