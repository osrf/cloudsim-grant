'use strict'

const should = require('should')
const csgrant = require('../index')

const log = function() {}
//const log = console.log

describe('<Unit Test misc>', function() {

  describe('Bitbucket PRs:', function() {
    it('should not work with wrong repo', (done) => {
      const req = {
      }
      const res = {
        status: function(s) {
          log('\n\n\nset request satus:',s)
          s.should.eql(404)
          done()
          return this
        }
      }
      // give a bad repo name
      const middleWare = csgrant.bitbucketBadgeOpenPrs('osrf/cloudsim-grantzz')
      middleWare (req, res)
    })
  })

  describe('Bitbucket PRs:', function() {
    it('should be able to use Bitbucket API to get PRs', (done) => {
      const req = {
      }
      const res = {
        setHeader: function (header, value) {
          log('\n\nset request header', header, value)
        },
        status: function(s) {
          log('\n\n\nset request satus:',s)
          return this
        },
        end: function(badge) {
          log('\n\nres:', badge)
          should.exist(badge)
          const index = badge.indexOf('pull requests')
          if (index === -1)
            should.fail('not a PR badge')
          done()
        }
      }
      const middleWare = csgrant.bitbucketBadgeOpenPrs('osrf/cloudsim-grant')
      middleWare (req, res)
    })
  })
})
