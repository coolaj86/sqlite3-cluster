'use strict';

var sqlite3 = require('./index');

function create(opts) {
  var cluster = require('cluster');
  var numCores = require('os').cpus().length;

  if (!opts.serve && ('boolean' !== typeof opts.serve)) {
    opts.serve = (numCores > 1) && cluster.isMaster;
  }

  if (!opts.connect && ('boolean' !== typeof opts.connect)) {
    opts.connect = (numCores > 1) && cluster.isWorker;
  }

  return sqlite3.create(opts);
}

module.exports.sanitize = sqlite3.sanitize;
module.exports.create = create;
