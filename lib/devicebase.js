'use strict';

const Homey = require('homey');
const querystring = require('querystring');
const fetch = require('node-fetch');
const https = require('https');

class DeviceBase extends Homey.Device {
  async getHomeyAddress() {
    this.log('get homey address');

    const homeyId = await this.homey.cloud.getHomeyId();
    const address = `https://${homeyId}.connect.athom.com`;

    this.log(address);

    return address;
  }

  async getCloudAddress() {
    this.log('get cloud address');

    const homeyId = await this.homey.cloud.getHomeyId();
    const address = `https://${homeyId}.connect.athom.com`;

    this.log(address);

    return address;
  }

  async getLocalAddress() {
    this.log('get local address');

    const host = await this.homey.cloud.getLocalAddress();
    const address = `http://${host}`;

    this.log(address);

    return address;
  }

  async storeSession(sid, did, init = false) {
    const device = this;
    await this.setStoreValue('sid', sid)
      .then(data => {
        this.log('store session');
        if (init === false) {
          device.onNewSid();
        }
      })
      .catch(this.error);

    if (did !== undefined && did.length > 0) {
      await this.setStoreValue('did', did)
        .catch(this.error);
    }
  }

  async getAPIUrl(path = '', qs = {}) {
    this.log('get api url');

    const stationId = this.getStoreValue('station_id');
    let protocol;
    let host;
    let port;
    let sid;

    if (stationId !== undefined && stationId !== null) {
      const sd = this.homey.drivers.getDriver('station').getDevice({ id: `${stationId}` });
      if (sd !== undefined && sd !== null && !(sd instanceof Error)) {
        protocol = sd.getStoreValue('protocol');
        host = sd.getStoreValue('host');
        port = sd.getStoreValue('port');
        sid = sd.getStoreValue('sid');
      }
    } else {
      protocol = this.getStoreValue('protocol');
      host = this.getStoreValue('host');
      port = this.getStoreValue('port');
      sid = this.getStoreValue('sid');
    }

    // add sid to querystring
    qs._sid = `${sid}`;

    // compile url
    return `${protocol}://${host}:${port}${path}?${querystring.stringify(qs)}`;
  }

  async getActionRules() {
    this.log('getActionRules');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'List',
      version: 3,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);

    if (response.data === undefined) {
      throw new Error('no rules found');
    }

    return response.data.actRule;
  }

  async getActionRule(id) {
    this.log('getActionRule');

    const rules = await this.getActionRules();

    let actionRule = null;

    Object.keys(rules).forEach(key => {
      const rule = rules[key];
      if (rule.ruleId === id) {
        actionRule = rule;
      }
    });

    if (actionRule !== null) {
      return actionRule;
    }
    return false;
  }

  /**
   * get the action rule id for a webhook url
   * @param url
   * @returns {Promise<boolean|number>}
   */
  async getActionRuleIdByUrl(url) {
    this.log(`get action rule by url${url}`);

    const rules = await this.getActionRules();

    let ruleMatch = 0;
    Object.keys(rules).every(key => {
      if (ruleMatch > 0) {
        return false;
      }

      const rule = rules[key];

      Object.keys(rule.actions).every(a => {
        const action = rule.actions[a];

        if (action.extUrl === url) {
          ruleMatch = rule.ruleId;
          return false;
        }
        return true;
      });
      return true;
    });

    if (ruleMatch > 0) {
      this.log(`rule ${ruleMatch} found`);
      return ruleMatch;
    }

    return false;
  }

  async enableActionRule(rule) {
    this.log('enable rule');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Enable',
      version: 1,
      idList: rule.ruleId,
    };
    const response = await this.fetchApi('/webapi/entry.cgi', qs);

    return response !== undefined && response.success !== undefined && response.success === true;
  }

  async disableActionRule(rule) {
    this.log('disable rule');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Disable',
      version: 1,
      idList: rule.ruleId,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);

    return response !== undefined && response.success !== undefined && response.success === true;
  }

  /**
   * delete action rule
   * @returns {Promise<void>}
   */
  async deleteActionRule(id) {
    this.log('delete action rule');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Delete',
      version: 1,
      idList: id,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);

    return response !== undefined && response.success !== undefined && response.success === true;
  }

  async fetchApi(path, qs) {
    let auth = true;
    let tries = 0;
    const authRetryCodes = [119, 105];


    while (auth === true && tries < 2) {
      auth = false;
      try {
        const apiUrl = await this.getAPIUrl(path, qs, tries);
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
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.indexOf('application/json') !== -1) {
              this.log('is json');
              return res.json();
            }
            this.log('is other');
            return res;
          })
          .catch(error => {
            this.log('catch 1');
            this.log(error);
            throw new Error(error);
          });

        // validate response
        if (response !== undefined && response.success === false
          && authRetryCodes.includes(response.error.code) && tries === 0) {
          this.log('get new session, retry');
          await this.getNewSession();
          tries++;
          auth = true;
        } else {
          // this.log(response);
          return response;
        }
      } catch (error) {
        this.log('catch 2');
        this.log(error);
        this.log('sid failed');
        await this.onSidFail();
      }
    }
    return null;
  }

  async getNewSession() {
    this.log('get new session');

    let device = null;

    // get driver
    const className = this.constructor.name;
    this.log(className);

    if (className === 'SynoCameraDevice') {
      // get station, device is station
      const stationId = this.getStoreValue('station_id');

      if (stationId === undefined || stationId === null) {
        this.log('Camera but no station id');
        throw new Error('pair exception');
      }

      const station = this.homey.drivers.getDriver('station').getDevice({ id: `${stationId}` });
      if (station === undefined || station === null || station instanceof Error) {
        this.log('failed to get Station device');
        throw new Error('pair exception');
      }
      device = station;
    } else {
      device = this;
    }

    const accountData = device.getStoreValue('account');

    if (accountData === undefined || accountData === null) {
      this.log('no credentials found');
      throw new Error('pair exception');
    }

    const credentials = await device.driver.getDecryptedAccount(accountData);

    const did = device.getStoreValue('did');
    const protocol = device.getStoreValue('protocol');
    const port = device.getStoreValue('port');
    const host = device.getStoreValue('host');

    const params = new URLSearchParams();
    params.append('api', 'SYNO.API.Auth');
    params.append('method', 'Login');
    params.append('version', 6);
    params.append('session', 'SurveillanceStation');
    params.append('account', `${credentials.account}`);
    params.append('passwd', `${credentials.password}`);
    params.append('format', 'sid');

    // device id / otp
    if (did !== null && did !== undefined && did !== '') {
      params.append('device_id', did);
    }
    this.log(params);

    const apiUrl = `${protocol}://${host}:${port}/webapi/auth.cgi`;

    this.log(apiUrl);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: params,
      agent: new https.Agent({
        rejectUnauthorized: false,
    })
    })
      .then(res => {
        return res.json();
      })
      .then(json => {
        return json;
      })
      .catch(error => {
        this.log(error);
        throw new Error('pair exception');
      });

    this.log('response');
    this.log(response);

    if (response !== undefined && response.data !== undefined && response.data.sid !== undefined) {
      // result = ok
      device.storeSession(response.data.sid, response.data.did);
    } else if (response !== undefined) {
      // result not ok
      this.log('Error', response.error.code);
      throw new Error('pair exception');
    }
  }

}

module.exports = DeviceBase;
