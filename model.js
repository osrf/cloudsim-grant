'use strict'

const redis = require("redis")
const client = redis.createClient()

// the database list where data is saved
let listName = 'jsgrant'

if (process.env.NODE_ENV === "test") {
  console.log('jsgrant/model.js NODE_ENV: ' + process.env.NODE_ENV)
  // test mode...
  // use the test list instead of the live one
  listName = 'jsgrant_test'
}


// internal function to add an item to the list
function push(operation, data) {

  let info = {
    operation: operation,
    data: data,
  }
  const json = JSON.stringify(info)
  client.rpush( listName, json)
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

function grant(granter, grantee, resource, readOnly ) {
  const data = {resource: resource,
                granter: granter,
                grantee: grantee,
                readOnly: readOnly}
  push('grant', data)
}

// this function expects a callback for each item with the following interface
//  callback (err, items) where items is a list in which each item is an
//  object with the following keys:
//    operation, resource, data
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

function clearDb() {
  client.del(listName)
}

exports.grant = grant
exports.revoke = revoke
exports.setResource = setResource
exports.readDb = readDb
exports.clearDb = clearDb




