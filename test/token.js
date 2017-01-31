'use strict'

const should = require('should')
const token = require('../token')

const log = function() {}
// const log = console.log

// new Date(new Date().getTime() + (60 * 60 * 24 * 30 * 6 * 1000)) - new Date(1501391161 * 1000)

const tokenData = {identities: ['admin']}
let keys

describe('<Unit Test token>', function() {

  describe('generate keys', function() {
    it('should be possible to generate keys', (done) => {
      keys = token.generateKeys()
      log('generated keys:', keys)
      if (!keys)
        should.fail('no keys')
      keys.public.should.containEql("-----BEGIN PUBLIC KEY-----", 'bad pub k')
      keys.private.should.containEql("-----BEGIN RSA PRIVATE KEY-----", 'bad priv k')
      done()
    })
    it('the token module should initialize', (done) => {
      token.initKeys(keys.public, keys.private)
      done()
    })
  })

  describe('generate token', function() {
    let tok
    const signDate = new Date()
    log('sign date:', signDate)
    it('should be possible to sign a token', (done) => {
      token.signToken(tokenData, (err, encoded) => {
        if(err)
          should.fail(err)
        tok = encoded
        log('tok:', tok)
        tok.should.String()
        tok.should.be.ok()
        done()
      })
    })
    let decoded
    it('should be possible to verify a token', (done) => {
      token.verifyToken(tok, (err, data) =>{
        if (err)
          should.fail(err)
        decoded = data
        log('decoded:', decoded)
        decoded.should.be.ok()
        decoded.should.have.property('identities', ['admin'])
        done()
      })
    })
    it('token should have expiration date', (done) => {
      decoded.should.have.property('exp')
      decoded.exp.should.be.a.Number('no expiry')
      // exp is in secs, date needs milisecs
      const expDate = new Date(decoded.exp * 1000)
      log('expiration date:', expDate)
      const duration =  expDate - signDate
      log('duration:', duration)
      duration.should.be.a.Number('wrong exp type')
      // expect 6 months before expiry:
      const fiveMonthsInMilisecs = 1.314e+10
      const sevenMonthsInMilisecs = 1.84e+10
      duration.should.be.greaterThan(fiveMonthsInMilisecs)
      duration.should.be.lessThan(sevenMonthsInMilisecs)
      done()
    })
  })
})
