'use strict';

var PromiseA = require('bluebird').Promise;
var wsses = {};

function createApp(servers, options) {
  var url = require('url');
  var wss = servers.wss;
  //var server = servers.server;

  //var express = require('express');
  //var app = express();
  /*
  function app(req, res) {
    res.end('NOT IMPLEMENTED');
  }
  */

  wss.on('connection', function (ws) {
    var location = url.parse(ws.upgradeReq.url, true);
    // you might use location.query.access_token to authenticate or share sessions
    // or ws.upgradeReq.headers.cookie (see http://stackoverflow.com/a/16395220/151312

    if (!options.ipcKey) {
      console.warn("[S] [SECURITY] please include { ipcKey: crypto.randomBytes(16).toString('base64') }"
        + " in your options and pass it from master to worker processes with worker.send()");
      ws._authorized = true;
    } else {
      ws._authorized = (options.ipcKey === (location.query.ipcKey || location.query.ipc_key));
    }

    if (!ws._authorized) {
      ws.send(JSON.stringify({ error: { message: "Unauthorized: ipc_key does not match", code: 'E_UNAUTHORIZED_IPCKEY' } }));
      ws.close();
      return;
    }

    if (!wss.__count) {
      wss.__count = 0;
    }
    wss.__count += 1;

    function decrWs() {
      wss.__count -= 1;
      if (!wss.__count) {
        console.log('[S] client count is zero, but server will be left open');
        /*
        wss.close(function () {
          console.log('wss.closed');
        });
        server.close(function () {
          console.log('server closed, but will not exit due to bug? in wss.close()');
          process.exit(0);
        });
        */
      }
    }

    ws.on('error', function (err) {
      console.error('[S] [WebSocket error]');
      console.error(err.stack);
      decrWs();
    });
    ws.on('close', decrWs);
    ws.on('message', function (buffer) {
      var cmd;
      var promise;

      try {
        cmd = JSON.parse(buffer.toString('utf8'));
      } catch(e) {
        console.error('[S] [ERROR] parse json');
        console.error(e.stack || e);
        console.error(buffer);
        console.error();
        ws.send(JSON.stringify({ type: 'error', value: { message: e.message, code: "E_PARSE_JSON" } }));
        return;
      }

      //console.log('cmd');
      //console.log(cmd);
      // caching and create logic happens in the wrapper stored here below
      promise = require('./wrapper').create(cmd && cmd.dbname && cmd || options).then(function (db) {

        switch(cmd.type) {
          case 'init':
            console.log('[S] init', cmd);
            db[cmd.func].apply(db, cmd.args).then(function () {
              var args = Array.prototype.slice.call(arguments);
              var myself;

              if (args[0] === db) {
                args = [];
                myself = true;
              }

              //console.log('[INIT HAPPENING]');
              ws.send(JSON.stringify({
                id: cmd.id
              , self: myself
              , args: args
              //, this: this
              }));
            });
            break;

          case 'rpc':
            if ('close' !== cmd.func && !db._initialized) {
              //console.log('[RPC NOT HAPPENING]');
              ws.send(JSON.stringify({
                type: 'error'
              , id: cmd.id
              , args: [{ message: 'database has not been initialized', code: 'E_NO_INIT' }]
              , error: { message: 'database has not been initialized', code: 'E_NO_INIT' }
              }));
              return;
            }

            cmd.args.push(function (err) {
              var args = Array.prototype.slice.call(arguments);
              var myself;

              if (args[0] === db) {
                args = [];
                myself = true;
              }

              //console.log('[RPC HAPPENING]', args, cmd.id);
              ws.send(JSON.stringify({
                this: (!err && this !== global) ? this : {}
              , args: args
              , self: myself
              , id: cmd.id
              , error: err
              }));
            });

            db[cmd.func].apply(db, cmd.args);
            break;

          default:
            throw new Error('UNKNOWN TYPE');
            //break;
        }

      });
    });
  });

  // wsses[options.sock] = app;
  return PromiseA.resolve();
}

function newSocket(options) {
  if (wsses[options.sock]) {
    return PromiseA.resolve(wsses[options.sock]);
  }

  wsses[options.sock] = new PromiseA(function (resolve) {
    var fs = require('fs');
    fs.unlink(options.sock, function () {
      var server = require('http').createServer();
      // ignore error when socket doesn't exist
      server.listen(options.sock, function () {
        resolve(server);
      });
    });
  }).then(function (server) {
    var WebSocketServer = require('ws').Server;
    var servers = {
      server: require('http').createServer()
    , wss: new WebSocketServer({ server: server })
    };
    
    return createApp(servers, options).then(function (/*app*/) {
      // server.on('request', app);
      wsses[options.sock] = servers;

      return wsses[options.sock];
    });
  });

  return wsses[options.sock];
}

function createMasterClient(options) {
  return require('./wrapper').create(options, null).then(function (db) {
    return db;
  });
}

function createServer(options) {
  if (!options.sock) {
    throw new Error("Please provide options.sock as the socket to serve from");
  }
  options.server = options.sock;

  return newSocket(options).then(function () {
    var result = {};

    Object.keys(wsses[options.sock]).forEach(function (key) {
      result[key] = wsses[options.sock][key];
    });
  });
}

function create(options) {
  return createServer(options).then(function (result) {
    if (!options.dbname) {
      return result;
    }

    return createMasterClient(options).then(function (db) {
      result.masterClient = db;

      return result;
    });
  });
}

module.exports.create = create;
module.exports.createMasterClient = createMasterClient;
module.exports.createServer = createServer;
