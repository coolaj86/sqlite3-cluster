'use strict';

var server = require('http').createServer();
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ server: server });
var port = process.env.PORT || process.argv[0] || 4080;

var app = require('./sqlite-server');

server.listen(port, function () {
});

app.create({ server: server, wss: wss }).then(function (app) {
  server.on('request', app);
});
