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
const dbName = 'cloudsim-grant' + (app.get('env') === 'test'? '-test': '')
const dbUrl = '127.0.0.1'
const port = process.env.PORT || 4444


function details() {
  const date = new Date()
  const pack = require('./package.json')
  const csgrantVersion = require('./package.json').version
  const env = app.get('env')

  const s = `
date: ${date}

${pack.name} version: ${pack.version}
${pack.description}
port: ${port}
cloudsim-grant version: ${csgrantVersion}
admin id: ${adminIdentity}
environment: ${env}
redis database name: ${dbName}
redis database url: ${dbUrl}
`
  return s

}

app.get('/', function (req, res) {
  const info = details()
  const s = `
    <h1>Cloudsim grant test server</h1>
    <pre>
    ${info}
    </pre>
  `
  res.end(s)
})

// write details to the console
console.log('============================================')
console.log(details())
console.log('============================================')

app.get('/', function (req, res) {
  const info = details()
  const s = `
    <h1>Cloudsim-sim server</h1>
    <div>Gazebo controller is running</div>
    <pre>
    ${info}
    </pre>
  `
  res.end(s)
})

csgrant.setId('toto')

csgrant.setPermissionsRoutes(app)

let resources = [
  {
    "server": "https://test.cloudsim.io",
    "type": "CREATE_RESOURCE",
    "name": "toto_resource",
    "creator": "bob",
    "data": {
      "txt": "toto_resource data"
    }
  },
]

// share the server (for tests)
app.csgrant = csgrant
exports = module.exports = app

console.log('loading options.json...')
try {
  const options = require('./options.json')
  if (options) {
    console.log('replacing default options with:' +
      JSON.stringify(options, null, 2)
    )
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
  dbName,
  dbUrl,
  httpServer,
  (err)=> {
    if(err) {
      console.log('Error loading resources: ' + err)
      process.exit(-2)
    }
    else {
      csgrant.dump()
      console.log('resources loaded')

      // start the server
      httpServer.listen(port, function(){
        console.log('listening on *:' + port);
      })
    }
  }
)

