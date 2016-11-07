'use strict'

const should = require('should')
const csgrant = require('../index')
const model = require('../model')
const token = require('../token')

// true: log appears on the console, false: no logging
const enableLog = false
const log = enableLog ? console.log: ()=>{}

// we need keys for this test
const keys = token.generateKeys()
token.initKeys(keys.public, keys.private)

// help debug (with a deluge of text)
//csgrant.showLog = true

let meToken
let eventsList = []

describe('<Unit Test grant>', function() {

  before(function(done) {
    model.clearDb()
    token.signToken({identities: ['me']}, (e, tok)=>{
      if(e) {
        should.fail(e)
      }
      meToken = tok
      done()
    })
  })

  before(function(done) {
    csgrant.events.on('resource', (resource, operation, users)=> {
      eventsList.push({
        resource: resource,
        operation: operation,
        users: users
      })
      log('RESOURCE event:', resource, operation, eventsList.length)
    })
    done()
  })

  describe('Toaster sharing:', function() {
    it('should authenticate', (done) => {
      const req = {
        headers : {authorization: meToken}
      }
      const res = {
        status: function(s) {
          console.log('satus:',s)
          return this
        },
        jsonp: function(p) {console.log('jsonp:', p)}
      }
      csgrant.authenticate(req, res, ()=> {
        should.exist(req.user)
        req.user.should.equal('me')
        req.identities.length.should.equal(1)
        req.identities[0].should.equal('me')
        done()
      })
    })

    it('should be possible to add a toaster', (done) => {
      csgrant.createResource('me', 'toaster', {slots:2}, (e)=>{
        if(e)
          should.fail(e)
        eventsList.length.should.equal(1)
        eventsList[0].resource.should.equal('toaster')
        eventsList[0].operation.should.equal('create')
        eventsList[0].users.length.should.equal(1)
        eventsList[0].users[0].should.equal('me')
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
        identities: ['me']
      }
      const response = {
        status: function(st) {
          st.should.equal(200)
          return this
        },
        jsonp: function (r) {
          if(!r.success) {
            console.log('error:', r)
            should.fail('toaster not in all resources')
          }
          r.result.length.should.equal(1)
          r.result[0].name.should.equal('toaster')
          done()
        }
      }
       // combine 2 middleware
      csgrant.userResources(req, response, ()=>{
        req.userResources.length.should.equal(1)
        csgrant.allResources(req, response)
      })
    })

    it('creator should have access to resource', (done) => {
      const req = {
        user: 'me',
        identities: ['bob','me','alice']
      }
      const res = class ServerResponse {}
      const owns = csgrant.ownsResource("toaster", false)
      owns(req, res, ()=> {

        should.exist(req.user)
        req.user.should.equal('me')
        req.identities.length.should.equal(3)
        if (! 'bob', 'me', 'alice' in req.identities) {
          should.fail()
        }

        should.exist(req.resourceName)
        req.resourceName.should.equal('toaster')

        done()
      })
    })

    it('random users should not have access to resource', (done) => {
      const req = {
        user: 'me',
        identities: ['bob', 'alice']
      }

      const res =  {
        jsonp: function() {
          done()
        },
        status: function (code) {
          code.should.equal(401)
          return this
        }
      }

      const owns = csgrant.ownsResource("toaster", false)
      owns(req, res, ()=> {
      })
    })

    it('the resource can be obtain via a route', (done) => {
      const req = {
        user: 'me',
        identities: ['me'],
        resourceName: 'toaster',
      }

      const res = {
        jsonp: function (r) {
          if(!r.success) {
            should.fail('no toaster in resource route')
          }
          r.result.name.should.equal('toaster')
          r.result.data.slots.should.equal(2)
          done()
        }
      }
      const owns = csgrant.ownsResource("toaster", false )
       // we call the middleware, mocking the next() call to invoke
       // csgrant.resource with the req and res
      owns(req, res, ()=>{
        csgrant.resource(req, res)
      })

    })


    it('should be possible to share the toaster with joe', (done) => {
      eventsList = []
      const req = {
        headers:{authorization: meToken},
        user: 'me',
        identities: ['me'],
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
          eventsList.length.should.equal(1)
          eventsList[0].resource.should.equal('toaster')
          eventsList[0].operation.should.equal('grant')
          eventsList[0].users.length.should.equal(2)
          eventsList[0].users[0].should.equal('me')
          eventsList[0].users[1].should.equal('joe')
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
        identities: ['joe']
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
      // clear vents
      eventsList = []
      csgrant.updateResource('me', 'toaster', {slots:4}, (e) =>{
        if(e)
          should.fail(e)
        eventsList.length.should.equal(1)
        eventsList[0].operation.should.equal('update')
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
        identities: ['me'],
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
        identities: ['joe']
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
        identities: ['me'],
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
        identities: ['jack']
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
  })

  describe('User Deletion:', function() {

    // add a blender for testing resource permission after user deletion
    it('should be possible for jack to add a blender', (done) => {
      eventsList = []
      csgrant.createResource('jack', 'blender', {blades:5}, (e)=>{
        if(e) should.fail(e)
        done()
        eventsList.length.should.equal(1)
        eventsList[0].resource.should.equal('blender')
        eventsList[0].operation.should.equal('create')
      })
    })

    // verify blender is in the database
    it('db should have the blender', (done) => {
      eventsList = []
      csgrant.readResource('jack', 'blender', (e, resource ) =>{
        if(e) {
          should.fail(e)
        }
        else {
          resource.data.blades.should.equal(5, 'no data')
          const mePerm = resource.permissions[0]
          mePerm.username.should.equal('jack', 'jack not owner')
          mePerm.permissions.readOnly.should.equal(false, 'jack not owner!')
          // no new eventsList
          eventsList.length.should.equal(0)
          done()
        }
      })
    })

    // share with joe and give readOnly permission
    it('should be possible to share the blender with joe', (done) => {
      eventsList = []
      const req = {
        user: 'jack',
        identities: ['jack'],
        body: {
          grantee: 'joe',
          resource: 'blender',
          readOnly: true
        }
      }
      const response = {
        jsonp: function (r) {
          if(!r.success) {
            should.fail('cannot grant')
          }
          r.requester.should.equal('jack')
          eventsList.length.should.equal(1)
          eventsList[0].resource.should.equal('blender')
          eventsList[0].operation.should.equal('grant')
          done()
        }
      }
      csgrant.grant(req, response)
    })

    // verify joe has readOnly permission to blender
    it('joe should also have access to the blender', (done) => {
      eventsList = []
      csgrant.isAuthorized('joe', 'blender', true, (e, authorized) => {
        should.not.exist(e)
        authorized.should.equal(true)
        eventsList.length.should.equal(0)
        done()
      })
    })

    it('should be possible to see the database', (done) => {
      // get all the db
      const db = csgrant.copyInternalDatabase()
      // get a single elem
      const toaster = csgrant.copyInternalDatabase('toaster')
      // get unknown resource
      const friend = csgrant.copyInternalDatabase('imaginary_friend')
      should.exist(db.toaster)
      db.toaster.data.slots.should.equal(4)
      toaster.data.slots.should.equal(4)
      // empty friend, should be {}
      Object.keys(friend).length.should.equal(0)
      done()
    })

    // delete jack!
    it('should be possible to delete jack', (done) => {
      eventsList = []
      csgrant.deleteUser('jack', (e) => {
        should.not.exist(e)
        eventsList.length.should.equal(2)
        eventsList[0].resource.should.equal('toaster')
        eventsList[0].operation.should.equal('revoke')
        eventsList[1].resource.should.equal('blender')
        eventsList[1].operation.should.equal('revoke')
        done()
      })
    })

    // verify permissions on all resources that jack previously had access to:
    // blender and toaster
    it('resources should not have permissions for jack', (done) => {

      // the blender should be gone since it's shared with another user
      // who has readOnly permission
      csgrant.readResource('joe', 'blender', (e) =>{
         // blender resource will not be deleted. It'll be an orphan for now.
        should.not.exist(e)

        // toaster should still be accessible since jack only had readOnly
        // access to this resource
        csgrant.readResource('me', 'toaster', (e, resource ) =>{
          if(e) {
            should.fail(e)
          }
          else {
            resource.data.slots.should.equal(4, 'not updated')
            resource.name.should.equal('toaster', 'wrong resource')
            resource.permissions.length.should.equal(1, 'wrong number of permissions')
            resource.permissions[0].username.should.equal('me')
            resource.permissions[0].permissions.readOnly.should.equal(false)
            done()
          }
        })
      })
    })

    // remove the toaster
    it('should be possible to remove the toaster', (done) => {
      eventsList = []
      csgrant.deleteResource('me', 'toaster', (e)=>{
        if(e) should.fail(e)
        eventsList.length.should.equal(1)
        eventsList[0].resource.should.equal('toaster')
        eventsList[0].operation.should.equal('delete')
        done()
      })
    })

  })
})
