'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const crypto = require('crypto');
const AbortController = require('abort-controller');

module.exports = class StationDriver extends Homey.Driver {

  onInit() {
    this._flowTriggerHomeModeOn = new Homey.FlowCardTriggerDevice('home_mode_on')
      .register();

    this._flowTriggerHomeModeOff = new Homey.FlowCardTriggerDevice('home_mode_off')
      .register();
  }

  triggerHomeModeOn(device, tokens, state) {
    this._flowTriggerHomeModeOn
      .trigger(device, tokens, state)
      .then(this.log)
      .catch(this.error);
  }

  triggerHomeModeOff(device, tokens, state) {
    this._flowTriggerHomeModeOff
      .trigger(device, tokens, state)
      .then(this.log)
      .catch(this.error);
  }

  async onPair(socket) {
    let api;
    let sid;
    let did;

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

    socket.on('list_devices', async (data, callback) => {
      this.log(data);
      this.log(api);
      this.log(sid);
      const deviceId = crypto.createHash('md5').update(api.toString()).digest('hex');
      this.log(deviceId);

      let accountEnc = null;
      if (api.store_credentials !== undefined && api.store_credentials === true) {
        accountEnc = await this.getEncryptedAccount(api.account, api.passwd);
      }

      const devices = [{
        name: 'Surveillance Station',
        data: {
          id: deviceId,
        },
        settings: {
        },
        store: {
          sid,
          did,
          account: accountEnc,
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
      did = data.did;

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

    socket.on('sid', async (data, callback) => {
      this.log('sid');
      this.log(data);
      this.log(api);

      this.log('save host and sid to device');

      // store credentials
      await device.setStoreValue('protocol', api.protocol).catch(this.error);
      await device.setStoreValue('host', api.host).catch(this.error);
      await device.setStoreValue('port', api.port).catch(this.error);

      // store credentials (encrypted)
      if (api.store_credentials !== undefined && api.store_credentials === true) {
        this.log('store credentials');
        // get encrypted account
        const accountEnc = await this.getEncryptedAccount(api.account, api.passwd);
        await device.setStoreValue('account', accountEnc).catch(this.error);
      } else {
        // remove old credentials
        await device.unsetStoreValue('account').catch(this.error);
      }

      // store session
      await device.storeSession(data.sid, data.did, false);

      // set available
      device.setAvailable()
        .catch(this.error);

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
      params.append('enable_device_token', 'yes');
    }

    const url = `${data.protocol}://${data.host}:${data.port}/webapi/auth.cgi`;

    this.log(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 25000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: params,
        signal: controller.signal,
      }).then(res => {
        return res.json();
      }).then(json => {
        return json;
      }).catch(error => {
        this.log(error);

        let message = '';
        if (error.type !== undefined && error.type === 'aborted') {
          message = Homey.__('exception.validate_pair_timeout');
        } else {
          message = error.message;
        }

        // result not ok
        socket.emit('station-api-error', message, (err, errData) => {
          this.log(errData);
        });
      });

      this.log('response');
      this.log(response);

      if (response !== undefined && response.data !== undefined
        && response.data.sid !== undefined) {
        socket.emit('station-api-ok', { sid: response.data.sid, did: response.data.did }, (err, errData) => {
          this.log(errData);
        });
      } else if (response !== undefined) {
        // result not ok
        if (response.error.code === 403) {
          socket.emit('station-api-2fa', '', (err, errData) => {
            this.log(errData);
          });
        } else {
          socket.emit('station-api-error', Homey.__('exception.validate_pair_failed'), (err, errData) => {
            this.log(errData);
          });
        }
      }
    } catch (error) {
      socket.emit('station-api-error', error.message, (err, errData) => {
        this.log(errData);
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async getEncryptedAccount(account, password) {
    this.log('get encrypted account');
    const accountData = {
      account,
      password,
    };
    const encryptedData = await Homey.app.encryptData(accountData);
    return encryptedData;
  }

  async getDecryptedAccount(accountData) {
    this.log('get decrypted account');
    const decryptedData = await Homey.app.decryptData(accountData);
    return decryptedData;
  }

};
