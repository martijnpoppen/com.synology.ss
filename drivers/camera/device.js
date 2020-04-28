'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const querystring = require('querystring');

class SynoCameraDevice extends Homey.Device {
  async onInit() {
    this.log('init device');

    const data = this.getData();
    const settings = this.getSettings();

    this.log(data);
    this.log(settings);

    this.migrate();

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

    // timers
    this.motion_timer = null;

    // set image
    this.setImage(settings);

    // update image action
    const updateImageAction = new Homey.FlowCardAction('update_image');
    updateImageAction
      .register()
      .registerRunListener(() => {
        this.image.update();
        return Promise.resolve(true);
      });

    if (settings.motion_detection === true
            && this.hasCapability('alarm_motion') === false) {
      this.addCapability('alarm_motion');
    }

    this.setAvailable();
  }

  migrate() {
    this.log('migrate device');

    const appVersion = Homey.manifest.version;
    const deviceVersion = this.getStoreValue('version');

    this.log(appVersion);
    this.log(deviceVersion);

    if (appVersion === deviceVersion) {
      // same version, no migration
      return true;
    }

    switch (appVersion) {
      case '1.1.0':
        this.setClass('sensor')
          .catch(this.error)
          .then(this.log);
        this.log('camera changed to sensor class');
        break;
      default:
        this.log('nothing to migrate');
    }

    // set version
    this.setStoreValue('version', appVersion);
    return true;
  }

  onAdded() {
    this.log('on added');
    const settings = this.getSettings();

    // add motion detection rule
    if (settings.motion_detection === true) {
      this.enableMotionDetection(settings);
    }
  }

  onDeleted() {
    this.log('on deleted');
    const settings = this.getSettings();

    // add motion detection rule
    this.deleteMotionDetectionRule(settings);
  }

  setImage(settings) {
    this.log('set image');

    // get session id
    const sid = this.getStoreValue('sid');
    const snapshotPath = this.getStoreValue('snapshot_path');

    this.image = new Homey.Image();
    this.image.setStream(async (stream) => {
      const res = await fetch(`${settings.protocol}://${settings.host}:${settings.port}${snapshotPath}&_sid=${sid}`);
      if (!res.ok) {
        this.log(res);
        throw new Error(res.statusText);
      }
      res.body.pipe(stream);
    });

    this.image.register()
      .then(() => {
        return this.setCameraImage('front', Homey.__('camera.front.title'), this.image);
      })
      .catch(this.error);
  }

  resetImage(settings) {
    this.log('reset image');

    // unregister image
    this.image.unregister();

    // set new image
    this.setImage(settings);
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

    if (changedKeysArr.includes('motion_detection')
            && newSettingsObj.motion_detection === true) {
      await this.enableMotionDetection(newSettingsObj);
    }

    if (changedKeysArr.includes('motion_detection')
            && newSettingsObj.motion_detection === false) {
      await this.disableMotionDetection(newSettingsObj);
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

    const homeyId = await Homey.ManagerCloud.getHomeyId();
    const address = `https://${homeyId}.connect.athom.com`;

    this.log(address);

    return address;
  }

  async enableMotionDetection(settings) {
    this.log('enable motion detection');

    const rule = await this.getMotionDetectionRule(settings);

    if (rule !== false) {
      // enable rule
      await this.enableActionRule(rule, settings);
    } else {
      // add action rule
      await this.createMotionDetectionRule(settings);
    }

    this.addCapability('alarm_motion');
  }

  async disableMotionDetection(settings) {
    this.log('disable motion detection');
    const rule = await this.getMotionDetectionRule(settings);

    if (rule !== false) {
      // disable rule
      await this.disableActionRule(rule, settings);
    }

    this.removeCapability('alarm_motion');
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

  async getMotionDetectionRule(settings) {
    this.log('get motion detection rule');
    const ruleMotion = this.getStoreValue('rule_motion');
    this.log(ruleMotion);

    // no rule yet
    if (ruleMotion === undefined || Number.isInteger(ruleMotion) === false) {
      return false;
    }

    // get from synology
    const rules = await this.getActionRules(settings);
    let motionRule = null;

    Object.keys(rules).forEach((key) => {
      const rule = rules[key];
      if (rule.ruleId === ruleMotion) {
        motionRule = rule;
      }
    });

    if (motionRule !== null) {
      return motionRule;
    }

    return false;
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

  onMotion() {
    this.log('new motion request');

    const settings = this.getSettings();
    if (settings.motion_detection === false) {
      return;
    }

    if (this.motion_timer !== null) {
      this.log('clear timer');
      clearTimeout(this.motion_timer);
    } else {
      this.log('device motion started');
      this.setCapabilityValue('alarm_motion', true);
      this.image.update();
    }

    const that = this;
    this.log('start new timer for 15s');
    this.motion_timer = setTimeout(() => {
      that.setCapabilityValue('alarm_motion', false);
      that.motion_timer = null;
      this.log('device motion ended');
    }, 21000);
  }

  async createMotionDetectionRule(settings) {
    this.log('create motion detection rule');

    // create rule
    const homeyaddress = await this.getHomeyAddress();
    const data = this.getData();
    const deviceApiMotionUrl = `${homeyaddress}/api/app/com.synology.ss/motion/${data.id}`;
    const sid = this.getStoreValue('sid');
    const urlq = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Save',
      version: 3,
      _sid: sid,
      name: `"Homey Motion Detection for ${this.getName()}"`,
      multiRuleId: -1,
      ruleType: 0,
      actType: 0,
      multiEvtSetting: 0,
      evtMinIntvl: 10,
      events: `[{"evtSrc":0,"evtDsId":0,"evtDevId":${data.id},"evtId":5,"evtItem":-1,"evtTrig":1,"evtWebhookToken":""}]`,
      actions: `[{"id":-1,"actSrc":1,"actDsId":0,"actDevId":-1,"actId":-1,"actItemId":-1,"actTimes":1,"actTimeUnit":1,"actTimeDur":10,"actRetPos":-2,"extUrl":"${deviceApiMotionUrl}","userName":"","password":"","iftttKey":"","iftttEvent":"","param1":"","param2":"","param3":"","webhookReqMethod":0,"httpContentType":0,"httpBody":""}]`,
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

    // get and save action rule id
    const ruleMotion = await this.getActionRuleMotionDetection(settings, deviceApiMotionUrl);

    // save rule id
    this.setStoreValue('rule_motion', ruleMotion);
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

  async getActionRuleMotionDetection(settings, deviceApiMotionUrl) {
    this.log('create motion detection rule');

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

    let ruleMatch = 0;
    Object.keys(response.data.actRule).forEach((i) => {
      const rule = response.data.actRule[i];

      Object.keys(rule.events).forEach((e) => {
        const event = rule.events[e];

        this.log(event.evtDevName);
        this.log(event.evtDevId);
        this.log(event.evtId);
      });

      Object.keys(rule.actions).forEach((a) => {
        const action = rule.actions[a];

        if (action.extUrl === deviceApiMotionUrl) {
          // rule found!
          this.log(`motion rule found: ${rule.ruleId}`);
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
}

module.exports = SynoCameraDevice;
