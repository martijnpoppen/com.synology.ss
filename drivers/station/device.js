'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const DeviceBase = require('../../lib/devicebase');

class StationDevice extends DeviceBase {

  async onInit() {
    this.log('init device');
    this.setUnavailable('initializing').catch(this.error);

    const data = this.getData();
    const settings = this.getSettings();

    this.log(data);
    this.log(settings);

    await this.migrate();

    this.registerCapabilityListener('home_mode', async value => {
      this.log(`set home mode: ${value.toString()}`);
      this.setHomeMode(value);
      return true;
    });

    const setHomeModeOnAction = new Homey.FlowCardAction('home_mode_on');
    setHomeModeOnAction
      .register()
      .registerRunListener(async args => {
        const device = args.station;
        device.setHomeMode(true); // Promise<void>
        return true;
      });

    const setHomeModeOffAction = new Homey.FlowCardAction('home_mode_off');
    setHomeModeOffAction
      .register()
      .registerRunListener(async args => {
        const device = args.station;
        device.setHomeMode(false);
        return true;
      });

    // get/set current state
    this.setCurrentState()
      .then(() => {
        this.setAvailable().catch(this.error);
      })
      .catch(err => {
        this.pairException();
        this.log(err);
      });
  }

  async onAdded() {
    this.log('on added');

    // Home Mode On rule
    const ruleOn = await this.getHomeModeRule('on');
    if (ruleOn !== false) {
      // enable rule
      await this.enableActionRule(ruleOn);
    } else {
      // add action rule
      await this.createHomeModeRule('on');
    }

    // Home Mode Off rule
    const ruleOff = await this.getHomeModeRule('off');
    if (ruleOff !== false) {
      // enable rule
      await this.enableActionRule(ruleOff);
    } else {
      // add action rule
      await this.createHomeModeRule('off');
    }
  }

  onDeleted() {
    this.log('on deleted');
    // delete home mode rules
    this.deleteHomeModeRules();
  }

  async setPairData(protocol, host, port, sid) {
    // store data
    await this.storePairData(protocol, host, port, sid);
    // set available
    this.setAvailable().catch(this.error);
  }

  async migrate() {
    this.log('migrate device');

    const appVersion = Homey.manifest.version;
    const deviceVersion = this.getStoreValue('version');
    const settings = this.getSettings();

    this.log(appVersion);
    this.log(deviceVersion);

    if (appVersion === deviceVersion) {
      // same version, no migration
      return true;
    }

    switch (appVersion) {
      case '2.1.0':
        if (settings.protocol !== null) {
          const sid = this.getStoreValue('sid');
          // copy host settings to store
          await this.storePairData(settings.protocol, settings.host, settings.port, sid);
          this.log('host settings copied to store');
          // remove api settings
          settings.protocol = null;
          settings.host = null;
          settings.port = null;
          settings.account = null;
          settings.passwd = null;
          this.log(settings);
          this.setSettings(settings).catch(this.error);
          this.log('api settings removed');
        }
        break;
      default:
        this.log('nothing to migrate');
    }

    // set version
    this.setStoreValue('version', appVersion).catch(this.error);
    return true;
  }

  async getHomeModeRule(state) {
    this.log('get home mode rule');
    const ruleHomeMode = this.getStoreValue(`rule_home_mode_${state}`);
    this.log(ruleHomeMode);

    // no rule yet
    if (ruleHomeMode === undefined || Number.isInteger(ruleHomeMode) === false) {
      return false;
    }

    // get from synology
    const rules = await this.getActionRules();
    let homeModeRule = null;

    Object.keys(rules).forEach(key => {
      const rule = rules[key];
      if (rule.ruleId === ruleHomeMode) {
        homeModeRule = rule;
      }
    });

    if (homeModeRule !== null) {
      return homeModeRule;
    }

    return false;
  }

