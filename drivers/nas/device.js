'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const { ManagerCloud } = require('homey');
const querystring = require('querystring');

class SynoNasDevice extends Homey.Device {
  async onInit() {
    this.log('init device');

    const data = this.getData();
    const settings = this.getSettings();

    this.log(data);
    this.log(settings);

    try {
      // get new session id
      const sid = await this.getSid(settings);
      this.log(`set sid: ${sid}`);

      // set new sid to store
      this.setStoreValue('sid', sid);
    } catch (e) {
      this.error(e.message);
      this.setUnavailable('Cannot connect to Synology');
    }
  }

  onAdded() {
    this.log('on added');
  }

  onDeleted() {
    this.log('on deleted');
  }

  async onSettings(oldSettingsObj, newSettingsObj, changedKeysArr) {
    this.log('onSettings');
    this.log(oldSettingsObj);
    this.log(newSettingsObj);
    this.log(changedKeysArr);

    if (changedKeysArr.includes('protocol')
        || changedKeysArr.includes('hostname')
        || changedKeysArr.includes('port')
        || changedKeysArr.includes('account')
        || changedKeysArr.includes('password')
        || (changedKeysArr.includes('reset_session') && newSettingsObj.reset_session === true)
    ) {
      try {
        this.log('try to get new sid');
        // get new session id
        const sid = await this.getSid(newSettingsObj);
        this.log(`new sid: ${sid}`);
        // unset old value
        this.unsetStoreValue('sid');
        // set new sid to store
        this.setStoreValue('sid', sid);
        // reset image with new sid
        this.resetImage(newSettingsObj);

        if (this.getAvailable() === false) {
          this.setAvailable();
        }
      } catch (e) {
        this.log(e.message);
        throw new Error('Credentials are not ok');
      }
    }

    // reset reset
    const that = this;
    if (newSettingsObj.reset_session === true) {
      setTimeout(() => { that.setSettings({ reset_session: false }); }, 3000);
    }
  }

  /**
     * get new SID / Session ID
     * @param settings
     */
  async getSid(settings) {
    this.log('get sid');
    const urlq = {
      api: 'SYNO.API.Auth',
      method: 'Login',
      version: 6,
      session: 'SurveillanceStation',
      account: settings.account,
      passwd: settings.passwd,
      format: 'sid',
    };

    const url = `${settings.protocol}://${settings.host}:${settings.port}/webapi/auth.cgi?${querystring.stringify(urlq)}`;

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
      this.error('There has been a problem with your fetch operation:', error);
    });

    this.log('response');
    this.log(response);

    if (response.data !== undefined && response.data.sid !== undefined) {
      return response.data.sid;
    }
    throw new Error('no sid found');
  }

  async getHomeyAddress() {
    this.log('get homey address');

    const homeyId = await ManagerCloud.getHomeyId();
    const address = `https://${homeyId}.connect.athom.com`;

    this.log(address);

    return address;
  }

  async enableActionRule(rule, settings) {
    this.log('enable rule');

    const sid = this.getStoreValue('sid');
    const urlq = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Enable',
      version: 1,
      _sid: sid,
      idList: rule.ruleId,
    };
    const url = `${settings.protocol}://${settings.host}:${settings.port}/webapi/entry.cgi?${querystring.stringify(urlq)}`;
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
      this.error('There has been a problem with your fetch operation:', error);
      throw new Error(error);
    });

    this.log('response');
    this.log(response);

    if (response.success === undefined || response.success === false) {
      throw new Error('response from synology is not ok');
    }
  }

  async disableActionRule(rule, settings) {
    this.log('disable rule');

    const sid = this.getStoreValue('sid');
    const urlq = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Disable',
      version: 1,
      _sid: sid,
      idList: rule.ruleId,
    };
    const url = `${settings.protocol}://${settings.host}:${settings.port}/webapi/entry.cgi?${querystring.stringify(urlq)}`;
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
      this.error('There has been a problem with your fetch operation:', error);
      throw new Error(error);
    });

    this.log('response');
    this.log(response);

    if (response.success === undefined || response.success === false) {
      throw new Error('response from synology is not ok');
    }
  }

  async getActionRules(settings) {
    this.log('getActionRules');
    const sid = this.getStoreValue('sid');
    const urlq = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'List',
      version: 3,
      _sid: sid,
    };
    const url = `${settings.protocol}://${settings.host}:${settings.port}/webapi/entry.cgi?${querystring.stringify(urlq)}`;
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
      this.error('There has been a problem with your fetch operation:', error);
      throw new Error(error);
    });

    this.log('response');
    this.log(response);

    if (response.data === undefined) {
      throw new Error('no rules found');
    }

    return response.data.actRule;
  }

  // add action rule
  async deleteMotionDetectionRule(settings) {
    this.log('delete motion detection rule');

    const ruleMotion = this.getStoreValue('rule_motion');
    const sid = this.getStoreValue('sid');
    const urlq = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Delete',
      version: 1,
      idList: ruleMotion,
      _sid: sid,
    };
    const url = `${settings.protocol}://${settings.host}:${settings.port}/webapi/entry.cgi?${querystring.stringify(urlq)}`;

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
      this.error('There has been a problem with your fetch operation:', error);
      throw new Error(error);
    });

    this.log('response');
    this.log(response);
  }
}

module.exports = SynoNasDevice;
