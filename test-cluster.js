'use strict';

var cluster = require('cluster');
//var numCores = 2;
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
    client.get("SELECT ?", ['Hello World!'], function (err, result) {
      if (err) {
        console.error('[ERROR]', cluster.isMaster && '0' || cluster.worker.id);
        console.error(err);
        return;
      }

      console.log('[this]', cluster.isMaster && '0' || cluster.worker.id);
      console.log(this);

      console.log('[result]', cluster.isMaster && '0' || cluster.worker.id);
      console.log(result);
    });
  });
}

if (cluster.isMaster) {
  // not a bad idea to setup the master before forking the workers
  run().then(function () {
    for (i = 1; i <= numCores; i += 1) {
      cluster.fork();
    }
  });
} else {
  run();
}

// The native Promise implementation ignores errors because... dumbness???
process.on('unhandledPromiseRejection', function (err) {
  console.error('Unhandled Promise Rejection');
  console.error(err);
  console.error(err.stack);

  process.exit(1);
});
