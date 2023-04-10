const mqtt = require('mqtt');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const UAV_TOPIC = 'uav/data';
const CLOUD_TOPIC = 'cloud/data';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'message_quality';
const MONGODB_COLLECTION_NAME = 'latency';
const MAX_LATENCY = 5000; // Maximum allowed latency in milliseconds
const HMAC_SECRET = 'my-secret-key'; // Secret key for HMAC signatures
const IV_LENGTH = 16; // Length of initialization vector for AES encryption

class ModificationDefender {
  constructor() {
    this.uavClient = mqtt.connect(UAV_BROKER_URL);
    this.cloudClient = mqtt.connect(CLOUD_BROKER_URL);

    this.uavClient.subscribe(UAV_TOPIC);
    this.cloudClient.subscribe(CLOUD_TOPIC);

    this.uavClient.on('message', this.onUAVMessage.bind(this));
    this.cloudClient.on('message', this.onCloudMessage.bind(this));

    MongoClient.connect(MONGODB_URL, (err, client) => {
      if (err) {
        console.error('Error connecting to MongoDB database', err);
        process.exit(1);
      }

      console.log('Connected to MongoDB database');
      const db = client.db(MONGODB_DATABASE_NAME);
      this.collection = db.collection(MONGODB_COLLECTION_NAME);
    });
  }

  onUAVMessage(topic, message) {
    const timestamp = Date.now();
    const encryptedMsg = this.encryptMessage(message);
    const hmac = this.createHmac(encryptedMsg);

    // Send message with HMAC signature to cloud
    const signedMsg = { message: encryptedMsg, hmac };
    this.cloudClient.publish(CLOUD_TOPIC, JSON.stringify(signedMsg));

    console.log(`Received message from UAV: ${message}`);
    console.log(`Encrypted message size: ${encryptedMsg.length}`);

    const latency = Date.now() - timestamp;
    console.log(`Latency: ${latency}`);

    if (latency > MAX_LATENCY) {
      console.log(`Latency too high: ${latency}`);
      return;
    }
    this.storeLatency(latency);
  }

  onCloudMessage(topic, message) {
    const timestamp = Date.now();
    const signedMsg = JSON.parse(message);
    const hmac = signedMsg.hmac;
    const encryptedMsg = signedMsg.message;

    // Verify HMAC signature before decrypting message
    if (!this.verifyHmac(encryptedMsg, hmac)) {
      console.error('HMAC signature is invalid');
      return;
    }

    let decryptedMsg;
    try {
      decryptedMsg = this.decryptMessage(encryptedMsg);
    } catch (err) {
      console.error('Error decrypting message', err);
      return;
    }

    // Check for modification attack
    if (this.checkForModification(decryptedMsg)) {
      console.error('Modification attack detected');
      return;
    }

    // Publish decrypted message to UAV
    this.uavClient.publish(UAV_TOPIC, decryptedMsg);

    console.log(`Received message from cloud: ${decryptedMsg}`);
    console.log(`Encrypted message size: ${encryptedMsg.length}`);

    const latency = Date.now() - timestamp;
    console.log(`Latency: ${latency}`);

    if (latency > MAX_LATENCY) {
      console.log(`Latency too high: ${latency}`);
      return;
    }

    this.storeLatency(latency);
  }

  checkForModification(message) {
    // Verify that message has not been modified
    const expectedHash = this.createHash(message);
    if (expectedHash !== this.lastHash) {
      this.lastHash = expectedHash;
      return true;
    }
    return false;
  }

  createHash(data) {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
  }

  async storeLatency(latency) {
    const document = { latency };
    try {
      await this.collection.insertOne(document);
      console.log(`Stored latency in MongoDB: ${latency}`);
    } catch (err) {
      console.error('Error storing latency in MongoDB', err);
    }
  }

  close() {
    this.uavClient.unsubscribe(UAV_TOPIC);
    this.cloudClient.unsubscribe(CLOUD_TOPIC);

    this.uavClient.end();
    this.cloudClient.end();
  }
}

module.exports = {
    ModificationDefender
};
