'use strict';
/*global Promise*/

var wsses = {};

function createApp(server, options) {

  if (wsses[options.filename]) {
    return Promise.resolve(wsses[options.filename]);
  }

  return require('./wrapper').create(options).then(function (db) {

    var url = require('url');
    //var express = require('express');
    //var app = express();
    var wss = server.wss;

    function app(req, res) {
      res.end('NOT IMPLEMENTED');
    }

    wss.on('connection', function (ws) {

      var location = url.parse(ws.upgradeReq.url, true);
      // you might use location.query.access_token to authenticate or share sessions
      // or ws.upgradeReq.headers.cookie (see http://stackoverflow.com/a/16395220/151312

      ws.__session_id = location.query.session_id || Math.random();

      ws.on('message', function (buffer) {
        var cmd;

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

        switch(cmd.type) {
          case 'init':
            db[cmd.func].apply(db, cmd.args).then(function () {
              var args = Array.prototype.slice.call(arguments);
              var myself;

              if (args[0] === db) {
                args = [];
                myself = true;
              }

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
              ws.send(JSON.stringify({
                type: 'error'
              , id: cmd.id
              , args: [{ message: 'database has not been initialized' }]
              , error: { message: 'database has not been initialized' }
              }));
              return;
            }

            cmd.args.push(function () {
              var args = Array.prototype.slice.call(arguments);
              var myself;

              if (args[0] === db) {
                args = [];
                myself = true;
              }

              ws.send(JSON.stringify({
                this: this
              , args: args
              , self: myself
              , id: cmd.id
              }));
            });

            db[cmd.func].apply(db, cmd.args);
            break;

          default:
            throw new Error('UNKNOWN TYPE');
            //break;
        }

      });

      ws.send(JSON.stringify({ type: 'session', value: ws.__session_id }));
    });

    app.masterClient = db;
    wsses[options.filename] = app;

    return app;
  });
}

function create(options) {
  var server = require('http').createServer();
  var WebSocketServer = require('ws').Server;
  var wss = new WebSocketServer({ server: server });
  //var port = process.env.PORT || process.argv[0] || 4080;

  var fs = require('fs');
  var ps = [];

  ps.push(new Promise(function (resolve) {
    fs.unlink(options.sock, function () {
      // ignore error when socket doesn't exist

      server.listen(options.sock, resolve);
    });
  }));

  ps.push(createApp({ server: server, wss: wss }, options).then(function (app) {
    server.on('request', app);
    return { masterClient: app.masterClient };
  }));

  return Promise.all(ps).then(function (results) {
    return results[1];
  });
}

module.exports.create = create;
