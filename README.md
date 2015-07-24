DRAFT
=====

This is just hypothetical while I build out the API

SQLite3 Server
=============

Node.js runs on a single core, which isn't very effective.

You can run multiple Node.js instances to take advantage of multiple cores,
but if you do that, you can't use SQLite in each process.

This module will either run client-server style in environments that benefit from it
(such as the Raspberry Pi 2 with 4 cores), or in-process for environments that don't
(such as the Raspberry Pi B and B+).

Usage
=====

```js
var sqlite = require('sqlite3-server');
var opts = {
  key: '1892d335081d8d346e556c9c3c8ff2c3'
, bits: 128
, filename: path.join('/tmp/authn.sqlcipher')
, verbose: false
, port: 3232 // default random
, forceServer: true // default false
};

sqlite.create(opts).then(function (db) {
  // EXACT same api as db
});
```
