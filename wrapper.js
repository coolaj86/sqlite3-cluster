'use strict';

var sqlite3 = require('sqlite3');
var dbs = {};

function sanitize(str) {
  return String(str).replace("'", "''");
}

function create(opts, verbs) {
  if (!verbs) {
    verbs = {};
  }
  var db;
  var PromiseA = verbs.Promise || require('bluebird');

  if (!opts) {
    opts = {};
  }

  if (opts.verbose) {
    sqlite3.verbose();
  }

  // TODO expire unused dbs from cache
  var dbname = "";
  if (opts.dirname) {
    dbname += opts.dirname;
  }
  if (opts.prefix) {
    dbname += opts.prefix;
  }
  if (opts.subtenant) {
    dbname += opts.subtenant + '.';
  }
  if (opts.tenant) {
    dbname += opts.tenant + '.';
  }
  if (opts.dbname) {
    dbname += opts.dbname;
  }
  if (opts.suffix) {
    dbname += opts.suffix;
  }
  if (opts.ext) {
    dbname += opts.ext;
  }

  if (dbs[dbname]) {
    return PromiseA.resolve(dbs[dbname]);
  }


  db = new sqlite3.Database(dbname);
  // dbs[dbname] = db // 
  db.sanitize = sanitize;
  db.escape = sanitize;

  db.init = function (newOpts) {
    if (!newOpts) {
      newOpts = {};
    }

    var key = newOpts.key || opts.key;
    var bits = newOpts.bits || opts.bits;

    return new PromiseA(function (resolve, reject) {
      if (db._initialized) {
        dbs[dbname] = db;
        resolve(db);
        return;
      }

      if (!key) {
        if (!bits) {
          db._initialized = true;
        }
        dbs[dbname] = db;
        resolve(db);
        return;
      }

      // TODO test key length

      db.serialize(function () {
        var setup = [];

        if (!bits) {
          bits = 128;
        }

        // TODO  db.run(sql, function () { resolve() });
        setup.push(new PromiseA(function (resolve, reject) {
          db.run("PRAGMA KEY = \"x'" + sanitize(key) + "'\"", [], function (err) {
            if (err) { reject(err); return; }
            resolve(this);
          });
        }));
        setup.push(new PromiseA(function (resolve, reject) {
          //process.nextTick(function () {
          db.run("PRAGMA CIPHER = 'aes-" + sanitize(bits) + "-cbc'", [], function (err) {
            if (err) { reject(err); return; }
            resolve(this);
          });
         //});
        }));

        PromiseA.all(setup).then(function () {
          // restore original functions
          db._initialized = true;
          dbs[dbname] = db;
          resolve(db);
        }, reject);
      });
    });
  };

  dbs[dbname] = db.init(opts);
  return dbs[dbname];
}

module.exports.sanitize = sanitize;
module.exports.escape = sanitize;
module.exports.Database = sqlite3.Database;
module.exports.create = create;
