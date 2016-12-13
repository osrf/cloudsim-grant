'use strict'

const request = require('request')

// sub modules
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

  if (!requester) {
    res.status(400).jsonp({success:false, error: 'user is not authenticated' })
    return
  }

  if (typeof(data.readOnly) == 'undefined' ||
      typeof(grantee) == 'undefined' ||
      typeof(resource) == 'undefined' ){
    res.status(400).jsonp({
      "operation": "grant",
      "success":false,
      "error":"missing required data: grantee, resource or readOnly"
    })
    return
  }
  const readOnly = JSON.parse(data.readOnly)

  grant.grantPermission(
    requester,
    grantee,
    resource,
    readOnly,
    (err, success, message)=>{
      let msg = message
      if (err) {
        success = false
        msg =  err
      }
      const r ={
        operation: 'grant',
        requester: requester,
        grantee: grantee,
        resource: resource,
        readOnly: readOnly,
        success: success,
        msg: msg
      }
      res.jsonp(r)
    }
  )
}

// route for revoke
exports.revoke = function(req, res) {
  const data = req.method === "GET"?req.query:req.body
  const requester = req.user
  const grantee  = data.grantee
  const resource = data.resource

  if (!requester) {
    res.status(400).jsonp({success:false, error: 'user is not authenticated' })
    return
  }
  if (typeof(data.readOnly) == 'undefined' ||
      typeof(grantee) == 'undefined' ||
      typeof(resource) == 'undefined' ){
    res.status(400).jsonp({
      "operation": "grant",
      "success":false,
      "error":"missing required data: grantee, resource or readOnly"
    })
  }
  const readOnly = JSON.parse(data.readOnly)
  grant.revokePermission(requester,
    grantee,
    resource,
    readOnly,
    (err, success, message)=>{
      let msg = message
      if (err) {
        success = false
        msg = err
      }
      const r ={
        operation: 'revoke',
        requester: requester,
        grantee: grantee,
        resource: resource,
        readOnly: readOnly,
        success: success,
        msg: msg
      }
      res.jsonp(r)
    }
  )
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

  const r = {
    success: false,
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

  const r = {
    success: false,
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
      exports.authenticate,
      exports.grant)

  // revoke user permission
  // (delete user from a group)
  app.delete('/permissions',
      exports.authenticate,
      exports.revoke)

  // get all user permissions for all resources
  app.get('/permissions',
      exports.authenticate,
      exports.userResources,
      exports.allResources
  )

  // get user permissions for a resource
  app.get('/permissions/:resourceId',
      exports.authenticate,
      exports.ownsResource(':resourceId', true),
      exports.resource
  )

  /// param for resource name
  app.param('resourceId', function(req, res, next, id) {
    req.resourceId = id
    next()
  })
}

// Middleware that serves an SVG badge that contains the number of
// open Pull Requests on a bitbucket repository
// @repository the bitbucket user and repo (ex: "osrf/cloudsim-portal")
exports.bitbucketBadgeOpenPrs = function (repository) {
  const url = 'https://bitbucket.org/!api/2.0/repositories/'
    + repository + '/pullrequests'
  return function (req, res) {
    request(url, function (error, response, body) {
      if (error) {
        console.error(error)
        return
      }
      if (response.statusCode != 200) {
        console.error('error getting PRs, code:', response.statusCode)
        res.status(response.statusCode).end(error)
        return
      }
      const bitbucketData = JSON.parse(body)
      const pullRequests = bitbucketData.size

      let color = '#4c1'
      if (pullRequests > 0)
        color = '#dfb317'

      const s = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="20"><linearGradient id="b" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><mask id="a"><rect width="128" height="20" rx="3" fill="#fff"/></mask>
<g mask="url(#a)"><path fill="#555" d="M0 0h81v20H0z"/><path fill="${color}" d="M81 0h47v20H81z"/><path fill="url(#b)" d="M0 0h128v20H0z"/></g><g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
<text x="40.5" y="15" fill="#010101" fill-opacity=".3">pull requests</text>
<text x="40.5" y="14">pull requests</text>
<text x="103.5" y="15" fill="#010101" fill-opacity=".3">${pullRequests} open</text>
<text x="103.5" y="14">${pullRequests} open</text>
</g></svg>`
      log('', pullRequests, 'open PRs for', repository)
      // serve it as an svg document
      res.setHeader('content-type', 'image/svg+xml;charset=utf-8')
      res.end(s)
    })
  }
}


