'use strict'

const express = require('express')
const app = express()
const bodyParser = require("body-parser")
const cors = require('cors')
const morgan = require('morgan')
const dotenv = require('dotenv')
const http = require('http')

// cloudsim-specific
const csgrant = require('.')

// the configuration values are set in the local .env file
// this loads the .env content and puts it in the process environment.
dotenv.load()

// The Cross-Origin Resource Sharing standard
app.use(cors())
// Populates the body of each request
app.use(bodyParser.json())
// prints all requests to the terminal
app.use(morgan('combined'))

const httpServer = http.Server(app)

const adminIdentity = process.env.CLOUDSIM_ADMIN || 'admin-test'
const db = 'grant-test'
const port = process.env.PORT || 4444

app.get('/', function (req, res) {
  const v = require('./package.json').version
  const s = `
    <h1>Cloudsim grant test server</h1>
    <pre>
    cloudsim-grant v${v}
    </pre>
  `
  res.end(s)
})

csgrant.setPermissionsRoutes(app)

let resources = [
  {
    "name": "toasters",
    "data": {},
    "permissions": [
      {
        "username": "bob",
        "permissions": {
          "readOnly": false
        }
      }
    ]
  }
]

// share the server (for tests)
app.csgrant = csgrant
exports = module.exports = app

console.log('loading options.json...')
try {
  const options = require('./options.json')
  if (options.resources) {
    console.log('replacing default options with:' + options.resources)
    resources = options.resources
  }
}
catch(e) {
  console.log('Can\'t load ./options.json: ' + e)
}

// call init and serve when the database is loaded
csgrant.init(
  adminIdentity,
  resources,
  db,
  'localhost',
  httpServer,
  (err)=> {
    if(err) {
      console.log('Error loading resources: ' + err)
      process.exit(-2)
    }
    else {
      console.log('resources loaded')

      // start the server
      httpServer.listen(port, function(){
        console.log('listening on *:' + port);
      })
    }
  }
)

