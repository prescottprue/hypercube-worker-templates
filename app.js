var port = process.env.PORT || 3000,
    http = require('http'),
    fs = require('fs'),
    s3 = require('s3'),
    s3Util = require('./lib/s3Util');

var log = function(entry) {
  fs.appendFileSync('/tmp/sample-app.log', new Date().toISOString() + ' - ' + entry + '\n');
};

var server = http.createServer(function (req, res) {
  if (req.method === 'POST') {
    var body = '';

    req.on('data', function(chunk) {
        body += chunk;
    });

    req.on('end', function() {
      if (req.url === '/message') {
        var templatesBucket = "hypercube-templates"
        var bucketName = body.split(":")[0];
        var templateName = body.split(":")[1] || "default";
        s3Util.copyBucketToBucket({name:"hypercube-templates", prefix:templateName}, {name:bucketName}).then(function(){
          res.writeHead(200, 'OK', {'Content-Type': 'text/plain'});
          res.end();
        }, function(err){
          log('Error uploading:' + JSON.stringify(err));
          res.status(400).send('Error copying template');
        })
      } else if (req.url = '/scheduled') {
        log('Received task ' + req.headers['x-aws-sqsd-taskname'] + ' scheduled at ' + req.headers['x-aws-sqsd-scheduled-at']);
        res.writeHead(200, 'OK', {'Content-Type': 'text/plain'});
        res.end();
      } else {
        res.writeHead(200, 'OK', {'Content-Type': 'text/plain'});
        res.end();
      }
    });
  } else {
    res.writeHead(200,'OK', {'Content-Type': 'text/plain'});
    res.end();
  }
});

// Listen on port 3000, IP defaults to 127.0.0.1
server.listen(port);

// Put a friendly message on the terminal
// console.log('Server running at http://127.0.0.1:' + port + '/');
