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
  if (resources.hasOwnProperty(resource)) {
    let perm = resources[resource].permissions
    for (let user in perm) {
      users.push(user)
    }
  }
  // fire a 'resource' event
  events.emit('resource', resource, operation, users)
}

// the resources data structure
let resources = {}

let dbStateSaveInterval = 1000
// determines how often the state is saved to the database
// i.e. the number of db operations / logs between saves.
exports.setDbStateSaveInterval = function(value) {
  dbStateSaveInterval = value
}


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

// Clear cache in memory without wiping data from database server
function clearCache() {
  resources = {}
}

// Initialization
// @resources: dictionary of resource names and initial data
// @databaseName: the Redis list that contains the data
// @databaseUrl: the ip of the Redis db
// @server: the httpServer used to initialize socket.io
// @cb: callback
function init(initialResources, databaseName, databaseUrl, server, cb) {
  log('cloudsim-grant init')
  // set the name of the list where data is stored
  model.init(databaseName)
  model.setDatabaseUrl(databaseUrl)
  log('loading redis list "' + databaseName + '" at url: ' + databaseUrl)
  loadPermissions(initialResources, () =>{
    sockets.init(server, events)
    console.log('cloudsim-grant db "' + databaseName  + '" loaded\n')
    cb()
  })
}

// read pemission from the database.
function loadPermissions(initialResources, cb) {
  let t = new Date()

  const callback = function() {
    // make sure initial resources and permissions are set
    setupInitialResources(initialResources)
    return cb()
  }

  model.loadData('state', (err, data) => {
    if (err) {
      return cb(err)
    }
    if (!data) {
      loadPermissionLogs((err) => {
        if (err) {
          return cb(err)
        }

        t = new Date()
        model.saveData('state', resources, (err) => {
          if (err) {
            return cb(err)
          }
          console.log('State saved. Time taken: ' + (new Date() - t))
          return callback()
        })
      })
    }
    else {
      console.log('State loaded. Time taken: ' + (new Date() - t))
      // set resources from state data
      resources = data

      // check for if there are any operations that are not saved in state
      // res is the number of operations performed post saved state
      model.loadData('state-backlog', (err, res) => {
        if (err) {
          return cb(err)
        }
        if (res && typeof (res == 'number') && res != 0) {
          let offset = res*-1
          model.readDbRange(offset, -1, (err, items) => {
            if (err) {
              return cb(err)
            }
            if (items && items.length > 0) {
              reconstructResources(items, callback)
            }
          })
        }
        else {
          callback()
        }
      })
    }
  })
}

// read operation logs the database and reconstruct a cache of resources
// @initialResources: Resources to be saved if the database is empty
// @cb:  function(err)
function loadPermissionLogs(cb) {
  let t = new Date()
  model.readDb((err, items)=>{
    if(err) {
      return cb(err)
    }
    log('data loaded')
    console.log('Data loaded from db. Time taken: ' + (new Date() - t) + 'ms')

    t = new Date()
    // if the datbase was not empty, reconstruct the resources
    if (items.length > 0) {
      reconstructResources(items, cb)
    }
    else
      cb(null)
  })
}

// Check if initial resources are in the database. If not, add them
function setupInitialResources(initialResources) {

  const callback = function(e, r) {
    if (e) {
      console.log('error loading permissions: ' + e)
      return cb(e)
    }
    log('cb ', r)
  }

  for (let i in initialResources) {
    const resource = initialResources[i]

    // skip resource if already exists
    // TODO verify resource data and permissions?
    if (resources.hasOwnProperty(resource))
      continue

    const resourceName = resource.name
    const data = resource.data
    const permissions = resource.permissions
    // we need to split users into a creator and grantees
    let creator
    // find first user that has non readonly pemission and promote him/her
    // to the creator
    const first = permissions.filter( e => {
      return e.permissions.readOnly == false
    })[0]
    if (!first) {
      throw new Error("Resource '" + resourceName +
          "' has no read/write user!")
    }
    else {
      creator = first.username
      // create the resource now
      setResource(creator, resourceName, data, callback)
    }
    // the resource has been created... now let's share it with the others
    for (let j in permissions) {
      const permission = permissions[j]
      const grantee = permission.username
      if (creator === grantee)
        continue  // skip the creator
      const readOnly = permission.permissions.readOnly
      // grant accesss to this resource for our grantee
      grantPermission(creator, grantee, resourceName, readOnly, callback)
    }
  }
}

