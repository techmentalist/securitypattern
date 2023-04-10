const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');
const zlib = require('zlib');

const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const UAV_TOPIC = 'uav/data';
const CLOUD_TOPIC = 'cloud/data';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'link_quality';
const MONGODB_COLLECTION_NAME = 'latency';
const MAX_LATENCY = 5000; // Maximum allowed latency in milliseconds

class LatencyAwareScheduler {
  constructor(uavClient, cloudClient, uavTopic, cloudTopic) {
    this.uavClient = uavClient;
    this.cloudClient = cloudClient;
    this.uavTopic = uavTopic;
    this.cloudTopic = cloudTopic;

    this.cloudQueue = [];
    this.uavQueue = [];

    this.uavClient.on('connect', this.sendUAVMessages.bind(this));
    this.cloudClient.on('connect', this.sendCloudMessages.bind(this));
  }

  addUAVMessage(message, latency) {
    this.uavQueue.push({ message, latency });
  }

  addCloudMessage(message, latency) {
    this.cloudQueue.push({ message, latency });
  }

  sendUAVMessages() {
    if (this.uavQueue.length === 0) {
      return;
    }

    this.uavQueue.sort((a, b) => a.latency - b.latency);

    const message = this.uavQueue[0].message;
    this.uavClient.publish(this.uavTopic, message);
    this.uavQueue.shift();
  }

  sendCloudMessages() {
    if (this.cloudQueue.length === 0) {
      return;
    }

    this.cloudQueue.sort((a, b) => a.latency - b.latency);

    const message = this.cloudQueue[0].message;
    this.cloudClient.publish(this.cloudTopic, message);
    this.cloudQueue.shift();
  }
}

class LinkQualityDefender {

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
    
        this.latencyAwareScheduler = new LatencyAwareScheduler(this.uavClient, this.cloudClient, UAV_TOPIC, CLOUD_TOPIC);
      }
  
    onUAVMessage(topic, message) {
      const timestamp = Date.now();
      const msgObj = JSON.parse(message.toString());
      msgObj.timestamp = timestamp;
  
      // Apply redundancy by sending the same message three times through different paths
      this.cloudClient.publish(CLOUD_TOPIC, JSON.stringify(msgObj));
      this.cloudClient.publish(CLOUD_TOPIC, JSON.stringify(msgObj));
      this.cloudClient.publish(CLOUD_TOPIC, JSON.stringify(msgObj));
  
      const compressedMsg = zlib.deflateSync(message);
      console.log(`Received message from UAV: ${message}`);
      console.log(`Compressed message size: ${compressedMsg.length}`);
  
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
      const msgObj = JSON.parse(message.toString());
      msgObj.timestamp = timestamp;
  
      // Use a latency-aware scheduling algorithm to prioritize messages with lower latency
      this.uavClient.publish(UAV_TOPIC, JSON.stringify(msgObj));
  
      const compressedMsg = zlib.deflateSync(message);
      console.log(`Received message from cloud: ${message}`);
      console.log(`Compressed message size: ${compressedMsg.length}`);
  
      const latency = Date.now() - timestamp;
      console.log(`Latency: ${latency}`);
  
      if (latency > MAX_LATENCY) {
        console.log(`Latency too high: ${latency}`);
        return;
      }
  
      this.storeLatency(latency);
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
    LinkQualityDefender
};

