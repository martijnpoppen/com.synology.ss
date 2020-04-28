'use strict';

const Homey = require('homey');
const querystring = require('querystring');
const fetch = require('node-fetch');

let crypto;
try {
  crypto = require('crypto');
} catch (err) {
  console.log('crypto support is disabled!');
}

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

    socket.on('list_devices', (data, callback) => {
      this.log(data);
      this.log(api);
      this.log(sid);
      let deviceId = crypto.createHash('md5').update(api.toString()).digest('hex');
      this.log(deviceId);

        const devices = [{
              name: 'Surveillance Station',
              data: {
                  id: deviceId,
              },
              settings: {
                  // Store connection variables in settings
                  // so the user can change them later
                  protocol: api.protocol,
                  host: api.host,
                  port: Number(api.port),
                  account: api.account,
                  passwd: api.passwd
              },
              store: {
                  sid,
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
      socket.emit('station-api-error', error.message, (err, data) => {
        this.log(data);
      });
    });

    this.log('response');
    this.log(response);

    if (response !== undefined && response.data.sid !== undefined) {
      socket.emit('station-api-ok', response.data.sid, (err, data) => {
        this.log(data);
      });
    } else if (response !== undefined) {
      // result not ok
      socket.emit('station-api-error', 'API login failed', (err, data) => {
        this.log(data);
      });
    }
  }

  getRandomInt(max) {
        return Math.floor(Math.random() * Math.floor(max));
    }
};
