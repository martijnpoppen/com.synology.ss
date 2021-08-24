'use strict';

const DeviceBase = require('../../lib/devicebase');

class StationDevice extends DeviceBase {

  async onInit() {
    this.log('init device');

    this.setUnavailable(this.homey.__('exception.initializing'))
      .catch(this.error);

    await this.unsetStoreValue('cameras').catch(this.error);

    await this.migrate();

    await this.initCapabilities();

    await this.setCurrentState()
      .then(() => {
        this.setAvailable()
          .catch(this.error);
      })
      .catch(err => {
        this.log(err);
      });

    this.homey.app.addStation(this.getData().id);
  }

  async onAdded() {
    this.log('on added');
  }

  onDeleted() {
    this.log('on deleted');
    // delete home mode rules
    this.deleteHomeModeRules();
  }

  async migrate() {
    this.log('migrate device');

    const appVersion = this.homey.manifest.version;
    const deviceVersion = this.getStoreValue('version');

    this.log(appVersion);
    this.log(deviceVersion);

    if (appVersion === deviceVersion) {
      // same version, no migration
      return true;
    }

    // edit settings
    const newSettings = {
      protocol: null,
      host: null,
      port: null,
      account: null,
      passwd: null,
      snapshot_path: null,
    };

    await this.setSettings(newSettings).catch(this.error);

    if (appVersion === '4.0.0') {
      // delete old action rules
      await this.deleteHomeModeRules();
    }

    // set version
    this.setStoreValue('version', appVersion)
      .catch(this.error);
    return true;
  }

  async initCapabilities() {
    if (this.hasCapability('button.repair_action_rules') === false) {
      await this.addCapability('button.repair_action_rules');
    }

    this.registerCapabilityListener('button.repair_action_rules', async () => {
      await this.repairActionRules();
    });

    await this.initCapabilityHomeMode();
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    // webhook_host
    if (changedKeys.includes('webhook_host') === true) {
      this.deleteHomeModeRules();
      this.repairActionRules();
      this.triggerCamerasOnWebhookHostChanged();
    }
  }

  getId() {
    const data = this.getData();
    return data.id;
  }

