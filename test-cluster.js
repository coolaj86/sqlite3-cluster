'use strict';

var cluster = require('cluster');
var numCores = require('os').cpus().length;
var i;

function run() {
  var sqlite3 = require('./cluster');

  sqlite3.create({
      key: '00000000000000000000000000000000'
    , bits: 128
    , filename: '/tmp/test.cluster.sqlcipher'
    , verbose: null
    , standalone: null
    , serve: null
    , connect: null
  }).then(function (client) {
    client.run("SELECT 1", [], function (err) {
      if (err) {
        console.error('[ERROR]', cluster.isMaster && '0' || cluster.worker.id);
        console.error(err);
        return;
      }

      console.log('[this]', cluster.isMaster && '0' || cluster.worker.id);
      console.log(this);
    });
  });
}

if (cluster.isMaster) {
  for (i = 1; i <= numCores; i += 1) {
    cluster.fork();
  }
}

run();
