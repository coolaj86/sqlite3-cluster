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

  if (!dbs[opts.storage] || dbs[opts.storage].__key !== opts.key) {
    dbs[opts.storage] = new sqlite3.Database(opts.storage);
  }

  db = dbs[opts.storage];
  db.__key = opts.key;

  return new Promise(function (resolve, reject) {
    db.serialize(function() {
      var setup = [];

      if (opts.key) {
        // TODO test key length
        if (!opts.bits) {
          opts.bits = 128;
        }

        // TODO  db.run(sql, function () { resolve() });
        setup.push(new Promise(function (resolve, reject) {
          db.run("PRAGMA KEY = \"x'" + sanitize(opts.key) + "'\"", [], function (err) {
            if (err) { reject(err); return; }
            resolve(this);
          });
        }));
        setup.push(new Promise(function (resolve, reject) {
          db.run("PRAGMA CIPHER = 'aes-" + sanitize(opts.bits) + "-cbc'", [], function (err) {
            if (err) { reject(err); return; }
            resolve(this);
          });
        }));
      }

      Promise.all(setup).then(function () { resolve(db); }, reject);
    });
  });
}

module.exports.sanitize = sanitize;
module.exports.Database = sqlite3.Database;
module.exports.create = create;
