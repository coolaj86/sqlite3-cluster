SQLite3 Cluster
===============

Works with node cluster, or completely and unrelated node processes.

**Note**: Most people would probably prefer to just use PostgreSQL rather than
wrap SQLite as a service... but I am not most people.

Node.js runs on a single core, which isn't very effective.

You can run multiple Node.js instances to take advantage of multiple cores,
but if you do that, you can't use SQLite in each process.

This module will either run client-server style in environments that benefit from it
(such as the Raspberry Pi 2 with 4 cores), or in-process for environments that don't
(such as the Raspberry Pi B and B+).

This also works with **SQLCipher**.

Usage
=====

The default behavior is to try to connect to a master and, if that fails, to become the master.

However, if you are in fact using the `cluster` rather than spinning up random instances,
you'll probably prefer to use this pattern:

```js
var cluster = require('cluster');
var sqlite = require('sqlite3-cluster');
var numCores = require('os').cpus().length;

var opts = {
  filename: '/tmp/mydb.sqlcipher'
, sock: '/tmp/mydb.sqlcipher.sock'
, verbose: false

  // a good default to use for instances where you might want
  // to cluster or to run standalone, but with the same API
, serve: cluster.isMaster
, connect: cluster.isWorker
, standalone: (1 === numCores) // overrides serve and connect

  // if using SQLCipher, you can supply the key and desired bit-length
  // and the appropriate PRAGMA statements will be issued before the database is returned
, key: '00000000000000000000000000000000'
, bits: 128
};

sqlite.create(opts).then(function (db) {
  // same api as new sqlite3.Database(options.filename)

  client.run("SELECT 1", [], function (err) {
    if (err) {
      console.error('[ERROR]', cluster.isMaster && '0' || cluster.worker.id);
      console.error(err);
      return;
    }

    console.log('[this]', cluster.isMaster && '0' || cluster.worker.id);
    console.log(this);
  });
});
```

If you wish to always use clustering, even on a single core system, see `test-cluster.js`.

Likewise, if you wish to use standalone mode in a particular worker process see `test-standalone.js`.

API
===

The API is exactly the same as `node-sqlite`, with these few exceptions:

1 Database Creation
-------------------

Instead of this:

```js
var db = new require('sqlite3').Database(filename);
```

You must do this:

```js
require('sqlite3-cluster').create(filename);
```

2 db.escape
-----------

This is an additional helper function.

If you need at any time to concatonate strings with user input
(which you should rarely need to do since `db.run(stmt, arr, fn)`
is usually sufficient), you can use the escape function.

```js
var sqlEscape = require('sqlite3-cluster').escape;
```

also

```js
require('sqlite3-cluster').create(options).then(function (db) {
  // obligatory xkcd reference https://xkcd.com/327/
  var userInput = db.escape("Robert'); DROP TABLE Students;");
});
```

3 serialize / parallelize
-------------------------

`db.serialize(fn)` and `db.parallelize(fn)` are not supported because it would require
copying a chunk of code from `node-sqlite3` and adapting it.

It wouldn't be a difficult task, just tedious and generally no longer necessary since
recent versions of node include native `Promise`s.

Standalone / Master Mode is raw sqlite3
========================

The `master` in the cluster (meaning `opts.serve = true`) will have a direct connection
to the sqlite3 database using `node-sqlite`, directly.

Likewise, when only one process is being used (`opts.standalone = true`) the listener is
not started and the connection is direct.

If you take a look at `wrapper.js` you'll see that it simply resolves with an instance of
`node-sqlite3`.

Security Warning
================

Note that any application on the system could connect to the socket.

In the future I may add a `secret` field in the options object to be
used for authentication across processes. This would not be difficult,
it's just not necessary for my use case at the moment.
