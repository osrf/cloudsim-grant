'use strict'

const util = require("util")
const jstoken = require("./token")
const model = require("./model")

// when true, log output is suppressed
const noLog = true

// log to console
// @s string to log
function log(s) {
  if (!noLog) {
    console.log('grant> ', s)
  }
}

// the resources data structure
let resources = {}

exports.dump = function () {
  let s = JSON.stringify(resources, null, 3)
  console.log('\n\nCLOUSDSIM GRANT DUMP\n',s,'\n-----\n')
}

// Initialization
// @adminUser: the initial username, owner of the first resource
// @resources: dictionary of resource names and initial data
function init(adminUsername, resources, database, cb) {
  log('cloudsim-grant init')
  // set the name of the list where data is stored
  model.init(database)
  log('loading data in redis list "' + database + '"')
  loadPermissions(adminUsername, resources, () =>{
    log('cloudsim-grant db "' + database  + '" loaded\n')
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
      log('  ' + i + '/' + items.length  +  ' ] ' + JSON.stringify(item))
      switch (item.operation) {
        case 'set': {
          log('set')
          setResource(item.data.owner,
                      item.data.resource,
                      item.data.data,
                      callback)
        }
        break
        case 'grant': {
          log('grant ')
          grantPermission(item.data.granter,
                          item.data.grantee,
                          item.data.resource,
                          item.data.readOnly,
                          callback)
        }
        break
        case 'revoke': {
          log('revoke')
          revokePermission(item.data.granter,
                           item.data.grantee,
                           item.data.resource,
                           item.data.readOnly,
                           callback)
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
//
function setResource(me, resource, data, cb) {
  model.setResource(me, resource, data)
  if (!data) {
    // data is null, signifying deletion
    delete resources[resource]
  }
  // adding or updating
  else {

    if(resources[resource]) {
      // resource update
      resources[resource].data = data
    }
    else {
      // brand new resource
      const permissions = {}
      permissions[me] = {readOnly: false}
      resources[resource] = {
        data: data,
        permissions: permissions
      }
    }
  }
  cb(null, resources[resource])
}


function createResource (me, resource, data, cb) {
  if(resources[resource]) {
    cb('"' + resource + '" already exists')
    return
  }
  setResource(me, resource, data, cb)
}

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

function readResource(me, resource, cb) {
  if(!resources[resource]) {
    cb('"' + resource + '" does not exist')
    return
  }
  isAuthorized(me, resource, true, (err, authorized) => {
    if(authorized) {
      // deep copy of the resource
      const res = JSON.parse(JSON.stringify(resources[resource]))
      cb(null, res)
      return
    }
    else {
      cb("not authorized")
      return
    }
  })
}

function grantPermission(me, user, resource, readOnly, cb) {

  const p = JSON.stringify(resources, null, 2)
  log('\n\nGrant:', me, user, resource, '\n', p)

  // Am I authorized to grant this permission
  isAuthorized(me, resource, readOnly, (err, authorized) =>  {
    // Error getting my authorization
    if (err) {
      log('grantPermission: Error getting my authorization')
      cb(err)
      return
    }
    // I'm not authorized to give this permission
    if (!authorized) {
      const msg = '"' + me + '" has insufficient priviledges to manage "'
                     + user + '" access for "' + resource + '"'
      // log('grantPermission error: ' + msg')
      cb(null, false, msg)
      return
    }
    if (!resources[resource])
    {
      cb(null, false, 'Resource "' + resource + '" does not exist')
      return
    }

    let current = resources[resource].permissions[user]

    // If user already has some authorization
    if (current)
    {
      // Is already read only
      if ((readOnly == true) && (current.readOnly == true))
      {
        cb(null, true, '"' + user +
           '" is already authorized for "read only" for "'
           + resource + '"')
        return
      }
      // Is already write
      if ((readOnly == false) && (current.readOnly == false))
      {
        cb(null, true, '"' + user + '" is already authorized for "write" for "'
           + resource + '"')
        return
      }
      // Is write and we want to downgrade
      if ((readOnly == true) && (current.readOnly == false))
      {
        current.readOnly = true
        cb(null, true, '"' + user + '" access for "'
           + resource + '" has been downgraded to "read only"')
        return
      }
      // Is read only and we want to upgrade
      if ((readOnly == false) && (current.readOnly == true))
      {
        current.readOnly = false
        cb(null, true, '"' + user + '" access for "'
           + resource + '" has been upgraded to "write"')
        return
      }

      cb("Something went wrong")
      return;
    }
    else
    {
      // Grant brand new permission
      let x = { readOnly : readOnly,
                authority : me
              }
      resources[resource].permissions[user] = x

      const readOnlyTxt = readOnly? "read only" : "write"
      const msg = '"' + user + '" now has "' + readOnlyTxt +
        '" access for "' + resource + '"'
      // write it to the db
      model.grant(me, user, resource, readOnly )
      cb(null, true, msg)
    }
  })
}

function revokePermission (me, user, resource, readOnly, cb) {
  model.revoke(me, user, resource, readOnly)

  // Am I authorized to revoke this permission
  isAuthorized(me, resource, readOnly, (err, authorized) =>  {

    // Error getting my authorization
    if (err) {
      cb(err)
      return
    }

    // I'm not authorized to give this permission
    if (!authorized) {
      cb(null, false, '"' + me + '" has insufficient priviledges to manage "'
                     + user + '" access for "' + resource + '"')
      return
    }
    const current = resources[resource].permissions[user]
    // If user has no authorization
    if (!current)
    {
      const msg = '"' + user + '" has no authorization for "'
         + resource + '" so nothing changed.'
      cb(null, true, msg)
      return
    }
    else
    {
      // Is read only, revoking read only
      if ((readOnly == true) && (current.readOnly == true))
      {
        delete resources[resource].permissions[user]
        let msg = '"' + user
           + '" is no longer authorized for "read only" for "'
           + resource + '"'
        cb(null, true, msg)
        return
      }
      // Is write, revoking write
      if ((readOnly == false) && (current.readOnly == false))
      {
        delete resources[resource].permissions[user]
        cb(null, true, '"' + user +
          '" is no longer authorized for "write" for "'
           + resource + '"')
        return
      }
      // Is write and we want to revoke read-only - not allowed
      if ((readOnly == true) && (current.readOnly == false))
      {
        cb(null, false, '"' + user + '" has "write" access for "'
           + resource + '", so "read only" can\'t be revoked.')
        return
      }
      // Is read-only and want to revoke write - remove it all
      if ((readOnly == false) && (current.readOnly == true))
      {
        delete resources[resource].permissions[user]
        cb(null, true, '"' + user + '" had "read only" access for "'
           + resource + '" and now has nothing')
        return
      }

      cb("something went wrong")
      return;
    }

  })
}

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

// route for grant
function grant(req, res) {
  const requester = req.user
  // where is the data? depends on the Method
  const data = req.method === "GET"?req.query:req.body
  const grantee  = data.grantee
  const resource = data.resource
  const readOnly = JSON.parse(data.readOnly)
  grantPermission(requester,
    grantee, resource, readOnly, (err, success, message)=>{
    let msg = message
    if (err) {
      success = false
      msg =  err
    }
    const r ={ operation: 'grant',
               requester: requester,
               grantee: grantee,
               resource: resource,
               readOnly: readOnly,
               success: success,
               msg: msg }
    res.jsonp(r)
  })
}

// route for revoke
function revoke(req, res) {
  const data = req.method === "GET"?req.query:req.body
  const requester = req.user
  const grantee  = data.grantee
  const resource = data.resource
  const readOnly = JSON.parse(data.readOnly)

  if (!requester) {
    res.jsonp({success:false, msg: 'user is not authenticated' })
    return
  }

  revokePermission(requester,
                   grantee,
                   resource,
                   readOnly, (err, success, message)=>{
    let msg = message
    if (err) {
      success = false
      msg = err
    }
    const r ={  operation: 'revoke',
                requester: requester,
                grantee: grantee,
                resource: resource,
                readOnly: readOnly,
                success: success,
                msg: msg
             }
    res.jsonp(r)
  })
}

function readAllResourcesForUser(user, cb) {
  const items =[]
  for (let res in resources) {
    if (resources.hasOwnProperty(res)) {
      // check for permission (readOnly)
      if (isAuthorizedSync(user, res, true)) {
        const data = JSON.parse(JSON.stringify(resources[res]))
        // add the name in each result
        data.id = res
        // this resource is available
        log('\n', JSON.stringify(data,null,2))
        items.push(data)
      }
    }
  }
  cb(null, items)
}

// this is middleware:
//  - It decodes the token (sets req.decoded)
//  - It sets req.user
// if authentication is succesful, it calls the next middleware
function authenticate(req, res, next) {
  // debug authentication issues:
  // console.log('authenticate headers:', req.headers)
  // get token
  const token = req.headers.authorization
  if (!token) {
    res.status(401).jsonp('{"error":"No identity token provided"}')
    // res.jsonp({success: false, error: "missing token"})
    return
  }
  // decrypt and verify token
  jstoken.verifyToken(token, (err, decoded) => {
    if(err) {
      res.jsonp({success:false, error: "invalid token: " + err})
      return
    }
    if(!decoded.username) {
      res.jsonp({"success":false, "error":"token must contain username"})
      return
    }
    // success.
    req.user = decoded.username
    req.decoded = decoded
    // debug: user has been authenticated
    // console.log('authenticated user ' + req.user)
    log(req.user,'authenticated')
    next()
  })
}

// This function returns a middleware function that checks wether a
// user has access to a resource.
//  - resourceName is the name of the resource
//  - readOnly specifies the access
function ownsResource(resource, readOnly) {

  return function(req, res, next) {
    log('ownsResource', resource, 'readOnly', readOnly)
    let resourceName = resource
    // check if the resource name is a route param
    // see express route params
    if (resourceName.startsWith(':')) {
      const param = resourceName.substr(1)
      // we are counting on a previous param middleware
      // to have put the value in the req for us
      resourceName = req[param]
    }
    // assume user is set in authenticate
    const user = req.user
    // check user authorization to resource
    isAuthorized(user, resourceName, readOnly,
                          (err, authorized) => {
      if(err) {
        return res.jsonp(error(err))
      }
      if(!authorized){
        const msg = 'insufficient permission for user "' + user + '"'
            + ' to access resource "' + resourceName + '"'
        log(msg)
        return res.status(401).jsonp({
           "success": false,
           "error": msg
        })
      }
      log('Authorized resource: ' + resourceName )
      req.resourceName = resourceName
      next()
    })
  }
}

// route that returns all relevant resources for a user
// assumes that req.user is set (authenticate middleware)
function allResources(req, res) {
  readAllResourcesForUser(req.user, (err, items) => {
    const r = {success: false,
               operation: 'get all resource',
               requester: req.user}
    if(err) {
      r.error = err
    }
    else {
      r.success = true
      r.result = items
    }
    res.jsonp(r)
  })
}

// route to get a single resource with data and permissions
// assumes that req.user and req.resourceName
function resource(req, res) {
  const resourceName = req.resourceName
  const user = req.user
  readResource(user, resourceName, (err, data) => {
    const r = {success: false,
               operation: 'get resource',
               requester: req.user}
    if(err) {
      r.error = err
    }
    else {
      r.success = true
      r.resource = resourceName
      r.result = data
    }
    res.jsonp(r)
  })
}

// database setup
exports.init = init

// routes
exports.grant = grant
exports.revoke = revoke
exports.allResources = allResources
exports.resource = resource

// middleware
exports.authenticate = authenticate
exports.ownsResource = ownsResource

// crud (create update read delete)
exports.createResource = createResource
exports.readResource = readResource
exports.updateResource = updateResource
exports.deleteResource = deleteResource

// util
exports.isAuthorized = isAuthorized
exports.readAllResourcesForUser = readAllResourcesForUser
exports.getNextResourceId = model.getNextResourceId
exports.grantPermission = grantPermission
exports.revokePermission = revokePermission

exports.signToken = jstoken.signToken
exports.verifyToken = jstoken.verifyToken

// republish submodules (maily for testing)
exports.token = jstoken
exports.model = model

