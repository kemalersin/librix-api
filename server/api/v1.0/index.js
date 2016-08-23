'use strict';

var express = require('express');
var controller = require('./v1.0.controller');

var router = express.Router();

router.get('/client/:consumerKey', controller.getClient);
router.post('/client', controller.createClient);
router.put('/client', controller.updateClient);
router.get('/token/:consumerKey', controller.getToken);

module.exports = router;
