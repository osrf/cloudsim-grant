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

// Initialization
// @adminUser: the initial username, owner of the first resource
// @resources: dictionary of resource names and initial data
function init(adminUsername, resources, database, cb) {
  log('cloudsim-grant init')
  // set the name of the list where data is stored
  model.init(database)
  log('loading data in redis list "' + database + '"')
  loadPermissions(adminUsername, resources, () =>{
    log('cloudsim-grant db loaded\n')
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
      log('  ' + i + '] ' + JSON.stringify(item))
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


// documented here
function setResource(me, resource, data, cb) {
  model.setResource(me, resource, data)
  if (!data) {
    delete resources[resource]
  }
  else {
    resources[resource] = {data: data, permissions: [
      {username: me, readOnly: false}
    ]}
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

function getResource(me, resource, cb) {
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
    const resourceUsers = resources[resource].permissions
    if (!resourceUsers)
    {
      cb(null, false, 'Resource "' + resource + '" does not exist')
      return
    }

    let current = resourceUsers.find ((userInfo) => {
      return userInfo.username == user
    })
    // If user already has some authorization
    if (current)
    {
      // Is already read only
      if ((readOnly == true) && (current.readOnly == true))
      {
        cb(null, true, '"' + user + '" is already authorized for "read only" for "'
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
      let x = { username : user,
                readOnly : readOnly,
                authority : me
              }
      resources[resource].permissions.push(x)
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

    const resourceUsers = resources[resource].permissions
    if (!resourceUsers)
    {
      cb(null, false, 'Resource "' + resource + '" does not exist')
      return
    }

    let current = resourceUsers.find ((userInfo) => {
      return userInfo.username == user
    })
    // If user has no authorization
    if (!current)
    {
      cb(null, true, '"' + user + '" has no authorization for "' + resource + '" so nothing changed.')
      return
    }
    else
    {
      // Is read only, revoking read only
      if ((readOnly == true) && (current.readOnly == true))
      {
        resourceUsers.splice(resourceUsers.indexOf(current), 1)
        cb(null, true, '"' + user + '" is no longer authorized for "read only" for "'
           + resource + '"')
        return
      }
      // Is write, revoking write
      if ((readOnly == false) && (current.readOnly == false))
      {
        resourceUsers.splice(resourceUsers.indexOf(current), 1)
        cb(null, true, '"' + user + '" is no longer authorized for "write" for "'
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
        resourceUsers.splice(resourceUsers.indexOf(current), 1)
        cb(null, true, '"' + user + '" had "read only" access for "'
           + resource + '" and now has nothing')
        return
      }

      cb("Bad bad widget, something went wrong")
      return;
    }

  })
}


function isAuthorizedSync(user, resourceName, readOnly) {

  const resource = resources[resourceName]
  if (!resource) {
    return false
  }

  const permissions  = resource.permissions
  const current = permissions.find ((userInfo) => {
      return userInfo.username == user
  })
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
  const token = req.query.granterToken
  const grantee  = req.query.grantee
  const resource = req.query.resource
  const readOnly = JSON.parse(req.query.readOnly)

  jstoken.verifyToken (token, (err, decoded) => {
    if(err) {
      const response = {success:false, msg: err.message }
      res.jsonp(response)
      return
    }
    log('decoded token: ' + JSON.stringify(decoded))
    const granter = decoded.username
    grantPermission(granter,
      grantee, resource, readOnly, (err, success, message)=>{
      let msg = message
      if (err) {
        success = false
        msg =  err
      }
      const r ={   operation: 'grant',
                    granter: granter,
                    grantee: grantee,
                    resource: resource,
                    readOnly: readOnly,
                    success: success,
                    msg: msg
                 }
      res.jsonp(r)
    })
  })
}

// route for revoke
function revoke(req, res) {
  const token = req.query.granterToken
  const grantee  = req.query.grantee
  const resource = req.query.resource
  const readOnly = JSON.parse(req.query.readOnly)

  jstoken.verifyToken (token, (err, decoded) => {
    if(err) {
      res.jsonp({success:false, msg: err.message })
      return
    }

    const granter = decoded.username
    revokePermission(granter,
        grantee, resource, readOnly, (err, success, message)=>{
      let msg = message
      if (err) {
        msg = err
      }
      const r ={   operation: 'revoke',
                  granter: granter,
                  grantee: grantee,
                  resource: resource,
                  readOnly: readOnly,
                  success: success,
                  msg: msg
               }
      res.jsonp(r)
    })
  })
}

function readAllResourcesForUser(userToken, cb) {
  jstoken.verifyToken(userToken, (err, decoded) => {
    if(err) {
      cb(err)
      return
    }
    const user = decoded.username
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
  })
}

let flip = false

// this is middleware. It sets req.user if authentication is succesful
//
function authenticate(req, res, next) {
  flip = !flip
  const token = req.headers.authorization
  if (flip)
    res.status(401).jsonp('{error:"User is not found"}')
  else next()
}

exports.init = init
exports.grant = grant
exports.revoke = revoke
exports.authenticate = authenticate

// crud
exports.createResource = createResource
exports.readResource = getResource
exports.updateResource = updateResource
exports.deleteResource = deleteResource
exports.readAllResourcesForUser = readAllResourcesForUser
exports.getNextResourceId = model.getNextResourceId
exports.grantPermission = grantPermission
exports.revokePermission = revokePermission


// the auth server signs tokens
exports.signToken = jstoken.signToken
exports.verifyToken = jstoken.verifyToken
