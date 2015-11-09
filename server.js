'use strict';

var PromiseA = require('bluebird').Promise;
var wsses = {};

function createApp(servers, options) {
  if (wsses[options.sock]) {
    return PromiseA.resolve(wsses[options.sock]);
  }


  var url = require('url');
  //var express = require('express');
  //var app = express();
  var wss = servers.wss;
  var server = servers.server;

  function app(req, res) {
    res.end('NOT IMPLEMENTED');
  }

  wss.on('connection', function (ws) {
    if (!wss.__count) {
      wss.__count = 0;
    }
    wss.__count += 1;

    var location = url.parse(ws.upgradeReq.url, true);
    // you might use location.query.access_token to authenticate or share sessions
    // or ws.upgradeReq.headers.cookie (see http://stackoverflow.com/a/16395220/151312

    if (!options.ipcKey) {
      console.warn("[SECURITY] please include { ipcKey: crypto.randomBytes(16).toString('base64') }"
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

    ws.on('close', function () {
      wss.__count -= 1;
      if (!wss.__count) {
        wss.close();
        server.close();
      }
    });
    ws.on('message', function (buffer) {
      var cmd;
      var promise;

      try {
        cmd = JSON.parse(buffer.toString('utf8'));
      } catch(e) {
        console.error('[ERROR] parse json');
        console.error(e);
        console.error(buffer);
        console.error();
        ws.send(JSON.stringify({ type: 'error', value: { message: e.message, code: "E_PARSE_JSON" } }));
        return;
      }

      // caching and create logic happens in the wrapper stored here below
      promise = require('./wrapper').create(options, cmd).then(function (db) {

        switch(cmd.type) {
          case 'init':
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
            if (!db._initialized) {
              //console.log('[RPC NOT HAPPENING]');
              ws.send(JSON.stringify({
                type: 'error'
              , id: cmd.id
              , args: [{ message: 'database has not been initialized' }]
              , error: { message: 'database has not been initialized' }
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

  //app.masterClient = db;
  wsses[options.sock] = app;

  return PromiseA.resolve(app);
}

function create(options) {
  var server = require('http').createServer();
  var WebSocketServer = require('ws').Server;
  var wss = new WebSocketServer({ server: server });
  //var port = process.env.PORT || process.argv[0] || 4080;

  var fs = require('fs');
  var ps = [];

  ps.push(new PromiseA(function (resolve) {
    fs.unlink(options.sock, function () {
      // ignore error when socket doesn't exist

      server.listen(options.sock, resolve);
    });
  }));

  ps.push(createApp({ server: server, wss: wss }, options).then(function (app) {
    server.on('request', app);
    return { masterClient: app.masterClient || true };
  }));

  return PromiseA.all(ps).then(function (results) {
    return results[1];
  });
}

module.exports.create = create;
