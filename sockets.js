'use strict';

const csgrant = require('cloudsim-grant')
var util = require('util');
var adminUser = 'admin';
if (process.env.CLOUDSIM_ADMIN)
  adminUser = process.env.CLOUDSIM_ADMIN;

exports.showLog = false
const log = exports.showLog? console.log: ()=>{}

// Fast lookup of sockets per user.
function SocketDict() {

  this.sockets = {};
  // a reference to the socket.io library
  this.io = null;

  this.addSocket = function (user, socket) {
    if(!user) {
      console.trace('socket: ' + socket + ', user: ' + user);
    }
    if (!this.sockets[user]) {
      this.sockets[user] = [];
    }
    this.sockets[user].push(socket);
  };

  this.removeSocket = function (socket) {
    for (var user in this.sockets) {
      var array = this.sockets[user];
      var index = array.indexOf(socket);
      if (index > -1) {
        array.splice(index,1);
        return;
      }
    }
  };

  this.getSockets = function (user) {
    return user in this.sockets ? this.sockets[user] : [];
  };

  this.notifyUser = function (user, channel, data) {
    log('notify user ' + user);
    var sockets = this.getSockets(user);

    for (var i=0; i < sockets.length; ++i) {
      var s = sockets[i];
      s.emit(channel, data);
    }
  };

  this.notifyAll = function (channel, msg) {
    this.io.sockets.emit(channel, msg);
  };
}

var userSockets = new SocketDict();

exports.getUserSockets = function () {
  return userSockets;
};


// Initialise the socket.io library
// server:
exports.init = function(server) {

  const io = require('socket.io')(server)
  userSockets.io = io;

  log('Init sockets');

  // authorization middleware
  io.use(function(socket, next) {

    var handshakeData = socket.request;
    var token = handshakeData._query['token'];

    if (process.env.NODE_ENV == 'test') {
        socket.identities = [token] || [adminUser];
        next();
    }
    else if (token) {
        csgrant.verifyToken(token, function(err, decoded) {

        var unauthorizedAccess = function(error) {
          socket.emit('unauthorized', error, function() {
            socket.disconnect('unauthorized');
          });
        }

        // verify a token
        if (err) {
          console.error('Error: ' + err.message);

          var error = {"message": "unauthorized"};
          unauthorizedAccess(error);
          return;
        }

        log(util.inspect(decoded));

        if (!decoded.identities || decoded.identities.length == 0) {
          console.error('Invalid token. No identities provided');
          var error = {"message": "no identities provided"};
          unauthorizedAccess(error);

          // return an error
          return;
        }
        socket.identities = decoded.identities;

        next();
      });
    }

  });

  io.on('connection', function (socket) {
    // todo: add each identity to the socket, not just the first one
    var user = socket.identities[0]
    log(' socket connection: ' + user)
    userSockets.addSocket(user, socket)

    socket.on('disconnect', function() {
      log(' socket disconnected: ' + user);
      userSockets.removeSocket(user, socket);
    });
  })
  return io
}
