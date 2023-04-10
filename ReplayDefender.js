const mqtt = require('mqtt');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const UAV_TOPIC = 'uav/data';
const CLOUD_TOPIC = 'cloud/data';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'message_quality';
const MONGODB_COLLECTION_NAME = 'replay_detection';
const WINDOW_SIZE = 100; // Size of message history window
const MAX_DELAY = 5000; // Maximum allowed delay in milliseconds
const HMAC_SECRET = 'my-secret-key'; // Secret key for HMAC signatures
const IV_LENGTH = 16; // Length of initialization vector for AES encryption

class ReplayDefender {
    // constructor and onUAVMessage and onCloudMessage methods are defined here...
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
          this.window = new Array(WINDOW_SIZE);
          this.head = 0;
          this.tail = 0;
        });
      }

    checkForReplay(msg) {
      // Check for message replay using window of recent messages
      for (let i = this.head; i !== this.tail; i = (i + 1) % WINDOW_SIZE) {
        const prevMsg = this.window[i];
        if (!prevMsg) continue;
        const prevHmac = prevMsg.hmac;
        const prevTimestamp = prevMsg.timestamp;
        const timeDiff = msg.timestamp - prevTimestamp;
        if (timeDiff <= MAX_DELAY && this.verifyHmac(msg.message, prevHmac)) {
          return true;
        }
      }
  
      return false;
    }
  
    addToHistory(msg) {
      // Add message to history window
      this.window[this.tail] = msg;
      this.tail = (this.tail + 1) % WINDOW_SIZE;
      if (this.tail === this.head) {
        // Remove oldest message if window is full
        this.head = (this.head + 1) % WINDOW_SIZE;
      }
    }
  
    createHmac(data) {
      const hmac = crypto.createHmac('sha256', HMAC_SECRET);
      hmac.update(data);
      return hmac.digest('hex');
    }
  
    verifyHmac(data, hmac) {
      return hmac === this.createHmac(data);
    }
  
    encryptMessage(message) {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-cbc', HMAC_SECRET, iv);
      let encrypted = cipher.update(message, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + encrypted;
    }
  
    decryptMessage(encrypted) {
      const iv = Buffer.from(encrypted.slice(0, IV_LENGTH * 2), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', HMAC_SECRET, iv);
      let decrypted = decipher.update(encrypted.slice(IV_LENGTH * 2), 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
  
    async storeDetection() {
      const document = { timestamp: new Date() };
      try {
        await this.collection.insertOne(document);
        console.log('Stored replay detection in MongoDB');
      } catch (err) {
        console.error('Error storing replay detection in MongoDB', err);
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
    ReplayDefender,
  };
  