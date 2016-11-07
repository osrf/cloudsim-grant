'use strict'

const should = require('should')

// this is the db interface
const model = require('../model')

describe('<Unit Test grant database (model.js)>', function() {

  before(function(done) {
    model.clearDb()
    done()
  })

  describe('numbering a resource:', function() {
    it('should have 3 characters for the number', (done) => {
      model.getNextResourceId('toto', (err, resId)=>{
        if(err)
          should.fail(err)
        if(resId.length != 8){
          should.fail("not the right size: " + resId)
        }
        else {
          done()
        }
      })
    })
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

  describe('connecting to database using url:', function(){
    it('should be able to connect to a db url', (done) => {
      model.setDatabaseUrl('127.0.0.1');
      model.readDb((err, items)=>{
        if(err)
          should.fail(err)
        should(items.length).be.eql(4, 'connection' )
        done()
      })
    })
  })

  describe('Datastore', function(){
    it('should not have data for new key on startup', (done) => {

      model.loadData('key-test', (err, data)=>{
        if(err)
          should.fail(err)
        if (!data)
          should.fail('no data')
        should(data).be.empty
        done()
      })
    })

    it('should be able save and load data', (done) => {

      // empty name, no good
      model.saveData('', {data:0}, (err) => {
        if (!err) {
          should.fail('save with empty name')
        }
      })

      // null name, no good
      model.loadData(null, (err, data) => {
        should.exist(err)
        should.not.exist(data)
      })

      // object with random string data
      const original = {data: "random: " +  Math.random()}

      model.saveData('key-test', original, (err) => {
        if(err)
          should.fail(err)
      })
      model.loadData('key-test', (err, copy)=>{
        if(err)
          should.fail(err)
        if (!copy)
          should.fail('no data')
        should(copy.data).be.eql(original.data, 'read error')
        done()
      })
    })

    it('should be able to override previously saved data', (done) => {

      let original

      model.loadData('key-test', (err, oldData)=>{
        if(err)
          should.fail(err)
        if (!oldData)
          should.fail('no data')
        original = oldData
      })

      // new object with random string data
      const newData = {data: "random: " +  Math.random()}
      should(newData).not.be.equal(original)

      model.saveData('key-test', newData, (err) => {
        if(err)
          should.fail(err)
      })

      model.loadData('key-test', (err, data)=>{
        if(err)
          should.fail(err)
        if (!data)
          should.fail('no data')
        should(data.data).be.equal(newData.data)
        done()
      })
    })
  })


})
