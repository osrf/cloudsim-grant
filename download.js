
// middleware function to download
// a single file.
// req.fileInfo should be populated with
//   path: full path of the file
//   type: the MIME type
//   name: the name of the file, as seen by the browser
exports.downloadFilePath = function (req, res) {
console.log('downloadFilePath')
  if(!req.fileInfo) {
    const msg = 'Internal Server Error: file informatino not in request'
    console.log(msg, filePath)
    return res.satus(500).end(msg)
  }

  // req.fileInfo might be a string, or an object with a path property
  const filePath = req.fileInfo.path?req.fileInfo.path:req.fileInfo
  // req may contain a MIME type (zip by default)
  const contentType = req.fileInfo.type?req.fileInfo.type:'application/zip'
  // the file may have a name to be saved to when downloaded
  const x = req.fileInfo.name
  const dName = x?x:path.basename(filePath)

  // load and serve the file
  fs.stat(filePath, function(err, stat) {
    if(err) {
        if('ENOENT' === err.code) {
            res.statusCode = 404
            console.log('file "' + filePath + '" not found')
            return res.end('Not Found');
        }
    } else {
      res.setHeader('Content-type', 'application/zip')
      const f = path.basename(filePath)
      res.setHeader('Content-disposition', 'attachment; filename=' + f)
      res.setHeader('Content-Length', stat.size)
      var stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('error', function() {
          const msg = 'Internal Server Error while reading "' + dName  + '"'
          console.log(msg, filePath)
          return res.status(500).end(msg)
      })
      stream.on('end', function() {
          console.log('"' + filePath + '" downloaded')
          return res.end();
      })
    }
  })
}

