const { exec } = require('child_process');
const MongoClient = require('mongodb').MongoClient;
const svm = require('node-svm');

// The InsiderDetector class is responsible for detecting insider attacks on a UAV
class InsiderDetector {
  constructor() {
    this.db = null;
    this.loginData = [];
    this.isModelTrained = false;
    this.model = null;
  }

  async connectToMongo(mongoUrl, dbName, collectionName) {
    try {
      const client = await MongoClient.connect(mongoUrl);
      this.db = client.db(dbName);
      this.loginData = await this.db.collection(collectionName).find().toArray();
      console.log('Connected to MongoDB and retrieved login data');
    } catch (err) {
      console.error('Error connecting to MongoDB', err);
      process.exit(1);
    }
  }

  async trainModel() {
    // Prepare training data
    const trainingData = this.loginData.map(login => ({
      input: [login.successful, login.time],
      output: login.successful,
    }));

    // Train machine learning model
    const options = { kernel: 'linear', probability: true };
    this.model = new svm(options);
    this.model.train(trainingData, function (error) {
      if (error) {
        console.error('Error training model:', error);
        process.exit(1);
      } else {
        console.log('Model trained successfully');
        this.isModelTrained = true;
      }
    });

    console.log('Training model...');
  }

  async onLoginAttempt(username, successful, time) {
    // Store login attempt in database
    await this.db.collection('logins').insertOne({ username, successful, time });

    // Check for insider threat
    if (this.isModelTrained) {
      const prediction = this.model.predictSync([[successful, time]])[0];
      if (!prediction) {
        console.log(`Possible insider threat detected: ${username} logged in unsuccessfully at ${time}`);
        this.takeAction(username, time);
      }
    }
  }

  takeAction(username, time) {
    // Block user's account
    const command = `sudo usermod --expiredate ${time} ${username}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error blocking account for ${username}: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Error blocking account for ${username}: ${stderr}`);
        return;
      }
      console.log(`Blocked account for ${username} at ${time}`);
    });
  }

  close() {
    this.db.close();
  }
}

// The InsiderDefender class is responsible for starting and stopping the InsiderDetector.
class InsiderDefender {
  constructor(mongoUrl, dbName, collectionName) {
    this.detector = new InsiderDetector();
    this.mongoUrl = mongoUrl;
    this.dbName = dbName;
    this.collectionName = collectionName;
  }

  async start() {
    console.log('Insider defender started');
    await this.detector.connectToMongo(this.mongoUrl, this.dbName, this.collectionName);
    await this.detector.trainModel();
  }

  stop() {
    console.log('Insider defender stopped');
    this.detector.close();
  }
}

module.exports = {
  InsiderDefender,
};
