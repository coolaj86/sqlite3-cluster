'use strict';

var cluster = require('cluster');

console.log("[Worker #" + cluster.worker.id + "]");

function testSelect(client) {
  var PromiseA = require('bluebird');

  return new PromiseA(function (resolve, reject) {
    client.run('CREATE TABLE IF NOT EXISTS meta (version TEXT)', function (err) {
      if (err) {
        if ('E_NO_INIT' === err.code) {
          console.error(err.message);
          resolve(client);
          return;
        }

        reject(err);
        return;
      }

      client.get("SELECT version FROM meta", [], function (err, result) {
        if (err) {
          console.error('[ERROR] create table', cluster.isMaster && '0' || cluster.worker.id);
          console.error(err.stack || err);
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

function run(ipcKey, sock) {
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
    , connect: sock
    , sock: sock
    , ipcKey: ipcKey
  });
}

function init(client) {
  //console.log('[INIT] begin');
  return client.init({
    algorithm: 'aes'
  , bits: 128
  , mode: 'cbc'
  , key: '00000000000000000000000000000000'
  }).then(function (/*args*/) {
    //console.log('[INIT]', args);
    return client;
  });
}

function onMessage(msg) {
  function loseTheWillToLive() {
    process.removeListener('message', onMessage);
    // child processes do not exit when their event loop is empty
    setTimeout(function () {
      console.log('#' + cluster.worker.id + ' dead');
      process.exit(0);
    }, 100);
  }

  console.log('New Worker', cluster.worker.id, msg);
  if (1 === cluster.worker.id) {
    //setTimeout(function () {
      run(msg.ipcKey, msg.sock).then(testSelect).then(function (client) {
        setTimeout(function () {
          console.log('init worker closing...');
          client.close(loseTheWillToLive);
          loseTheWillToLive();
        }, 1000);
        // waiting for https://github.com/websockets/ws/issues/613 to land
      });
    //}, 1000);
  } else {
    setTimeout(function () {
      run(msg.ipcKey, msg.sock).then(init).then(testSelect).then(function (client) {
        console.log('#' + cluster.worker.id + ' other working closing...');
        client.close(loseTheWillToLive);
        loseTheWillToLive();
      });
    }, 100 * cluster.worker.id);
  }
}
process.on('message', onMessage);

// The native Promise implementation ignores errors because... dumbness???
process.on('beforeExit', function () {
  console.log("[WORKER] I've got nothing left to do");
});
process.on('unhandledRejection', function (err) {
  console.error('Unhandled Promise Rejection');
  console.error(err.stack || err);

  process.exit(1);
});
