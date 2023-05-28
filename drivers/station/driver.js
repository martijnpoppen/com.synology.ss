'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const https = require('https');
const AbortController = require('abort-controller');
const querystring = require('querystring');

module.exports = class StationDriver extends Homey.Driver {

  onInit() {
    this._flowTriggerHomeModeOn = this.homey.flow.getDeviceTriggerCard('home_mode_on');
    this._flowTriggerHomeModeOff = this.homey.flow.getDeviceTriggerCard('home_mode_off');

    this.homey.flow.getActionCard('home_mode_on').registerRunListener(async args => {
      await args.device.setHomeMode(true);
      return true;
    });

    this.homey.flow.getActionCard('home_mode_off').registerRunListener(async args => {
      await args.device.setHomeMode(false);
      return true;
    });
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

  async onPair(session) {
    let api;
    let sid;
    let did;
    let station;

    session.setHandler('station-api', async data => {
      // set data to api settings
      api = data;

      this.validateAPI(session, data, this);
      return true;
    });

    session.setHandler('station-api-2fa', async data => {
      api.otp_code = data.otp_code;

      this.validateAPI(session, api, this);
      return true;
    });

    session.setHandler('list_devices', async data => {
      this.log(data);
      this.log(api);
      this.log(sid);
      this.log(station);

      let accountEnc = null;
      if (api.store_credentials !== undefined && api.store_credentials === true) {
        accountEnc = await this.getEncryptedAccount(api.account, api.passwd);
      }

      const devices = [{
        name: `${station.hostname} (${station.DSModelName})`,
        data: {
          id: station.serial,
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
          version: this.homey.manifest.version,
        },
      }];

      this.log(devices);
      return devices;
    });

    session.setHandler('sid', async data => {
      this.log(data);
      this.log('sid-pair');

      sid = data.sid;
      did = data.did;
      station = data.station;

      return true;
    });
  }

  onRepair(session, device) {
    this.log('on repair');
    let api;

    session.setHandler('station-api', async data => {
      // set data to api settings
      api = data;

      this.validateAPI(session, data);
      return true;
    });

    session.setHandler('station-api-2fa', async data => {
      // set data to api settings
      api.otp_code = data.otp_code;

      this.validateAPI(session, api);
      return true;
    });

    session.setHandler('sid', async data => {
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

      return true;
    });
  }

  async validateAPI(session, data) {
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
        agent: new https.Agent({
            rejectUnauthorized: false,
        })
      }).then(res => {
        return res.json();
      }).then(json => {
        return json;
      }).catch(error => {
        this.log(error);

        let message = '';
        if (error.type !== undefined && error.type === 'aborted') {
          message = this.homey.__('exception.validate_pair_timeout');
        } else {
          message = error.message;
        }

        // result not ok
        session.emit('station-api-error', message).then(this.log);
      });

      this.log('response');
      this.log(response);

      if (response !== undefined && response.data !== undefined
        && response.data.sid !== undefined) {
        // get station details
        const stationInfo = await this.getStationInfo(data, response.data.sid);

        session.emit('station-api-ok', { sid: response.data.sid, did: response.data.did, station: stationInfo }).then(this.log);
      } else if (response !== undefined) {
        // result not ok
        if (response.error.code === 403) {
          session.emit('station-api-2fa', '').then(this.log);
        } else {
          session.emit('station-api-error', this.homey.__('exception.validate_pair_failed')).then(this.log);
        }
      }
    } catch (error) {
      session.emit('station-api-error', error.message).then(this.log);
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
    const encryptedData = await this.homey.app.encryptData(accountData);
    return encryptedData;
  }

  async getDecryptedAccount(accountData) {
    this.log('get decrypted account');
    const decryptedData = await this.homey.app.decryptData(accountData);
    return decryptedData;
  }

  async getStationInfo(data, sid) {
    this.log('get station info');
    const path = '/webapi/entry.cgi';
    const qs = {
      api: 'SYNO.SurveillanceStation.Info',
      method: 'GetInfo',
      version: 8,
      _sid: sid,
    };

    // compile url
    const apiUrl = `${data.protocol}://${data.host}:${data.port}${path}?${querystring.stringify(qs)}`;
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
    })
      .then(res => {
        return res.json();
      })
      .catch(error => {
        this.log(error);
        throw new Error(error);
      });

    // validate response
    this.log(response);
    if (response === undefined || response.success === false) {
      throw new Error('Could not get Surveillance Station info');
    } else {
      // this.log(response);
      return response.data;
    }
  }

};
