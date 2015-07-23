'use strict';

var numcpus = require('os').cpus().length;
var sqlite3;

if (numcpus >= 2) {
  sqlite3 = require('./client');
} else {
  sqlite3 = require('./wrapper');
}

module.exports = sqlite3;
