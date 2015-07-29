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
    //setTimeout(function () {
      var WebSocket = require('ws');
      var ws = new WebSocket('ws+unix:' + opts.sock);

      ws.on('error', function (err) {
        console.error('[ERROR] ws connection failed, retrying');
        console.error(err);

        function retry() {
          setTimeout(function () {
            getConnection(opts).then(resolve, retry);
          }, 100 + (Math.random() * 250));
        }

        if (!opts.connect && ('ENOENT' === err.code || 'ECONNREFUSED' === err.code)) {
          console.log('[NO SERVER] attempting to create a server #######################');
          return startServer(opts).then(function (client) {
            // ws.masterClient = client;
            resolve({ masterClient: client });
          }, function (err) {
            console.error('[ERROR] failed to connect to sqlite3-cluster service. retrying...');
            console.error(err);
            retry();
          });
        }

        retry();
      });

      ws.on('open', function () {
        resolve(ws);
      });
    //}, 100 + (Math.random() * 250));
  });
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
    }, function (err) {
      console.error('[ERROR] retryServe()');
      console.error(err);
      retryServe();
    });
  }

  if (opts.serve) {
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
      return ws.masterClient;
    }

    var db = {};
    var proto = sqlite3real.Database.prototype;
    var messages = [];

    function init(opts) {
      return new Promise(function (resolve) {
        var id = Math.random();

        ws.send(JSON.stringify({
          type: 'init'
        , args: [opts]
        , func: 'init'
        , filename: opts.filename
        , id: id
        }));

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

          if (cmd.self) {
            cmd.args = [db];
          }

          messages.splice(messages.indexOf(onMessage), 1);

          if ('error' === cmd.type) {
            reject(cmd.args[0]);
            return;
          }
          resolve(cmd.args[0]);
        }

        messages.push(onMessage);
      });
    }

    function rpcThunk(fname, args) {
      var id;
      var cb;

      if ('function' === typeof args[args.length - 1]) {
        id = Math.random();
        cb = args.pop();
      }

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

        if (cmd.self) {
          cmd.args = [db];
        }
        cb.apply(cmd.this, cmd.args);

        if ('on' !== fname) {
          var index = messages.indexOf(onMessage);
          messages.splice(index, 1);
        }
      }

      messages.push(onMessage);
    }

    db.sanitize = require('./wrapper').sanitize;
    db.escape = require('./wrapper').escape;

    // TODO get methods from server (cluster-store does this)
    // instead of using the prototype
    Object.keys(sqlite3real.Database.prototype).forEach(function (key) {

      if ('function' === typeof proto[key]) {
        db[key] = function () {
          rpcThunk(key, Array.prototype.slice.call(arguments));
        };
      }
    });

    db.init = init;

    ws.on('message', function (data) {
      messages.forEach(function (fn) {
        try {
          fn(data);
        } catch(e) {
          console.error("[ERROR] ws.on('message', fn) (multi-callback)");
          console.error(e);
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
module.exports.escape = require('./wrapper').escape;
module.exports.create = create;
