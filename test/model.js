'use strict'

const should = require('should')

// this is the db interface
const model = require('../model')

describe('<Unit Test grant database (model.js)>', function() {

  before(function(done) {
      model.clearDb()
      done()
  })

  describe('adding and sharing a resource:', function(){
    it('should have an empty db', (done) => {
      model.readDb((err, items)=>{
        if(err)
          should.fail(err)
        if(items.length != 0){
          should.fail("database not empty items: " + items.length)
        }
        else {
          done()
        }
      })
    })

    it('should have a toaster', (done) => {
      model.setResource('me', 'toaster', {slots:2})
      model.readDb((err, items)=>{
        if(err)
          should.fail(err)

        if(items.length != 1) {
          should.fail('no toaster added: (' + items.length + ' items)')
        }
        else {
          if(items[0].data.data.slots != 2)
            should.fail('not our toaster: ' + JSON.stringify(item[0]))
          done()
        }
      })
    })

    it('should be possible to share the toaster with joe', (done) => {
      model.grant('me', 'joe', 'toaster', true)
      model.readDb((err, items)=>{
        if(err)
          should.fail(err)

        should(items.length).be.eql(2, 'unshared' )
        done()
      })
    })

    it('should be possible to revoke the toaster for joe', (done) => {
      model.revoke('me', 'joe', 'toaster', true)
      model.readDb((err, items)=>{
        if(err)
          should.fail(err)
        should(items.length).be.eql(3, 'unrevoked' )
        done()
      })
    })

    it('should be possible to remove the toaster', (done) => {
      model.setResource('me', 'toaster')
      model.readDb((err, items)=>{
        if(err)
          should.fail(err)
        should(items.length).be.eql(4, 'undeletion' )
        done()
      })
    })
  })
})
