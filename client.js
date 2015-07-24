'use strict';

/*global Promise*/

// TODO iterate over the prototype
// translate request / response
var sqlite3real = require('sqlite3');

/*
function createConnection(opts) {
  var server = ;

  return server.create(opts).then(function () {
    // created and listening
  });
}
*/

function startServer(opts) {
  return require('./server').create(opts).then(function (server) {
    // this process doesn't need to connect to itself
    // through a socket
    return server.masterClient;
  });
}

function getConnection(opts) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      var WebSocket = require('ws');
      var ws = new WebSocket('ws+unix:' + opts.sock);

      if (opts.serve) {
        console.log("[EXPLICIT SERVER] #################################################");
        return startServer(opts).then(function (client) {
          // ws.masterClient = client;
          resolve({ masterClient: client });
        });
      }

      ws.on('error', function (err) {
        console.error('[ERROR] ws connection failed, retrying');
        console.error(err);

        function retry() {
          setTimeout(function () {
            getConnection(opts).then(resolve);
          }, 100 + (Math.random() * 250));
        }

        if (!opts.connect && ('ENOENT' === err.code || 'ECONNREFUSED' === err.code)) {
          console.log('[NO SERVER] attempting to create a server #######################');
          return startServer(opts).then(function (client) {
            // ws.masterClient = client;
            resolve({ masterClient: client });
          }, function () {
            retry();
          });
        }

        retry();
      });

      ws.on('open', function () {
        resolve(ws);
      });
    });
  }, 100 + (Math.random() * 250));
}

function create(opts) {
  if (!opts.sock) {
    opts.sock = opts.filename + '.sock';
  }

  var promise;
  var numcpus = require('os').cpus().length;
  if (opts.standalone || (1 === numcpus && !opts.serve && !opts.connect)) {
    return require('./wrapper').create(opts);
  }

  function retryServe() {
    return startServer(opts).then(function (client) {
      // ws.masterClient = client;
      return { masterClient: client };
    }, function () {
      retryServe();
    });
  }

  if (opts.serve) {
    console.log('[EXPLICIT]');
    promise = retryServe();
  } else {
    promise = getConnection(opts);
  }
  /*
  if (opts.connect) {
  }
  */

  // TODO maybe use HTTP POST instead?
  return promise.then(function (ws) {
    if (ws.masterClient) {
      console.log('[MASTER CLIENT] found');
      return ws.masterClient;
    }

    var db = {};
    var proto = sqlite3real.Database.prototype;
    var messages = [];

    function rpc(fname, args) {
      var id;
      var cb;

      if ('function' === typeof args[args.length - 1]) {
        id = Math.random();
        cb = args.pop();
      }

      console.log('fname, args');
      console.log(fname, args);

      ws.send(JSON.stringify({
        type: 'rpc'
      , func: fname
      , args: args
      , filename: opts.filename
      , id: id
      }));

      if (!cb) {
        return;
      }

      function onMessage(data) {
        var cmd;

        try {
          cmd = JSON.parse(data.toString('utf8'));
        } catch(e) {
          console.error('[ERROR] in client, from sql server parse json');
          console.error(e);
          console.error(data);
          console.error();

          //ws.send(JSON.stringify({ type: 'error', value: { message: e.message, code: "E_PARSE_JSON" } }));
          return;
        }

        if (cmd.id !== id) {
          return;
        }

        //console.log('onMessage data');
        //console.log(cmd);

        cb.apply(cmd.this, cmd.args);

        if ('on' !== fname) {
          var index = messages.indexOf(onMessage);
          messages.splice(index, 1);
        }
      }

      messages.push(onMessage);
    }

    db.sanitize = require('./wrapper').sanitize;

    Object.keys(sqlite3real.Database.prototype).forEach(function (key) {

      if ('function' === typeof proto[key]) {
        db[key] = function () {
          rpc(key, Array.prototype.slice.call(arguments));
        };
      }

    });

    ws.on('message', function (data) {
      messages.forEach(function (fn) {
        try {
          fn(data);
        } catch(e) {
          // ignore
        }
      });
    });

    // serialize
    // parallel
    db.serialize = db.parallel = function () {
      throw new Error('NOT IMPLEMENTED in SQLITE3-remote');
    };

    return db;
  });
}


module.exports.sanitize = require('./wrapper').sanitize;
module.exports.create = create;
