'use strict';

const Homey = require('homey');
const DeviceBase = require('../../lib/devicebase');

class SynoCameraDevice extends DeviceBase {

  /**
   * on init
   * @returns {Promise<void>}
   */
  async onInit() {
    this.cameraImage = null;

    this.log('init device');

    this.setUnavailable(Homey.__('exception.initializing')).catch(this.error);

    const data = this.getData();
    const settings = this.getSettings();

    this.log(data);
    this.log(settings);

    await this.migrate();

    // set image
    await this.setImage();

    // motion detection
    this.motion_timer = null;

    if (settings.motion_detection === true
            && this.hasCapability('alarm_motion') === false) {
      this.addCapability('alarm_motion').catch(this.error);
      this.setCapabilityValue('alarm_motion', false);
    }

    this.log('camera available');
    this.setAvailable().catch(this.error);

    // enable motion detection
    if (this.added === true && settings.motion_detection === true) {
      this.enableMotionDetection().catch(this.error);
    }

    this.added = false;

    // flow actions
    const extRecordStartAction = new Homey.FlowCardAction('ext_record_start');
    extRecordStartAction
      .register()
      .registerRunListener(async args => {
        const device = args.camera;
        device.externalRecordStart().catch(this.error);
        return true;
      });

    const extRecordStopAction = new Homey.FlowCardAction('ext_record_stop');
    extRecordStopAction
      .register()
      .registerRunListener(async args => {
        const device = args.camera;
        device.externalRecordStop().catch(this.error);
        return true;
      });
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

    // set version
    this.setStoreValue('version', appVersion).catch(this.error);
    return true;
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
    // add motion detection rule
    this.deleteMotionDetectionRule().catch(this.error);
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
    }

    await this.setImageStream();
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
      const res = await this.fetchApi('/webapi/entry.cgi', qs);
      this.log(res);
      try {
        res.body.pipe(stream);
      } catch (e) {
        throw new Error('failed to get image');
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

    if (changedKeysArr.includes('motion_detection')
            && newSettingsObj.motion_detection === true) {
      const success = await this.enableMotionDetection();
      if (success !== true) {
        throw new Error(Homey.__('exception.rule_update_failed'));
      }
    }

    if (changedKeysArr.includes('motion_detection')
            && newSettingsObj.motion_detection === false) {
      await this.disableMotionDetection();
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
   * disable motion detection
   * @returns {Promise<void>}
   */
  async disableMotionDetection() {
    this.log('disable motion detection');

    const rule = await this.getMotionDetectionRule();
    let success;

    if (rule !== false) {
      // disable rule
      success = await this.disableActionRule(rule);
    }

    if (success === true) {
      this.removeCapability('alarm_motion')
        .catch(this.error);
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

    const settings = this.getSettings();
    if (settings.motion_detection === false) {
      this.log('motion detection disabled');
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
    this.log('start new timer for 15s');
    this.motion_timer = setTimeout(() => {
      that.setCapabilityValue('alarm_motion', false);
      that.motion_timer = null;
      this.log('device motion ended');
    }, 21000);
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
    const ruleMotion = await this.getActionRuleMotionDetection(deviceApiMotionUrl);

    if (ruleMotion !== undefined && Number.isInteger(ruleMotion)) {
      this.setStoreValue('rule_motion', ruleMotion).catch(this.error);
      return true;
    }

    return false;
  }

  /**
   * delete motion detection rule
   * @returns {Promise<void>}
   */
  async deleteMotionDetectionRule() {
    this.log('delete motion detection rule');

    const ruleMotion = this.getStoreValue('rule_motion');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Delete',
      version: 1,
      idList: ruleMotion,
    };

    await this.fetchApi('/webapi/entry.cgi', qs);
  }

  /**
   * get motion detection rule
   * @param deviceApiMotionUrl
   * @returns {Promise<number>}
   */
  async getActionRuleMotionDetection(deviceApiMotionUrl) {
    this.log('get motion detection rule');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'List',
      version: 3,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);

    if (response.data === undefined) {
      throw new Error('no rules found');
    }

    let ruleMatch = 0;
    Object.keys(response.data.actRule).forEach(i => {
      const rule = response.data.actRule[i];

      Object.keys(rule.events).forEach(e => {
        const event = rule.events[e];

        this.log(event.evtDevName);
        this.log(event.evtDevId);
        this.log(event.evtId);
      });

      Object.keys(rule.actions).forEach(a => {
        const action = rule.actions[a];

        if (action.extUrl === deviceApiMotionUrl) {
          // rule found!
          this.log(`motion rule found: ${rule.ruleId}`);
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

}

module.exports = SynoCameraDevice;
