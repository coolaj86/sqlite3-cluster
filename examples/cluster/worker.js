'use strict';

var cluster = require('cluster');

function testSelect(client) {
  var PromiseA = require('bluebird');

  return new PromiseA(function (resolve, reject) {
    client.run('CREATE TABLE IF NOT EXISTS meta (version TEXT)', function (err) {
      if (err) {
        console.error('[ERROR]', cluster.isMaster && '0' || cluster.worker.id);
        console.error(err.stack);
        reject(err);
        return;
      }

      client.get("SELECT version FROM meta", [], function (err, result) {
        if (err) {
          console.error('[ERROR] create table', cluster.isMaster && '0' || cluster.worker.id);
          console.error(err);
          reject(err);
          return;
        }

        console.log('[this] Worker #', cluster.isMaster && '0' || cluster.worker.id);
        console.log(this);

        console.log('[result] Worker #', cluster.isMaster && '0' || cluster.worker.id);
        console.log(result);

        resolve(client);
      });
    });
  });
}

function init(ipcKey) {
  var sqlite3 = require('../../cluster');

  return sqlite3.create({
      bits: 128
    , dirname: '/tmp/'
    , prefix: 'foobar.'
    , dbname: 'cluster'
    , suffix: '.test'
    , ext: '.sqlcipher'
    , verbose: null
    , standalone: null
    , serve: null
    , connect: true
    , sock: '/tmp/foobar.sqlite3-cluster.test.sock'
    , ipcKey: ipcKey
  }).then(function (client) {
    //console.log('[INIT] begin');
    return client.init({ algorithm: 'aes', bits: 128, key: '00000000000000000000000000000000' }).then(function (args) {
      //console.log('[INIT]', args);
      return client;
    });
  });
}

function run(connect, ipcKey) {
  var sqlite3 = require('../../cluster');

  return sqlite3.create({
      bits: 128
    , dirname: '/tmp/'
    , prefix: 'foobar.'
    , dbname: 'cluster'
    , suffix: '.test'
    , ext: '.sqlcipher'
    , verbose: null
    , standalone: null
    , serve: !connect
    , connect: connect
    , sock: '/tmp/foobar.sqlite3-cluster.test.sock'
    , ipcKey: ipcKey
  });//.then(testSelect);
}

function onMessage(msg) {
  function loseTheWillToLive() {
    process.removeListener('message', onMessage);
    // child processes do not exit when their event loop is empty
    process.nextTick(function () {
      process.exit(0);
    });
  }

  console.log('New Worker', cluster.worker.id, msg);
  if (1 === cluster.worker.id) {
    init(msg.ipcKey).then(testSelect).then(function (client) {
      console.log('init worker closing...');
      setTimeout(function () {
        client.close(loseTheWillToLive);
        loseTheWillToLive();
      }, 1000);
      // waiting for https://github.com/websockets/ws/issues/613 to land
    });
  } else {
    setTimeout(function () {
      run(true, msg.ipcKey).then(testSelect).then(function (client) {
        console.log('other working closing...');
        client.close(loseTheWillToLive);
        loseTheWillToLive();
      });
    }, 100);
  }
}
process.on('message', onMessage);

// The native Promise implementation ignores errors because... dumbness???
process.on('beforeExit', function () {
  console.log("[WORKER] I've got nothing left to do");
});
process.on('unhandledRejection', function (err) {
  console.error('Unhandled Promise Rejection');
  console.error(err);
  console.error(err.stack);

  process.exit(1);
});
