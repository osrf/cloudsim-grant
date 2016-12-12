'use strict'

console.log('test/server.js')
const fs = require('fs')
const path = require('path')

const tok = require('../token')
const keys = tok.generateKeys()

const supertest = require('supertest')

const log = function(){} // console.log

//keys.private
// before launching the server, we want to
// generate a cutom configuration
const envPath = path.normalize(__dirname + '/../.env')
const optionsPath = path.normalize(__dirname + '/../options.json')

// this is our custom .env file content
let env = `
PORT=4444

CLOUDSIM_ADMIN="admins"
CLOUDSIM_AUTH_PUB_KEY=${keys.public}

`

// this is our options.json file
// it has 3 resources, with only one that is shared with
// user "admin" ("admin" is part of the "admins" see all group )
const options = {
  "resources":
  [
    {
      "name": "toto_resource",
      "data": {},
      "permissions": [
        {
          "username": "toto",
          "permissions": {
            "readOnly": false
          }
        }
      ]
    },
    {
      "name": "admin_resource",
      "data": {
        "key": "value"
      },
      "permissions": [
        {
          "username": "bob",
          "permissions": {
            "readOnly": true
          }
        },
        {
          "username": "admin",
          "permissions": {
            "readOnly": false
          }
        }
      ]
    }
  ]
}

fs.writeFileSync(envPath, env)
fs.writeFileSync(optionsPath, JSON.stringify(options, null, 2))
console.log('wrote files: .env to ', envPath, ' and options to ', optionsPath)


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


const app = require('../server')
const agent = supertest.agent(app)


// we need the right instance of cloudsim-grant
const csgrant = app.csgrant

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
      console.log('admin token:', tok)
      done()
    })
  })

  describe('See bob\'s resource', function() {
    it('bob should see 1 resources', function(done) {
      agent
      .get('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', bobToken)
      .send()
      .end(function(err,res){
        var response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('bob')
        // admin should see all resources, because he is part
        // of 'admins' group
        response.result.length.should.equal(1)
        done()
      })
    })
  })

  describe('See all resources', function() {
    it('admin should see 3 resources', function(done) {
      agent
      .get('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send()
      .end(function(err,res){
        var response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('admin')
        // admin should see all resources, because he is part
        // of 'admins' group
        response.result.length.should.equal(3)
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
        var response = parseResponse(res.text, res.status != 400)
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
        var response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('admin')
        done()
      })
    })
  })

  describe('Revoking to admins', function() {
    it('revoking "admins" should not fail', function(done) {
      agent
      .delete('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send({
        "grantee": "admins",
        "resource": "admin_resource",
        "readOnly": false
      })
      .end(function(err,res){
        var response = parseResponse(res.text, res.status != 200)
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
        var response = parseResponse(res.text, res.status != 200)
        res.status.should.be.equal(200)
        response.success.should.equal(true)
        response.requester.should.equal('admin')
        // admin should still see all 3 resources, because he is part
        // of 'admins' group
        response.result.length.should.equal(3)
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

  after(function(done) {
    csgrant.model.clearDb()
    done()
  })

})
