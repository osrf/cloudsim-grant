'use strict'

const token = require('./token')

// get a private / public key pair
var keys = token.generateKeys()


// make them dotenv friendly (replace new lines with \n)
const privEnv = keys.private.replace( new RegExp( "\n", "g" ),"\\n")
const pubEnv  = keys.public.replace( new RegExp( "\n", "g" ),"\\n")

console.log('CLOUDSIM_AUTH_PRIV_KEY="' + privEnv + '"')
console.log('CLOUDSIM_AUTH_PUB_KEY="' + pubEnv + '"')
console.log('CLOUDSIM_AUTH_URL=https://x.x.x.x:5050')

