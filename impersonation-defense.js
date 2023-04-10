// The ImpersonationDetector class is responsible for detecting impersonation attacks on a UAV
// by monitoring the authentication tokens that are being used to communicate with the cloud server.
const jwt = require('jsonwebtoken');
const dgram = require('dgram');
const MongoClient = require('mongodb').MongoClient;

const MONGO_URL = 'mongodb://localhost:27017';
const MONGO_DB_NAME = 'telemetry_db';
const MONGO_COLLECTION_NAME = 'telemetry_collection';
const AUTH_TOKEN_SECRET = 'mysecret';
const AUTH_TOKEN_EXPIRATION = '1h';
const IMPERSONATION_THRESHOLD = 5; // number of standard deviations away from the mean to trigger impersonation detection

class ImpersonationDetector {
  constructor(port) {
    this.server = dgram.createSocket('udp4');
    this.server.on('message', this.onMessage.bind(this));
    this.server.on('error', this.onError.bind(this));
    this.server.bind(port);
    this.db = null;
  }

  async connectToMongo() {
    try {
      const client = await MongoClient.connect(MONGO_URL);
      this.db = client.db(MONGO_DB_NAME);
      console.log('Connected to MongoDB');
    } catch (err) {
      console.error('Error connecting to MongoDB', err);
      process.exit(1);
    }
  }

  async onMessage(message, remote) {
    const telemetry = JSON.parse(message.toString());
    telemetry.ipAddress = remote.address;

    // Store the telemetry data in MongoDB
    await this.db.collection(MONGO_COLLECTION_NAME).insertOne(telemetry);

    // Check for impersonation
    const { mean, standardDeviation } = await this.calculateStats();
    const distanceFromMean = Math.abs(telemetry.altitude - mean);
    const deviationCount = distanceFromMean / standardDeviation;
    if (deviationCount >= IMPERSONATION_THRESHOLD) {
      console.log(`Possible impersonation detected: deviation count of ${deviationCount.toFixed(2)} is greater than or equal to the impersonation threshold of ${IMPERSONATION_THRESHOLD}`);
      this.blockImpersonation(telemetry.ipAddress);
    }
  }

  async calculateStats() {
    const telemetryData = await this.db.collection(MONGO_COLLECTION_NAME).find().toArray();
    const altitudeData = telemetryData.map(data => data.altitude);
    const mean = altitudeData.reduce((a, b) => a + b, 0) / altitudeData.length;
    const variance = altitudeData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / altitudeData.length;
    const standardDeviation = Math.sqrt(variance);
    return { mean, standardDeviation };
  }

  // Check if the given authentication token is valid
  async verifyAuthToken(authToken) {
    try {
      const decoded = await jwt.verify(authToken, AUTH_TOKEN_SECRET);
      return true;
    } catch (err) {
      return false;
    }
  }

  // Block the impersonator's IP address
  blockImpersonation(ipAddress) {
    console.log(`Blocking connection from the IP address ${ipAddress}`);
    // TODO: Implement defense mechanism to block the connection
  }

  onError(err) {
    console.error('Error in UDP server', err);
    this.server.close();
    process.exit(1);
  }

  close() {
    this.server.close();
    this.db.close();
  }
}

class ImpersonationDefender {
  constructor(port) {
    this.detector = new ImpersonationDetector(port);
  }

  start() {
    console.log('Impersonation defender started');
    this.detector.connectToMongo();
  }

  stop() {
    console.log('Impersonation defender stopped');
    this.detector.close();
  }
}

module.exports = {
  ImpersonationDefender,
};
