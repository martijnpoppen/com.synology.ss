'use strict';

const Homey = require('homey');
const querystring = require('querystring');
const fetch = require('node-fetch');

class DeviceBase extends Homey.Device {

  pairException() {
    this.setUnavailable(Homey.__('pair.lost'));
  }

  async getHomeyAddress() {
    this.log('get homey address');

    const homeyId = await Homey.ManagerCloud.getHomeyId();
    const address = `https://${homeyId}.connect.athom.com`;

    this.log(address);

    return address;
  }

  async storePairData(protocol, host, port, sid) {
    // store data
    await this.setStoreValue('sid', sid).catch(this.error);
    await this.setStoreValue('protocol', protocol).catch(this.error);
    await this.setStoreValue('host', host).catch(this.error);
    await this.setStoreValue('port', port).catch(this.error);
  }

  getSid() {
    this.log('get sid');
    return this.getStoreValue('sid');
  }

  getAPIUrl(path = '', qs = {}) {
    this.log('get api url');
    const protocol = this.getStoreValue('protocol');
    const host = this.getStoreValue('host');
    const port = this.getStoreValue('port');

    // add sid to querystring
    qs._sid = this.getSid();
    this.log(qs);

    // compile url
    const url = `${protocol}://${host}:${port}${path}?${querystring.stringify(qs)}`;

    this.log(url);
    return url;
  }

  querystringToObject(qs) {
    return querystring.parse(qs);
  }

  async getActionRules() {
    this.log('getActionRules');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'List',
      version: 3,
    };
    const apiUrl = this.getAPIUrl('/webapi/entry.cgi', qs);
    const response = await fetch(apiUrl, {
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

  async enableActionRule(rule) {
    this.log('enable rule');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Enable',
      version: 1,
      idList: rule.ruleId,
    };

    const apiUrl = this.getAPIUrl('/webapi/entry.cgi', qs);

    const response = await fetch(apiUrl, {
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
      this.error('There has been a problem with your fetch operation:', error);
      throw new Error(error);
    });

    this.log('response');
    this.log(response);

    if (response.success === undefined || response.success === false) {
      throw new Error('response from synology is not ok');
    }
  }

  async disableActionRule(rule) {
    this.log('disable rule');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Disable',
      version: 1,
      idList: rule.ruleId,
    };

    const apiUrl = this.getAPIUrl('/webapi/entry.cgi', qs);

    const response = await fetch(apiUrl, {
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
      this.error('There has been a problem with your fetch operation:', error);
      throw new Error(error);
    });

    this.log('response');
    this.log(response);

    if (response.success === undefined || response.success === false) {
      throw new Error('response from synology is not ok');
    }
  }

}

module.exports = DeviceBase;
