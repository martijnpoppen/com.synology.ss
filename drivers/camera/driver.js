'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const { ManagerDrivers } = require('homey');

module.exports = class CameraDriver extends Homey.Driver {

  async onPair(socket) {
    let api;
    let motionDetection = false;
    let stationId;

    socket.on('station', (data, callback) => {
      this.log('on station');
      const stations = [];

      const devices = ManagerDrivers.getDriver('station').getDevices();
      this.log(devices);

      Object.keys(devices).forEach(i => {
        const device = devices[i];
        const station = {
          id: device.getData().id,
          name: device.getName(),
        };
        stations.push(station);
      });

      this.log(stations);
      callback(null, stations);
    });

    socket.on('station_save', (data, callback) => {
      // set data to api settings
      stationId = data.station;

      callback(null, true);
    });

    socket.on('motion', (data, callback) => {
      // set data to api settings
      motionDetection = data.motion_detection;
      callback(null, true);
    });

    socket.on('list_devices', async (data, callback) => {
      this.log(data);
      this.log(api);
      this.log(stationId);

      const stationDevice = ManagerDrivers.getDriver('station').getDevice({ id: `${stationId}` });
      this.log(stationDevice);

      const qs = {
        api: 'SYNO.SurveillanceStation.Camera',
        method: 'List',
        version: 3,
      };
      const apiUrl = await stationDevice.getAPIUrl('/webapi/entry.cgi', qs);

      this.log(apiUrl);
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }).then(res => {
        return res.json();
      }).then(json => {
        this.log(json);
        const devices = [];

        Object.keys(json.data.cameras).forEach(i => {
          const cam = json.data.cameras[i];

          this.log(cam.name);

          // set cameralist
          const camera = {
            name: cam.name,
            data: {
              id: cam.id,
            },
            settings: {
              motion_detection: motionDetection,
            },
            store: {
              station_id: stationId,
              version: Homey.manifest.version,
            },
          };
          devices.push(camera);
        });

        this.log(devices);
        callback(null, devices);
      }).catch(error => {
        this.log('There has been a problem with your fetch operation:', error);
        callback(new Error('There has been a problem with your fetch operation:', error));
      });
      this.log(response);
    });
  }

  onRepair(socket, device) {
    this.log('on repair');

    socket.on('station', (data, callback) => {
      this.log('on station');
      const stations = [];

      const devices = ManagerDrivers.getDriver('station').getDevices();
      this.log(devices);

      Object.keys(devices).forEach(i => {
        const driverDevice = devices[i];
        const station = {
          id: driverDevice.getData().id,
          name: driverDevice.getName(),
        };
        stations.push(station);
      });

      this.log(stations);
      callback(null, stations);
    });

    socket.on('station_save', (data, callback) => {
      // set data to api settings
      device.setStoreValue('station_id', `${data.station}`)
        .then(async () => {
          // validate connection
          const success = await device.validatePair();

          if (success === true) {
            device.setAvailable();
          } else {
            device.setUnavailable('authentication failed');
          }

          callback(null, success);
        })
        .catch(this.error);
    });
  }

};
