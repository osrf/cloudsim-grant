'use strict'

const model = require("./model")
const sockets = require('./sockets')
const EventEmitter = require('events')

// when false, log output is suppressed
exports.showLog = false

// log to console
// @s string to log
function log(s) {
  if (exports.showLog) {
    console.log('grant> ', s)
  }
}

// Event emitter for resource (create, update and delete)
class Emitter extends EventEmitter {}
const events = new Emitter()
exports.events = events

// This function fires a resource change event to interested parties.
// resource: the name of the resource
// operation: 'create', 'update' or 'delete'
// usersToNotify: a list of users to notify
//
// The event is called 'resource'
function emit(resource, operation, usersToNotify) {
  // gather users (identities) of this resource
  const users = usersToNotify?usersToNotify:[]
  if (resources[resource]) {
    for (let user in resources[resource].permissions) {
      users.push(user)
    }
  }
  // fire a 'resource' event
  events.emit('resource', resource, operation, users)
}

// the resources data structure
let resources = {}

// write the content of the db to the terminal
exports.dump = function (msg) {
  let s = JSON.stringify(resources, null, 3)
  const title = msg?msg:""
  console.log('\n\nCLOUSDSIM GRANT DUMP\n',
    title,
    '\n',
    '  DB:', model.listName,
    '\n',s,
    '\n-----\n')
}

// Initialization
// @adminUser: the initial username, owner of the first resources
// @resources: dictionary of resource names and initial data
// @databaseName: the Redis list that contains the data
// @databaseUrl: the ip of the Redis db
// @server: the httpServer used to initialize socket.io
// @cb: callback
function init(adminUser, resources, databaseName, databaseUrl, server, cb) {
  log('cloudsim-grant init')
  // set the name of the list where data is stored
  model.init(databaseName)
  model.setDatabaseUrl(databaseUrl)
  log('loading redis list "' + databaseName + '" at url: ' + databaseUrl)
  loadPermissions(adminUser, resources, () =>{
    log('cloudsim-grant db "' + databaseName  + '" loaded\n')
    sockets.init(server, events)
    cb()
  })
}

// read emissions from the database
function loadPermissions(adminUser, resources, cb) {
  // callback for db operations
  const callback = function(e, r) {
    if (e) {
      console.log('error loading permissions: ' + e)
      cb(e)
      return
    }
    log('cb ', r)
  }

  model.readDb((err, items)=>{
    if(err) {
      cb(err)
      return
    }
    log('data loaded, clearing db')
    // remove the data in the db
    model.clearDb()
    // if the datbase was empty, we need to populate it with the
    // initial resources. Otherwise, they are first in the list
    if (items.length == 0) {
      // make a list with resources
      for (var resourceName in resources) {
        const resourceData = resources[resourceName]
        // add each of the original resource
        setResource(adminUser, resourceName, resourceData, callback)
      }

    }
    // put the data back
    for (let i=0; i < items.length; i++) {
      const item = items[i]
      log(' [' + i + '/' + items.length + '] ' + JSON.stringify(item, null, 2))
      switch (item.operation) {
      case 'set': {
        log('set')
        setResource(item.data.owner,
                      item.data.resource,
                      item.data.data,
                      callback)
        break
      }
      case 'grant': {
        log('grant ')
        grantPermission(item.data.granter,
                          item.data.grantee,
                          item.data.resource,
                          item.data.readOnly,
                          callback)
        break
      }
      case 'revoke': {
        log('revoke')
        revokePermission(item.data.granter,
                           item.data.grantee,
                           item.data.resource,
                           item.data.readOnly,
                           callback)
        break
      }
      default: {
        cb('Unknown operation "' + item.operation + '"')
        return
      }
      }
    }
    cb(null)
  })
}

// create update delete a resource.
function setResourceSync(me, resource, data) {

  model.setResource(me, resource, data)
  if (!data) {
    const usersToNotify = []
    for (let user in resources[resource].permissions) {
      usersToNotify.push(user)
    }
    // data is null, signifying deletion
    delete resources[resource]
    // delete is a special case where users are collected before
    emit(resource, 'delete', usersToNotify)
  }
  // adding or updating
  else {

    if(resources[resource]) {
      // resource update
      resources[resource].data = data
      emit(resource, 'update')
    }
    else {
      // brand new resource
      const permissions = {}
      permissions[me] = {readOnly: false}
      resources[resource] = {
        data: data,
        permissions: permissions
      }
      emit(resource, 'create')
    }
  }
  return {error: null, result: resources[resource]}
}

