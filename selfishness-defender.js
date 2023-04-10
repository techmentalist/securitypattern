class SelfishDefender {
    constructor() {
      this.uavClient = mqtt.connect(UAV_BROKER_URL);
      this.cloudClient = mqtt.connect(CLOUD_BROKER_URL);
      this.serverClient = mqtt.connect(SERVER_BROKER_URL);
  
      this.uavClient.subscribe(UAV_TOPIC);
      this.cloudClient.subscribe(CLOUD_TOPIC);
      this.serverClient.subscribe(SERVER_TOPIC);
  
      this.uavs = new Map();
  
      this.uavClient.on('message', this.onUAVMessage.bind(this));
      this.cloudClient.on('message', this.onCloudMessage.bind(this));
      this.serverClient.on('message', this.onServerMessage.bind(this));
    }
  
    onUAVMessage(topic, message) {
      const uavId = topic.split('/').pop();
      const uavData = this.uavs.get(uavId);
      if (!uavData) {
        console.error(`Unregistered UAV: ${uavId}`);
        return;
      }
  
      // Update UAV progress
      uavData.progress = message;
  
      console.log(`Received message from UAV${uavId}: Progress ${message}`);
  
      // Check if all UAVs have completed their tasks
      const allComplete = Array.from(this.uavs.values()).every(
        uavData => uavData.progress === '100'
      );
      if (allComplete) {
        console.log('All UAVs have completed their tasks');
  
        // Verify that each UAV completed its task in the correct order
        let correctOrder = true;
        for (let i = 0; i < this.uavs.size - 1; i++) {
          const prevProgress = Array.from(this.uavs.values())[i].progress;
          const nextProgress = Array.from(this.uavs.values())[i + 1].progress;
          if (prevProgress === '100' && nextProgress !== '100') {
            correctOrder = false;
            break;
          }
        }
        if (correctOrder) {
          console.log('All UAVs completed their tasks in the correct order');
        } else {
          console.error('UAVs did not complete their tasks in the correct order');
        }
  
        // Reset UAV progress
        this.uavs.forEach(uavData => {
          uavData.progress = '0';
        });
      }
    }
  
    onCloudMessage(topic, message) {
      console.error('Unexpected message from cloud:', message);
    }
  
    onServerMessage(topic, message) {
      console.log('Received message from server:', message);
  
      // Assign tasks to UAVs
      let taskNumber = 1;
      this.uavs.forEach((uavData, uavId) => {
        const task = `Task ${taskNumber++}`;
        uavData.task = task;
        this.uavClient.publish(`${UAV_TOPIC}/${uavId}`, task);
      });
    }
    defend() {
      // Register UAVs
      this.uavClient.on('connect', () => {
        for (let i = 0; i < MAX_UAVS; i++) {
          const uavId = `UAV${i + 1}`;
          this.uavs.set(uavId, {
            task: null,
            progress: '0',
          });
          this.uavClient.subscribe(`${UAV_TOPIC}/${uavId}`);
          console.log(`Registered UAV: ${uavId}`);
        }
      });
    }
  }
  module.exports = {
    SelfishDefender,
  };
  