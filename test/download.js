'use strict'

const supertest = require('supertest');
const csgrant = require('../index')

let agent

const filePath = __dirname + '/csgrant-test.tar.gz'

describe('<Unit Test download>', function() {

  before(function(done) {
    done()
  })

  before(function(done) {
    const express = require('express')
    const bodyParser = require('body-parser')
    const testApp = express()
    const testHttpServer = require('http').Server(testApp)
    testApp.use(bodyParser.json())
    agent = supertest.agent(testHttpServer)
    testApp.get('/download',
      (req, res, next) => {
        req.fileInfo = {
          path: req.body.path,
          name: req.body.name,
          type: req.body.type
        }
        next()
      },
      csgrant.downloadFilePath)
    testHttpServer.listen(1234, () => {
      done()
    })
  })

  describe('Download file:', function() {
    it('should be able to download file', (done) => {

      console.log ('filePath ' + filePath)
      agent
      .get('/download')
      .set('Accept', 'application/json')
      .send({
        path: filePath,
        name: 'test.tar.gz',
        type: 'application/gzip'
      })
      .end(function(err,res) {
        console.log(JSON.stringify(res))
        res.status.should.be.equal(200)
        res.header['content-type'].should.equal('application/gzip')
        res.header['content-disposition'].indexOf('test.tar.gz')
          .should.be.greaterThan(0)
        done()
      })
    })
  })
})
