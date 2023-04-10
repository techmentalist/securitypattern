const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');
const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'wormhole_detection';
const MONGODB_COLLECTION_NAME = 'wormhole_events';
const MAX_UAVS = 10; // Maximum number of UAVs that can be registered
const DETECTION_INTERVAL = 10000; // Interval between wormhole attack detections
const DISTANCE_THRESHOLD = 100; // Distance threshold in meters above which an attack is detected

class WormholeDefender {
    constructor() {
        this.uavClient = mqtt.connect(UAV_BROKER_URL);
        this.cloudClient = mqtt.connect(CLOUD_BROKER_URL);

        this.uavClient.on('connect', () => {
            this.uavs = new Set();
            for (let i = 0; i < MAX_UAVS; i++) {
                const uavId = `UAV${i + 1}`;
                this.uavs.add(uavId);
                this.uavClient.subscribe(`${uavId}/gps`);
            }
        });

        this.cloudClient.on('message', this.onCloudMessage.bind(this));
        this.uavClient.on('message', this.onUAVMessage.bind(this));

        setInterval(this.detectWormhole.bind(this), DETECTION_INTERVAL);

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
        // do nothing
    }

    calculateDistance(gps1, gps2) {
        // Haversine formula for computing distance between two GPS coordinates
        const R = 6371000; // Earth's radius in meters
        const φ1 = gps1.lat * Math.PI / 180; // φ, λ in radians
        const φ2 = gps2.lat * Math.PI / 180;
        const Δφ = (gps2.lat - gps1.lat) * Math.PI / 180;
        const Δλ = (gps2.lon - gps1.lon) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in meters
        return d;
    }

    detectWormhole() {
        // Collect GPS data from UAVs
        const gpsPromises = Array.from(this.uavs).map(uavId => {
            return new Promise((resolve, reject) => {
                this.uavClient.publish(`${uavId}/gps/request`, '', { qos: 1 }, err => {
                    if (err) {
                        reject(err);
                    } else {
                        this.uavClient.once(`${uavId}/gps`, message => {
                            const gps = JSON.parse(message);
                            resolve({ uavId, gps });
                        });
                    }
                });
            });
        });

        // Analyze data for wormhole attack
        Promise.all(gpsPromises).then(results => {
            const numUAVs = results.length;

            const distances = new Map();
            for (let i = 0; i < numUAVs; i++) {
                for (let j = i + 1; j < numUAVs; j++) {
                    const uavId1 = results[i].uavId;
                    const uavId2 = results[j].uavId;
                    const gps1 = results[i].gps;
                    const gps2 = results[j].gps;
                    const distance = this.calculateDistance(gps1, gps2);
                    distances.set(`${uavId1}-${uavId2}`, distance);
                }
            }

            const minDistance = Math.min(...distances.values());
            if (minDistance <= WORMHOLE_DISTANCE_THRESHOLD) {
                console.error(`Potential wormhole attack detected: ${minDistance.toFixed(2)} meters`);
                this.publishAlert({ type: 'wormhole', data: { distance: minDistance } });
            }
        }).catch(err => {
            console.error('Error collecting GPS data from UAVs', err);
        });
    }
    // Calculate distance between two GPS coordinates using Haversine formula
    calculateDistance(gps1, gps2) {
        const R = 6371e3; // Earth's radius in meters
        const phi1 = (gps1.latitude * Math.PI) / 180;
        const phi2 = (gps2.latitude * Math.PI) / 180;
        const deltaPhi = ((gps2.latitude - gps1.latitude) * Math.PI) / 180;
        const deltaLambda = ((gps2.longitude - gps1.longitude) * Math.PI) / 180;

        const a =
            Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const d = R * c;
        return d;
    }

    publishAlert(event) {
        // Save event to MongoDB
        this.collection.insertOne(event, (err) => {
            if (err) {
                console.error('Error saving event to database', err);
            }
        });

        // Publish alert to cloud
        this.cloudClient.publish('wormhole/alert', JSON.stringify(event));
    }

    defend() {
        // Check for wormhole attack
        setInterval(this.detectWormholeAttack.bind(this), DETECTION_INTERVAL);
    }

}

module.exports = {
    WormholeDefender,
};


