'use strict';

// I'm not a fan of singletons (as they are EVIL).
// However, this module is, by intent, meant to
// represent a worker process in a cluster.
// Thus, it is appropriately a singleton.
var processWebSocket;
var promiseWebSocket;

function startServer(opts, verbs, myServer) {
  if (myServer) {
    return verbs.Promise.resolve(myServer);
  }
  return require('./server').create(opts, verbs).then(function (server) {
    // this process doesn't need to connect to itself
    // through a socket
    return server.masterClient;
  });
}

// connection is scoped per-process, nothing more
function getConnection(opts, verbs, mySocket) {
  function incr(ws) {
    if (!ws.__count) {
      ws.__count = 0;
    }
    ws.__count += 1;
    return ws;
  }
  if (mySocket || processWebSocket) {
    promiseWebSocket = verbs.Promise.resolve(mySocket || processWebSocket);
    return promiseWebSocket.then(incr);
  }

  if (promiseWebSocket) {
    return promiseWebSocket.then(incr);
  }

  promiseWebSocket = new verbs.Promise(function (resolve) {
    //setTimeout(function () {
      var WebSocket = require('ws');
      // TODO how to include path and such?
      // http://unix:/absolute/path/to/unix.socket:/request/path
      // https://github.com/websockets/ws/issues/236
      var address = require('url').parse('ws+unix:' + opts.sock);
      var ws;
      address.pathname = opts.sock;
      address.path = '/' + require('cluster').worker.id + '/' + opts.ipcKey;
      address.query = {
        ipcKey: opts.ipcKey
      , ipc_key: opts.ipcKey
      , worker_id: require('cluster').worker.id
      };
      address.path += '?' + require('querystring').stringify(address.query);
      ws = new WebSocket(address);

      ws.on('error', function (err) {
        console.error('[ERROR] ws connection failed, retrying');
        console.error(err.stack);

        function retry() {
          // TODO eventually throw up
          setTimeout(function () {
            getConnection(opts, verbs, mySocket).then(resolve, retry);
          }, 100 + (Math.random() * 250));
        }

        if (!opts.connect && ('ENOENT' === err.code || 'ECONNREFUSED' === err.code)) {
          console.log('[NO SERVER] attempting to create a server #######################');
          return startServer(opts, verbs).then(function (client) {
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
  }).then(function (ws) {
    if (!processWebSocket) {
      processWebSocket = ws;
    }

    return ws;
  });

  return promiseWebSocket.then(incr);
}

module.exports.createClientFactory = function (conf, verbs, _socket) {
  // TODO distinguish between defaults and mandates

  if (!conf.ipcKey) {
    throw new Error("[E_NO_IPCKEY] Your config must specify an ipcKey.");
  }

  return {
    create: function (opts, _s) {
      var copy = {};

      if (_socket && _s) {
        throw new Error("[E_USR_SOCKET] Your parent has decided that you may not choose your own SOCKET. Don't get mad at me, take it up with them.");
      }
      if (opts.dirname && conf.dirname) {
        throw new Error("[E_USR_TENANT] Your parent has decided that you may not choose your own TENANT. Don't get mad at me, take it up with them.");
      }
      if (opts.tenant && conf.tenant) {
        throw new Error("[E_USR_TENANT] Your parent has decided that you may not choose your own TENANT. Don't get mad at me, take it up with them.");
      }
      if (opts.prefix && conf.prefix) {
        throw new Error("[E_USR_PREFIX] Your parent has decided that you may not choose your own PREFIX. Don't get mad at me, take it up with them.");
      }
      if (opts.suffix && conf.suffix) {
        throw new Error("[E_USR_SUFFIX] Your parent has decided that you may not choose your own SUFFIX. Don't get mad at me, take it up with them.");
      }
      if (opts.ext && conf.ext) {
        throw new Error("[E_USR_EXT] Your parent has decided that you may not choose your own EXT. Don't get mad at me, take it up with them.");
      }
      if (opts.serve) {
        throw new Error("[E_USR_SERVE] Your parent have forbidden you to SERVE. Don't get mad at me, take it up with them.");
      }
      if (opts.sock && conf.sock) {
        throw new Error("[E_USR_SERVE] Your parent have forbidden you to choose your own SOCK. Don't get mad at me, take it up with them.");
      }

      Object.keys(conf).forEach(function (key) {
        copy[key] = conf[key];
      });
      Object.keys(opts).forEach(function (key) {
        copy[key] = opts[key];
      });

      if (!verbs) {
        verbs = {
          Promise: null
        };
      }
      if (!verbs.Promise) {
        verbs.Promise = require('bluebird');
      }

      copy.connect = true;
      copy.sock = conf.sock;
      copy.tenant = conf.tenant;
      copy.ipcKey = conf.ipcKey;
      return module.exports.create(copy, verbs, _socket || _s || processWebSocket);
    }
  };
};

module.exports.create = function (opts, verbs, mySocket) {
  if (!verbs) {
    verbs = {};
  }

  var PromiseA = verbs && verbs.Promise || require('bluebird');
  verbs.Promise = PromiseA;
  // TODO iterate over the prototype
  // translate request / response
  var sqlite3real = require('sqlite3');

  if (!mySocket) {
    mySocket = processWebSocket;
  }

  function create(opts) {
    if (!opts.tenant) {
      opts.tenant = "";
    }
    if (!opts.subtenant) {
      opts.subtenant = "";
    }
    if (!opts.prefix) {
      opts.prefix = '';
    }
    if (!opts.suffix) {
      opts.suffix = '';
    }
    if (!opts.ext) {
      opts.ext = '.sqlite3'; // also .sqlcipher
    }
    if (!opts.dbname) {
      throw new Error("Please specify opts.dbname as the name of the database");
    }


    var promise;
    var numcpus = require('os').cpus().length;

    // if we're only on one core, use the lib directly, no socket
    if (opts.standalone || (1 === numcpus && !opts.serve && !opts.connect)) {
      return require('./wrapper').create(opts, verbs);
    }

    function retryServe() {
      return startServer(opts, verbs).then(function (client) {
        // ws.masterClient = client;
        return { masterClient: client };
      }, function (err) {
        console.error('[ERROR] retryServe()');
        console.error(err);
        retryServe();
      });
    }

    if (!opts.sock) {
      throw new Error("Please specify opts.sock as the path to the master socket. '/tmp/sqlite3-cluster' would do nicely.");
    }

    if (opts.serve) {
      promise = retryServe(opts);
    } else {
      promise = getConnection(opts, verbs, mySocket).then(function (socket) {
        mySocket = socket;
        return mySocket;
      });
    }

    // TODO maybe use HTTP POST instead?
    return promise.then(function (ws) {
      if (ws.masterClient) {
        // for the server
        return ws.masterClient;
      }

      var db = {};
      var proto = sqlite3real.Database.prototype;
      var messages = [];
      var idprefix = require('crypto').randomBytes(12).toString('base64');
      var idcount = 0;

      function genId() {
        idcount += 1;
        return idprefix + idcount;
      }

      function init(opts) {
        return new PromiseA(function (resolve, reject) {
          // TODO needs to reject by a timeout

          var id = genId();
          ws.send(JSON.stringify({
            type: 'init'
          , args: [opts]
          , func: 'init'
          , dirname: opts.dirname
          , prefix: opts.prefix
          , subtenant: opts.subtenant
          , tenant: opts.tenant
          , dbname: opts.dbname
          , suffix: opts.suffix
          , ext: opts.ext
          , id: id
          }));

          function onMessage(data) {
            var cmd;

            if (
              (data.dbname !== opts.dbname)
            || (data.dirname !== opts.dirname)
            || (data.prefix !== opts.prefix)
            || (data.subtenant !== opts.subtenant)
            || (data.tenant !== opts.tenant)
            || (data.suffix !== opts.suffix)
            || (data.ext !== opts.ext)
            ) {
              return reject(new Error("suxors to rejexors"));
            }

            try {
              cmd = JSON.parse(data.toString('utf8'));
            } catch(e) {
              console.error('[ERROR] in client, from sql server parse json');
              console.error(e);
              console.error(data);
              console.error();

              // ignore this message, it came out of order
              return reject(new Error("suxors to rejexors"));
            }

            if (cmd.id !== id) {
              // ignore this message, it came out of order
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

            //console.log('RESOLVING INIT');
            resolve(cmd.args[0]);
            return;
          }

          messages.push(onMessage);
        });
      }

      function rpcThunk(fname, args) {
        var id;
        var cb;

        if ('function' === typeof args[args.length - 1]) {
          id = genId();
          cb = args.pop();
        }

        ws.send(JSON.stringify({
          type: 'rpc'
        , func: fname
        , args: args
        , dirname: opts.dirname
        , prefix: opts.prefix
        , subtenant: opts.subtenant
        , tenant: opts.tenant
        , dbname: opts.dbname
        , suffix: opts.suffix
        , ext: opts.ext
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
            // ignore this message, it probably came out of order
            return;
          }

          if (cmd.self) {
            cmd.args = [db];
          }
          //console.log('RESOLVING RPC', cmd.this, cmd.args);
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

      db.close = function (fn) {
        ws.__count -= 1;
        if (!ws.__count) {
          // waiting for https://github.com/websockets/ws/issues/613 to land
          // 1000 means 'normal' https://github.com/websockets/ws/blob/master/lib/ErrorCodes.js
          ws.close(1000, null, fn);
        }
      };

      return db;
    });
  }

  return create(opts);
};

module.exports.sanitize = require('./wrapper').sanitize;
module.exports.escape = require('./wrapper').escape;
