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

        console.log('Worker #', (cluster.isMaster && '0' || cluster.worker.id), '[this], [result]:');
        console.log(this);
        console.log(result);

        resolve(client);
      });
    });
  });
}

function run(clientFactory) {
  return clientFactory.create({
      init: false
    , dbname: 'factory.' + cluster.worker.id
  });
}

function init(client) {
  return client.init({
    algorithm: 'aes'
  , bits: 128
  , mode: 'cbc'
  , key: '00000000000000000000000000000000'
  }).then(function (/*db*/) {
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

  var clientFactory = require('../../client').createClientFactory({
      algorithm: 'aes'
    , bits: 128
    , mode: 'cbc'
    , dirname: '/tmp/'
    , prefix: 'foobar.'
    //, dbname: 'cluster'
    , suffix: '.test'
    , ext: '.sqlcipher'
    , sock: msg.sock
    , ipcKey: msg.ipcKey
  });

  console.log('New Worker', cluster.worker.id, msg);
  if (1 === cluster.worker.id) {
    //setTimeout(function () {
      run(clientFactory).then(testSelect).then(function (client) {
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
      run(clientFactory).then(init).then(testSelect).then(function (client) {
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
