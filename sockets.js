'use strict';

const csgrant = require('../index')

var util = require('util');
var adminUser = 'admin';
if (process.env.CLOUDSIM_ADMIN)
  adminUser = process.env.CLOUDSIM_ADMIN;

exports.showLog = false
const log = exports.showLog? console.log: ()=>{}

// returns true if any of users is in identities
function AnyOfUsersInIdentities(users, identities){
  var intersection = identities.filter(function(n) {
    // true if users has this identity
    return users.indexOf(n) > -1
  })
  // if this array is not empty, we have at least
  // one of the users in the identities list
  return intersection.length > 0
}

// Fast lookup of sockets per user.
function SocketDict() {
  // keep a list of active sockets
  this.sockets = []
  // a reference to the socket.io library
  this.io = null;

  // add new socket
  this._addSocket = function (socket) {
    // is socket already in the list?
    const index = this.sockets.indexOf(socket)
    if (index > -1)
      return
    // new socket
    this.sockets.push(socket)
    log('add socket: ' + socket + ', identities: ' + socket.identities);
  }

  // remove socket
  this._removeSocket = function (socket) {
    // is socket already in the list?
    const index = this.sockets.indexOf(socket)
    if (index > -1) {
      // remove
      array.splice(index,1)
      return
    }
  }

  // Notifies a list of users, if they are in any socket
  this.notifyUsers = function (users, channel, data) {
    log('notify users ' + users)
    for (let socket of this.sockets) {
      // verify token again (as it may have expired)
      csgrant.verifyToken(socket.token, function(err, decoded) {
        if (err) {
          console.log('Error verifying token: ' + err )
          return
        }
        // token is good. Any users in its identities?
        if (AnyOfUsersInIdentities(users, decode.identities))
          s.emit(channel, data)
      }
    }
  }

  // Notify everybody....
  this.notifyAll = function (channel, msg) {
    this.io.sockets.emit(channel, msg);
  }
}

// Initialise the socket.io library
// server:
exports.init = function(server, events) {
  const io = require('socket.io')(server)
  userSockets.io = io
  log('Init sockets')
  // authorization middleware
  io.use(function(socket, next) {
    var handshakeData = socket.request
    var token = handshakeData._query['token']
    (if !token) {
      const error = 'missing token in the socket'
      console.log(error, socket)
      socket.emit('unauthorized', error, function() {
      socket.disconnect('unauthorized')
      return
    }
    csgrant.verifyToken(token, function(err, decoded) {
      // function to call when unauthorized
      var unauthorizedAccess = function(error) {
        socket.emit('unauthorized', error, function() {
          socket.disconnect('unauthorized');
        });
      }
      // verify the token
      if (err) {
        console.error('Error: ' + err.message);
        var error = {"message": "unauthorized"};
        unauthorizedAccess(error);
        return;
      }
      log(util.inspect(decoded))
      if (!decoded.identities || decoded.identities.length == 0) {
        console.error('Invalid token. No identities provided')
        var error = {"message": "no identities provided"}
        unauthorizedAccess(error)
        // return an error
        return
      }
      socket.identities = decoded.identities
      next()
    })
  })

  io.on('connection', function (socket) {
    log(' socket connection: ' + socket.identities[0])
    userSockets._addSocket(socket)

    socket.on('disconnect', function() {
      log(' socket disconnect: ' + socket.identities[0])
      userSockets._removeSocket(socket)
    })

    events.on('resource', function(resource, operation, users) {
      const user = users[0]
      const data = {resource: resource, operation: operation}
      // notify the users on sockets with appropriate identities
      userSockets.notifyUsers(users, 'resource', data)
    }

  })
  // allow others to send/receive messages
  return io
}

// global variable for list of sockets
const userSockets = new SocketDict()

// global function to access sockets
exports.getUserSockets = function () {
  return userSockets
}