function reconstructResources(items, cb) {
  // callback for db operations
  const callback = function(e, r) {
    if (e) {
      console.log('error reconstructing resources: ' + e)
      return cb(e)
    }
    log('cb ', r)
  }

  let t = new Date()
  // put the data back
  for (let i=0; i < items.length; i++) {
    const item = items[i]
    // calling stringify repeatedly is computationally expensive
    // so commented out for now
    // log(' [' + i + '/' + items.length + '] ' + JSON.stringify(item, null, 2))
    switch (item.operation) {
    case 'set': {
      log('set')
      setResourceLocal(item.data.owner,
                    item.data.resource,
                    item.data.data,
                    callback)
      break
    }
    case 'grant': {
      log('grant ')
      grantPermissionLocal(item.data.granter,
                        item.data.grantee,
                        item.data.resource,
                        item.data.readOnly,
                        callback)
      break
    }
    case 'revoke': {
      log('revoke')
      revokePermissionLocal(item.data.granter,
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
  console.log('Reconstructed cache. Time taken: ' + (new Date() - t) + 'ms')
  cb(null)
}

// keep track of db operations and save the state
// when the backlog is full
function logDbWrite() {
  model.incrData('state-backlog', (err, value) => {
    if (value % dbStateSaveInterval === 0) {
      model.saveData('state', resources, (err) => {
        if (err) {
          console.log('Error saving state')
          return
        }
        model.saveData('state-backlog', 0, (err) => {
          if (err) {
            console.log('Error incr state-backlog')
            return
          }
        })
      })
    }
  })
}

// create update delete a resource.
// @me: user performing the operation
// @resource: resource name
// @data: resource data
// @local: if set to true, the operation will performed only on
// the resources in cache and not written back to database
function setResourceSync(me, resource, data, local) {

  if (!local) {
    model.setResource(me, resource, data)
    logDbWrite()
  }
  if (!data) {
    // NOTE: the same operation for gathering user data
    // is done in the emit function so commented out for now
    // const usersToNotify = []
    // for (let user in resources[resource].permissions) {
    //   usersToNotify.push(user)
    // }
    // // data is null, signifying deletion
    // delete resources[resource]
    // // delete is a special case where users are collected before
    // emit(resource, 'delete', usersToNotify)

    if (resources.hasOwnProperty(resource)) {
      delete resources[resource]
      emit(resource, 'delete')
    }
  }
  // adding or updating
  else {
    if(resources.hasOwnProperty(resource)) {
      // resource update
      let res = resources[resource];
      if (res) {
        res.data = data
        emit(resource, 'update')
      }
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
  cb(result.error, result.result, resource)
}

// create update delete a resource without writing to db.
function setResourceLocal(me, resource, data, cb) {
  const result = setResourceSync(me, resource, data, true)
  cb(result.error, result.result, resource)
}

// create a new resource with an existing name
function createResource (me, resource, data, cb) {
  if(resources[resource]) {
    cb('"' + resource + '" already exists')
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

// Grant permission on a resource
// @me: grantor
// @user: grantee
// @resource: resource name
// @readOnly: True to grant readOnly permission, otherwise write
// @local: if set to true, the operation will performed only on
// the resources in cache and not written back to database
function grantPermissionSync(me, user, resource, readOnly, local) {
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
  if (!local) {
    model.grant(me, user, resource, readOnly )
    logDbWrite()
  }
  // console.trace('GRANT moment', resource)
  emit(resource, 'grant')
  return {error: null, success: true, message: message}
}


function grantPermission(me, user, resource, readOnly, cb) {
  const result = grantPermissionSync(me, user, resource, readOnly)
  cb(result.error, result.success, result.message)
}

function grantPermissionLocal(me, user, resource, readOnly, cb) {
  const result = grantPermissionSync(me, user, resource, readOnly, true)
  cb(result.error, result.success, result.message)
}

// Revoke permission on a resource
// @me: grantor
// @user: grantee
// @resource: resource name
// @readOnly: True to revoke readOnly permission, otherwise write
// @local: if set to true, the operation will performed only on
// the resources in cache and not written back to database
function revokePermissionSync (me, user, resource, readOnly, local) {
  const innerRevoke = function(me, user, resource, readOnly, local) {
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

      // write it to the db
      if (!local) {
        model.revoke(me, user, resource, readOnly )
        logDbWrite()
      }

      return result
    }
  }
  const result = innerRevoke(me, user, resource, readOnly, local)
  if (result.success)
    events.emit('resource', resource, 'revoke', [user])
  return result
}

function revokePermission (me, user, resource, readOnly, cb) {
  const result = revokePermissionSync(me, user, resource, readOnly)
  cb(result.error, result.success, result.message)
}

function revokePermissionLocal(me, user, resource, readOnly, cb) {
  const result = revokePermissionSync(me, user, resource, readOnly, true)
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
exports.clearCache = clearCache

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
