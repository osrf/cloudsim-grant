'use strict'

const redis = require("redis")

let client = redis.createClient()

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
  if (!databaseName)
    return

  listName = databaseName
}

// connect to database using a URL
function setDatabaseUrl(url) {
  if (!url)
    return

  if (client)
    client.quit()

  let options = {}
  options.url = 'redis://' + url
  client = redis.createClient(options)
}

// Redis events
client.on("error", function (err) {
  console.log("Redis error: " + err);
})

client.on("connect", function () {
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
  const data = {
    resource: resource,
    granter: granter,
    grantee: grantee,
    readOnly: readOnly
  }
  push('revoke', data)
}

// create, update or delete a resource
// creates the resource if it does not exists
// deletss the resource if data is null or undefined
// updates the resource with new data if it exists
function setResource(owner, resource, resourceData) {
  const data = {
    resource: resource,
    data: resourceData,
    owner: owner
  }
  push('set', data)
}

// share a resource with a new user
function grant(granter, grantee, resource, readOnly ) {
  const data = {
    resource: resource,
    granter: granter,
    grantee: grantee,
    readOnly: readOnly
  }
  push('grant', data)
}

// this function expects a callback for each item with the following interface
// callback (err, items) where items is a list in which each item is an
// object with the following keys:
//   operation, resource, data
function readDb(cb) {
  readDbRange(0, -1, cb)
}

// read list from database with start and end range
function readDbRange(start, end, cb) {
  // get all data from db
  client.lrange(listName, start, end, function (error, items) {
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

// erases the list of all db operations and states
function clearDb(cb) {
  client.keys(listName + '*', (err, keys) => {
    for (let i = 0; i < keys.length; ++i) {
      client.del(keys[i])
      console.log('"' + keys[i]+ '" database deleted')
    }
    if (cb)
      cb()
  })
}

// function to get 0 in front of a number ( 9 -> 0009)
// s: string / number to pad
// c: pad character
// n: total number of characters after padding
const leftPad = (s,c,n) => c.repeat(n-String(s).length)+s

// this is a convenient method to get the next id for a
// given resource type (i.e. simulation). The value is
// kept in the database
function getNextResourceId(resourceType, cb) {
  client.incr(resourceType + "_id", function(err, id) {
    if(err)
      cb(err)
    const numberStr = id < 1000?leftPad(id, '0', 3):id
    cb(null, resourceType + '-' + numberStr)
  });
}


// save ab object to the db (after JSON string conversion)
// name: the key name for the data
// value: an object that contains data
// cb: a callback with an error (null means success)
function saveData(name, value, cb) {
  if (!name || name === '') {
    cb("Error saving data: empty key name")
    return
  }
  let strData
  if (typeof value != 'number')
    strData = JSON.stringify(value)
  else
    strData = value
  const keyName = listName + ":" + name
  client.set(keyName, strData, (err, reply) => {
    if (reply === 'OK') {
      cb()
      return
    }
    cb(err)
  })
}

// save a Json object to the db
// name: the key name for the data
// cb: a callback (err, data) the data is a JSON object
function loadData(name, cb) {
  if (!name || name === '') {
    cb("Error loading data: empty key name")
    return
  }
  const keyName = listName + ":" + name
  client.get(keyName, (err, strData) => {
    if (err) {
      cb(err)
      return
    }
    // not expecting JSON.parse to throw
    // because data was stringified in save
    const data = JSON.parse(strData)
    cb(null, data)
  })
}

// increment a value of a key
// the value must be a number
function incrData(name, cb) {
  if (!name || name === '') {
    cb("Error incrementing data: empty key name")
    return
  }
  const keyName = listName + ":" + name
  client.incr(keyName, (err, data) => {
    if (err) {
      cb(err)
      return
    }
    cb(null, data)
  })
}

// Resources and permissions
exports.init = init
exports.setDatabaseUrl = setDatabaseUrl
exports.listName = listName
exports.grant = grant
exports.revoke = revoke
exports.setResource = setResource
exports.readDb = readDb
exports.readDbRange = readDbRange
exports.clearDb = clearDb
exports.getNextResourceId = getNextResourceId


// save and load data directly
exports.saveData = saveData
exports.loadData = loadData
exports.incrData = incrData
