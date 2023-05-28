'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const https = require('https');

module.exports = class CameraDriver extends Homey.Driver {

  async onInit() {
    this._flowTriggerCameraEnabled = this.homey.flow.getDeviceTriggerCard('camera_enabled');
    this._flowTriggerCameraDisabled = this.homey.flow.getDeviceTriggerCard('camera_disabled');
    this._flowTriggerCameraConnectionLost = this.homey.flow.getDeviceTriggerCard('camera_connection_lost');
    this._flowTriggerCameraConnectionNormal = this.homey.flow.getDeviceTriggerCard('camera_connection_normal');

    this.homey.flow.getConditionCard('is_enabled').registerRunListener(async (args, state) => {
      const response = await args.device.getCapabilityValue('enabled');
      return response;
    });

    this.homey.flow.getConditionCard('is_connected').registerRunListener(async (args, state) => {
      const response = await args.device.isConnected();
      return response;
    });

    this.homey.flow.getActionCard('ext_record_start').registerRunListener(async args => {
      await args.device.externalRecordStart().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('ext_record_stop').registerRunListener(async args => {
      await args.device.externalRecordStop().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('enable_camera').registerRunListener(async args => {
      await args.device.enableCamera().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('disable_camera').registerRunListener(async args => {
      await args.device.disableCamera().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('update_image').registerRunListener(async args => {
      await args.device.snapshot.update();
      return true;
    });

    this.homey.flow.getActionCard('create_snapshot').registerRunListener(async args => {
      await args.device.createSnapshot().catch(this.error);
      return true;
    });
  }

  async onPair(session, filterPtz = false) {
    let api;
    let stationId;

    session.setHandler('station', async data => {
      this.log('on station');
      const stations = [];

      const devices = this.homey.drivers.getDriver('station').getDevices();
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
      return stations;
    });

    session.setHandler('station_save', async data => {
      stationId = data.station;
      return true;
    });

    session.setHandler('list_devices', async data => {
      this.log(data);
      this.log(api);
      this.log(stationId);

      const stationDevice = this.homey.drivers.getDriver('station').getDevice({ id: `${stationId}` });
      this.log(stationDevice);

      const qs = {
        api: 'SYNO.SurveillanceStation.Camera',
        method: 'List',
        version: 8,
        basic: true,
      };
      const apiUrl = await stationDevice.getAPIUrl('/webapi/entry.cgi', qs);

      this.log(apiUrl);
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        agent: new https.Agent({
            rejectUnauthorized: false,
        })
      }).then(res => {
        return res.json();
      }).then(json => {
        this.log(json);
        const devices = [];

        Object.keys(json.data.cameras).forEach(i => {
          const cam = json.data.cameras[i];

          this.log(cam.name);

          const ptz = cam.deviceType & 4;
          const ptzBln = (ptz === 4);

          if (filterPtz === false || (filterPtz === true && ptzBln === true)) {
            // set cameralist
            const camera = {
              name: cam.name,
              data: {
                id: cam.id,
                station: stationId,
              },
              store: {
                station_id: stationId,
                version: this.homey.manifest.version,
              },
            };
            devices.push(camera);
          }
        });

        this.log(devices);
        return devices;
      }).catch(error => {
        this.log('There has been a problem with your fetch operation:', error);
        throw Error('There has been a problem with your fetch operation:', error);
      });
      this.log(response);
      return response;
    });
  }

  onRepair(session, device) {
    this.log('on repair');

    session.setHandler('station', async data => {
      this.log('on station');
      const deviceData = device.getData();
      const stations = [];
      const devices = this.homey.drivers.getDriver('station').getDevices();

      Object.keys(devices).forEach(i => {
        const driverDevice = devices[i];
        const stationId = driverDevice.getData().id;
        const station = {
          id: stationId,
          name: driverDevice.getName(),
        };

        if (deviceData.station === undefined || deviceData.station === '' || deviceData.station === stationId) {
          stations.push(station);
        }
      });

      return stations;
    });

    session.setHandler('station_save', async data => {
      let success = false;
      await device.setStoreValue('station_id', `${data.station}`)
        .then(async () => {
          success = await device.validatePair();
          if (success === true) {
            device.setAvailable();
          } else {
            device.setUnavailable('authentication failed');
          }
        })
        .catch(this.error);

      return success;
    });
  }

  triggerCameraEnabled(device, tokens, state) {
    this._flowTriggerCameraEnabled
      .trigger(device, tokens, state)
      .then(this.log)
      .catch(this.error);
  }

  triggerCameraDisabled(device, tokens, state) {
    this._flowTriggerCameraDisabled
      .trigger(device, tokens, state)
      .then(this.log)
      .catch(this.error);
  }

  triggerCameraConnectionLost(device, tokens, state) {
    this._flowTriggerCameraConnectionLost
      .trigger(device, tokens, state)
      .then(this.log)
      .catch(this.error);
  }

  triggerCameraConnectionNormal(device, tokens, state) {
    this._flowTriggerCameraConnectionNormal
      .trigger(device, tokens, state)
      .then(this.log)
      .catch(this.error);
  }

};
