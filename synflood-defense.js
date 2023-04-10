const mqtt = require('mqtt');
const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const MAX_UAVS = 10; // Maximum number of UAVs that can be registered
const DETECTION_INTERVAL = 5000; // Interval between SYN flood attack detections
const SYN_THRESHOLD = 5; // Number of SYN packets per second above which an attack is detected

class SynFloodDefender {
    constructor() {
      this.uavClient = mqtt.connect(UAV_BROKER_URL);
      this.cloudClient = mqtt.connect(CLOUD_BROKER_URL);
  
      this.uavClient.on('connect', () => {
        this.uavs = new Set();
        for (let i = 0; i < MAX_UAVS; i++) {
          const uavId = `UAV${i + 1}`;
          this.uavs.add(uavId);
          this.uavClient.subscribe(`${uavId}/data`);
        }
      });
  
      this.cloudClient.on('message', this.onCloudMessage.bind(this));
      this.uavClient.on('message', this.onUAVMessage.bind(this));
  
      this.synFloodDetected = false;
  
      setInterval(this.detectSynFlood.bind(this), DETECTION_INTERVAL);
    }
  
    onCloudMessage(topic, message) {
      console.error('Unexpected message from cloud:', message);
    }
  
    onUAVMessage(topic, message) {
      // do nothing
    }
  
    detectSynFlood() {
      // Collect data from UAVs
      const dataPromises = Array.from(this.uavs).map((uavId) => {
        return new Promise((resolve, reject) => {
          this.uavClient.publish(
            `${uavId}/syn/request`,
            '',
            { qos: 1 },
            (err) => {
              if (err) {
                reject(err);
              } else {
                this.uavClient.once(`${uavId}/syn`, (message) => {
                  resolve({ uavId, message });
                });
              }
            }
          );
        });
      });
  
      // Analyze data for SynFlood attack
      Promise.all(dataPromises)
        .then((results) => {
          const numUAVs = results.length;
  
          const synCounts = new Map();
          results.forEach((result) => {
            const uavId = result.uavId;
            const message = JSON.parse(result.message);
            const synCount = message.count || 0;
            synCounts.set(uavId, synCount);
          });
  
          const maxSynCount = Math.max(...synCounts.values());
  
          if (maxSynCount >= SYN_THRESHOLD) {
            this.synFloodDetected = true;
            console.error(`SYN flood detected: ${maxSynCount} requests`);
            this.publishAlert({
              type: 'syn_flood',
              data: { count: maxSynCount },
            });
          } else {
            this.synFloodDetected = false;
          }
        })
        .catch((err) => {
          console.error('Error collecting data from UAVs', err);
        });
    }
  
    publishAlert(event) {
      if (this.synFloodDetected) {
        // Save event to MongoDB
        this.collection.insertOne(event, (err) => {
          if (err) {
            console.error('Error saving event to database', err);
          }
        });
  
        // Publish alert to cloud
        this.cloudClient.publish('synflood/alert', JSON.stringify(event));
      }
    }
  
    defend() {
      // Check for SynFlood attack
      setInterval(this.detectSynFlood.bind(this), DETECTION_INTERVAL);
    }
  }
  
  module.exports = {
    SynFloodDefender,
  };
  