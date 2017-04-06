'use strict';

const csgrant = require('./index')

const util = require('util');

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
    log('add socket: ', this.sockets.length , 'identities:', socket.identities)
  }

  // remove socket
  this._removeSocket = function (socket) {
    // is socket already in the list?
    const index = this.sockets.indexOf(socket)
    if (index > -1) {
      // remove
      log('remove socket: ', index)
      this.sockets.splice(index,1)
      return
    }
  }
  // Notifies a list of users, if they are in any socket
  this.notifyUsers = function (users, channel, data) {
    log('\nnotify users:', users, channel, data)
    log('  -# sockets:', this.sockets.length)
    for (let socket of this.sockets) {
      log('  -socket identities:', socket.identities)
      if (AnyOfUsersInIdentities(users, socket.identities)) {
        log('  --notifying', socket.identities)
        csgrant.verifyToken(socket.token, function(err) {
          if (err) {
            console.error('Error verifying token: ' + err )
            return
          }
          log('  --emit channel:', channel, 'data:', data)
          socket.emit(channel, data)
        })
      }
    }
    log('end notify\n')
  }

  // Notify everybody....
  this.notifyAll = function (channel, msg) {
    this.io.sockets.emit(channel, msg);
  }
}

// Initialise the socket.io library
// server:
exports.init = function(server, events) {
  if (!server) {
    log('No server available, socket connections will not be established')
    return
  }
  const io = require('socket.io')(server)
  userSockets.io = io
  log('Init sockets')
  // authorization middleware
  io.use(function(socket, next) {
    const handshakeData = socket.request
    const token = handshakeData._query['token']
    if(!token) {
      const error = 'missing token in the socket'
      console.log(error)
      socket.emit('unauthorized', error, function() {
        socket.disconnect('unauthorized')
        return
      })
    }
    socket.token = token
    csgrant.verifyToken(socket.token, function(err, decoded) {
      // function to call when unauthorized
      var unauthorizedAccess = function(error) {
        console.error('unauthorizedAccess:', error)
        socket.emit('unauthorized', error, function() {
          socket.disconnect('unauthorized');
        });
      }
      // verify the token
      let error
      if (err) {
        console.error('Error: ' + err.message);
        error = {"message": "unauthorized"};
        unauthorizedAccess(error);
        return;
      }
      log(util.inspect(decoded))
      if (!decoded.identities || decoded.identities.length == 0) {
        console.error('Invalid token. No identities provided')
        error = {"message": "no identities provided"}
        unauthorizedAccess(error)
        return
      }
      socket.identities = decoded.identities
      next()
    })
  })

  events.on('resource', function(resource, operation, users) {
    const data = {resource: resource, operation: operation}
    // notify the users on sockets with appropriate identities
    userSockets.notifyUsers(users, 'resource', data)
  })

  io.on('connection', function (socket) {
    log(' socket connection: ' + socket.identities[0])
    userSockets._addSocket(socket)

    socket.on('disconnect', function() {
      log(' socket disconnect: ' + socket.identities[0])
      userSockets._removeSocket(socket)
    })

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


