'use strict';

const Homey = require('homey');
const { ManagerDrivers } = require('homey');
const { ManagerNotifications } = require('homey');
const DeviceBase = require('../../lib/devicebase');

class StationDevice extends DeviceBase {

  async onInit() {
    this.log('init device');

    this.setUnavailable(Homey.__('exception.initializing'))
      .catch(this.error);

    const data = this.getData();

    await this.unsetStoreValue('cameras').catch(this.error);

    this.ready(() => {
      Homey.app.addStation(data.id);
    });

    await this.migrate();

    await this.initCapabilities();

    const setHomeModeOnAction = new Homey.FlowCardAction('home_mode_on');
    setHomeModeOnAction
      .register()
      .registerRunListener(async args => {
        const device = args.station;
        device.setHomeMode(true);
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

    this.setCurrentState()
      .then(() => {
        this.setAvailable()
          .catch(this.error);
      })
      .catch(err => {
        this.log(err);
      });
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

    const appVersion = Homey.manifest.version;
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

    await this.fetchApi('/webapi/entry.cgi', qs);

    const ruleHomeMode = await this.getActionRuleHomeMode(deviceApiHomeModeUrl);

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

  async registerCamera(id) {
    this.log('register camera', id);
    let cameras = this.getStoreValue('cameras');

    if (cameras === null || cameras === undefined) {
      this.log('new array with cameras');
      cameras = [];
    }

    if (cameras.indexOf(id) === -1) {
      cameras.push(id);
    }

    this.log(cameras);

    await this.setStoreValue('cameras', cameras)
      .catch(this.error);
  }

  async onNewSid() {
    this.log('station on new sid');

    this.setAvailable();

    const cameras = await this.getStoreValue('cameras');
    if (cameras === null || cameras === undefined || cameras.length === 0) {
      this.log('no cameras for this station');
      return;
    }

    this.log(cameras);

    await Promise.all(cameras.map(async cameraId => {
      this.log(cameraId);
      const camera = ManagerDrivers.getDriver('camera').getDevice({ id: Number(cameraId) });
      if (camera !== undefined && camera !== null && !(camera instanceof Error)) {
        await camera.onNewSid();
      }
    }));
  }

  /**
   * When Session ID fails, trigger failed method for all camera's
   * @returns {Promise<void>}
   */
  async onSidFail() {
    this.log('station sid failed');

    this.setUnavailable(Homey.__('exception.authentication_failed'));

    ManagerNotifications.registerNotification({ excerpt: Homey.__('exception.authentication_failed') }, (e, n) => {});

    const cameras = await this.getStoreValue('cameras');
    if (cameras === null || cameras === undefined || cameras.length === 0) {
      this.log('no cameras for this station');
      return;
    }

    this.log(cameras);

    await Promise.all(cameras.map(async cameraId => {
      this.log(cameraId);
      const camera = ManagerDrivers.getDriver('camera').getDevice({ id: Number(cameraId) });
      if (camera !== undefined && camera !== null && !(camera instanceof Error)) {
        await camera.onSidFail();
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

}

module.exports = StationDevice;
