// deauth-defense.js
const pcap = require('pcap');
const EventEmitter = require('events');
const { WifiInterface } = require('./wifi-interface');

class DeauthDetector extends EventEmitter {
  constructor(interface, target) {
    super();
    this.interface = interface;
    this.target = target;
    this.packets = [];

    this.interface.on('packet', (rawPacket) => {
      const packet = pcap.decode.packet(rawPacket);
      if (packet.payload.payload.payload.type === 0x00a) {
        this.packets.push(packet);
        if (this.packets.length === 2) {
          this.checkForDeauthAttack();
        }
      }
    });
  }

  checkForDeauthAttack() {
    const [packet1, packet2] = this.packets;
    if (packet1.payload.payload.payload.addr1 === this.target &&
        packet2.payload.payload.payload.addr1 === this.target &&
        packet1.payload.payload.payload.addr2 === packet2.payload.payload.payload.addr2 &&
        packet1.payload.payload.payload.addr3 === packet2.payload.payload.payload.addr3) {
      this.emit('deauth', packet1, packet2);
    }
    this.packets = [];
  }
}

class DeauthDefender {
  constructor(interface, target) {
    this.interface = interface;
    this.target = target;
  }

  defend() {
    const detector = new DeauthDetector(this.interface, this.target);
    detector.on('deauth', (packet1, packet2) => {
      console.log(`Deauthentication attack detected against ${this.target}`);
      const mac = packet1.payload.payload.payload.addr2;
      this.interface.block(mac);
    });
  }
}

module.exports = {
  DeauthDefender,
};

// wifi-interface.js

const exec = require('child_process').exec;

class WifiInterface {
  constructor(name) {
    this.name = name;
  }

  block(mac) {
    exec(`iw dev ${this.name} station del ${mac}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Failed to block MAC address: ${mac}`, error);
        return;
      }
      console.log(`Blocked MAC address: ${mac}`);
    });
  }

  createSession() {
    const session = pcap.createSession(this.name, {
      filter: 'type mgt subtype beacon or type mgt subtype probe-req or type mgt subtype probe-resp or type data subtype data',
    });
    return session;
  }

  start() {
    const session = this.createSession();
    session.on('packet', (rawPacket) => {
      this.emit('packet', rawPacket);
    });
  }
}

module.exports = {
  WifiInterface,
};
