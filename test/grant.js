'use strict'

const should = require('should')
const grantjs = require('../index')
const model = require('../model')
const token = require('../token')
const util = require('util')


// we need keys for this test
const keys = token.generateKeys()
token.initKeys(keys.public, keys.private)


let meTokenData = {username:'me'}
let meToken

let lastResponse = null

describe('<Unit Test grant>', function() {

  before(function(done) {
      model.clearDb()
      token.signToken({username: 'me'}, (e, tok)=>{
        console.log('token signed for user "me"')
        if(e) {
          console.log('sign error: ' + e)
        }
        meToken = tok
        done()
      })
  })

  describe('adding and sharing a resource:', function() {

    it('should have an empty db', (done) => {
      done()
    })

    it('should have a toaster', (done) => {
      grantjs.createResource('me', 'toaster', {slots:2}, (e)=>{
        if(e) should.fail(e)
        done()
      })
    })

    it('should be possible to share the toaster with joe', (done) => {
      const req = {
                    query: {
                      granterToken: meToken,
                      grantee: 'joe',
                      resource: 'toaster',
                      readOnly: false
                    }
                  }
      const response = {
        jsonp: function (r) {
          if(!r.success) {
            should.fail('cannot grant')
          }
          done()
        }
      }
      grantjs.grant(req, response)

    })

    it('should be possible to update the toaster', (done) => {
      grantjs.updateResource('me', 'toaster', {slots:4}, (e) =>{
        if(e)
          should.fail(e)
        else
          done()
      })
    })

    it('the toaster should now have 4 slots', (done) => {
      grantjs.readResource('joe', 'toaster', (e, resource ) =>{
        if(e)
          should.fail(e)
        else {
          resource.data.slots.should.equal(4, 'not updated')
          resource.permissions.length.should.equal(2, 'not shared')
          done()
        }
      })
    })

    it('joe should have access to the toaster', (done) => {
      grantjs.isAuthorized('joe', 'toaster', true, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(true)
        done()
      })
    })

    it('should be possible to revoke the toaster for joe', (done) => {
      const req = {
                    query: {
                      granterToken: meToken,
                      grantee: 'joe',
                      resource: 'toaster',
                      readOnly: false
                    }
                  }
      const response = {
        jsonp: function (r) {
          if(!r.success) {
            should.fail('cannot revoke')
          }
          done()
        }
      }
      grantjs.revoke(req, response)
    })

    it('joe should not have access to the toaster', (done) => {
      grantjs.isAuthorized('joe', 'toaster', true, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(false)
        done()
      })
    })

    it('should be possible to remove the toaster', (done) => {
      grantjs.deleteResource('me', 'toaster', (e)=>{
        if(e) should.fail(e)
        done()
      })
    })

  })
})
