// data-tampering-defense.js

const crypto = require('crypto');
const { Client, PrivateKey } = require('@textile/hub');

// Initialize a Textile Hub client
const identity = PrivateKey.fromRandom();
const client = await Client.withKeyInfo({
  key: identity,
});

// Helper function to calculate the SHA-256 hash of a message
function calculateHash(message) {
  const hash = crypto.createHash('sha256');
  hash.update(message);
  return hash.digest('hex');
}

// Helper function to store data in the distributed ledger
async function addToLedger(data) {
  try {
    const threadID = '<your thread ID>';
    const thread = await client.getThread(threadID);
    const block = await thread.push(
      {
        data: data,
        timestamp: Date.now(),
      },
      { key: identity }
    );
    console.log(`Added data to the distributed ledger: ${JSON.stringify(block, null, 2)}`);
  } catch (error) {
    console.error(`Failed to add data to the distributed ledger: ${error}`);
  }
}

// Helper function to check if data has been tampered with
async function detectTampering(data) {
  const { payload, hash } = data;
  const calculatedHash = calculateHash(payload);

  if (calculatedHash !== hash) {
    console.log(`Tampered data detected: ${JSON.stringify(data, null, 2)}`);
    return true;
  }

  console.log(`Data is authentic: ${JSON.stringify(data, null, 2)}`);
  return false;
}

// Main function to defend against data tampering attacks
function defendAgainstDataTampering(data) {
  const isTampered = detectTampering(data);

  if (isTampered) {
    // If tampered data is detected, add it to the distributed ledger
    addToLedger(data);
  }
}

module.exports = {
  defendAgainstDataTampering,
};
