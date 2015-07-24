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
    client.run("SELECT 1", [], function (err) {
      if (err) {
        console.error('[ERROR] standalone');
        console.error(err);
        return;
      }

      console.log('[this] standalone');
      console.log(this);
    });
  });
}

run();
