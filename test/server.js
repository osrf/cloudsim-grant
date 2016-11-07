'use strict'

const express = require('express')
const app = express()
const bodyParser = require("body-parser")
const cors = require('cors')
const morgan = require('morgan')
const dotenv = require('dotenv')
const http = require('http')

// cloudsim-specific
const csgrant = require('cloudsim-grant')

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

const user = 'admin'
const db = 'grant-test'
const port = 5555
const resources = {
  toasters : {}
}

app.get('/', function (req, res) {
  const v = require('../package.json').version
  const s = `
    <h1>Cloudsim-grant test server</h1>
    <pre>
    cloudsim-grant v${v}
    </pre>
  `
  res.end(s)
})

csgrant.setPermissionsRoutes(app)

csgrant.init(user,
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

