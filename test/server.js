'use strict'

console.log('test/server.js')

const fs = require('fs')
const path = require('path')
const should = require('should')
const supertest = require('supertest')

// local modules
const tok = require('../token')
const model = require('../model')

const log = console.log // function(){} // console.log

// keys.private
// before launching the server, we want to
// generate a cutom configuration

let dump
function parseResponse(text, log) {
  if(log) {
    dump('test/server.js')
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

// all these things will be defined shortly, then used
// elsewhere.
let adminToken
let bobToken
let agent
let app
let keys

describe('<Unit test Server>', function() {

  // generate keys for this test
  before(function() {
    keys = tok.generateKeys()
    tok.initKeys(keys.public, keys.private)
  })

  before(function(done) {
    tok.signToken(adminTokenData, (e, tok)=>{
      if(e) {
        should.fail('sign error: ' + e)
      }
      adminToken = tok
      log('admin\'s token:', tok)
      done()
    })
  })

  before(function(done) {
    tok.signToken(bobTokenData, (e, tok)=>{
      if(e) {
        should.fail('sign error: ' + e)
      }
      bobToken = tok
      log('bob\'s token:', tok)
      done()
    })
  })

  before(function() {
    model.init('127.0.0.1', 'cloudsim-grant-test')
    model.clearDb()
  })

  describe('Configuration', function() {
    it('should have a .env file', function(done) {
      const envPath = path.normalize(__dirname + '/../.env')
      // we need to remove line breaks before saving the key
      // in the env
      const keyStr = keys.public.split('\n').join('\\n')
      // this is our custom .env file content
      let env = `
PORT=4444
CLOUDSIM_ADMIN="admins"
CLOUDSIM_AUTH_PUB_KEY=${keyStr}
    `
      fs.writeFileSync(envPath, env)
      // check that it exists
      fs.stat(envPath, function (err) {
        if (err) should.fail(err)
        done()
      })
    })
    it('should have an options.json file', function(done) {
      const optionsPath = path.normalize(__dirname + '/../options.json')
      // this is our options.json file
      // it has resources, admin_resource is shared with user "bob"
      // user "admin" is part of the "admins"
      const options = {
        "resources":[
          {
            "server": "https://test.cloudsim.io",
            "action": "CREATE_RESOURCE",
            "resource": "bob_resource",
            "creator": "bob",
            "data": {
              "txt": "bob_resource data"
            }
          },
          {
            "server": "https://test.cloudsim.io",
            "action": "CREATE_RESOURCE",
            "prefix": "toto_resource",
            "param": "totoId",
            "creator": "toto",
            "data": {
              "txt": "toto_resource-xxx data"
            }
          },
          {
            "server": "https://test.cloudsim.io",
            "action": "CREATE_RESOURCE",
            "prefix": "totosub",
            "suffix": ":totoId",
            "creator": "toto",
            "data": {
              "txt": "totosub_resource-xxx data"
            }
          },
          {
            "server": "https://test.cloudsim.io",
            "action": "CREATE_RESOURCE",
            "resource": "admin_resource",
            "creator": "admin",
            "data": {
              "txt": "admin_resource data"
            }
          },
          {
            "server": "https://devportal.cloudsim.io",
            "action": "GRANT_RESOURCE",
            "granter": "admin",
            "grantee": "bob",
            "resource": "admin_resource",
            "permissions": {
              "readOnly": true,
            }
          }
        ]
      }
      fs.writeFileSync(optionsPath, JSON.stringify(options, null, 2))
      fs.stat(optionsPath, function (err) {
        if (err) should.fail(err)
        done()
      })
    })
  })
  describe ('Server', function() {
    it('Should be online', function(done) {
      app = require('../server')
      agent = supertest.agent(app)
      dump = app.csgrant.dump
      done()
    })
  })
  describe ('See bob\'s resource', function() {
    it('bob should see 2 resources', function(done) {
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
        response.result.length.should.equal(2)
        response.result[0].name.should.equal('bob_resource')
        response.result[1].name.should.equal('admin_resource')
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
        // admin should still see all resources, because he is part
        // of 'admins' group
        response.result.length.should.equal(4)
        response.result[0].name.should.equal('bob_resource')
        response.result[1].name.should.equal('admin_resource')
        const toto = response.result[2].name
        const totosub = response.result[3].name
        toto.indexOf('toto_resource-').should.equal(0)
        totosub.indexOf('totosub-').should.equal(0)
        // compare the numbers, they should be identical
        toto.split('toto_resource-')[1].should.equal(totosub.split('totosub-')[1])
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
    app.csgrant.model.clearDb()
    done()
  })

})
