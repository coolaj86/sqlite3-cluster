'use strict';
/*global Promise*/

var wsses = {};

function createApp(server, options) {
  console.log('Create App');

  if (wsses[options.filename]) {
    return Promise.resolve(wsses[options.filename]);
  }

  return require('./wrapper').create(options).then(function (db) {
    var url = require('url');
    var express = require('express');
    var app = express();
    var wss = server.wss;

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
          ws.send(JSON.stringify({ type: 'error', value: { message: e.message, code: "E_PARSE_JSON" } }));
        }

        switch(cmd.type) {
          case 'init':
            break;

          case 'rpc':
            break;

          default:
            break;
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
  console.log('Create Server');

  return new Promise(function (resolve) {
    var server = require('http').createServer();
    var WebSocketServer = require('ws').Server;
    var wss = new WebSocketServer({ server: server });
    //var port = process.env.PORT || process.argv[0] || 4080;

    console.log('options.sock');
    console.log(options.sock);
    var fs = require('fs');
    fs.unlink(options.sock, function () {
      // ignore error when socket doesn't exist

      server.listen(options.sock, function () {
        console.log('Listening');
      });
    });

    createApp({ server: server, wss: wss }, options).then(function (app) {
      server.on('request', app);
      resolve({ masterClient: app.masterClient });
    });
  });
}

module.exports.create = create;
