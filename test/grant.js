'use strict'

const should = require('should')
const csgrant = require('../index')
const model = require('../model')
const token = require('../token')
const util = require('util')


// we need keys for this test
const keys = token.generateKeys()
token.initKeys(keys.public, keys.private)
csgrant.showLog = false

let meTokenData = {username:'me'}
let meToken

let lastResponse = null

describe('<Unit Test grant>', function() {

  before(function(done) {
      model.clearDb()
      token.signToken({username: 'me'}, (e, tok)=>{
        if(e) {
          should.fail(e)
        }
        meToken = tok
        done()
      })
  })

  describe('Toaster sharing:', function() {
    it('should have an empty db', (done) => {
      csgrant.model.clearDb()
      done()
    })
    it('should authenticate', (done) => {
      const req = {
        headers : {authorization: meToken}
      }
      const res = {}
      csgrant.authenticate(req, res, ()=> {
        should.exist(req.user)
        req.user.should.equal('me')
        done()
      })
    })
    it('should be possible to add a toaster', (done) => {
      csgrant.createResource('me', 'toaster', {slots:2}, (e)=>{
        if(e) should.fail(e)
        done()
      })
    })

    it('db should have the toaster', (done) => {
      csgrant.readResource('me', 'toaster', (e, resource ) =>{
        if(e) {
          should.fail(e)
        }
        else {
          resource.data.slots.should.equal(2, 'no data')
          const mePerm = resource.permissions[0]
          mePerm.username.should.equal('me', 'Me not owner')
          mePerm.permissions.readOnly.should.equal(false, 'me not owner!')
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
            r.result[0].name.should.equal('toaster')
            done()
          }
       }
       csgrant.allResources(req, response)
    })

    it('creator should have access to resource', (done) => {
       const req = {
                     user: 'me',
                   }

       const res = class ServerResponse {}

       const owns = csgrant.ownsResource("toaster", false)
       owns(req, res, ()=> {

        should.exist(req.user)
        req.user.should.equal('me')

        should.exist(req.resourceName)
        req.resourceName.should.equal('toaster')

        done()
      })
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
            r.result.name.should.equal('toaster')
            r.result.data.slots.should.equal(2)
            done()
          }
       }
       csgrant.resource(req, response)
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
      csgrant.grant(req, response)

    })

    it('the toaster should still be accessible', (done) => {
      csgrant.isAuthorized('me', 'toaster', true, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(true)
        done()
      })
    })

    it('joe should also have access to the toaster', (done) => {
      csgrant.isAuthorized('joe', 'toaster', true, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(true)
        done()
      })
    })

    it('joe should have write access to resource', (done) => {
       const req = {
                     user: 'joe',
                   }

       const res = {}

       const owns = csgrant.ownsResource("toaster", false)
       owns(req, res, ()=> {

        should.exist(req.user)
        req.user.should.equal('joe')

        should.exist(req.resourceName)
        req.resourceName.should.equal('toaster')

        done()
      })
    })

    it('should be possible to update the toaster (add slots)', (done) => {
      csgrant.updateResource('me', 'toaster', {slots:4}, (e) =>{
        if(e)
          should.fail(e)
        else
          done()
      })
    })

    it('Joe should now see the 4 slots of the toaster', (done) => {
      csgrant.readResource('joe', 'toaster', (e, resource ) =>{
        if(e)
          should.fail(e)
        else {
          resource.data.slots.should.equal(4, 'not updated')
          resource.name.should.equal('toaster', 'wrong resource')
          resource.permissions.length.should.equal(2, 'wrong number of permissions')

          resource.permissions[0].username.should.equal('joe')
          resource.permissions[0].permissions.readOnly.should.equal(false)

          resource.permissions[1].username.should.equal('me')
          resource.permissions[1].permissions.readOnly.should.equal(false)
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
          r.requester.should.equal('me')
          done()
        }
      }
      csgrant.revoke(req, response)
    })

    it('joe should not have access to the toaster', (done) => {
      csgrant.isAuthorized('joe', 'toaster', true, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(false)
        done()
      })
    })

    it('joe should not have write access to resource', (done) => {
       const req = {
                     user: 'joe',
                   }

       let res =  {
         status : function(number) {
           number.should.equal(401)
           return this
         },
         jsonp: function(data) {
          data.success.should.equal(false)
          should.exist(data.error)
          done()
         }

       }

       const owns = csgrant.ownsResource("toaster", false)
       owns(req, res, ()=> {
         should.fail()
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
          r.requester.should.equal('me')
          done()
        }
      }
      csgrant.grant(req, response)

    })

    it('jack should not have write access to the toaster', (done) => {
      csgrant.isAuthorized('jack', 'toaster', false, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(false)
        done()
      })
    })

    it('jack should have read access to resource', (done) => {
       const req = {
                     user: 'jack',
                   }

       let res =  {
         status : function(number) {
           console.log('status!!',number)

         }

       }

       const owns = csgrant.ownsResource("toaster", true)
       owns(req, res, ()=> {

        should.exist(req.user)
        req.user.should.equal('jack')

        should.exist(req.resourceName)
        req.resourceName.should.equal('toaster')

        done()
      })
    })

    it('should be possible to remove the toaster', (done) => {
      csgrant.deleteResource('me', 'toaster', (e)=>{
        if(e) should.fail(e)
        done()
      })
    })

  })
})
