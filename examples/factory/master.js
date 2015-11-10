'use strict';

var cluster = require('cluster');
var minCores = 3;
var numCores = Math.max(minCores, require('os').cpus().length);
var i;
var sock = '/tmp/foobar.sqlite3-cluster.test.sock';

function run(connect, ipcKey) {
  var sqlite3 = require('../../server');

  return sqlite3.createServer({
    verbose: null
  , sock: sock 
  , ipcKey: ipcKey
  });
}

var ipcKey = require('crypto').randomBytes(16).toString('hex');
// not a bad idea to setup the master before forking the workers

run(false, ipcKey).then(function () {
  var w;

  function setupWorker(w) {
    function sendKey() {
      w.send({ ipcKey: ipcKey, sock: sock });
    }
    w.on('online', sendKey);
  }

  for (i = 1; i <= numCores; i += 1) {
    w = cluster.fork();
    setupWorker(w);
  }
});

process.on('beforeExit', function () {
  console.log("[MASTER] I've got nothing left to live for... ugh... death is upon me...");
});
// The native Promise implementation ignores errors because... dumbness???
process.on('unhandledRejection', function (err) {
  console.error('Unhandled Promise Rejection');
  console.error(err);
  console.error(err.stack);

  process.exit(1);
});
