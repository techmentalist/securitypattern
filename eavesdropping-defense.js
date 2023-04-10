// Required modules
const mqtt = require('mqtt');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

// Constants
const UAV_BROKER_URL = 'mqtt://localhost:1883';
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const UAV_TOPIC = 'uav/data';
const CLOUD_TOPIC = 'cloud/data';
const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DATABASE_NAME = 'eavesdropping';
const MONGODB_COLLECTION_NAME = 'messages';
const SECRET_KEY = 'my_super_secret_key_123';

class EavesdroppingDefender {
    constructor() {
        // Connect to the UAV and cloud brokers
        this.uavClient = mqtt.connect(UAV_BROKER_URL);
        this.cloudClient = mqtt.connect(CLOUD_BROKER_URL);

        // Subscribe to the UAV and cloud topics
        this.uavClient.subscribe(UAV_TOPIC);
        this.cloudClient.subscribe(CLOUD_TOPIC);

        // Handle incoming messages from the UAV
        this.uavClient.on('message', this.onUAVMessage.bind(this));

        // Handle incoming messages from the cloud
        this.cloudClient.on('message', this.onCloudMessage.bind(this));

        // Connect to the MongoDB database
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
        // Decrypt the message
        const decryptedMessage = this.decryptMessage(message.toString());

        // Log the message for debugging purposes
        console.log(`Received message from UAV: ${decryptedMessage}`);

        // Store the decrypted message in MongoDB
        this.storeDecryptedMessage(decryptedMessage);

        // Forward the message to the cloud
        const encryptedMessage = this.encryptMessage(decryptedMessage);
        this.cloudClient.publish(CLOUD_TOPIC, encryptedMessage);
    }

    onCloudMessage(topic, message) {
        // Decrypt the message
        const decryptedMessage = this.decryptMessage(message.toString());

        // Log the message for debugging purposes
        console.log(`Received message from cloud: ${decryptedMessage}`);

        // Store the encrypted message in MongoDB
        this.storeEncryptedMessage(message.toString());

        // Forward the message to the UAV
        this.uavClient.publish(UAV_TOPIC, message);
    }

    encryptMessage(message) {
        // Generate a random initialization vector
        const iv = crypto.randomBytes(16);

        // Create a cipher with the secret key and initialization vector
        const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);

        // Encrypt the message
        let encrypted = cipher.update(message, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Combine the initialization vector and encrypted message
        const encryptedMessage = iv.toString('hex') + encrypted;

        return encryptedMessage;
    }
    decryptMessage(message) {
        // Extract the initialization vector and encrypted message
        const iv = Buffer.from(message.substring(0, 32), 'hex');
        const encrypted = message.substring(32);
        // Create a decipher with the secret key and initialization vector
        const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);

        // Decrypt the message
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }   
    async storeDecryptedMessage(message) {
        // Store the decrypted message in MongoDB
        const document = { message, encrypted: false };
        try {
            await this.collection.insertOne(document);
            console.log('Stored decrypted message in MongoDB');
        } catch (err) {
            console.error('Error storing decrypted message in MongoDB', err);
        }
    }   
    async storeEncryptedMessage(message) {
        // Store the encrypted message in MongoDB
        const document = { message, encrypted: true };
        try {
            await this.collection.insertOne(document);
            console.log('Stored encrypted message in MongoDB');
        } catch (err) {
            console.error('Error storing encrypted message in MongoDB', err);
        }
    }
    close() {
        // Unsubscribe from the UAV and cloud topics
        this.uavClient.unsubscribe(UAV_TOPIC);
        this.cloudClient.unsubscribe(CLOUD_TOPIC);
        // End the MQTT connections
        this.uavClient.end();
        this.cloudClient.end();
    }
}
// Export the EavesdroppingDefender class
module.exports = {
    EavesdroppingDefender,
};

