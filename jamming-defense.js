const dgram = require('dgram');
const mqtt = require('mqtt');
const { spawn } = require('child_process');

const JAMMING_THRESHOLD = 5; // number of standard deviations away from the mean to trigger jamming detection
const JAMMING_DURATION = 30000; // duration in milliseconds to jam the UAV's communication
const CLOUD_BROKER_URL = 'mqtt://localhost:1883';
const JAMMING_TOPIC = 'uav/jamming';
const JAMMING_MESSAGE = 'Jamming detected!';

class JammingDetector {
    constructor(port) {
        this.server = dgram.createSocket('udp4');
        this.server.on('message', this.onMessage.bind(this));
        this.server.on('error', this.onError.bind(this));
        this.server.bind(port);
        this.mqttClient = null;
    }

    async connectToCloudBroker() {
        try {
            this.mqttClient = mqtt.connect(CLOUD_BROKER_URL);
            this.mqttClient.on('connect', () => {
                console.log('Connected to cloud broker');
            });
        } catch (err) {
            console.error('Error connecting to cloud broker', err);
            process.exit(1);
        }
    }

    async onMessage(message, remote) {
        const telemetry = JSON.parse(message.toString());
        telemetry.ipAddress = remote.address;

        // Check for jamming
        const { mean, standardDeviation } = await this.calculateStats();
        const distanceFromMean = Math.abs(telemetry.altitude - mean);
        const deviationCount = distanceFromMean / standardDeviation;

        if (deviationCount >= JAMMING_THRESHOLD) {
            console.log(`Possible jamming detected: deviation count of ${deviationCount.toFixed(2)} is greater 
            than or equal to the jamming threshold of ${JAMMING_THRESHOLD}`);
            this.blockCommunication(telemetry.ipAddress);
            this.sendJammingAlert();
        }
    }

    async calculateStats() {
        // Retrieve telemetry data from cloud server
        const telemetryData = await this.retrieveTelemetryData();
        const altitudeData = telemetryData.map(data => data.altitude);
        const mean = altitudeData.reduce((a, b) => a + b, 0) / altitudeData.length;
        const variance = altitudeData.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / altitudeData.length;
        const standardDeviation = Math.sqrt(variance);
        return { mean, standardDeviation };
    }

    async retrieveTelemetryData() {
        // TODO: Implement retrieval of telemetry data from cloud server
        return [];
    }

    blockCommunication(ipAddress) {
        // Use iptables to block communication from the given IP address
        const command = `sudo iptables -A INPUT -s ${ipAddress} -j DROP`;
        spawn(command, { shell: true });

        console.log(`Blocked communication from IP address: ${ipAddress}`);
    }

    sendJammingAlert() {
        // Publish jamming alert to cloud broker
        this.mqttClient.publish(JAMMING_TOPIC, JAMMING_MESSAGE);

        // Jam the UAV's communication for a specified duration
        this.jamCommunication();
    }

    jamCommunication() {
        // Use airmon-ng to enable monitor mode on the wireless interface
        const enableMonitorMode = spawn('sudo airmon-ng start wlan0', { shell: true });
        enableMonitorMode.on('close', code => {
            console.log('Enabled monitor mode on wireless interface');

            // Use aireplay-ng to send deauthentication packets
            const sendDeauthPackets = spawn(`sudo aireplay-ng -0 0 -a ${accessPoint} -c ${client}`, { shell: true });
            sendDeauthPackets.on('close', code => {
                console.log(`Sent deauthentication packets to access point ${accessPoint} for client ${client}`);

                // Use airmon-ng to disable monitor mode
                const disableMonitorMode = spawn('sudo airmon-ng stop wlan0mon', { shell: true });
                disableMonitorMode.on('close', code => {
                    console.log('Disabled monitor mode on wireless interface');

                    // Wait for the jamming duration to expire before re-enabling communication
                    setTimeout(() => {
                        this.unblockCommunication();
                    }, JAMMING_DURATION);
                });
            });
        });
    }

    unblockCommunication() {
        // Use iptables to unblock communication from all IP addresses
        const command = 'sudo iptables -F';
        spawn(command, { shell: true });
        console.log('Unblocked communication');
    }

    close() {
        this.server.close();
    }
}

// The JammingDefender class is responsible for starting and stopping the JammingDetector.
class JammingDefender {
    constructor(port) {
        this.detector = new JammingDetector(port);
    }

    async start() {
        console.log('Jamming defender started');
        await this.detector.connectToCloudBroker();
    }

    stop() {
        console.log('Jamming defender stopped');
        this.detector.close();
    }
}

// Export the JammingDefender class
module.exports = {
    JammingDefender,
};