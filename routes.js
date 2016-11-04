'use strict'

const grant = require('./grant')
const jstoken = require('./token')

// when false, log output is suppressed
exports.showLog = false

// log to console
// @s string to log
function log(s) {
  if (exports.showLog) {
    console.log('grant (routes)> ', s)
  }
}


// route for grant
exports.grant = function(req, res) {
  const requester = req.user
  // where is the data? depends on the Method
  const data = req.method === "GET"?req.query:req.body
  const grantee  = data.grantee
  const resource = data.resource
  const readOnly = JSON.parse(data.readOnly)
  grant.grantPermission(requester,
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
exports.revoke = function(req, res) {
  const data = req.method === "GET"?req.query:req.body
  const requester = req.user
  const grantee  = data.grantee
  const resource = data.resource
  const readOnly = JSON.parse(data.readOnly)

  if (!requester) {
    res.jsonp({success:false, msg: 'user is not authenticated' })
    return
  }

  grant.revokePermission(requester,
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

// this is middleware:
//  - It decodes the token (sets req.decoded)
//  - It sets req.user
// if authentication is succesful, it calls the next middleware
exports.authenticate = function(req, res, next) {
  // debug authentication issues:
  // console.log('authenticate headers:', req.headers)
  // get token
  let token = req.headers.authorization
  if (!token) {
    if (req.method == 'GET')
      token = req.query.token
  }

  if (!token) {
    res.status(401).jsonp('{"error":"No identity token provided"}')
    // res.jsonp({success: false, error: "missing token"})
    return
  }
  // decrypt and verify token
  jstoken.verifyToken(token, (err, decoded) => {
    if(err) {
      if (err.message === "PEM_read_bio_PUBKEY failed"){
        return res.status(500).jsonp({success:false,
          error: 'public auth key is missing'})
      }
      res.status(401).jsonp({success:false, error: "invalid token: " + err})
      return
    }
    if(!decoded.identities || decoded.identities.length === 0) {
      res.status(401).jsonp({"success":false, "error":"token must contain identities"})
      return
    }
    // success.
    req.user = decoded.identities[0]
    req.identities = decoded.identities
    req.decoded = decoded
    // debug: user has been authenticated
    log(req.user,'authenticated')
    next()
  })
}

// This middelware sets req.userResources to contain all
// the resources available to a user. That user must be
// specified in req.user
exports.userResources = function(req, res, next) {
  grant.readAllResourcesForUser(req.identities, (err, items) => {
    if(err) {
      return res.status(500).jsonp({
        success: false,
        "error": err
      })
    }
    req.userResources = items
    next()
  })
}

// route that returns all shared resources for a user
// assumes that:
//    req.user is set (authenticate middleware)
//    req.userResources contains the resources for the user
exports.allResources = function(req, res) {
  const user = req.user
  const resources = req.userResources

  const r = {success: false,
             operation: 'get resources for user',
             requester: user,
            }

  if(!user) {
    r.error = "Authentication missing"
    return res.status(500).jsonp(r)
  }

  if(!resources) {
    r.error = "Internal error: resources not specified"
    return res.status(500).jsonp(r)
  }

  r.success = true
  r.result = resources

  res.jsonp(r)
}

// route to get a single resource with data and permissions
// assumes that req.user, req.resourceName and req.resourceData exist
exports.resource = function(req, res) {
  const data = req.resourceData
  const resourceName = req.resourceName
  const user = req.user

  const r = {success: false,
             operation: 'get resource',
             requester: user,
             resource: resourceName,
             id: resourceName
            }
  if(!user) {
    r.error = "Authentication missing"
    return res.status(500).jsonp(r)
  }

  if(!resourceName) {
    r.error = "resource not specified"
    return res.status(500).jsonp(r)
  }

  if(!req.resourceData) {
    r.error = "resource data not found in request"
    return res.status(500).jsonp(r)
  }

  r.success = true
  r.result = data
  res.jsonp(r)
}

// This function returns a middleware function that checks wether a
// user has access to a resource.
//  - resourceName is the name of the resource
//  - readOnly specifies the access
exports.ownsResource = function(resource, readOnly) {

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

    // check all identities and proceed if any one of them is authorized
    for (let i = 0; i < req.identities.length; ++i) {
      const authorized = grant.isAuthorizedSync(
          req.identities[i], resourceName, readOnly)
      if (authorized) {
        req.authorizedIdentity = req.identities[i]
        break
      }
    }

    if(!req.authorizedIdentity){
      const msg = 'insufficient permission for user "' + req.user + '"'
          + ' to access resource "' + resourceName + '"'
      log(msg)
      return res.status(401).jsonp({
        "success": false,
        "error": msg
      })
    }
    else {
      // read the resource, keep a local copy in the req
      grant.readResource(req.authorizedIdentity, resourceName, (err, data) => {
        if(err) {
          return res.status(500).jsonp({
            "success": false,
            "error": err
          })
        }
        log('Authorized resource: ' + resourceName )
        req.resourceData = data
        req.resourceName = resourceName
        req.resourcePermissions = data.permissions[0].permissions
        next()
      })
    }
  }
}

exports.setPermissionsRoutes = function(app) {
  // grant user permission to a resource
  // (add user to a group)
  app.post('/permissions',
      authenticate,
      grant)

  // revoke user permission
  // (delete user from a group)
  app.delete('/permissions',
      authenticate,
      revoke)

  // get all user permissions for all resources
  app.get('/permissions',
      authenticate,
      userResources,
      allResources
  )

  // get user permissions for a resource
  app.get('/permissions/:resourceId',
      authenticate,
      ownsResource(':resourceId', true),
      resource
  )

  /// param for resource name
  app.param('resourceId', function(req, res, next, id) {
    req.resourceId = id
    next()
})


}