// create update delete a resource.
function setResource(me, resource, data, cb) {
  const result = setResourceSync(me, resource, data)
  cb(result.error, result.result)
}

function createResource (me, resource, data, cb) {
  if(resources[resource]) {
    cb('"' + resource + '" already exists')
    return
  }
  setResource(me, resource, data, cb)
}

// function deleteResourceSync (me, resource) {
//   if (resources[resource]) {
//     return setResourceSync(me, resource, null)
//   }
//   return {error: 'resource "' + resource +  '" does not exist', result: null}
// }

function deleteResource (me, resource, cb) {
  if(resources[resource]) {
    setResource(me, resource, null, cb)
    return
  }
  cb('resource "' + resource +  '" does not exist')
}

function updateResource(me, resource, data, cb) {
  if(!resources[resource]) {
    cb('resource "' + resource +  '" does not exist')
    return
  }
  isAuthorized(me, resource, false, (err, authorized) => {
    if(err) {
      cb(err)
      return
    }
    if(!authorized) {
      cb('not authorized')
      return
    }
    else {
      resources[resource].data = data
      setResource(me, resource, data, cb)
    }
  })
}

function grantPermissionSync(me, user, resource, readOnly) {
  const p = JSON.stringify(resources, null, 2)
  log('Grant:', me, user, resource, '\n', p)

  if (!resources[resource])
  {
    return {error: null, success: false, message: 'Resource "' + resource +
        '" does not exist'}
  }

  let current = resources[resource].permissions[user]
  let message
  // If user already has some authorization
  if (current)
  {
    // Is already read only
    if ((readOnly == true) && (current.readOnly == true))
    {
      return {error: null, success: true, message: '"' + user +
         '" is already authorized for "read only" for "'
         + resource + '"'}
    }
    // Is already write
    if ((readOnly == false) && (current.readOnly == false))
    {
      return {error: null, success: true, message: '"' + user +
          '" is already authorized for "write" for "' + resource + '"'}
    }
    // Is write and we want to downgrade
    if ((readOnly == true) && (current.readOnly == false))
    {
      current.readOnly = true
      message = '"' + user + '" access for "'
         + resource + '" has been downgraded to "read only"'
    }
    // Is read only and we want to upgrade
    else if ((readOnly == false) && (current.readOnly == true))
    {
      current.readOnly = false
      message = '"' + user + '" access for "'
         + resource + '" has been upgraded to "write"'
    }
    else {
      return {error: 'something went wrong', success: false,
        message: 'unknown error'}
    }
  }
  else
  {
    // Grant brand new permission
    let x = {
      readOnly : readOnly,
      authority : me
    }
    resources[resource].permissions[user] = x

    const readOnlyTxt = readOnly? "read only" : "write"
    message = '"' + user + '" now has "' + readOnlyTxt +
      '" access for "' + resource + '"'
  }
  // write it to the db
  model.grant(me, user, resource, readOnly )
  // console.trace('GRANT moment', resource)
  emit(resource, 'grant')
  return {error: null, success: true, message: message}
}


function grantPermission(me, user, resource, readOnly, cb) {
  const result = grantPermissionSync(me, user, resource, readOnly)
  cb(result.error, result.success, result.message)
}

function revokePermissionSync (me, user, resource, readOnly) {
  const innerRevoke = function(me, user, resource, readOnly) {
    const current = resources[resource].permissions[user]
    // If user has no authorization
    if (!current)
    {
      const msg = '"' + user + '" has no authorization for "'
         + resource + '" so nothing changed.'
      return {error: null, success: true, message: msg}
    }
    else
    {
      let result
      // Is read only, revoking read only
      if ((readOnly == true) && (current.readOnly == true))
      {
        delete resources[resource].permissions[user]
        const msg = '"' + user
           + '" is no longer authorized for "read only" for "'
           + resource + '"'
        result = {error: null, success: true, message: msg}
      }
      // Is write, revoking write
      if ((readOnly == false) && (current.readOnly == false))
      {
        delete resources[resource].permissions[user]
        result = {error: null, success: true, message: '"' + user +
          '" is no longer authorized for "write" for "'
           + resource + '"'}
      }
      // Is write and we want to revoke read-only - not allowed
      if ((readOnly == true) && (current.readOnly == false))
      {
        result = {error: null, success: false, message: '"' + user +
            '" has "write" access for "' + resource +
            '", so "read only" can\'t be revoked.'}
      }
      // Is read-only and want to revoke write - remove it all
      if ((readOnly == false) && (current.readOnly == true))
      {
        delete resources[resource].permissions[user]
        result = {error: null, success: true, message: '"' + user +
            '" had "read only" access for "' + resource +
            '" and now has nothing'}
      }

      return result
    }
  }
  const result = innerRevoke(me, user, resource, readOnly)
  if (result.success)
    events.emit('resource', resource, 'revoke', [user])
  return result
}

