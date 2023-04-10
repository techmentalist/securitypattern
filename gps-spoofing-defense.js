class GpsSpoofingDetector {
    constructor() {
      this.lastPosition = null;
      this.lastTime = null;
  
      parser.on('data', (data) => {
        const parts = data.split(',');
        if (parts[0] === '$GPRMC') {
          const time = parts[1];
          const lat = parts[3];
          const latDir = parts[4];
          const lon = parts[5];
          const lonDir = parts[6];
          const speed = parts[7];
          const heading = parts[8];
          const date = parts[9];
          const variation = parts[10];
  
          const latitude = parseFloat(lat.substr(0, 2)) + parseFloat(lat.substr(2)) / 60;
          const longitude = parseFloat(lon.substr(0, 3)) + parseFloat(lon.substr(3)) / 60;
  
          const position = {
            latitude: latDir === 'S' ? -latitude : latitude,
            longitude: lonDir === 'W' ? -longitude : longitude,
            speed: parseFloat(speed) * 0.5144, // knots to meters per second
            altitude: null, // not available in GPRMC sentence
            heading: parseFloat(heading),
            time: new Date(`${date.slice(0, 2)}/${date.slice(2, 4)}/${date.slice(4, 6)} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4)}`),
            variation: parseFloat(variation),
            satellites: null, // not available in GPRMC sentence
            hdop: null, // not available in GPRMC sentence
          };
  
          if (this.isValidPosition(position)) {
            this.checkForGpsSpoofing(position);
            this.lastPosition = position;
            this.lastTime = new Date();
          }
        } else if (parts[0] === '$GPGGA') {
          const time = parts[1];
          const lat = parts[2];
          const latDir = parts[3];
          const lon = parts[4];
          const lonDir = parts[5];
          const quality = parts[6];
          const satellites = parts[7];
          const hdop = parts[8];
          const altitude = parts[9];
  
          const latitude = parseFloat(lat.substr(0, 2)) + parseFloat(lat.substr(2)) / 60;
          const longitude = parseFloat(lon.substr(0, 3)) + parseFloat(lon.substr(3)) / 60;
  
          const position = {
            latitude: latDir === 'S' ? -latitude : latitude,
            longitude: lonDir === 'W' ? -longitude : longitude,
            speed: null, // not available in GPGGA sentence
            altitude: parseFloat(altitude),
            heading: null, // not available in GPGGA sentence
            time: new Date(`${this.lastTime.getFullYear()}-${this.lastTime.getMonth() + 1}-
            ${this.lastTime.getDate()} ${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4)}`),
            variation: null, // not available in GPGGA sentence
            satellites: parseInt(satellites),
            hdop: parseFloat(hdop),
          };
  
          if (this.isValidPosition(position)) {
            this.checkForGpsSpoofing(position);
            this.lastPosition = position;
          }
        }
      });
    }
  
    isValidPosition(position) {
      if (position.latitude === 0 && position.longitude === 0) {
        return false;
      }
    }

    checkForGpsSpoofing(position) {
        const timeDelta = (position.time - this.lastPosition.time) / 1000;
        const distanceDelta = this.getDistance(position.latitude, position.longitude, this.lastPosition.latitude, this.lastPosition.longitude);
        const speed = distanceDelta / timeDelta;
      
        if (speed > maxSpeed) {
          console.log(`Possible GPS spoofing detected: speed of ${speed.toFixed(2)} m/s is higher than the maximum speed of ${maxSpeed} m/s`);
          this.blockSpoofing();
          return;
        }
      
        if (position.altitude > maxAltitude) {
          console.log(`Possible GPS spoofing detected: altitude of ${position.altitude.toFixed(2)} m is higher than the maximum altitude of ${maxAltitude} m`);
          this.blockSpoofing();
          return;
        }
      
        if (position.satellites < minSatellites) {
          console.log(`Possible GPS spoofing detected: number of satellites ${position.satellites} is less than the required minimum of ${minSatellites}`);
          this.blockSpoofing();
          return;
        }
      
        if (position.hdop > minHDOP) {
          console.log(`Possible GPS spoofing detected: HDOP of ${position.hdop} is higher than the maximum allowed value of ${minHDOP}`);
          this.blockSpoofing();
          return;
        }
      
        this.lastPosition = position;
      }
      
      blockSpoofing() {
        console.log(`Blocking connection from the IP address ${this.ipAddress}`);
        // TODO: Implement defense mechanism to block the connection
      }
      
      getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
      
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      
        const d = R * c; // in metres
      
        return d;
      }      
}

class GpsSpoofingDefender {
    constructor(interface, allowedDistance) {
      this.interface = interface;
      this.allowedDistance = allowedDistance;
    }
  
    defend() {
      const detector = new GpsSpoofingDetector(this.allowedDistance);
      detector.on('spoofing', (position) => {
        console.log(`GPS spoofing detected: ${position.latitude}, ${position.longitude}`);
        this.interface.block();
      });
    }
}
  
module.exports = {
    GpsSpoofingDefender,
};

