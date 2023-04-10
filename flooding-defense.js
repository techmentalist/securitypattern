// flooding-defense.js
const pcap = require('pcap');
const windowSize = 1000;
const threshold = 0.9;
const learningRate = 0.1;

class FloodDetector {
  constructor(interface, maxPacketsPerSecond) {
    this.interface = interface;
    this.maxPacketsPerSecond = maxPacketsPerSecond;
    this.packetCounts = {};
    this.scores = {};
    this.blockedIPs = new Set();

    this.interface.on('packet', (rawPacket) => {
      const packet = pcap.decode.packet(rawPacket);
      const srcIP = packet.payload.payload.saddr.toString();

      if (!this.packetCounts[srcIP]) {
        this.packetCounts[srcIP] = [];
      }
      this.packetCounts[srcIP].push(1);

      if (this.packetCounts[srcIP].length > windowSize) {
        this.packetCounts[srcIP].shift();
      }

      const packetCount = this.packetCounts[srcIP].reduce((sum, count) => sum + count, 0);
      const packetsPerSecond = packetCount / windowSize;

      if (packetsPerSecond > this.maxPacketsPerSecond) {
        if (!this.blockedIPs.has(srcIP)) {
          this.blockedIPs.add(srcIP);
          console.log(`Flooding attack detected from ${srcIP}. Blocking traffic from this IP address.`);

          this.interface.block(srcIP);
        }
      }

      // Update the score for the current source IP
      if (!this.scores[srcIP]) {
        this.scores[srcIP] = 0.5;
      }

      const scoreDelta = packetsPerSecond / this.maxPacketsPerSecond - 1;
      const newScore = this.scores[srcIP] + learningRate * scoreDelta;

      if (newScore < 0) {
        this.scores[srcIP] = 0;
      } else if (newScore > 1) {
        this.scores[srcIP] = 1;
      } else {
        this.scores[srcIP] = newScore;
      }

      // Check if the source IP should be blocked based on its score
      if (this.scores[srcIP] >= threshold) {
        if (!this.blockedIPs.has(srcIP)) {
          this.blockedIPs.add(srcIP);
          console.log(`Flooding attack detected from ${srcIP}. Blocking traffic from this IP address.`);

          this.interface.block(srcIP);
        }
      }
    });
  }
}

class FloodDefender {
  constructor(interface, maxPacketsPerSecond) {
    this.interface = interface;
    this.maxPacketsPerSecond = maxPacketsPerSecond;
  }

  defend() {
    const detector = new FloodDetector(this.interface, this.maxPacketsPerSecond);
  }
}

module.exports = {
  FloodDefender,
};
