'use strict'

const redis = require("redis")
const client = redis.createClient()

// when true, most output is suppressed
exports.showLog = false

// log to console
// @s string to log
function log(s) {
  if (exports.showLog) {
    console.log('grant:db> ', s)
  }
}

// the database list where data is saved
let listName = 'cloudsim-grant'

// set the list name
function init(databaseName) {
  listName = databaseName
}

// Redis events
client.on("error", function (err) {
  console.log("Redis error: " + err);
})

client.on("connect", function (err) {
    log("Redis connected");
})

if (process.env.NODE_ENV === "test") {
  console.log('cloudsim-grant/model.js NODE_ENV: ' + process.env.NODE_ENV)
  // test mode...
  // use the test list instead of the live one
  listName = 'cloudsim-grant_test'
}

// internal function to add an item to the list
function push(operation, data) {

  let info = {
    operation: operation,
    data: data
  }

  const json = JSON.stringify(info)
  const dbData = json // json.replace(/"|"/g, '\\"')
  log('DB PUSH [' +  listName+ '] ' + dbData)
  let r = client.rpush( listName, dbData)
  log('rpush returned ' + r)
}

// revokes a permission
function revoke(granter, grantee, resource, readOnly ) {
  const data = {resource: resource,
                granter: granter,
                grantee: grantee,
                readOnly: readOnly}
  push('revoke', data)
}

// create, update or delete a resource
// creates the resource if it does not exists
// deletss the resource if data is null or undefined
// updates the resource with new data if it exists
function setResource(owner, resource, resourceData) {
  const data = { resource: resource,
                 data: resourceData,
                 owner: owner}
  push('set', data)
}

// share a resource with a new user
function grant(granter, grantee, resource, readOnly ) {
  const data = {resource: resource,
                granter: granter,
                grantee: grantee,
                readOnly: readOnly}
  push('grant', data)
}

// this function expects a callback for each item with the following interface
// callback (err, items) where items is a list in which each item is an
// object with the following keys:
//   operation, resource, data
function readDb(cb) {
  // get all data from db
  client.lrange(listName, 0, -1, function (error, items) {
    if (error)
      cb(error)
    // transform items (in place) from strings to data
    for (var i =0; i < items.length; i++) {
      items [i] = JSON.parse(items[i])
    }
    // return the data
    cb(null, items)
  })
}

// erases the list of all db operations
function clearDb() {
  client.del(listName)
  console.log('"' + listName + '" database deleted')
}

// this is a convenient method to get the next id for a
// given resource type (i.e. simulation). The value is
// kept in the database
function getNextResourceId(resourceType, cb) {
  client.incr(resourceType + "_id", function(err, id) {
    if(err)
      cb(err)
    cb(null, resourceType + '-' + id)
  });
}

exports.init = init
exports.listName = listName
exports.grant = grant
exports.revoke = revoke
exports.setResource = setResource
exports.readDb = readDb
exports.clearDb = clearDb
exports.getNextResourceId = getNextResourceId
