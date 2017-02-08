'use strict'

//const pub = require('./.publickey.js').publicKey
const jwt = require('jsonwebtoken')
const dotenv = require('dotenv')
const NodeRSA = require('node-rsa')


let  publicKey = "not a key"
let  privateKey = "not a key"

// this function sets the keys. It is called automatically with
// the values found in the .env file. Only the test needs to
// call it directly.
exports.initKeys = function(publicK, privateK) {
  if (publicK)
    publicKey = publicK.replace(/\\n/g, "\n");
  if (privateK)
    privateKey = privateK.replace(/\\n/g, "\n");
}

// generates keys that can be used with jsonwebtoken
exports.generateKeys = function() {
  var key = new NodeRSA({b: 512, e: 5});

  key.setOptions({
    encryptionScheme: {
      scheme: 'pkcs1',
      label: 'Optimization-Service'
    },
    signingScheme: {
      saltLength: 25
    }
  });

  return {
    "private" : key.exportKey('pkcs1-private-pem'),
    "public"  : key.exportKey('pkcs8-public-pem')
  };
}


// sign a token. This is done by the server
// the private key is necessary
// the private key should only be on the auth server
exports.signToken = function (data, cb) {
  const options = {
    algorithm: 'RS256',
    // good for 6 months (in seconds)
    expiresIn: 60 * 60 * 24 * 180,
  }
  jwt.sign(data, privateKey, options, cb)
}

// verify a token... requires the public key of the server in the .env file
exports.verifyToken = function(token, cb) {
  jwt.verify(token, publicKey,  {algorithms: ['RS256']}, cb)
}

// read the environment variables. They contain the keys(s)
dotenv.config()

exports.initKeys(process.env.CLOUDSIM_AUTH_PUB_KEY,
                 process.env.CLOUDSIM_AUTH_PRIV_KEY,
                 process.env.CLOUDSIM_AUTH_URL)

if (!process.env.CLOUDSIM_AUTH_PUB_KEY || process.env.CLOUDSIM_AUTH_PUB_KEY === "") {
  console.warn('warning: CLOUDSIM_AUTH_PUB_KEY is empty!')
}

