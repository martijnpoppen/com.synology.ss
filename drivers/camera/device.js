'use strict';

const Homey = require('homey');
const { ManagerDrivers } = require('homey');
const DeviceBase = require('../../lib/devicebase');

class SynoCameraDevice extends DeviceBase {

  /**
   * on init
   * @returns {Promise<void>}
   */
  async onInit() {
    this.log('init device');

    this.cameraImage = null;
    this.motion_timer = null;

    this.setUnavailable(Homey.__('exception.initializing')).catch(this.error);

    await this.migrate();

    const stationId = this.getStoreValue('station_id');
    if (stationId !== undefined && stationId !== null) {
      await this.initStation(stationId);
    } else {
      this.log('no station set for camera');
      this.setUnavailable(Homey.__('exception.no_station_found')).catch(this.error);
    }

    this.log('init end');
  }

  /**
   * actions on updates to new version
   * @returns {Promise<boolean>}
   */
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

    // switch class to sensor
    if (this.getClass() !== 'sensor') {
      await this.setClass('sensor').catch(this.error);
    } else {
      this.log('camera class already on sensor');
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

    // add capability
    if (this.hasCapability('button.repair_action_rules') === false) {
      await this.addCapability('button.repair_action_rules');
    }

    // set version
    this.setStoreValue('version', appVersion).catch(this.error);
    return true;
  }

  /**
   * wait for the station to be ready
   * @param {Number} stationId
   */
  async initStation(stationId) {
    let timer = 0;
    const intVal = setInterval(() => {
      timer++;
      const stationReady = Homey.app.isStationReady(stationId);
      if (stationReady === true) {
        this.log('stop timer, station is ready');
        // finish
        clearInterval(intVal);
        this.onStationReady();
      } else if (timer > 60) {
        // timeout
        this.log('stop timer, timeout');
        this.setUnavailable(Homey.__('exception.no_station_found')).catch(this.error);
        clearInterval(intVal);
      }
    }, 1000);
  }

  async repairActionRules() {
    const successEnabled = await this.setCapabilityEnabled();
    if (successEnabled === false) {
      throw new Error('Could not set enabled/disabeld action rule');
    }

    const successMotionAlarm = await this.setCapabilityMotionAlarm();
    if (successMotionAlarm === false) {
      throw new Error('Could not set motion detection rule');
    }
  }

  async syncMotionDetectionRule() {
    this.log('sync motion detection rule');

    const success = await this.enableMotionDetection();
    this.log(success);

    return success;
  }

  async syncEnabledRule() {
    this.log('sync enabled rule');

    const ruleEnabled = this.getStoreValue('rule_enabled');
    this.log(ruleEnabled);

    let createNewRule = false;

    if (ruleEnabled === undefined || Number.isInteger(ruleEnabled) === false) {
      createNewRule = true;
    } else {
      const rule = await this.getActionRule(ruleEnabled);
      if (rule === false) {
        createNewRule = true;
      }
    }

    if (createNewRule === false) {
      return true;
    }

    const success = await this.createEnabledRule();
    this.log(success);

    return success;
  }

  async syncDisabledRule() {
    this.log('sync disabled rule');

    const ruleDisabled = this.getStoreValue('rule_disabled');
    this.log(ruleDisabled);

    let createNewRule = false;

    if (ruleDisabled === undefined || Number.isInteger(ruleDisabled) === false) {
      createNewRule = true;
    } else {
      const rule = await this.getActionRule(ruleDisabled);
      if (rule === false) {
        createNewRule = true;
      }
    }

    if (createNewRule === false) {
      return true;
    }

    const success = await this.createDisabledRule();
    this.log(success);

    return success;
  }

  /**
   * initialize motion alarm capability
   * register capability listener for repair
   * set capability
   * @returns {Promise<void>}
   */
  async initCapabilityMotionAlarm() {
    this.log('init capability motion alarm');

    await this.setCapabilityMotionAlarm();
  }

