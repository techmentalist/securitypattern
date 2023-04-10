const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');

const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const UAV_TOPIC = 'uav/data';
const CLOUD_TOPIC = 'cloud/data';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'message_quality';
const MONGODB_COLLECTION_NAME = 'rush_detection';
const MAX_UAVS = 10; // Maximum number of UAVs that can be registered
const MAX_DATA_REQUESTS = 10; // Maximum number of data requests per UAV
const MAX_PUBLISH_REQUESTS = 10; // Maximum number of publish requests per UAV


class RushDefender {
    constructor() {
      this.uavClient = mqtt.connect(UAV_BROKER_URL);
      this.cloudClient = mqtt.connect(CLOUD_BROKER_URL);
      this.serverClient = mqtt.connect(SERVER_BROKER_URL);
  
      this.uavClient.subscribe(UAV_TOPIC);
      this.cloudClient.subscribe(CLOUD_TOPIC);
      this.serverClient.subscribe(SERVER_TOPIC);
  
      this.uavs = new Set();
  
      this.uavClient.on('message', this.onUAVMessage.bind(this));
      this.cloudClient.on('message', this.onCloudMessage.bind(this));
      this.serverClient.on('message', this.onServerMessage.bind(this));
  
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
  
    onUAVMessage(topic, message) {
      // Check if the message is from a registered UAV
      if (!this.uavs.has(topic)) {
        console.error(`Message from unregistered UAV: ${topic}`);
        return;
      }
      const timestamp = Date.now();
      const encryptedMsg = this.encryptMessage(message);
      const hmac = this.createHmac(encryptedMsg);
  
      // Send message with HMAC signature to cloud
      const signedMsg = { message: encryptedMsg, hmac };
      this.cloudClient.publish(CLOUD_TOPIC, JSON.stringify(signedMsg));
  
      console.log(`Received message from UAV: ${message}`);
      console.log(`Encrypted message size: ${encryptedMsg.length}`);
  
      this.addToHistory({ message, hmac, timestamp });
  
      if (this.checkForReplay({ message, hmac, timestamp })) {
        console.error('Replay attack detected');
        return;
      }
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
      console.log(`Received message from cloud: ${decryptedMsg}`);
      console.log(`Encrypted message size: ${encryptedMsg.length}`);
      this.addToHistory({ message: decryptedMsg, hmac, timestamp });
      if (this.checkForReplay({ message: decryptedMsg, hmac, timestamp })) {
        console.error('Replay attack detected');
        return;
      }
  
      // Publish decrypted message to UAV
      this.uavClient.publish(UAV_TOPIC, decryptedMsg);
    }
  
    onServerMessage(topic, message) {
      // Ignore message if not from the server
      if (topic !== SERVER_TOPIC) return;
  
      console.log(`Received message from server: ${message}`);
  
      const target = JSON.parse(message);
  
      // Disconnect all UAVs except for those targeting the specified location
      for (const uav of this.uavs) {
        if (!this.isTargeting(uav, target)) {
          this.disconnectUAV(uav);
        }
      }
    }
  
    isTargeting(uav, target) {
     
        return uav.target === target;
    }
  
    async defend() {
        // Connect to MQTT broker
        const client = mqtt.connect(MQTT_BROKER_URL);
        await new Promise(resolve => client.on('connect', resolve));
        console.log('Connected to MQTT broker');
      
        // Subscribe to relevant topics
        client.subscribe(UAV_DATA_TOPIC);
        client.subscribe(CLOUD_DATA_TOPIC);
        client.subscribe(TARGET_TOPIC);
        console.log('Subscribed to topics');
      
        const uavs = {};
        const targets = new Set();
      
        client.on('message', async (topic, message) => {
          if (topic === UAV_DATA_TOPIC) {
            const { uavId, data } = JSON.parse(message);
            if (!uavs[uavId]) {
              console.log(`New UAV registered: ${uavId}`);
              uavs[uavId] = { lastRequestTime: 0 };
            }
      
            uavs[uavId].lastRequestTime = Date.now();
      
            // Check if the UAV is targeting any of the known targets
            const targeting = Array.from(targets).filter(target => {
              return isTargeting(uavs[uavId], target);
            });
      
            if (targeting.length > 0) {
              console.log(`UAV ${uavId} is targeting: ${targeting.join(', ')}`);
      
              // Send alert to security team
              const alert = { uavId, targets: targeting };
              await sendAlert(alert);
            }
          } else if (topic === CLOUD_DATA_TOPIC) {
            const data = JSON.parse(message);
      
            // Check if the data is targeting any of the known targets
            const targeting = Array.from(targets).filter(target => {
              return isTargeting(data, target);
            });
      
            if (targeting.length > 0) {
              console.log(`Cloud data is targeting: ${targeting.join(', ')}`);
      
              // Send alert to security team
              const alert = { targets: targeting };
              await sendAlert(alert);
            }
          } else if (topic === TARGET_TOPIC) {
            // Add target to set of known targets
            targets.add(message);
            console.log(`New target added: ${message}`);
          }
        });
      
        // Check for idle UAVs
        setInterval(() => {
          const now = Date.now();
          Object.entries(uavs).forEach(([uavId, uavData]) => {
            if (now - uavData.lastRequestTime > MAX_IDLE_TIME) {
              console.log(`UAV ${uavId} has been idle for too long`);
              delete uavs[uavId];
            }
          });
        }, CHECK_IDLE_INTERVAL);
      }
      
  
    publishAlert({ target, timestamp }) {
      // Publish attack alert to cloud
      const alertMsg = { target, timestamp };
      this.cloudClient.publish(ALERT_TOPIC, JSON.stringify(alertMsg));
    }
  
    disconnectUavs() {
      // Disconnect all registered UAVs
      this.uavs.forEach(uav => {
        this.uavClient.unsubscribe(`${UAV_TOPIC}/${uav.id}`);
      });
      this.uavs = [];
    }
  
    close() {
      this.uavClient.end();
      this.cloudClient.end();
    }
  }
  
  module.exports = {
    RushDefender,
  };
    