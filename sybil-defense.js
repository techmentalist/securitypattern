const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');

const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'sybil_detection';
const MONGODB_COLLECTION_NAME = 'sybil_events';
const MAX_UAVS = 10; // Maximum number of UAVs that can be registered
const DEVIATION_MULTIPLIER = 2; // Multiplier used to determine threshold values
const DETECTION_INTERVAL = 10000; // Interval between Sybil UAV detections

class SybilDefender {
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

        this.sybilUAVs = new Set();

        setInterval(this.detectSybilUAVs.bind(this), DETECTION_INTERVAL);

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
        console.error('Unexpected message from cloud:', message);
    }

    onUAVMessage(topic, message) {
        const uavId = topic.split('/')[0];

        if (this.sybilUAVs.has(uavId)) {
            // Sybil UAV detected
            console.error(`Sybil UAV detected: ${uavId}`);
            this.publishAlert({ type: 'sybil_uav', data: uavId });
        }
    }

    detectSybilUAVs() {
        // Collect data from UAVs
        const dataPromises = Array.from(this.uavs).map(uavId => {
            return new Promise((resolve, reject) => {
                this.uavClient.publish(`${uavId}/data/request`, '', { qos: 1 }, err => {
                    if (err) {
                        reject(err);
                    } else {
                        this.uavClient.once(`${uavId}/data`, (message) => {
                            const data = JSON.parse(message);
                            resolve({ uavId, data });
                        });
                    }
                });
            });
        });

        // Analyze data for Sybil UAVs
        Promise.all(dataPromises).then(results => {
            const numUAVs = results.length;

            // Calculate average values for each property across all UAVs
            const averages = {};
            results.forEach(result => {
                const data = result.data;
                Object.keys(data).forEach(property => {
                    if (typeof data[property] === 'number') {
                        averages[property] = (averages[property] || 0) + data[property] / numUAVs;
                    }
                });
            });

            // Calculate standard deviations for each property across all UAVs
            results.forEach(result => {
                const data = result.data;
                Object.keys(data).forEach(property => {
                    if (typeof data[property] === 'number') {
                        deviations[property] = (deviations[property] || 0) + (data[property] - averages[property]) ** 2 / numUAVs;
                    }
                });
            });

            Object.keys(deviations).forEach(property => {
                deviations[property] = Math.sqrt(deviations[property]);
            });

            // Determine threshold values for each property
            const thresholds = {};
            Object.keys(averages).forEach(property => {
                thresholds[property] = averages[property] + DEVIATION_MULTIPLIER * deviations[property];
            });

            // Detect Sybil UAVs
            results.forEach(result => {
                const data = result.data;
                const isSybil = Object.keys(data).some(property => {
                    if (typeof data[property] === 'number' && property !== 'timestamp') {
                        return data[property] > thresholds[property];
                    }
                    return false;
                });
                if (isSybil) {
                    const uavId = result.uavId;
                    console.error(`Potential Sybil UAV detected: ${uavId}`);
                    this.sybilUAVs.add(uavId);
                }
            });
        }).catch(err => {
            console.error('Error collecting data from UAVs', err);
        });
    }

    publishAlert(event) {
        // Save event to MongoDB
        this.collection.insertOne(event, err => {
            if (err) {
                console.error('Error saving event to database', err);
            }
        });

        // Publish alert to cloud
        this.cloudClient.publish('sybil/alert', JSON.stringify(event));
    }

    defend() {
        // Check for idle UAVs
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

        // Check for Sybil UAVs
        setInterval(this.detectSybilUAVs.bind(this), DETECTION_INTERVAL);
    }
}

module.exports = {
    SybilDefender,
};    