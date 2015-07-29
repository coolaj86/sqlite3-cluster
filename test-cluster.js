'use strict';

var cluster = require('cluster');
//var numCores = 2;
var numCores = require('os').cpus().length;
var i;

function testSelect(client) {
  return client.run('CREATE TABLE IF NOT EXISTS meta (version TEXT)', function (err) {
    if (err) {
      console.error('[ERROR] create table', cluster.isMaster && '0' || cluster.worker.id);
      console.error(err);
      return;
    }

    return client.get("SELECT version FROM meta", [], function (err, result) {

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

function init() {
  var sqlite3 = require('./cluster');

  return sqlite3.create({
      bits: 128
    , filename: '/tmp/test.cluster.sqlcipher'
    , verbose: null
    , standalone: null
    , serve: null
    , connect: null
  }).then(function (client) {
    console.log('[INIT] begin');
    return client.init({ bits: 128, key: '00000000000000000000000000000000' });
  }).then(testSelect, function (err) {
    console.error('[ERROR]');
    console.error(err);
  }).then(function () {
    console.log('success');
  }, function (err) {
    console.error('[ERROR 2]');
    console.error(err);
  });
}

function run() {
  var sqlite3 = require('./cluster');

  return sqlite3.create({
      bits: 128
    , filename: '/tmp/test.cluster.sqlcipher'
    , verbose: null
    , standalone: null
    , serve: null
    , connect: null
  });//.then(testSelect);
}

if (cluster.isMaster) {
  // not a bad idea to setup the master before forking the workers
  run().then(function () {
    for (i = 1; i <= numCores; i += 1) {
      cluster.fork();
    }
  });
} else {
  if (1 === cluster.worker.id) {
    init().then(testSelect);
    return;
  } else {
    setTimeout(function () {
      run().then(testSelect);
    }, 100);
  }
}

// The native Promise implementation ignores errors because... dumbness???
process.on('unhandledPromiseRejection', function (err) {
  console.error('Unhandled Promise Rejection');
  console.error(err);
  console.error(err.stack);

  process.exit(1);
});
