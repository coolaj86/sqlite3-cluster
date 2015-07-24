'use strict';

function run() {
  var sqlite3 = require('./standalone');

  sqlite3.create({
      key: '00000000000000000000000000000000'
    , bits: 128
    , filename: '/tmp/test.cluster.sqlcipher'
    , verbose: null
    , standalone: true
    , serve: null
    , connect: null
  }).then(function (client) {
    client.all("SELECT ?", ['Hello World!'], function (err, result) {
      if (err) {
        console.error('[ERROR] standalone');
        console.error(err);
        return;
      }

      console.log('[this] standalone');
      console.log(this);

      console.log('[result] standalone');
      console.log(result);
    });
  });
}

run();

// The native Promise implementation ignores errors because... dumbness???
process.on('unhandledPromiseRejection', function (err) {
  console.error('Unhandled Promise Rejection');
  console.error(err);
  console.error(err.stack);

  process.exit(1);
});
