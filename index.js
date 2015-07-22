'use strict';

var path = require('path');
var numcpus = require('os').cpus().length;

if (numcpus >= 2) {
  sqlite3 = require('./sqlite-client');
} else {
  sqlite3 = require('./sqlite3-wrapper');
}

module.exports = sqlite3;