  async setCapabilityMotionAlarm() {
    this.log('set capability motion alarm');

    const ruleSucces = await this.syncMotionDetectionRule();
    if (ruleSucces === true) {
      await this.addCapability('alarm_motion').catch(this.error);
      await this.setCapabilityValue('alarm_motion', false).catch(this.error);
    }

    return ruleSucces;
  }

  /**
   * initialize enabled capability
   * register capability listener for repair
   * set capability
   * @returns {Promise<void>}
   */
  async initCapabilityEnabled() {
    this.log('init capability enabled');

    await this.setCapabilityEnabled();
  }

  async setCapabilityEnabled() {
    this.log('set capability enabled');

    const ruleEnabledSuccess = await this.syncEnabledRule();
    const ruleDisabledSuccess = await this.syncDisabledRule();

    if (ruleEnabledSuccess === true && ruleDisabledSuccess === true) {
      await this.addCapability('enabled').catch(this.error);

      // listener
      await this.registerCapabilityListener('enabled', async value => {
        this.log(`set enabled: ${value.toString()}`);
        if (value === true) {
          this.enableCamera();
        } else {
          this.disableCamera();
        }
        return true;
      });

      // condition
      const enabledCondition = new Homey.FlowCardCondition('is_enabled');
      enabledCondition
        .register()
        .registerRunListener(async (args, state) => {
          return this.getCapabilityValue('enabled'); // Promise<boolean>
        });

      return true;
    } if ((ruleEnabledSuccess === false || ruleDisabledSuccess === false) && this.hasCapability('enabled') === true) {
      this.log('remove capability enabled');
      await this.removeCapability('enabled');
    }

    return false;
  }

  /**
   * on added
   */
  onAdded() {
    this.log('on added');
    this.added = true;
  }

  /**
   * delete motion detection rule when device is deleted
   */
  onDeleted() {
    this.log('on deleted');

    this.deleteMotionDetectionRule().catch(this.error);

    this.deleteEnabledRule().catch(this.error);

    this.deleteDisabledRule().catch(this.error);
  }

  async setCurrentState() {
    this.log('set currrent state');
    const data = this.getData();

    const qs = {
      api: 'SYNO.SurveillanceStation.Camera',
      method: 'GetInfo',
      version: 8,
      basic: true,
      cameraIds: data.id,
    };

    const res = await this.fetchApi('/webapi/entry.cgi', qs);

    if (res === undefined || res.data === undefined || res.data.cameras === undefined
      || typeof res.data.cameras[0].enabled !== 'boolean') {
      throw new Error('no current state found or wrong data returned from Synology');
    }

    this.log(`set enabled to ${res.data.cameras[0].enabled.toString()}`);

    // set capability
    this.setCapabilityValue('enabled', res.data.cameras[0].enabled)
      .catch(this.error);
  }

  /**
   * set image for camera
   * @returns {Promise<void>}
   */
  async setImage() {
    this.log('set image');

    if (this.cameraImage === null) {
      this.cameraImage = new Homey.Image();

      await this.setImageStream();

      this.log('register camera image');
      this.cameraImage.register()
        .then(() => {
          return this.setCameraImage('front', Homey.__('camera.front.title'), this.cameraImage);
        })
        .catch(this.error);

      // update image action
      const updateImageAction = new Homey.FlowCardAction('update_image');
      updateImageAction
        .register()
        .registerRunListener(async () => {
          this.cameraImage.update();
          return Promise.resolve(true);
        });
    } else {
      await this.setImageStream();
    }
  }

  /**
   * set image stream
   * @returns {Promise<void>}
   */
  async setImageStream() {
    this.log('set stream');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.Camera',
      method: 'GetSnapshot',
      version: 9,
      id: data.id,
    };