function revokePermission (me, user, resource, readOnly, cb) {
  const result = revokePermissionSync(me, user, resource, readOnly)
  cb(result.error, result.success, result.message)
}

// this is the synchronous version of isAuthorized. It returns
// true if the user has access to the specified resource
function isAuthorizedSync(user, resourceName, readOnly) {

  if(!user)
    return false

  const resource = resources[resourceName]
  if (!resource) {
    return false
  }
  const permissions  = resource.permissions
  const current = permissions[user]
  if (!current) {
    return false
  }
  // not enough permission
  if(current.readOnly && readOnly == false) {
    return false
  }
  // user in the list, with enough permissions
  return true
}

// Check if a user already has a given permission for a resource
function isAuthorized(user, resource, readOnly, cb) {
  const r = isAuthorizedSync(user, resource, readOnly)
  cb(null, r)
}

/// user: the requester... his permissions will be first
/// returns nothing if user has no access
function copyAndFormatResourceForOutput(user, resourceName) {

  // check for permission (readOnly)
  if (!isAuthorizedSync(user, resourceName, true)) {
    return null
  }
  const dbInfo = resources[resourceName]
  const data = dbInfo.data
  const name = resourceName
  const permissionDict = dbInfo.permissions
  const requesterPermissions = dbInfo.permissions[user]
  // by convention, the first permission is the requester's
  const permissions = [{username: user, permissions: requesterPermissions}]
  for (let username in permissionDict) {
    const perms = permissionDict[username]
    if (user != username)
      permissions.push({username: username, permissions: perms})
  }
  const r =  {
    name: name,
    data: data,
    permissions: permissions,
  }
  // prevent modification of data by the caller
  const clone = JSON.parse(JSON.stringify(r))
  return clone
}

/// Get a single resource, including data and permissions
/// user The requester user.
function readResource(user, resourceName, cb) {
  const resource = resources[resourceName]
  if(!resource) {
    cb('"' + resourceName + '" does not exist')
    return
  }
  const data = copyAndFormatResourceForOutput(user, resourceName)
  if (!data) {
    cb("not authorized for resource")
    return
  }
  cb(null, data)
}

function readAllResourcesForUser(identities, cb) {
  const items =[]
  for (let res in resources) {
    if (resources.hasOwnProperty(res)) {
      for (let i = 0; i < identities.length; ++i) {
        const resource = copyAndFormatResourceForOutput(identities[i], res)
        if (resource) {
          items.push(resource)
          break
        }
      }
    }
  }
  cb(null, items)
}

// this returns a copy of the internal database.
// when resource is defined, it only gets the resource data
// and permission. When resource is null or undefined, the
// entire db is returned
function copyInternalDatabase(resource) {
  let data = resources
  if (resource) {
    data = resources[resource]
    if (!data) {
      return {}
    }
  }
  const res = JSON.parse(JSON.stringify(data))
  return res
}


// Remove user from database and revoke the user permissions on all relevant
// resources
function deleteUser(user, cb) {
  for (let res in resources) {
    if (resources.hasOwnProperty(res)) {
      if (!isAuthorizedSync(user, res, true)) {
        continue
      }

      // revoke permission on resource
      const result = revokePermissionSync(user, user, res,
          resources[res].permissions[user].readOnly)
      if (result.error) {
        cb(result.error)
        return
      }
    }
  }
  cb(null)
}

// database, setup
exports.init = init
exports.copyInternalDatabase = copyInternalDatabase

// crud (create update read delete)
exports.createResource = createResource
exports.readResource = readResource
exports.updateResource = updateResource
exports.deleteResource = deleteResource
exports.deleteUser = deleteUser

// util
exports.isAuthorized = isAuthorized
exports.readAllResourcesForUser = readAllResourcesForUser
exports.getNextResourceId = model.getNextResourceId
exports.grantPermission = grantPermission
exports.revokePermission = revokePermission

// inter module
exports.isAuthorizedSync = isAuthorizedSync

