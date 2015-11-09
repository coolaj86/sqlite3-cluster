var cluster = require('cluster');

if (cluster.isMaster) {
  require('./test-cluster-master');
}
else {
  require('./test-cluster-worker');
}
