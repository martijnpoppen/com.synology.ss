'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const { ManagerCloud } = require('homey');
const querystring = require('querystring');

class StationDevice extends Homey.Device {
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
      return;
    }

    // get/set current state
    this.setCurrentState(settings);

    this.registerCapabilityListener('home_mode', async (value) => {
      this.log('set home mode: '+value.toString());
      this.setHomeMode(value, settings);
      return true;
    });

    let setHomeModeOnAction = new Homey.FlowCardAction('home_mode_on');
    setHomeModeOnAction
      .register()
      .registerRunListener(async ( args, state ) => {
        this.setHomeMode(true, settings); // Promise<void>
        return true;
      });

    let setHomeModeOffAction = new Homey.FlowCardAction('home_mode_off');
    setHomeModeOffAction
      .register()
      .registerRunListener(async ( args, state ) => {
        this.setHomeMode(false, settings);
        return true;
      });

    this.setAvailable();
  }

  async onAdded() {
    this.log('on added');

    const settings = this.getSettings();

    // Home Mode On rule
    const ruleOn = await this.getHomeModeRule(settings, 'on');
    if (ruleOn !== false) {
      // enable rule
      await this.enableActionRule(ruleOn, settings);
    } else {
      // add action rule
      await this.createHomeModeRule(settings, 'on');
    }

    // Home Mode Off rule
    const ruleOff = await this.getHomeModeRule(settings, 'off');
    if (ruleOff !== false) {
      // enable rule
      await this.enableActionRule(ruleOff, settings);
    } else {
      // add action rule
      await this.createHomeModeRule(settings, 'off');
    }
  }

  onDeleted() {
    this.log('on deleted');

    const settings = this.getSettings();

    // add motion detection rule
    this.deleteHomeModeRules(settings);
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

  async getHomeModeRule(settings, state) {
    this.log('get home mode rule');
    const ruleHomeMode = this.getStoreValue('rule_home_mode_'+state);
    this.log(ruleHomeMode);

    // no rule yet
    if (ruleHomeMode === undefined || Number.isInteger(ruleHomeMode) === false) {
      return false;
    }

    // get from synology
    const rules = await this.getActionRules(settings);
    let homeModeRule = null;

    Object.keys(rules).forEach((key) => {
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

  async createHomeModeRule(settings, state) {
    this.log('create home mode rule '+state);

    const homeyaddress = await this.getHomeyAddress();
    const data = this.getData();
    const deviceApiHomeModeUrl = `${homeyaddress}/api/app/com.synology.ss/homemode_${state}/${data.id}`;
    const sid = this.getStoreValue('sid');
    const evtId=(state==='on') ? 20 : 21;
    const urlq = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Save',
      version: 3,
      _sid: sid,
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

    const ruleHomeMode = await this.getActionRuleHomeMode(settings, deviceApiHomeModeUrl);

    // save rule id
    this.setStoreValue('rule_home_mode_'+state, ruleHomeMode);
  }

  async getActionRuleHomeMode(settings, extUrl) {
    this.log('get action rule home mode');

    const actRule=await this.getActionRules(settings);

    let ruleMatch = 0;
    Object.keys(actRule).forEach((i) => {
      const rule = actRule[i];

      Object.keys(rule.events).forEach((e) => {
        const event = rule.events[e];

        this.log(event.evtDevName);
        this.log(event.evtDevId);
        this.log(event.evtId);
      });

      Object.keys(rule.actions).forEach((a) => {
        const action = rule.actions[a];

        if (action.extUrl === extUrl) {
          // rule found!
          this.log(`home mode rule found: ${rule.ruleId}`);
          ruleMatch = rule.ruleId;
          return ruleMatch;
        }
      });
    });

    if (ruleMatch > 0) {
      this.log(`rule ${ruleMatch} found`);
      return ruleMatch;
    }
    throw new Error('no rule found');
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
  async deleteHomeModeRules(settings) {
    this.log('delete home mode rules');
    const ruleList=[];

    const ruleHomeModeOn = this.getStoreValue('rule_motion_on');
    if (ruleHomeModeOn !== undefined || Number.isInteger(ruleHomeModeOn) === true) {
      ruleList.push(ruleHomeModeOn);
    }

    const ruleHomeModeOff = this.getStoreValue('rule_motion_off');
    if (ruleHomeModeOff !== undefined || Number.isInteger(ruleHomeModeOff) === true) {
      ruleList.push(ruleHomeModeOff);
    }

    if(ruleList.length===0) {
      return;
    }

    const idList=ruleList.join(',');
    this.log(idList);

    const sid = this.getStoreValue('sid');
    const urlq = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Delete',
      version: 1,
      idList: idList,
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

  async setCurrentState(settings) {
    this.log('set currrent state');

    const sid = this.getStoreValue('sid');
    const urlq = {
      api: 'SYNO.SurveillanceStation.HomeMode',
      method: 'GetInfo',
      version: 1,
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

    if (response.success === undefined || response.success === false) {
      throw new Error('response from synology is not ok');
    }

    if (response.data === undefined || response.data.on === undefined
    || typeof response.data.on !== "boolean") {
      throw new Error('no current state found or wrong data returned from Synology');
    }

    this.log('set currrent state to '+response.data.on.toString());

    // set capability
    this.setCapabilityValue('home_mode', response.data.on)
      .catch(this.error);
  }

  async setHomeMode(value, settings){
    this.log('set home mode');

    const sid = this.getStoreValue('sid');
    const urlq = {
      api: 'SYNO.SurveillanceStation.HomeMode',
      method: 'Switch',
      version: 1,
      _sid: sid,
      on: value,
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

  async onHomeModeStatusChange(value){
    this.log('on home mode state change to '+value.toString());

    if(this.getCapabilityValue('home_mode')===value) {
      this.log('device state already '+value.toString());
      return;
    }

    this.setCapabilityValue('home_mode', value)
      .catch(this.error);
  }
}

module.exports = StationDevice;
