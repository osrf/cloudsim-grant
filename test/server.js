'use strict'

console.log('test/server.js')
const fs = require('fs')
const path = require('path')
const should = require('should')


const tok = require('../token')
const keys = tok.generateKeys()
tok.initKeys(keys.public, keys.private, null)

const supertest = require('supertest')

const log = function(){} // console.log

//keys.private
// before launching the server, we want to
// generate a cutom configuration
const envPath = path.normalize(__dirname + '/../.env')
const optionsPath = path.normalize(__dirname + '/../options.json')

// this is our custom .env file content
let envTxt = `
PORT=4444

CLOUDSIM_ADMIN="admins"
CLOUDSIM_AUTH_PUB_KEY=${keys.public}

`

// this is our options.json file
// it has 4 resources, with only one that is shared with
// user "admin" is part of the "admins" see all group.
const options = {
  "resources":[
    {
      "server": "https://test.cloudsim.io",
      "type": "CREATE_RESOURCE",
      "resource": "bob_resource",
      "creator": "bob",
      "data": {
        "txt": "bob_resource data"
      }
    },
    {
      "server": "https://test.cloudsim.io",
      "type": "CREATE_RESOURCE",
      "prefix": "toto_resource",
      "param": "totoId",
      "creator": "toto",
      "data": {
        "txt": "toto_resource-xxx data"
      }
    },
    {
      "server": "https://test.cloudsim.io",
      "type": "CREATE_RESOURCE",
      "prefix": "totosub",
      "suffix": ":totoId",
      "creator": "toto",
      "data": {
        "txt": "totosub_resource-xxx data"
      }
    },
    {
      "server": "https://test.cloudsim.io",
      "type": "CREATE_RESOURCE",
      "resource": "admin_resource",
      "creator": "admin",
      "data": {
        "txt": "admin_resource data"
      }
    },
    {
      "server": "https://devportal.cloudsim.io",
      "type": "GRANT_RESOURCE",
      "granter": "admin",
      "grantee": "bob",
      "resource": "admin_resource",
      "permissions": {
        "readOnly": true,
      }
    }
  ]
}

/*
this one has the alllow downgrade
    {
      "server": "https://devportal.cloudsim.io",
      "type": "GRANT_RESOURCE",
      "granter": "admin",
      "grantee": "bob",
      "resource": "admin_resource",
      "permissions": {
        "readOnly": true,
        "allowDowngrade": true
      }
    }



"actions": [
  {
    server: 'https://test.cloudsim.io', // not used
    type: 'CREATE_RESOURCE',
    fullname: 'toto_resource',
    creator: 'bob',
    data: {txt: 'toto_resource data' }
  },
  // prefix must be null, param must be null
  // ...
  // result
  // check data, bob write
  {
    server: 'https://test.cloudsim.io', // not used
    type: 'CREATE_RESOURCE',
    fullname: 'admin_resource',
    creator: 'admin',
    data: {txt: 'admin_resource data' }
  },
  {
    server: 'https://devportal.cloudsim.io',
    type: 'GRANT_RESOURCE',
    granter: 'admin'
    grantee: 'bob'
    resource: 'admin_resource'
    permissions: {
      readOnly: true,
      allowDowngrade: true,   // dafault is false
    }
  }
]


var actions = [
  {
    server: 'https://devportal.cloudsim.io', // not used
    type: 'CREATE_RESOURCE',
    param: 'tomatoId',
    prefix: 'tomato', creator: 'bob', data: {content: 'a string' }
  },

  // suffix of the resource is now set in param: 'totoId'
  {
    server: 'https://devportal.cloudsim.io',
    type: 'ADD_RESOURCE',
    prefix: 'toto-team-blue',
    suffix: ':totoId',
    data: {"key": "something" }} // data must be a valid JSON
  },
  // there should be 2 resources with same nb
  {
    server: 'https://devportal.cloudsim.io',
    type: 'GRANT_RESOURCE',
    granter: ''
    grantee: ''
    resource: ''
    permissions: {
      readOnly: true
      allowDowngrade: true,   // optional
    }
  },
  {
    server: 'https://devportal.cloudsim.io',
    type: 'REVOKE_RESOURCE',
    granter:
    grantee:
    resource:
    permissions: {
      readOnly: false
    }
  },
  {
    server: 'https://devportal.cloudsim.io',
    type: 'UPDATE_RESOURCE',
    path: 'something.something', // optional, relative to data
    value: {'chair': 'is against the wall'}
  }

DELETE_RESOURCE
]


// path.toString().split('.')


CREATE_RESOURCE undo:
  nothing
DELETE_RESOURCE undo:
  need to save previous state and id
  create resource when it does not exist (idem)
UPDATE_RESOURCE undo:
  need to save the previous state (all or path)
  use an update operation (idem? change from old x value to y value is OK)
GRANT_RESOURCE:
  save previous grantee access
  revoke or downgrade (idem? grant/revoke is idem)
REVOKE_RESOURCE:
  see GRANT

results? not too sure.

dispatch
*/

