const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: 'us-east-1' });

// Function to store data in S3 bucket
async function storeDataInBucket(bucketName, data) {
  const params = {
    Bucket: bucketName,
    Key: 'data.txt',
    Body: data
  };
  const result = await s3.putObject(params).promise();
  return result;
}

// Function to backup data to S3 bucket
async function backupDataToBucket(bucketName, data) {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const backupName = `backup-${timestamp}.txt`;
  const params = {
    Bucket: bucketName,
    Key: backupName,
    Body: data
  };
  const result = await s3.putObject(params).promise();
  return result;
}

// Function to retrieve data from S3 bucket
async function retrieveDataFromBucket(bucketName) {
  const params = {
    Bucket: bucketName,
    Key: 'data.txt'
  };
  const result = await s3.getObject(params).promise();
  return result.Body.toString('utf-8');
}

// Function to encrypt sensitive data using AES-256 encryption
function encryptData(data, key) {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// Function to decrypt sensitive data using AES-256 decryption
function decryptData(data, key) {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const [iv, encrypted] = data.split(':').map(x => Buffer.from(x, 'hex'));
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const decrypted = decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  return decrypted;
}

// Example usage
const sensitiveData = 'this is sensitive data';
const encryptionKey = 'my-secret-key';

// Store data in S3 bucket
storeDataInBucket('my-bucket', sensitiveData);

// Backup data to S3 bucket
backupDataToBucket('my-bucket', sensitiveData);

// Retrieve data from S3 bucket
retrieveDataFromBucket('my // Retrieve data from S3 bucket');
retrieveDataFromBucket('my-bucket').
then(data => console.log(`Retrieved data: ${data})`))
.catch(err => console.error(`Error retrieving data: ${err})`));

// Encrypt sensitive data
const encryptedData = encryptData(sensitiveData, encryptionKey);
console.log(`Encrypted data: ${encryptedData}`);

// Decrypt sensitive data
const decryptedData = decryptData(encryptedData, encryptionKey);
console.log(`Decrypted data: ${decryptedData}`);