  async createHomeModeRule(state) {
    this.log(`create home mode rule ${state}`);

    const homeyaddress = await this.getHomeyAddress();
    const data = this.getData();
    const deviceApiHomeModeUrl = `${homeyaddress}/api/app/com.synology.ss/homemode_${state}/${data.id}`;
    const evtId = (state === 'on') ? 20 : 21;

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Save',
      version: 3,
      name: `"Homey Home Mode ${state}"`,
      multiRuleId: -1,
      ruleType: 0,
      actType: 0,
      multiEvtSetting: 0,
      evtMinIntvl: 10,
      events: `[{"evtSrc":4,"evtDsId":0,"evtDevId":0,"evtId":${evtId},"evtItem":-1,"evtTrig":0,"evtWebhookToken":""}]`,
      actions: `[{"id":-1,"actSrc":1,"actDsId":0,"actDevId":-1,"actId":-1,"actItemId":-1,"actTimes":1,"actTimeUnit":1,"actTimeDur":10,"actRetPos":-2,"extUrl":"${deviceApiHomeModeUrl}","userName":"","password":"","iftttKey":"","iftttEvent":"","param1":"","param2":"","param3":"","webhookReqMethod":0,"httpContentType":0,"httpBody":""}]`,
      actSchedule: '"111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"',
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

    const ruleHomeMode = await this.getActionRuleHomeMode(deviceApiHomeModeUrl);

    // save rule id
    this.setStoreValue(`rule_home_mode_${state}`, ruleHomeMode);
  }

  async getActionRuleHomeMode(extUrl) {
    this.log('get action rule home mode');

    const actRule = await this.getActionRules();

    let ruleMatch = 0;
    Object.keys(actRule).forEach(i => {
      const rule = actRule[i];

      Object.keys(rule.events).forEach(e => {
        const event = rule.events[e];

        this.log(event.evtDevName);
        this.log(event.evtDevId);
        this.log(event.evtId);
      });

      Object.keys(rule.actions).forEach(a => {
        const action = rule.actions[a];

        if (action.extUrl === extUrl) {
          // rule found!
          this.log(`home mode rule found: ${rule.ruleId}`);
          ruleMatch = rule.ruleId;
        }
        return ruleMatch;
      });
    });

    if (ruleMatch > 0) {
      this.log(`rule ${ruleMatch} found`);
      return ruleMatch;
    }
    throw new Error('no rule found');
  }

  // add action rule
  async deleteHomeModeRules() {
    this.log('delete home mode rules');
    const ruleList = [];

    const ruleHomeModeOn = this.getStoreValue('rule_home_mode_on');
    if (ruleHomeModeOn !== undefined && Number.isInteger(ruleHomeModeOn) === true) {
      ruleList.push(ruleHomeModeOn);
    }

    const ruleHomeModeOff = this.getStoreValue('rule_home_mode_off');
    if (ruleHomeModeOff !== undefined && Number.isInteger(ruleHomeModeOff) === true) {
      ruleList.push(ruleHomeModeOff);
    }

    if (ruleList.length === 0) {
      this.log('no rules to delete');
      return;
    }

    this.log(ruleList);

    const idList = ruleList.join(',');
    this.log(idList);

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Delete',
      version: 1,
      idList,
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
  }

  async setCurrentState() {
    this.log('set currrent state');

    const qs = {
      api: 'SYNO.SurveillanceStation.HomeMode',
      method: 'GetInfo',
      version: 1,
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

    if (response.data === undefined || response.data.on === undefined
    || typeof response.data.on !== 'boolean') {
      throw new Error('no current state found or wrong data returned from Synology');
    }

    this.log(`set currrent state to ${response.data.on.toString()}`);

    // set capability
    this.setCapabilityValue('home_mode', response.data.on)
      .catch(this.error);
  }

  async setHomeMode(value) {
    this.log('set home mode');

    const qs = {
      api: 'SYNO.SurveillanceStation.HomeMode',
      method: 'Switch',
      version: 1,
      on: value,
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

  async onHomeModeStatusChange(value) {
    this.log(`on home mode state change to ${value.toString()}`);

    if (this.getCapabilityValue('home_mode') === value) {
      this.log(`device state already ${value.toString()}`);
      return;
    }

    // set capability
    this.setCapabilityValue('home_mode', value)
      .catch(this.error);

    // trigger flows
    const device = this;
    const tokens = {};
    const state = {};

    this._driver = this.getDriver();

    if (value === false) {
      this._driver.triggerHomeModeOff(device, tokens, state);
    } else if (value === true) {
      this._driver.triggerHomeModeOn(device, tokens, state);
    }
  }

}

module.exports = StationDevice;
