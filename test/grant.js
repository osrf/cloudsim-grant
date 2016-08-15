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
      grantjs.model.clearDb()
      done()
    })
    it('should authenticate', (done) => {
      const req = {
        headers : {authorization: meToken}
      }
      const res = {}
      grantjs.authenticate(req, res, ()=> {
        should.exist(req.user)
        req.user.should.equal('me')
        done()
      })
    })
    it('should be possible to add a toaster', (done) => {
      grantjs.createResource('me', 'toaster', {slots:2}, (e)=>{
        if(e) should.fail(e)
        done()
      })
    })

    it('db should have the toaster', (done) => {
      grantjs.readResource('me', 'toaster', (e, resource ) =>{
        if(e)
          should.fail(e)
        else {
          resource.data.slots.should.equal(2, 'no data')
          resource.permissions.length.should.equal(1, 'no single owner')
          done()
        }
      })
    })


    it('there should be resources', (done) => {
       const req = {
                    user: 'me',
                    }

       const response = {
          jsonp: function (r) {
            if(!r.success) {
              should.fail('toaster not in all resources')
            }
            r.result.length.should.equal(1)
            r.result[0].id.should.equal('toaster')
            done()
          }
       }
       grantjs.allResources(req, response)
    })

    it('the resource can be obtain via a route', (done) => {
       const req = {
                    user: 'me',
                    resourceName: 'toaster'
                    }

       const response = {
          jsonp: function (r) {
            if(!r.success) {
              should.fail('no toaster in resource route')
            }
            r.resource.should.equal('toaster')
            r.result.data.slots.should.equal(2)
            done()
          }
       }
       grantjs.resource(req, response)
    })



    it('should be possible to share the toaster with joe', (done) => {
      const req = {
                    headers:{authorization: meToken},
                    user: 'me',
                    body: {
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

    it('the toaster should still be accessible', (done) => {
      grantjs.isAuthorized('me', 'toaster', true, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(true)
        done()
      })
    })

    it('joe should also have access to the toaster', (done) => {
      grantjs.isAuthorized('joe', 'toaster', true, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(true)
        done()
      })
    })

    it('should be possible to update the toaster (add slots)', (done) => {
      grantjs.updateResource('me', 'toaster', {slots:4}, (e) =>{
        if(e)
          should.fail(e)
        else
          done()
      })
    })

    it('Joe should now see the 4 slots of the toaster', (done) => {
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

    it('should be possible to revoke joe\'s toaster access', (done) => {
      const req = {
                    user: 'me',
                    body: {
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
          r.granter.should.equal('me')
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

    it('should be possible to share the toaster with jack', (done) => {
      const req = {
                    user: 'me',
                    body: {
                      grantee: 'jack',
                      resource: 'toaster',
                      readOnly: true
                    }
                  }
      const response = {
        jsonp: function (r) {
          if(!r.success) {
            should.fail('cannot grant')
          }
          r.granter.should.equal('me')
          done()
        }
      }
      grantjs.grant(req, response)

    })

    it('jack should not have write access to the toaster', (done) => {
      grantjs.isAuthorized('jack', 'toaster', false, (e, authorized) => {
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