    this.cameraImage.setStream(async stream => {
      if (this.getCapabilityValue('enabled') !== true) {
        throw new Error(Homey.__('exception.camera_disabled'));
      }

      const res = await this.fetchApi('/webapi/entry.cgi', qs);

      try {
        res.body.pipe(stream);
      } catch (e) {
        throw new Error(Homey.__('exception.image_failed'));
      }
    });
  }

  /**
   * onSettings, enable/disable motion detection
   * @param oldSettingsObj
   * @param newSettingsObj
   * @param changedKeysArr
   * @returns {Promise<void>}
   */
  async onSettings(oldSettingsObj, newSettingsObj, changedKeysArr) {
    this.log('onSettings');
    this.log(oldSettingsObj);
    this.log(newSettingsObj);
    this.log(changedKeysArr);

    if (changedKeysArr.includes('motion_timeout')
    && newSettingsObj.motion_timeout < 10) {
      throw new Error(Homey.__('exception.motion_timeout_tolow'));
    }
  }

  /**
   * enable motion detection
   * @returns {Promise<void>}
   */
  async enableMotionDetection() {
    this.log('enable motion detection');

    const rule = await this.getMotionDetectionRule();

    let success;

    if (rule !== false) {
      // enable rule
      success = await this.enableActionRule(rule);
    } else {
      // add action rule
      success = await this.createMotionDetectionRule();
    }

    if (success === true) {
      this.addCapability('alarm_motion').catch(this.error);
    }

    return success;
  }

  /**
   * get motion detection rule
   * @returns {Promise<null|boolean>}
   */
  async getMotionDetectionRule() {
    this.log('get motion detection rule');
    const ruleMotion = this.getStoreValue('rule_motion');
    this.log(ruleMotion);

    // no rule yet
    if (ruleMotion === undefined || Number.isInteger(ruleMotion) === false) {
      return false;
    }

    // get from synology
    const rules = await this.getActionRules();
    let motionRule = null;

    Object.keys(rules).forEach(key => {
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

  /**
   * on motion action, triggers on motion event
   * @returns {Promise<void>}
   */
  async onMotion() {
    this.log('new motion request');

    if (this.getAvailable() === false) {
      this.log('device not ready');
      return;
    }

    if (this.motion_timer !== null) {
      this.log('clear timer');
      clearTimeout(this.motion_timer);
    } else {
      this.log('device motion started');
      this.setCapabilityValue('alarm_motion', true);
      if (this.cameraImage !== null) {
        this.cameraImage.update().catch(this.error);
      }
    }

    const that = this;
    const motionTimeout = this.getMotionTimeoutSetting();

    this.log(`start new timer for ${motionTimeout} sec`);
    this.motion_timer = setTimeout(() => {
      that.setCapabilityValue('alarm_motion', false);
      that.motion_timer = null;
      this.log('device motion ended');
    }, (motionTimeout * 1000));
  }

  /**
   * create motion detection rule
   * @returns {Promise<void>}
   */
  async createMotionDetectionRule() {
    this.log('create motion detection rule');

    // create rule
    const homeyAddress = await this.getHomeyAddress();
    const data = this.getData();
    const deviceApiMotionUrl = `${homeyAddress}/api/app/com.synology.ss/motion/${data.id}`;

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Save',
      version: 3,
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

    await this.fetchApi('/webapi/entry.cgi', qs);

    // get and save action rule id
    const ruleMotion = await this.getActionRuleIdByUrl(deviceApiMotionUrl);

    if (ruleMotion !== undefined && Number.isInteger(ruleMotion) && ruleMotion > 0) {
      this.setStoreValue('rule_motion', ruleMotion).catch(this.error);
      return true;
    }

    return false;
  }

  async createEnabledRule() {
    this.log('create enabled rule');

    // create rule
    const homeyAddress = await this.getHomeyAddress();
    const data = this.getData();
    const webhookUrl = `${homeyAddress}/api/app/com.synology.ss/enabled/${data.id}`;

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Save',
      version: 3,
      name: `"Homey Enabled rule for ${this.getName()}"`,
      multiRuleId: -1,
      ruleType: 0,
      actType: 0,
      multiEvtSetting: 0,
      evtMinIntvl: 10,
      events: `[{"evtSrc":0,"evtDsId":0,"evtDevId":${data.id},"evtId":1,"evtItem":-1,"evtTrig":0,"evtWebhookToken":""}]`,
      actions: `[{"id":-1,"actSrc":1,"actDsId":0,"actDevId":-1,"actId":-1,"actItemId":-1,"actTimes":1,"actTimeUnit":1,"actTimeDur":10,"actRetPos":-2,"extUrl":"${webhookUrl}","userName":"","password":"","iftttKey":"","iftttEvent":"","param1":"","param2":"","param3":"","webhookReqMethod":0,"httpContentType":0,"httpBody":""}]`,
      actSchedule: '"111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"',
    };

    await this.fetchApi('/webapi/entry.cgi', qs);

    const ruleEnabled = await this.getActionRuleIdByUrl(webhookUrl);

    if (ruleEnabled > 0) {
      this.setStoreValue('rule_enabled', ruleEnabled).catch(this.error);
      return true;
    }

    return false;
  }

  async createDisabledRule() {
    this.log('create disabled rule');

    // create rule
    const homeyAddress = await this.getHomeyAddress();
    const data = this.getData();
    const webhookUrl = `${homeyAddress}/api/app/com.synology.ss/disabled/${data.id}`;

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Save',
      version: 3,
      name: `"Homey Disabled rule for ${this.getName()}"`,
      multiRuleId: -1,
      ruleType: 0,
      actType: 0,
      multiEvtSetting: 0,
      evtMinIntvl: 10,
      events: `[{"evtSrc":0,"evtDsId":0,"evtDevId":${data.id},"evtId":2,"evtItem":-1,"evtTrig":0,"evtWebhookToken":""}]`,
      actions: `[{"id":-1,"actSrc":1,"actDsId":0,"actDevId":-1,"actId":-1,"actItemId":-1,"actTimes":1,"actTimeUnit":1,"actTimeDur":10,"actRetPos":-2,"extUrl":"${webhookUrl}","userName":"","password":"","iftttKey":"","iftttEvent":"","param1":"","param2":"","param3":"","webhookReqMethod":0,"httpContentType":0,"httpBody":""}]`,
      actSchedule: '"111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"',
    };

    await this.fetchApi('/webapi/entry.cgi', qs);

    const ruleDisabled = await this.getActionRuleIdByUrl(webhookUrl);

    if (ruleDisabled > 0) {
      this.setStoreValue('rule_disabled', ruleDisabled).catch(this.error);
      return true;
    }

    return false;
  }

  /**
   * delete enabled rule
   * @returns {Promise<void>}
   */
  async deleteEnabledRule() {
    this.log('delete enabled rule');

    const ruleEnabled = this.getStoreValue('rule_enabled');

    if (ruleEnabled === undefined || Number.isInteger(ruleEnabled) === false) {
      return;
    }

    await this.deleteActionRule(ruleEnabled);
  }

  /**
   * delete disabled rule
   * @returns {Promise<void>}
   */
  async deleteDisabledRule() {
    this.log('delete disabled rule');

    const ruleDisabled = this.getStoreValue('rule_disabled');

    if (ruleDisabled === undefined || Number.isInteger(ruleDisabled) === false) {
      return;
    }

    await this.deleteActionRule(ruleDisabled);
  }

  /**
   * delete motion detection rule
   * @returns {Promise<void>}
   */
  async deleteMotionDetectionRule() {
    this.log('delete motion detection rule');

    const ruleMotion = this.getStoreValue('rule_motion');

    if (ruleMotion === undefined || Number.isInteger(ruleMotion) === false) {
      return;
    }

    await this.deleteActionRule(ruleMotion);
  }

  /**
   * start recording
   * @returns {Promise<void>}
   */
  async externalRecordStart() {
    this.externalRecord('start');
  }

  /**
   * stop recording
   * @returns {Promise<void>}
   */
  async externalRecordStop() {
    this.externalRecord('stop');
  }

  /**
   * recording call
   * @param value
   * @returns {Promise<void>}
   */
  async externalRecord(value) {
    this.log(`externalRecord ${value}`);

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.ExternalRecording',
      method: 'Record',
      cameraId: data.id,
      version: 1,
      action: value,
    };

    await this.fetchApi('/webapi/entry.cgi', qs);
  }

  /**
   * set camera as available and update image link when new session is available
   * @returns {Promise<void>}
   */
  async onNewSid() {
    this.log('camera on new sid');
    await this.setImage();
    this.setAvailable().catch(this.error);
  }

  /**
   * set this device as unavailable when session fails
   * @returns {Promise<void>}
   */
  async onSidFail() {
    this.log('camera sid fail');
    this.setUnavailable(Homey.__('exception.authentication_failed')).catch(this.error);
  }

  /**
   * validate (re)pair connection with Surveillance Station
   * @returns boolean
   */
  async validatePair() {
    this.log('validate pair');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.Camera',
      method: 'GetInfo',
      cameraIds: data.id,
      version: 8,
    };

    try {
      const response = await this.fetchApi('/webapi/entry.cgi', qs);
      return response !== undefined && response.success === true
        && response.data.cameras.length > 0;
    } catch (e) {
      this.log(e);
      return false;
    }
  }

  getMotionTimeoutSetting() {
    const motionTimeout = this.getSetting('motion_timeout');
    if (motionTimeout !== undefined && Number.isInteger(motionTimeout) && motionTimeout >= 10) {
      return motionTimeout;
    } return 21;
  }

  async enableCamera() {
    this.log('enable camera');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.Camera',
      method: 'Enable',
      idList: data.id,
      version: 9,
    };

    await this.fetchApi('/webapi/entry.cgi', qs);
  }

  async disableCamera() {
    this.log('disable camera');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.Camera',
      method: 'Disable',
      idList: data.id,
      version: 9,
    };

    await this.fetchApi('/webapi/entry.cgi', qs);
  }

  async onCameraEnabled() {
    this.log('on camera enabled');

    if (this.hasCapability('enabled') !== true) {
      return;
    }

    if (this.getCapabilityValue('enabled') !== true) {
      this.setCapabilityValue('enabled', true).catch(this.error);
    }

    this.getDriver().triggerCameraEnabled(this, { }, { });
  }

  async onCameraDisabled() {
    this.log('on camera disabled');

    if (this.hasCapability('enabled') !== true) {
      return;
    }

    if (this.getCapabilityValue('enabled') !== false) {
      this.setCapabilityValue('enabled', false).catch(this.error);
    }

    this.getDriver().triggerCameraDisabled(this, { }, { });
  }

  async onStationReady() {
    this.log('on station ready');

    await this.registerCameraForStation();

    await this.initCapabilityMotionAlarm();
    await this.initCapabilityEnabled();

    this.registerCapabilityListener('button.repair_action_rules', async () => {
      await this.repairActionRules();
    });

    await this.setImage();

    await this.setCurrentState()
      .then(() => {
        this.setAvailable()
          .catch(this.error);
      })
      .catch(err => {
        this.log(err);
      });
  }

  async getStation() {
    this.log('get station');

    const stationId = this.getStoreValue('station_id');

    if (stationId !== undefined && stationId !== null) {
      const station = ManagerDrivers.getDriver('station').getDevice({ id: `${stationId}` });
      if (station !== undefined && station !== null && !(station instanceof Error)) {
        return station;
      }
      this.log(station);
    }
    return false;
  }

  async registerCameraForStation() {
    this.log('register camera for station');

    const station = await this.getStation();
    const data = this.getData();

    if (station !== false) {
      await station.registerCamera(data.id);
    }
  }

}

module.exports = SynoCameraDevice;
