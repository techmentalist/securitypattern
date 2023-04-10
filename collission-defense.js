// collision-defense.js

const pcap = require('pcap');
const EventEmitter = require('events');

class NetworkInterface extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.sessions = {};
  }

  addSession(session) {
    this.sessions[session.addresses[1].addr] = session;
    session.on('packet', (rawPacket) => {
      this.emit('packet', session, pcap.decode.packet(rawPacket));
    });
  }

  sendPacket(packet, src, dst) {
    const session = this.sessions[src];
    if (!session) {
      console.error(`Session not found for ${src}`);
      return;
    }
    session.inject(packet, dst);
  }
}

class CollisionDetector {
  constructor(interface, address) {
    this.interface = interface;
    this.address = address;
    this.packet = Buffer.from('0'.repeat(32), 'hex');
    this.intervalId = null;
    this.busy = false;
    this.backoff = 0;
  }

  start() {
    this.intervalId = setInterval(() => {
      if (!this.busy) {
        // If the network is not busy, send the packet
        this.interface.sendPacket(this.packet, this.address, 'broadcast');
        this.busy = true;
      } else {
        // If the network is busy, back off and wait a random amount of time before trying again
        this.backoff = Math.floor(Math.random() * (Math.pow(2, this.backoff) - 1));
        setTimeout(() => {
          this.busy = false;
          this.backoff++;
        }, this.backoff * 1000);
      }
    }, 1000);
  }

  stop() {
    clearInterval(this.intervalId);
  }
}

module.exports = {
  NetworkInterface,
  CollisionDetector,
};
