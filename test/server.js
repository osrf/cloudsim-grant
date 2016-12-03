'use strict'

console.log('test/server.js')
const fs = require('fs')
const path = require('path')

const tok = require('cloudsim-grant/token')
const keys = tok.generateKeys()

const supertest = require('supertest')

const log = console.log

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
    console.log(text)
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

app.csgrant.dump()

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

  describe('something', function() {
    it('there should be something', function(done) {
      agent
      .get('/permissions')
      .set('Acccept', 'application/json')
      .set('authorization', adminToken)
      .send()
      .end(function(err,res){
        var response = parseResponse(res.text, res.status != 2000)
        res.status.should.be.equal(200)
        res.redirect.should.equal(false)
        response.success.should.equal(true)
        response.requester.should.equal('admin')
        // admin should see 2 resources, because he is part
        // of 'admins' group
        response.result.length.should.equal(3)
        done()
      })
    })
  })

  after(function(done) {
    csgrant.model.clearDb()
    done()
  })

})
