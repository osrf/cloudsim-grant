'use strict'

const util = require("util")
const jstoken = require("./token")
const model = require("./model")

let resources = {}
let pubkey = ''
let authServerIp = ''


// Initialization
// ip: the authentication ip to verify that users exist
// key: the public authentication server key, to verify tokens
function init(key, ip) {
  authServerIp = ip
  pubkey = key

  loadPermissions( () =>{
    console.log('read all permissions')
  })
}

function loadPermissions(cb) {

  const callback = console.log

  model.readDb((err, items)=>{
    if(err) {
      cb(err)
      return
    }
    // remove the data in the db
    model.clearDb()
    // put the data back
    for (let i=0; i < items.length; i++) {
      const item = items[i]
      console.log(JSON.stringify(item))
      switch (item.operation) {
        case 'set': {
          console.log('set')
          setResource(item.data.owner,
                      item.data.data,
                      console.log)
        }
        break
        case 'grant': {
          console.log('grant ')
          grantPermission(item.data.granter,
                          item.data.grantee,
                          item.data.resource,
                          item.data.readOnly,
                          callback)
        }
        break
        case 'revoke': {
          console.log('revoke')
          revokePermission(item.data.granter,
                           item.data.grantee,
                           item.data.resource,
                           item.data.readOnly,
                           callback)
        }
        default: {
          cb('Unknown operation "' + item.operation +'"')
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
  cb(null)
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
      cb(null)
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
  model.grant(me, user, resource, readOnly )
  // Am I authorized to grant this permission
  isAuthorized(me, resource, readOnly, (err, authorized) =>  {
    // Error getting my authorization
    if (err) {
      console.log('grantPermission: Error getting my authorization')
      cb(err)
      return
    }
    // I'm not authorized to give this permission
    if (!authorized) {
      const msg = '"' + me + '" has insufficient priviledges to manage "'
                     + user + '" access for "' + resource + '"'
      // console.log('grantPermission error: ' + msg')
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
      var readOnlyTxt = readOnly? "read only" : "write"
      cb(null, true, '"' + user + '" now has "' + readOnlyTxt + '" access for "' + resource +'"')
      return
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

// Check if a user already has a given permission for a resource
function isAuthorized(user, resource, readOnly, cb) {
  getResourceUsers(resource, function (err, users) {
    // Error getting users for this resource
    if (err) {
      cb(err)
      return
    }

    // Get user's current permission for this resource
    const current = users.find ((userInfo) => {
        return userInfo.username == user
    })

    // User not authorized for this resource yet
    if (!current) {
      cb(null, false)
      return
    }

    // Currently read only, so not write authorized
    if(current.readonly && readOnly == false) {
      // not authorized
      cb(null, false)
      return
    }
    // the user has access
    cb(null, true)
  })
}

// Returns all users for the given resource
// resource: resource to check
// cb: callback with params:
// - error
// - list of users
function getResourceUsers (resourceName, cb) {
  let resource = resources[resourceName]

  let users = []
  if(resource) {
    users = resource.permissions
    if (!users) {
      cb('resource has no permissions')
      return
    }
  }
  cb(null, users)
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
    const granter = decoded.username
    grantPermission(granter, grantee, resource, readOnly, (err, success, message)=>{
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
    revokePermission(granter, grantee, resource, readOnly, (err, success, message)=>{
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


exports.init = init
exports.grant = grant
exports.revoke = revoke
exports.isAuthorized = isAuthorized

// crud
exports.createResource = createResource
exports.readResource = getResource
exports.updateResource = updateResource
exports.deleteResource = deleteResource

//exports.signToken = jstoken.signToken
//exports.verifyToken = jstoken.verifyToken

