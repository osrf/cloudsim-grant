'use strict'

// node modules
const EventEmitter = require('events')
// third party modules
const deasync = require("deasync")
// local modules
const model = require("./model")
const sockets = require('./sockets')


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

// this identity (a user or a group) has read/write access to every resource
let adminIdentity
// the resources data structure
let resources = {}


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

// write the content of the db to the terminal
exports.dump = function (msg) {
  let s = JSON.stringify(resources, null, 3)
  const title = msg?msg:""
  console.log('\n\nCLOUSDSIM GRANT DUMP\n',
    title,
    '\n',
    '  DB:', model.getDb(), '\n',
    '  admin identity:', adminIdentity,
    '\n',s,
    '\n-----\n')
}

// Initialization
// @adminId: this identity (user or group) that has read/write access to
// all resources in this database.
// @resources: dictionary of resource commands to create initial resources and
// permissions.
// @databaseName: the Redis list that contains the data
// @databaseUrl: the ip of the Redis db
// @server: the httpServer used to initialize socket.io
// @cb: callback
function init(adminId, actions, databaseName, databaseUrl, server, cb) {
  resources = {}
  adminIdentity = adminId
  // set the name of the list where data is stored
  model.init(databaseUrl, databaseName)
  log('loading redis list "' + databaseName + '" at url: ' + databaseUrl)
  loadPermissions(actions, (err) =>{
    if (err) {
      console.log('error while loading the permissions from the database')
      throw err
    }
    log('cloudsim-grant db "' + databaseName  + '" loaded\n')
    if (server) {
      sockets.init(server, events)
    }
    cb()
  })
}

// use the deasync module to turn an async call into a sync one
const getNextIdSync = deasync(model.getNextResourceId)

function processAction(action, params) {
  // returns the resource name
  const getName = function(action) {
    // does it have a name?
    if (action.resource)
      return action.resource
    // is it a parameter?
    let suffixValue
    if (action.suffix) {
      if (action.suffix.indexOf(':') == 0) {
        const paramName = action.suffix.substring(1, action.suffix.length)
        suffixValue = params[paramName]
      }
      return action.suffix
    }
    if (!action.prefix || action.prefix.length ==0) {
      const actStr = JSON.stringify(action)
      throw new Error("action has no resource or prefix: " + actStr)
    }
    // no suffix value yet, we find the next available index
    if (!suffixValue) {
      try {
        suffixValue = getNextIdSync(action.prefix)
        // we may need to save the value for later
        if (action.param) {
          params[action.param] = suffixValue
        }
      }
      catch(err) {
        return {"error": err}
      }
    }
    return action.prefix + '-' + suffixValue
  }

  if (action.action == 'CREATE_RESOURCE'){
    const name = getName(action)
    console.log('new resource:', action.creator, name, action.data)
    const r = setResourceSync(action.creator, action.resource, action.data)
    return r
  }
  if (action.action == 'DELETE_RESOURCE') {
    const r = setResourceSync(action.user, action.resource)
    return r
  }
  if (action.action == 'UPDATE_RESOURCE') {
    const r = setResourceSync(action.user, action.resource, action.data)
    return r
  }
  if (action.action == 'GRANT_PERMISSION') {
    const r = grantPermissionSync(action.granter,
                    action.grantee,
                    action.resource,
                    action.permissions.readOnly)
    return r
  }
  if (action.action == 'REVOKE_PERMISSION') {
    const r = revokePermissionSync(action.granter,
                     action.grantee,
                     action.resource,
                     action.permissions.readOnly)
    return r
  }
  throw new Error('unknown action type: "' + action.action +
    '" for action: "' +
    JSON.stringify(action) + '"')
}


function dispatchActions(actions) {
  const results = []
  // this accumulates parameters
  const params = {}
  for (let i in actions) {
    const action = actions[i]
    console.log('\n\n'+ i + '/' + actions.length + ': ' + JSON.stringify(action))
    const r = processAction(action, params)
console.log('Process result:', i + '/' + actions.length ,  r)
    results.push(r)
    exports.dump('after:' + i + ' result: ' + JSON.stringify(r))
  }
  console.log('dispatchActions done')
  return results
}

