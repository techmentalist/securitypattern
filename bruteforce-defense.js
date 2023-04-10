const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');

const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'bruteforce_detection';
const MONGODB_COLLECTION_NAME = 'bruteforce_events';
const MAX_UAVS = 10; // Maximum number of UAVs that can be registered
const DETECTION_INTERVAL = 5000; // Interval between brute force attack detections
const LOGIN_ATTEMPTS_THRESHOLD = 3; // Number of failed login attempts above which an attack is detected

class BruteForceDefender {
    constructor() {
        this.uavClient = mqtt.connect(UAV_BROKER_URL);
        this.cloudClient = mqtt.connect(CLOUD_BROKER_URL);

        this.uavClient.on('connect', () => {
            this.uavs = new Set();
            for (let i = 0; i < MAX_UAVS; i++) {
                const uavId = `UAV${i + 1}`;
                this.uavs.add(uavId);
                this.uavClient.subscribe(`${uavId}/login`);
            }
        });

        this.cloudClient.on('message', this.onCloudMessage.bind(this));
        this.uavClient.on('message', this.onUAVMessage.bind(this));

        setInterval(this.detectBruteForceAttack.bind(this), DETECTION_INTERVAL);

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

    detectBruteForceAttack() {
        // Collect authentication data from UAVs
        const authPromises = Array.from(this.uavs).map((uavId) => {
            return new Promise((resolve, reject) => {
                this.uavClient.publish(
                    `${ uavId } / auth / request`,
                    '',
                    { qos: 1 },
                    (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            this.uavClient.once(`${ uavId } / auth`, (message) => {
                                resolve({ uavId, message });
                            });
                        }
                    }
                );
            });
        });

        // Analyze data for brute force attack
        Promise.all(authPromises)
            .then((results) => {
                const numUAVs = results.length;

                const failedAttempts = new Map();
                results.forEach((result) => {
                    const uavId = result.uavId;
                    const message = JSON.parse(result.message);
                    const failedCount = message.failedCount || 0;
                    failedAttempts.set(uavId, failedCount);
                });

                const totalFailedAttempts = Array.from(failedAttempts.values()).reduce(
                    (acc, val) => acc + val,
                    0
                );

                if (totalFailedAttempts >= BRUTEFORCE_THRESHOLD) {
                    console.error(
                        `Brute force attack detected: ${totalFailedAttempts} failed attempts`
                    );
                    this.publishAlert({
                        type: 'brute_force',
                        data: { count: totalFailedAttempts },
                    });
                }
            })
            .catch((err) => {
                console.error('Error collecting authentication data from UAVs', err);
            });

    }

    publishAlert(event) {
        // Save event to MongoDB
        if (this.mongoClient) {
            this.collection.insertOne(event, (err) => {
                if (err) {
                    console.error('Error saving event to database', err);
                }
            });
        }
    }

    publishAlert(event) {
        // Save event to MongoDB
        if (this.mongoClient) {
            this.collection.insertOne(event, (err) => {
                if (err) {
                    console.error('Error saving event to database', err);
                }
            });
        }
    }

    defend() {
        // Check for brute force attack
        setInterval(this.detectBruteForceAttack.bind(this), DETECTION_INTERVAL);
    }
}

module.exports = {
    BruteForceDefender,
};
