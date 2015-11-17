'use strict';

var sqlite3 = require('sqlite3');
// TODO expire unused dbs from cache
var dbs = {};

function sanitize(str) {
  return String(str).replace("'", "''");
}

function create(opts, verbs) {
  if (!verbs) {
    verbs = {};
  }
  if (!opts) {
    opts = {};
  }

  var db;
  var PromiseA = verbs.Promise || require('bluebird');
  var dbname = "";

  dbname += (opts.prefix || '');
  if (opts.subtenant) {
    dbname += opts.subtenant + '.';
  }
  if (opts.tenant) {
    dbname += opts.tenant + '.';
  }
  dbname += (opts.dbname || '');
  dbname += (opts.suffix || '');
  dbname += (opts.ext || '');
  dbname = require('path').resolve(opts.dirname || '', dbname);

  function initDb(newOpts) {
    if (dbs[dbname].initPromise) {
      return dbs[dbname].initPromise;
    }

    if (!newOpts) {
      newOpts = {};
    }

    var key = newOpts.key || opts.key;
    var bits = newOpts.bits || opts.bits;

    dbs[dbname].initPromise = new PromiseA(function (resolve, reject) {
      if (dbs[dbname].db._initialized) {
        resolve(db);
        return;
      }

      if (!key) {
        if (!bits) {
          //console.log("INITIALIZED WITHOUT KEY");
          //console.log(opts);
          dbs[dbname].db._initialized = true;
        }
        dbs[dbname].db = db;
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
          dbs[dbname].db._initialized = true;
          dbs[dbname].db = db;

          resolve(db);
        }, reject);
      });
    });

    return dbs[dbname].initPromise;
  }

  function newDb() {
    // dbs[dbname] = db // 
    db = new sqlite3.Database(dbname);
    db.init = initDb;
    db.sanitize = sanitize;
    db.escape = sanitize;

    if (opts.verbose) {
      sqlite3.verbose();
    }

    return db;
  }

  // Could be any of:
  //   * db object
  //   * init promise

  if (!dbs[dbname]) {
    dbs[dbname] = { db: newDb() };
  }

  if (dbs[dbname].db._initialized) {
    return PromiseA.resolve(dbs[dbname].db);
  }

  if (opts.init || ('init' === opts.type) || (opts.bits && opts.key)) {
    dbs[dbname].initPromise = db.init(opts);
  }

  return dbs[dbname].initPromise || PromiseA.resolve(dbs[dbname].db);
}

module.exports.sanitize = sanitize;
module.exports.escape = sanitize;
module.exports.Database = sqlite3.Database;
module.exports.create = create;
