const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');

const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'spof_detection';
const MONGODB_COLLECTION_NAME = 'spof_events';
const MAX_UAVS = 10; // Maximum number of UAVs that can be registered
const MAX_DATA_REQUESTS = 10; // Maximum number of data requests per UAV
const MAX_PUBLISH_REQUESTS = 10; // Maximum number of publish requests per UAV
const EVENT_INTERVAL = 10000; // Interval between SPOF event checks
const UAV_IDLE_TIMEOUT = 60000; // Time in ms before considering UAV idle

class SpofDefender {
    constructor() {
        this.uavClient = mqtt.connect(UAV_BROKER_URL);
        this.cloudClient = mqtt.connect(CLOUD_BROKER_URL);

        this.uavClient.on('connect', () => {
            this.uavs = new Map();
            for (let i = 0; i < MAX_UAVS; i++) {
                const uavId = `UAV${i + 1}`;
                this.uavs.set(uavId, {
                    lastDataRequest: Date.now(),
                    lastPublishRequest: Date.now(),
                    idleTimeout: null,
                });
                this.uavClient.subscribe(`${uavId}/data`);
            }
            this.startEventInterval();
        });

        this.cloudClient.on('message', this.onCloudMessage.bind(this));
        this.uavClient.on('message', this.onUAVMessage.bind(this));

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

    onCloudMessage(topic, message) {
        const data = JSON.parse(message);

        // Check for SPOF events
        const event = this.detectSpofEvent(data);
        if (event) {
            console.error('SPOF event detected:', event);
            this.publishAlert(event);
        }
    }

    onUAVMessage(topic, message) {
        const uavId = topic.split('/')[0];
        const data = JSON.parse(message);

        // Check for SPOF events
        const event = this.detectSpofEvent(data);
        if (event) {
            console.error(`SPOF event detected on UAV${uavId}:`, event);
            this.publishAlert(event);
        }

        // Reset idle timeout when receiving data
        const uavData = this.uavs.get(uavId);
        if (uavData) {
            uavData.idleTimeout = null;
        }
    }

    detectSpofEvent(data) {
        // Check for single point of failure events
        if (data.cpuUsage > 90) {
            return { type: 'high_cpu_usage', data };
        }
        if (data.memoryUsage > 90) {
            return { type: 'high_memory_usage', data };
        }
        if (data.diskUsage > 90) {
            return { type: 'high_disk_usage', data };
        }
        if (data.networkUsage > 90) {
            return { type: 'high_network_usage', data };
        }

        setInterval(() => {
            const idleUAVs = new Set(this.uavs);
            this.uavClient.publish('data/request', JSON.stringify({ numRequests: MAX_DATA_REQUESTS }));
            this.uavClient.publish('publish/request', JSON.stringify({ numRequests: MAX_PUBLISH_REQUESTS }));

            setTimeout(() => {
                // Remove UAVs that have responded
                this.uavs.forEach(uavId => {
                    idleUAVs.delete(uavId);
                });

                // Check if any UAVs are idle
                if (idleUAVs.size > 0) {
                    console.error(`SPOF event detected: idle UAVs (${Array.from(idleUAVs).join(', ')})`);
                    this.publishAlert({ type: 'idle_uavs', data: Array.from(idleUAVs) });
                }
            }, MAX_DATA_REQUESTS + MAX_PUBLISH_REQUESTS + 1000); // Wait for requests to complete and add 1 second buffer
        }, EVENT_INTERVAL);

    }
}

module.exports = {
    SpofDefender,
};
