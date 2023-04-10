// ddos-slowloris-defense.js
const net = require('net');
const TARGET_PORT = 80;
const MAX_CONNECTIONS = 1000;
const MAX_REQUESTS_PER_CONNECTION = 10;
const MAX_REQUEST_LENGTH = 1024;

function defendAgainstDDoSAndSlowLoris(target, port) {
  const server = net.createServer((client) => {
    let requestCount = 0;
    let requestData = '';

    client.on('data', (data) => {
      // Check if we have received too many requests on this connection
      if (requestCount >= MAX_REQUESTS_PER_CONNECTION) {
        client.destroy();
        return;
      }

      // Check if the request is too long
      if (data.length > MAX_REQUEST_LENGTH) {
        client.destroy();
        return;
      }

      // Append the request data to our buffer
      requestData += data.toString();

      // Check if the request is complete
      if (requestData.includes('\r\n\r\n')) {
        // Count the request and reset the data buffer
        requestCount++;
        requestData = '';

        // Check if we have too many connections
        if (server.connections > MAX_CONNECTIONS) {
          client.destroy();
          return;
        }

        // Forward the request to the target server
        const targetClient = net.connect(port, target, () => {
          targetClient.write(data);
        });

        targetClient.on('data', (data) => {
          client.write(data);
        });

        targetClient.on('end', () => {
          client.end();
        });

        targetClient.on('error', (error) => {
          console.error('Error forwarding request to target server:', error);
          client.destroy();
        });
      }
    });
  });

  server.on('error', (error) => {
    console.error('Server error:', error);
  });

  server.listen(TARGET_PORT, () => {
    console.log('Server started on port', TARGET_PORT);
  });
}

module.exports = {
  defendAgainstDDoSAndSlowLoris,
};