fs.writeFileSync(envPath, envTxt)
fs.writeFileSync(optionsPath, JSON.stringify(options, null, 2))
log('wrote files: .env to ', envPath, ' and options to ', optionsPath)

const app = require('../server')
const agent = supertest.agent(app)

// we need the right instance of cloudsim-grant
const csgrant = app.csgrant
console.log('DUMP before start')
csgrant.dump()

function parseResponse(text, log) {
  if(log) {
    csgrant.dump()
  }
  let res
  try {
    res = JSON.parse(text)
  }
  catch (e) {
    console.log('=== not  valid JSON ===')
    console.log(text)
    console.log('========================')
    throw e
  }
  if(log){
    const s = JSON.stringify(res, null, 2)
    console.log(s)
  }
  return res
}

// setup identities
const adminTokenData = {
  identities: ['admin', 'admins']
}

const bobTokenData = {
  identities: ['bob']
}

let adminToken
let bobToken

describe('<Unit test Server>', function() {
  before(function(done) {
    tok.signToken(adminTokenData, (e, tok)=>{
      log('token signed for "admin"')
      if(e) {
        should.fail('sign error: ' + e)
      }
      adminToken = tok
      console.log('admin token:', tok)
      done()
    })
  })

  before(function(done) {
    tok.signToken(bobTokenData, (e, tok)=>{
      log('token signed for "bob"')
      if(e) {
        should.fail('sign error: ' + e)
      }
      bobToken = tok
      log('bob token:', tok)
      done()
    })
  })

  describe('See bob\'s resource', function() {
    it('bob should see 2 resources', function(done) {
      agent
      .get('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', bobToken)
      .send()
      .end(function(err,res){
        const response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('bob')
        // admin should see all resources, because he is part
        // of 'admins' group
        response.result.length.should.equal(2)
        done()
      })
    })
  })

  describe('See all resources', function() {
    it('admin should see all resources', function(done) {
      agent
      .get('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send()
      .end(function(err,res){
        const response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('admin')
        // admin should see all resources, because he is part
        // of 'admins' group
        response.result.length.should.equal(4)
        // let's dig in... verify each result list the adminIdentity
        // with a read/write permission
        const filter = function(permission) {
          return (permission.username == 'admins')
        }
        for (let i in response.result) {
          const permissions = response.result[i].permissions
          const adminIsHere = permissions.filter(filter)
          if (!adminIsHere)
            should.fail('not shared with "admins"')
        }
        done()
      })
    })
  })

  describe('Grant with bad params', function() {
    it('should fail', function(done) {
      agent
      .post('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send({ // we are not sending the data!
      })
      .end(function(err,res){
        const response = parseResponse(res.text, res.status != 400)
        res.status.should.be.equal(400)
        response.error.should.equal(
          "missing required data: grantee, resource or readOnly"
        )
        done()
      })
    })
  })

  describe('Grant to admins', function() {
    it('granting to "admins" should have no effect', function(done) {
      agent
      .post('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send({
        "grantee": "admins",
        "resource": "admin_resource",
        "readOnly": false
      })
      .end(function(err,res){
        const response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('admin')
        done()
      })
    })
  })

  describe('Revoking admins', function() {
    it('revoking "admins" should not fail', function(done) {
      agent
      .delete('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send({
        "granter": "admin",
        "grantee": "admins",
        "resource": "admin_resource",
        "readOnly": false
      })
      .end(function(err,res){
        const response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('admin')
        done()
      })
    })
    it('should have no effect', function(done) {
      agent
      .get('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send()
      .end(function(err,res){
        const response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('admin')
        // admin should still see all 3 resources, because he is part
        // of 'admins' group
        response.result.length.should.equal(4)
        // let's dig in... verify each result list the adminIdentity
        // with a read/write permission
        const filter = function(permission) {
          return (permission.username == 'admins')
        }
        for (let i in response.result) {
          const permissions = response.result[i].permissions
          const adminIsHere = permissions.filter(filter)
          if (!adminIsHere)
            should.fail('not shared with "admins"')
        }
        done()
      })
    })
  })

  describe('Revoking a resource', function() {
    it('revoking "bob" should not fail', function(done) {
      agent
      .put('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send([
        {
          server: 'https://devportal.cloudsim.io',
          type: 'REVOKE_RESOURCE',
          granter: 'admin',
          grantee: 'bob',
          resource: 'admin_resource',
          permissions: {
            readOnly: true,
          }
        }
      ])
      .end(function(err,res){
        const response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
//        response.success.should.equal(true)
//        response.requester.should.equal('admin')
        done()
      })
    })
  })

  after(function(done) {
    csgrant.model.clearDb()
    done()
  })

})
