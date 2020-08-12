'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const crypto = require('crypto');

module.exports = class StationDriver extends Homey.Driver {

  async onPair(socket) {
    let api;
    let sid;

    socket.on('station-api', (data, callback) => {
      // set data to api settings
      api = data;

      this.validateAPI(socket, data, this);
      callback(null, true);
    });

    socket.on('station-api-2fa', (data, callback) => {
      // set data to api settings
      api.otp_code = data.otp_code;

      this.validateAPI(socket, api, this);
      callback(null, true);
    });

    socket.on('list_devices', (data, callback) => {
      this.log(data);
      this.log(api);
      this.log(sid);
      const deviceId = crypto.createHash('md5').update(api.toString()).digest('hex');
      this.log(deviceId);

      const devices = [{
        name: 'Surveillance Station',
        data: {
          id: deviceId,
        },
        settings: {
        },
        store: {
          sid,
          protocol: api.protocol,
          host: api.host,
          port: Number(api.port),
          version: Homey.manifest.version,
        },
      }];

      this.log(devices);
      callback(null, devices);
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

    socket.on('station-api', (data, callback) => {
      // set data to api settings
      api = data;

      this.validateAPI(socket, data);
      callback(null, true);
    });

    socket.on('station-api-2fa', (data, callback) => {
      // set data to api settings
      api.otp_code = data.otp_code;

      this.validateAPI(socket, api);
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

    const params = new URLSearchParams();
    params.append('api', 'SYNO.API.Auth');
    params.append('method', 'Login');
    params.append('version', 6);
    params.append('session', 'SurveillanceStation');
    params.append('account', data.account);
    params.append('passwd', data.passwd);
    params.append('format', 'sid');

    // one time password
    if (data.otp_code !== undefined && data.otp_code.length > 0) {
      params.append('otp_code', data.otp_code);
    }

    const url = `${data.protocol}://${data.host}:${data.port}/webapi/auth.cgi`;

    this.log(url);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: params,
    }).then(res => {
      return res.json();
    }).then(json => {
      return json;
    }).catch(error => {
      this.log(error);
      // result not ok
      socket.emit('station-api-error', error.message, (err, errData) => {
        this.log(errData);
      });
    });

    this.log('response');
    this.log(response);

    if (response !== undefined && response.data !== undefined && response.data.sid !== undefined) {
      socket.emit('station-api-ok', response.data.sid, (err, errData) => {
        this.log(errData);
      });
    } else if (response !== undefined) {
      // result not ok
      if (response.error.code === 403) {
        socket.emit('station-api-2fa', '', (err, errData) => {
          this.log(errData);
        });
      } else {
        socket.emit('station-api-error', 'API login failed', (err, errData) => {
          this.log(errData);
        });
      }
    }
  }

};
