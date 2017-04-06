'use strict'

const download =  require('./download')
const grant = require('./grant')
const jstoken = require('./token')
const model = require('./model')
const routes = require('./routes')
const sockets = require('./sockets')

// event emitter
exports.events = grant.events

// database, setup
exports.init = grant.init
exports.copyInternalDatabase = grant.copyInternalDatabase
exports.saveData = model.saveData
exports.loadData = model.loadData
exports.clearCache = grant.clearCache

// routes
exports.setPermissionsRoutes = routes.setPermissionsRoutes
exports.grant = routes.grant
exports.revoke = routes.revoke
exports.downloadFilePath = download.downloadFilePath
exports.bitbucketBadgeOpenPrs = routes.bitbucketBadgeOpenPrs

// middleware
exports.userResources = routes.userResources
exports.authenticate = routes.authenticate
exports.ownsResource = routes.ownsResource

// middleware to write responses
exports.resource = routes.resource
exports.allResources = routes.allResources

// crud (create update read delete)
exports.createResource = grant.createResource
exports.createResourceWithType = grant.createResourceWithType
exports.readResource = grant.readResource
exports.updateResource = grant.updateResource
exports.deleteResource = grant.deleteResource
exports.deleteUser = grant.deleteUser

// util
exports.dump = grant.dump
exports.isAuthorized = grant.isAuthorized
exports.readAllResourcesForUser = grant.readAllResourcesForUser
exports.getNextResourceId = model.getNextResourceId
exports.grantPermission = grant.grantPermission
exports.revokePermission = grant.revokePermission

exports.signToken = jstoken.signToken
exports.verifyToken = jstoken.verifyToken

// republish submodules (mainly for testing)
exports.download = download
exports.token = jstoken
exports.model = model
exports.routes = routes
exports.sockets = sockets
