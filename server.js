'use strict';

function create(options) {
  var url = require('url');
  var express = require('express');
  var app = express();
  var wss = options.wss;

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

      /*
  var tablename = 'authn';
      if (tablename) {
        setup.push(db.runAsync("CREATE TABLE IF NOT EXISTS '" + sanitize(tablename)
          + "' (id TEXT, secret TEXT, json TEXT, PRIMARY KEY(id))"));
      }
      */

  /*global Promise*/
  return new Promise(function (resolve) {
    resolve(app);
  });
}

module.exports.create = create;