// read emissions from the database
function loadPermissions(actions, cb) {
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
    console.log('' + items.length +  ' actions loaded in "' + model.getDb() + '"')
    // remove the data in the db
    model.clearDb(true)
console.log('db cleared')
    // if the datbase was empty, we need to populate it with the
    // initial resources. Otherwise, they are first in the list
    if (items.length == 0) {
      console.log('Empty database, loading defaults:', actions)
      const results = dispatchActions(actions)
      console.log('loadPermissions', results)
      cb(null, results)
    }
  })
}


/*
    const results = []
    // put the data back
    for (let i=0; i < items.length; i++) {
      const item = items[i]
      log(' [' + i + '/' + items.length + '] ' + JSON.stringify(item, null, 2))
      switch (item.operation) {
      case 'set': {
        log('set')
        const r = setResourceSync(item.data.owner,
                      item.data.resource,
                      item.data.data)
        results.push(r)
        break
      }
      case 'grant': {
        log('grant ')
        const r = grantPermissionSync(item.data.granter,
                          item.data.grantee,
                          item.data.resource,
                          item.data.readOnly)
        results.push(r)
        break
      }
      case 'revoke': {
        log('revoke')
        const r = revokePermissionSync(item.data.granter,
                           item.data.grantee,
                           item.data.resource,
                           item.data.readOnly)
        results.push(r)
        break
      }
      default: {
        cb('Unknown operation "' + item.operation + '"')
        return
      }
      }
    }
    cb(null, results)
  })

*/



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
console.log('CREATED')
      emit(resource, 'create')
console.log('EMITED')
    }
  }
  return {error: null, result: resources[resource]}
}

// create update delete a resource.
function setResource(me, resource, data, cb) {
  const result = setResourceSync(me, resource, data)
  cb(result.error, result.result, resource)
}

// create a new resource with an existing name
function createResource (me, resource, data, cb) {
  if(resources[resource]) {
    cb( new Error('"' + resource + '" already exists'))
    return
  }
  setResource(me, resource, data, cb)
}

// create a new resource, using a type to generate a new name
// @me the username creating the resource
// @resourceType the resource prefix name (ex "simulator")
// the resulting resource will have a name that is type with a number
// (ex "simulator-00X")
// @data JSON data for the resource
// @callback function(err, data, resourceName)
function createResourceWithType(me, resourceType, data, cb) {
  model.getNextResourceId(resourceType, (err, resourceName) => {
    if(err) {
      cb(err)
      return
    }
    createResource(me, resourceName, data, cb)
  })
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

  if (user === adminIdentity)
  {
    return {error: null, success: true,
      message: 'Can\'t change existing read/write permissions for "' +
        user + '" (it a built-in admin identity)'}
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
    if (user === adminIdentity)
    {
      return {error: null, success: true,
        message: 'Can\'t change existing read/write permissions for "' +
        user + '" (it a built-in admin identity)'
      }
    }

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
// true if any of the user has access to the specified resource
// @identity: a username or a list of usernames
// @resourceName: the resourceName
// @readOnly: false for read/write access, true for read only access
function isAuthorizedSync(identity, resourceName, readOnly) {

  const users = Array.isArray(identity)?identity:[identity]
  for (let i in users) {
    const user = users[i]
    if(!user)
      return false
    // check that resource exists
    const resource = resources[resourceName]
    if (!resource) {
      return false
    }
    // admin identity has access to everything
    if (user === adminIdentity){
      return true
    }
    // check that user has permission
    const permissions  = resource.permissions
    const current = permissions[user]
    if (!current) {
      return false
    }
    // check for enough permission
    if(current.readOnly && readOnly == false) {
      return false
    }
    // user in the list, with enough permissions
    return true
  }
}

// Check if a user (or any user in a list of users) already has a given
// permission for a resource
// @user: a username or a list of usernames
// @resourceName: the resourceName
// @readOnly: false for read/write access, true for read only access
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
  // also, add the adminIdentiy (if its not already there)
  if (!permissionDict[adminIdentity]) {
    permissions.push({username: adminIdentity, permissions: {readOnly: false}})
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
exports.createResourceWithType = createResourceWithType
exports.getNextResourceId = model.getNextResourceId
exports.readResource = readResource
exports.updateResource = updateResource
exports.deleteResource = deleteResource
exports.deleteUser = deleteUser

// util
exports.isAuthorized = isAuthorized
exports.readAllResourcesForUser = readAllResourcesForUser
exports.grantPermission = grantPermission
exports.revokePermission = revokePermission

// inter module
exports.isAuthorizedSync = isAuthorizedSync

