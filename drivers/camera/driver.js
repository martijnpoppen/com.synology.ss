'use strict';

const Homey = require('homey');
const querystring = require('querystring');
const fetch = require('node-fetch');

module.exports = class CameraDriver extends Homey.Driver {

  async onPair(socket) {
    let api;
    let motionDetection = false;
    let sid;

    socket.on('api', (data, callback) => {
      // set data to api settings
      api = data;

      this.validateAPI(socket, data, this);
      callback(null, true);
    });

    socket.on('api-2fa', (data, callback) => {
      // set data to api settings
      api.otp_code = data.otp_code;

      this.validateAPI(socket, api, this);
      callback(null, true);
    });

    socket.on('motion', (data, callback) => {
      // set data to api settings
      motionDetection = data.motion_detection;
      callback(null, true);
    });

    socket.on('list_devices', (data, callback) => {
      this.log(data);
      this.log(api);
      this.log(sid);

      const urlq = {
        api: 'SYNO.SurveillanceStation.Camera',
        method: 'List',
        version: 3,
        _sid: sid,
      };
      const url = `${api.protocol}://${api.host}:${api.port}/webapi/entry.cgi?${querystring.stringify(urlq)}`;
      this.log(url);
      const response = fetch(url, {
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
              snapshot_path: cam.snapshot_path,
              sid,
              protocol: api.protocol,
              host: api.host,
              port: Number(api.port),
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

    socket.on('sid', (data, callback) => {
      this.log(data);
      this.log('sid');

      sid = data.sid;

      callback(null, true);
    });
  }

  onRepair(socket, device) {
    this.log('on repair');
    let api;

    socket.on('api', (data, callback) => {
      // set data to api settings
      api = data;

      this.validateAPI(socket, data, this);
      callback(null, true);
    });

    socket.on('api-2fa', (data, callback) => {
      // set data to api settings
      api.otp_code = data.otp_code;

      this.validateAPI(socket, api, this);
      callback(null, true);
    });

    socket.on('sid', (data, callback) => {
      this.log(data);
      this.log('sid');

      this.log('save host and sid to device');
      device.setPairData(api.protocol, api.host, api.port, data.sid);

      callback(null, true);
    });
  }

  async validateAPI(socket, data) {
    this.log('validateAPI');
    this.log(data);

    const urlq = {
      api: 'SYNO.API.Auth',
      method: 'Login',
      version: 6,
      session: 'SurveillanceStation',
      account: data.account,
      passwd: data.passwd,
      format: 'sid',
    };

    // one time password
    if (data.otp_code !== undefined && data.otp_code.length > 0) {
      urlq.otp_code = data.otp_code;
    }

    const url = `${data.protocol}://${data.host}:${data.port}/webapi/auth.cgi?${querystring.stringify(urlq)}`;

    this.log(url);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }).then(res => {
      return res.json();
    }).then(json => {
      return json;
    }).catch(error => {
      this.log(error);
      // result not ok
      socket.emit('api-error', error.message, (err, errData) => {
        this.log(errData);
      });
    });

    this.log('response');
    this.log(response);

    if (response !== undefined && response.data !== undefined && response.data.sid !== undefined) {
      socket.emit('api-ok', response.data.sid, (err, errData) => {
        this.log(errData);
      });
    } else if (response !== undefined) {
      // result not ok
      if (response.error.code === 403) {
        socket.emit('api-2fa', '', (err, errData) => {
          this.log(errData);
        });
      } else {
        socket.emit('api-error', 'API login failed', (err, errData) => {
          this.log(errData);
        });
      }
    }
  }

};
