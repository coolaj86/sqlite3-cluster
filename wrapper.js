'use strict';

/*global Promise*/
var sqlite3 = require('sqlite3');
var dbs = {};

function sanitize(str) {
  return String(str).replace("'", "''");
}

function create(opts) {
  var db;

  if (!opts) {
    opts = {};
  }

  if (opts.verbose) {
    sqlite3.verbose();
  }

  if (!dbs[opts.filename]) {
    dbs[opts.filename] = new sqlite3.Database(opts.filename);
  }

  db = dbs[opts.filename];
  db.sanitize = sanitize;
  db.escape = sanitize;

  db.init = function (newOpts) {
    if (!newOpts) {
      newOpts = {};
    }

    var key = newOpts.key || opts.key;
    var bits = newOpts.bits || opts.bits;

    return new Promise(function (resolve, reject) {
      console.log('OPTS', opts);
      console.log('BITS', bits);
      if (db._initialized) {
        resolve(db);
        return;
      }

      if (!key) {
        if (!bits) {
          db._initialized = true;
        }
        resolve(db);
        return;
      }

      // TODO test key length

      db._initialized = true;
      db.serialize(function () {
        var setup = [];

        if (!bits) {
          bits = 128;
        }

        // TODO  db.run(sql, function () { resolve() });
        setup.push(new Promise(function (resolve, reject) {
          db.run("PRAGMA KEY = \"x'" + sanitize(key) + "'\"", [], function (err) {
            if (err) { reject(err); return; }
            resolve(this);
          });
        }));
        setup.push(new Promise(function (resolve, reject) {
          //process.nextTick(function () {
          db.run("PRAGMA CIPHER = 'aes-" + sanitize(bits) + "-cbc'", [], function (err) {
            if (err) { reject(err); return; }
            resolve(this);
          });
         //});
        }));

        Promise.all(setup).then(function () {
          // restore original functions
          resolve(db);
        }, reject);
      });
    });
  };

  return db.init(opts);
}

module.exports.sanitize = sanitize;
module.exports.escape = sanitize;
module.exports.Database = sqlite3.Database;
module.exports.create = create;