  async getWebhookUrl(eventName) {
    const stationId = this.getId();
    let address;

    this.log(this.getSetting('webhook_host'));
    if (this.getSetting('webhook_host') === 'local') {
      address = await this.getLocalAddress();
    } else {
      address = await this.getCloudAddress();
    }

    return `${address}/api/app/com.synology.ss/station/${stationId}/${eventName}`;
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

    Object.keys(rules)
      .forEach(key => {
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
    const webhookUrl = await this.getWebhookUrl(`homemode_${state}`);
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
      actions: `[{"id":-1,"actSrc":1,"actDsId":0,"actDevId":-1,"actId":-1,"actItemId":-1,"actTimes":1,"actTimeUnit":1,"actTimeDur":10,"actRetPos":-2,"extUrl":"${webhookUrl}","userName":"","password":"","iftttKey":"","iftttEvent":"","param1":"","param2":"","param3":"","webhookReqMethod":0,"httpContentType":0,"httpBody":""}]`,
      actSchedule: '"111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"',
    };

    await this.fetchApi('/webapi/entry.cgi', qs);

    const ruleHomeMode = await this.getActionRuleHomeMode(webhookUrl);

    // save rule id
    this.setStoreValue(`rule_home_mode_${state}`, ruleHomeMode);
  }

  async getActionRuleHomeMode(extUrl) {
    this.log('get action rule home mode');

    const actRule = await this.getActionRules();

    let ruleMatch = 0;
    Object.keys(actRule)
      .forEach(i => {
        const rule = actRule[i];

        Object.keys(rule.events)
          .forEach(e => {
            const event = rule.events[e];

            this.log(event.evtDevName);
            this.log(event.evtDevId);
            this.log(event.evtId);
          });

        Object.keys(rule.actions)
          .forEach(a => {
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

    await this.fetchApi('/webapi/entry.cgi', qs);
  }

  async setCurrentState() {
    this.log('set currrent state');

    const qs = {
      api: 'SYNO.SurveillanceStation.HomeMode',
      method: 'GetInfo',
      version: 1,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);

    if (response === undefined || response.data === undefined || response.data.on === undefined
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
    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    return response;
  }

  async onHomeModeStatusChange(value) {
    this.log(`on home mode state change to ${value.toString()}`);

    if (this.getCapabilityValue('home_mode') !== value) {
      this.setCapabilityValue('home_mode', value).catch(this.error);
    }

    if (value === false) {
      this.driver.triggerHomeModeOff(this, {}, {});
    } else if (value === true) {
      this.driver.triggerHomeModeOn(this, {}, {});
    }
  }

  async registerCamera(id, driver) {
    this.log('register camera', id, driver);

    const storeKey = (driver === 'ptz-camera') ? 'ptz-cameras' : 'cameras';

    let cameras = this.getStoreValue(storeKey);

    if (cameras === null || cameras === undefined) {
      this.log('new array with cameras');
      cameras = [];
    }

    if (cameras.indexOf(id) === -1) {
      cameras.push(id);
    }

    this.log(cameras);

    await this.setStoreValue(storeKey, cameras)
      .catch(this.error);
  }

  async getDevices() {
    const devices = [];
    const cameras = await this.getStoreValue('cameras');
    if (Array.isArray(cameras)) {
      cameras.forEach(camera => {
        const device = {
          id: camera,
          driver: 'camera',
        };
        devices.push(device);
      });
    }
    const ptzCameras = await this.getStoreValue('ptz-cameras');
    if (Array.isArray(ptzCameras)) {
      ptzCameras.forEach(ptzCamera => {
        const device = {
          id: ptzCamera,
          driver: 'ptz-camera',
        };
        devices.push(device);
      });
    }

    return devices;
  }

  async onNewSid() {
    this.log('station on new sid');

    this.setAvailable();

    const devices = this.getDevices();
    if (devices.length === 0) {
      this.log('no cameras for this station');
      return;
    }

    this.log(devices);

    await Promise.all(devices.map(async device => {
      this.log(device);
      try {
        const camera = this.getCamera(device.id, device.driver);
        await camera.onNewSid();
      } catch (e) {
        this.log(e);
      }
    }));
  }

  /**
   * When Session ID fails, trigger failed method for all camera's
   * @returns {Promise<void>}
   */
  async onSidFail() {
    this.log('station sid failed');

    this.setUnavailable(this.homey.__('exception.authentication_failed'));

    this.homey.notifications.registerNotification({ excerpt: this.homey.__('exception.authentication_failed') }, (e, n) => { });

    const devices = this.getDevices();
    if (devices.length === 0) {
      this.log('no cameras for this station');
      return;
    }

    this.log(devices);

    await Promise.all(devices.map(async device => {
      this.log(device);
      try {
        const camera = this.getCamera(device.id, device.driver);
        await camera.onSidFail();
      } catch (e) {
        this.log(e);
      }
    }));
  }

  async initCapabilityHomeMode() {
    if (this.hasCapability('home_mode') === false) {
      await this.addCapability('home_mode');
    }

    await this.setCapabilityHomeModeRules();

    this.registerCapabilityListener('home_mode', async value => {
      this.log(`set home mode: ${value.toString()}`);
      this.setHomeMode(value);
      return true;
    });
  }

  async setCapabilityHomeModeRules() {
    try {
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
      return true;
    } catch (err) {
      this.log(err);
      return false;
    }
  }

  async repairActionRules() {
    const successHomeMode = await this.setCapabilityHomeModeRules();
    if (successHomeMode === false) {
      throw new Error('Could not set home mode action rules');
    }
  }

  async getInfo() {
    this.log('get info');

    const qs = {
      api: 'SYNO.SurveillanceStation.Info',
      method: 'GetInfo',
      version: 5,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);

    if (response.success === false) {
      throw new Error('Could not get info');
    }

    return response.data;
  }

  async triggerCamerasOnWebhookHostChanged() {
    this.log('trigger cameras on webhook changed');

    const devices = await this.getDevices();
    if (devices.length === 0) {
      this.log('no cameras for this station');
      return;
    }

    this.log(devices);

    await Promise.all(devices.map(async device => {
      this.log(device);
      try {
        const camera = this.getCamera(device.id, device.driver);
        await camera.onWebhookHostChanged();
      } catch (e) {
        this.log(e);
      }
    }));
  }

  getCamera(id, driver) {
    this.log('get camera');

    if (driver !== 'camera' && driver !== 'ptz-camera') {
      this.log(`${driver} is not a driver`);
      throw new Error(`${driver} is not a driver`);
    }

    try {
      const station = this.getId();
      const camSearchId1 = { id, station };
      const camSearchId2 = { id };
      let device;

      try {
        device = this.homey.drivers.getDriver(driver).getDevice(camSearchId1);
      } catch (e) {
        this.log('device not found 1');
      }
      try {
        if (!device) {
          device = this.homey.drivers.getDriver(driver).getDevice(camSearchId2);
        }
      } catch (e) {
        this.log('device not found 2');
        throw new Error('device not found');
      }
      return device;
    } catch (e) {
      this.log(e.error);
      throw new Error(e);
    }
  }

}

module.exports = StationDevice;
