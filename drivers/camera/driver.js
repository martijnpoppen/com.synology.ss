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
      }).then((response) => {
        return response.json();
      }).then((json) => {
        this.log(json);
        const devices = [];

        Object.keys(json.data.cameras).forEach((i) => {
          const cam = json.data.cameras[i];

          this.log(cam.name);

          // set cameralist
          const camera = {
            name: cam.name,
            data: {
              id: cam.id,
            },
            settings: {
              // Store connection variables in settings
              // so the user can change them later
              protocol: api.protocol,
              host: api.host,
              port: Number(api.port),
              account: api.account,
              passwd: api.passwd,
              motion_detection: motionDetection,
            },
            store: {
              snapshot_path: cam.snapshot_path,
              sid,
              version: Homey.manifest.version,
            },
          };
          devices.push(camera);
        });

        this.log(devices);
        callback(null, devices);
      }).catch((error) => {
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

  onRepair( socket, device ) {
    // Argument socket is an EventEmitter, similar to Driver.onPair
    // Argument device is a Homey.Device that's being repaired

    let api;
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

    socket.on('sid', (data, callback) => {
      this.log(data);
      this.log('sid');

      this.log('save sid to device');

      sid = data.sid;

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
    if(data.otp_code !== undefined && data.otp_code.length > 0) {
      urlq.otp_code=data.otp_code;
    }

    const url = `${data.protocol}://${data.host}:${data.port}/webapi/auth.cgi?${querystring.stringify(urlq)}`;

    this.log(url);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }).then((response) => {
      return response.json();
    }).then((json) => {
      return json;
    }).catch((error) => {
      this.log(error);
      // result not ok
      socket.emit('api-error', error.message, (err, data) => {
        this.log(data);
      });
    });

    this.log('response');
    this.log(response);

    if (response !== undefined && response.data !== undefined && response.data.sid !== undefined) {
      socket.emit('api-ok', response.data.sid, (err, data) => {
        this.log(data);
      });
    } else if (response !== undefined) {
      // result not ok
      if(response.error.code === 403) {
        socket.emit('api-2fa', '', (err, data) => {
          this.log(data);
        });
      } else {
        socket.emit('api-error', 'API login failed', (err, data) => {
          this.log(data);
        });
      }
    }
  }
};
