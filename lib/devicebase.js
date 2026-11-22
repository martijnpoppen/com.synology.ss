'use strict';

const Homey = require('homey');
const querystring = require('querystring');
const fetch = require('node-fetch');
const https = require('https');
const http = require('http');

// minimum time between two logins for the same station
const LOGIN_COOLDOWN = 60 * 1000;

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

  async getAgent(url) {
    this.log(`get agent for ${url}`);
    if (url.startsWith("https:")) {
       this.log("https agent");
      return new https.Agent({ rejectUnauthorized: false });
    } else {
        this.log("http agent");
      return new http.Agent();
    }
  }

  async getActionRules() {
    this.log('getActionRules');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'List',
      version: 3,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);

    if (!response || response.data === undefined) {
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
    const authRetryCodes = [105, 106, 119];

    while (auth === true && tries < 2) {
      auth = false;
      try {
        const sidUsed = this.getSessionDevice().getStoreValue('sid');
        const apiUrl = await this.getAPIUrl(path, qs, tries);
        this.log(apiUrl);
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
            agent: await this.getAgent(apiUrl)
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
          && response.error && authRetryCodes.includes(response.error.code) && tries === 0) {
          tries++;
          // only retry when a login actually gave a different session: a
          // permission error (105) on a valid session must not log in again
          auth = await this.getNewSession(sidUsed);
          if (auth === false) {
            return response;
          }
          this.log('got new session, retry');
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

  /**
   * the device that holds the Synology login: the station for cameras
   * @returns {DeviceBase}
   */
  getSessionDevice() {
    const stationId = this.getStoreValue('station_id');

    if (stationId === undefined || stationId === null) {
      return this;
    }

    const station = this.homey.drivers.getDriver('station').getDevice({ id: `${stationId}` });
    if (station === undefined || station === null || station instanceof Error) {
      this.log('failed to get Station device');
      throw new Error('pair exception');
    }
    return station;
  }

  /**
   * get a new session for the station, at most one login at a time and at
   * most one per LOGIN_COOLDOWN per station. Every login is a new session on
   * the Synology, so logging in for every failed call floods DSM with
   * SYNO.API.Auth sessions until it runs out of memory.
   * @param {string} sidUsed the session the failed call was made with
   * @returns {Promise<boolean>} true when there is a session to retry with
   */
  async getNewSession(sidUsed) {
    const device = this.getSessionDevice();

    // another call already replaced the session the failed call used
    if (sidUsed !== undefined && device.getStoreValue('sid') !== sidUsed) {
      this.log('session already renewed');
      return true;
    }

    // a login for this station is already running: wait for it
    if (device.loginPromise) {
      this.log('login already running');
      return device.loginPromise;
    }

    if (device.lastLogin && Date.now() - device.lastLogin < LOGIN_COOLDOWN) {
      this.log('logged in less than a minute ago, not logging in again');
      return false;
    }

    device.lastLogin = Date.now();
    device.loginPromise = this.login(device)
      .then(() => true)
      .finally(() => {
        device.loginPromise = null;
      });

    return device.loginPromise;
  }

  async login(device) {
    this.log('get new session');

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
      // must match the device name used when the device token was issued
      params.append('device_name', 'Homey');
    }
    this.log(`login with device token: ${did ? 'yes' : 'no'}`);

    const apiUrl = `${protocol}://${host}:${port}/webapi/auth.cgi`;

    this.log(apiUrl);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: params,
      agent: await this.getAgent(apiUrl)
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
    this.log(`login success: ${response && response.success}`);

    if (response !== undefined && response.data !== undefined && response.data.sid !== undefined) {
      // result = ok
      const oldSid = device.getStoreValue('sid');
      await device.storeSession(response.data.sid, response.data.did);
      device.logout(oldSid).catch(this.error);
    } else if (response !== undefined) {
      // result not ok
      this.log('Error', response.error && response.error.code);
      throw new Error('pair exception');
    }
  }

  /**
   * close a session we no longer use, so it does not stay open on the Synology
   * @param {string} sid
   */
  async logout(sid) {
    if (sid === undefined || sid === null || sid === '') {
      return;
    }

    const protocol = this.getStoreValue('protocol');
    const port = this.getStoreValue('port');
    const host = this.getStoreValue('host');
    const qs = {
      api: 'SYNO.API.Auth',
      method: 'Logout',
      version: 6,
      session: 'SurveillanceStation',
      _sid: sid,
    };
    const apiUrl = `${protocol}://${host}:${port}/webapi/auth.cgi?${querystring.stringify(qs)}`;

    this.log('logout old session');
    await fetch(apiUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      agent: await this.getAgent(apiUrl),
    });
  }

}

module.exports = DeviceBase;
