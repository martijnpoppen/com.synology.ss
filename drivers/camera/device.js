'use strict';

const DeviceBase = require('../../lib/devicebase');

class SynoCameraDevice extends DeviceBase {

  /**
   * on init
   * @returns {Promise<void>}
   */
  async onInit() {
    this.log('init device');

    this.snapshot = null;
    this.motion_timer = null;

    this.setUnavailable(this.homey.__('exception.initializing')).catch(this.error);

    await this.migrate();

    const stationId = this.getStoreValue('station_id');
    if (stationId !== undefined && stationId !== null) {
      await this.initStation(stationId);
    } else {
      this.log('no station set for camera');
      this.setUnavailable(this.homey.__('exception.no_station_found')).catch(this.error);
    }

    this.log('init end');
  }

  /**
   * actions on updates to new version
   * @returns {Promise<boolean>}
   */
  async migrate() {
    this.log('migrate device');

    const appVersion = this.homey.manifest.version;
    const deviceVersion = this.getStoreValue('version');

    this.log(appVersion);
    this.log(deviceVersion);

    if (appVersion === deviceVersion) {
      // same version, no migration
      return false;
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

    if (appVersion === '4.0.0') {
      // delete action rules
      await this.deleteActionRules();
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
      const stationReady = this.homey.app.isStationReady(stationId);
      if (stationReady === true) {
        this.log('stop timer, station is ready');
        // finish
        clearInterval(intVal);
        this.onStationReady();
      } else if (timer > 60) {
        // timeout
        this.log('stop timer, timeout');
        this.setUnavailable(this.homey.__('exception.no_station_found')).catch(this.error);
        clearInterval(intVal);
      }
    }, 1000);
  }

  getId() {
    const data = this.getData();
    return data.id;
  }

  getStationId() {
    const stationId = this.getStoreValue('station_id');
    if (stationId === null || stationId === '') {
      return '0';
    }
    return stationId;
  }

  getDriver() {
    return this.driver.manifest.id;
  }

  async getStation() {
    this.log('get station');

    const stationId = this.getStoreValue('station_id');

    if (stationId !== undefined && stationId !== null) {
      const station = this.homey.drivers.getDriver('station').getDevice({ id: `${stationId}` });
      if (station !== undefined && station !== null && !(station instanceof Error)) {
        return station;
      }
      this.log(station);
    }
    return false;
  }

  async getWebhookUrl(eventName) {
    const cameraId = this.getId();
    const stationId = this.getStationId();
    const driver = this.getDriver();
    const station = await this.getStation();
    let address;

    if (station !== false && station.getSetting('webhook_host') === 'local') {
      address = await this.getLocalAddress();
    } else {
      address = await this.getCloudAddress();
    }

    return `${address}/api/app/com.synology.ss/station/${stationId}/${driver}/${cameraId}/${eventName}`;
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

    const successConnectionLost = await this.syncConnectionLostRule();
    if (successConnectionLost === false) {
      throw new Error('Could not set connection lost rule');
    }

    const successConnectionNormal = await this.syncConnectionNormalRule();
    if (successConnectionNormal === false) {
      throw new Error('Could not set connection normal rule');
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
    this.deleteConnectionLostRule().catch(this.error);
    this.deleteConnectionNormalRule().catch(this.error);
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
      || res.data.cameras.length === 0
      || typeof res.data.cameras[0].enabled !== 'boolean') {
      throw new Error('no current state found or wrong data returned from Synology');
    }

    const camera = res.data.cameras[0];
    this.log(`set enabled to ${camera.enabled.toString()}`);

    // set capability enabled
    this.setCapabilityValue('enabled', camera.enabled)
      .catch(this.error);
  }

  /**
   * set image for camera
   * @returns {Promise<void>}
   */
  async setImage() {
    this.log('set image');

    if (this.snapshot === null) {
      this.snapshot = await this.homey.images.createImage();
      await this.setImageStream();
      await this.setCameraImage('front', this.homey.__('camera.front.title'), this.snapshot);
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

    this.snapshot.setStream(async stream => {
      if (this.getCapabilityValue('enabled') !== true) {
        throw new Error(this.homey.__('exception.camera_disabled'));
      }

      const profiletypeId = this.getProfileType();
      const data = this.getData();
      const qs = {
        api: 'SYNO.SurveillanceStation.Camera',
        method: 'GetSnapshot',
        version: 9,
        id: data.id,
        profileType: profiletypeId,
      };

      const res = await this.fetchApi('/webapi/entry.cgi', qs);

      try {
        res.body.pipe(stream);
      } catch (e) {
        throw new Error(this.homey.__('exception.image_failed'));
      }
    });
  }

  async setVideo() {
        try {
            const video = await this.homey.videos.createVideoRTSP();
            const data = this.getData();
            const qs1 = {
                api: 'SYNO.SurveillanceStation.Camera',
                method: 'Save',
                version: 9,
                id: data.id,
                rtspPathTimeout: 1
            };

            await this.fetchApi('/webapi/entry.cgi', qs1); // enable RTSP
            

            video.registerVideoUrlListener(async () => {
                this.log(`[Device] ${this.getName()} - setVideo registerVideoUrlListener`);

                this.log('get stream url');

                const data = this.getData();

                const qs = {
                    api: 'SYNO.SurveillanceStation.Camera',
                    method: 'GetStmUrlPath',
                    cameraIds: data.id,
                    version: 8
                };

                const response = await this.fetchApi('/webapi/entry.cgi', qs);
                const urlPaths = response.data && response.data.pathInfos;
                const urlPath = urlPaths && urlPaths.length && urlPaths[0];
                const rtspUrl = urlPath ? urlPath.unicastPath : 'Could_not_get_RTSP_url';

                this.log(`[Device] ${this.getName()} - setvideo registerVideoUrlListener - request url for native RTSP`, rtspUrl);
                return { url: rtspUrl };
            });

            await this.setCameraVideo('main', 'Live', video);
        } catch (err) {
            this.homey.app.error(err);
        }
    }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('onSettings');
    this.log(oldSettings);
    this.log(newSettings);
    this.log(changedKeys);

    if (changedKeys.includes('motion_timeout')
      && newSettings.motion_timeout < 10) {
      throw new Error(this.homey.__('exception.motion_timeout_tolow'));
    }
  }

  async syncConnectionLostRule() {
    this.log('sync connection lost rule');

    const ruleConLost = this.getStoreValue('rule_connection_lost');
    this.log(ruleConLost);

    let createNewRule = false;

    if (ruleConLost === undefined || Number.isInteger(ruleConLost) === false) {
      createNewRule = true;
    } else {
      const rule = await this.getActionRule(ruleConLost);
      if (rule === false) {
        createNewRule = true;
      }
    }

    if (createNewRule === false) {
      return true;
    }

    const success = await this.createConnectionLostRule();
    this.log(success);

    return success;
  }

  async syncConnectionNormalRule() {
    this.log('sync connection normal rule');

    const ruleConNormal = this.getStoreValue('rule_connection_normal');
    this.log(ruleConNormal);

    let createNewRule = false;

    if (ruleConNormal === undefined || Number.isInteger(ruleConNormal) === false) {
      createNewRule = true;
    } else {
      const rule = await this.getActionRule(ruleConNormal);
      if (rule === false) {
        createNewRule = true;
      }
    }

    if (createNewRule === false) {
      return true;
    }

    const success = await this.createConnectionNormalRule();
    this.log(success);

    return success;
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

    const webhookUrl = await this.getWebhookUrl('motion');
    const cameraId = this.getId();
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
      events: `[{"evtSrc":0,"evtDsId":0,"evtDevId":${cameraId},"evtId":5,"evtItem":-1,"evtTrig":1,"evtWebhookToken":""}]`,
      actions: `[{"id":-1,"actSrc":1,"actDsId":0,"actDevId":-1,"actId":-1,"actItemId":-1,"actTimes":1,"actTimeUnit":1,"actTimeDur":10,"actRetPos":-2,"extUrl":"${webhookUrl}","userName":"","password":"","iftttKey":"","iftttEvent":"","param1":"","param2":"","param3":"","webhookReqMethod":0,"httpContentType":0,"httpBody":""}]`,
      actSchedule: '"111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"',
    };

    await this.fetchApi('/webapi/entry.cgi', qs);

    // get and save action rule id
    const ruleMotion = await this.getActionRuleIdByUrl(webhookUrl);

    if (ruleMotion !== undefined && Number.isInteger(ruleMotion) && ruleMotion > 0) {
      this.setStoreValue('rule_motion', ruleMotion).catch(this.error);
      return true;
    }

    return false;
  }

  async createEnabledRule() {
    this.log('create enabled rule');

    const webhookUrl = await this.getWebhookUrl('enabled');
    const cameraId = this.getId();
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
      events: `[{"evtSrc":0,"evtDsId":0,"evtDevId":${cameraId},"evtId":1,"evtItem":-1,"evtTrig":0,"evtWebhookToken":""}]`,
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

    const webhookUrl = await this.getWebhookUrl('disabled');
    const cameraId = this.getId();
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
      events: `[{"evtSrc":0,"evtDsId":0,"evtDevId":${cameraId},"evtId":2,"evtItem":-1,"evtTrig":0,"evtWebhookToken":""}]`,
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

  async createConnectionLostRule() {
    this.log('create connection lost rule');

    const webhookUrl = await this.getWebhookUrl('connection_lost');
    const cameraId = this.getId();
    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Save',
      version: 3,
      name: `"Homey Connection lost rule for ${this.getName()}"`,
      multiRuleId: -1,
      ruleType: 0,
      actType: 0,
      multiEvtSetting: 0,
      evtMinIntvl: 10,
      events: `[{"evtSrc":0,"evtDsId":0,"evtDevId":${cameraId},"evtId":3,"evtItem":-1,"evtTrig":0,"evtWebhookToken":""}]`,
      actions: `[{"id":-1,"actSrc":1,"actDsId":0,"actDevId":-1,"actId":-1,"actItemId":-1,"actTimes":1,"actTimeUnit":1,"actTimeDur":10,"actRetPos":-2,"extUrl":"${webhookUrl}","userName":"","password":"","iftttKey":"","iftttEvent":"","param1":"","param2":"","param3":"","webhookReqMethod":0,"httpContentType":0,"httpBody":""}]`,
      actSchedule: '"111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"',
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    this.log(response);

    const ruleConnectionLost = await this.getActionRuleIdByUrl(webhookUrl);

    if (ruleConnectionLost > 0) {
      this.setStoreValue('rule_connection_lost', ruleConnectionLost).catch(this.error);
      return true;
    }

    return false;
  }

  async createConnectionNormalRule() {
    this.log('create connection normal rule');

    const webhookUrl = await this.getWebhookUrl('connection_normal');
    const cameraId = this.getId();
    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Save',
      version: 3,
      name: `"Homey Connection normal rule for ${this.getName()}"`,
      multiRuleId: -1,
      ruleType: 0,
      actType: 0,
      multiEvtSetting: 0,
      evtMinIntvl: 10,
      events: `[{"evtSrc":0,"evtDsId":0,"evtDevId":${cameraId},"evtId":4,"evtItem":-1,"evtTrig":0,"evtWebhookToken":""}]`,
      actions: `[{"id":-1,"actSrc":1,"actDsId":0,"actDevId":-1,"actId":-1,"actItemId":-1,"actTimes":1,"actTimeUnit":1,"actTimeDur":10,"actRetPos":-2,"extUrl":"${webhookUrl}","userName":"","password":"","iftttKey":"","iftttEvent":"","param1":"","param2":"","param3":"","webhookReqMethod":0,"httpContentType":0,"httpBody":""}]`,
      actSchedule: '"111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"',
    };

    await this.fetchApi('/webapi/entry.cgi', qs);

    const ruleConnectionNormal = await this.getActionRuleIdByUrl(webhookUrl);

    if (ruleConnectionNormal > 0) {
      this.setStoreValue('rule_connection_normal', ruleConnectionNormal).catch(this.error);
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
   * delete connection lost rule
   * @returns {Promise<void>}
   */
  async deleteConnectionLostRule() {
    this.log('delete connection lost rule');

    const rule = this.getStoreValue('rule_connection_lost');

    if (rule === undefined || Number.isInteger(rule) === false) {
      return;
    }

    await this.deleteActionRule(rule);
  }

  /**
   * delete connection normal rule
   * @returns {Promise<void>}
   */
  async deleteConnectionNormalRule() {
    this.log('delete connection normal rule');

    const rule = this.getStoreValue('rule_connection_normal');

    if (rule === undefined || Number.isInteger(rule) === false) {
      return;
    }

    await this.deleteActionRule(rule);
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
    await this.setVideo();
    this.setAvailable().catch(this.error);
  }

  /**
   * set this device as unavailable when session fails
   * @returns {Promise<void>}
   */
  async onSidFail() {
    this.log('camera sid fail');
    this.setUnavailable(this.homey.__('exception.authentication_failed')).catch(this.error);
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
    if (motionTimeout !== undefined && Number.isInteger(motionTimeout)
    && motionTimeout >= 10 && motionTimeout <= 60) {
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

    this.driver.triggerCameraEnabled(this, {}, {});
  }

  async onCameraDisabled() {
    this.log('on camera disabled');

    if (this.hasCapability('enabled') !== true) {
      return;
    }

    if (this.getCapabilityValue('enabled') !== false) {
      this.setCapabilityValue('enabled', false).catch(this.error);
    }

    this.driver.triggerCameraDisabled(this, {}, {});
  }

  async onCameraConnectionLost() {
    this.log('on camera connection lost');

    this.driver.triggerCameraConnectionLost(this, {}, {});
  }

  async onCameraConnectionNormal() {
    this.log('on camera connection normal');

    this.driver.triggerCameraConnectionNormal(this, {}, {});
  }

  async getCapabilities(){
    this.log('get capabilities');
    
    const id = this.getId();
    const qs = {
      api: 'SYNO.SurveillanceStation.Camera',
      method: 'GetCapabilityByCamId',
      cameraId: id,
      version: 8,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    if(response !== undefined && response.success === true) {
      return response.data;
    } else {
      throw new Error('could not get capabilities');
    }
  }

  async initCapabilities() {
    this.log('init capabilities');

    const capabilities = await this.getCapabilities();
    await this.setCapabilities(capabilities);
  }

  async setCapabilities(capabilities) {
    this.log('set capabilities');

    await this.initCapabilityMotionAlarm();
    await this.initCapabilityEnabled();
  }

  async onStationReady() {
    this.log('on station ready');

    await this.registerCameraForStation();

    await this.syncConnectionLostRule();
    await this.syncConnectionNormalRule();

    await this.initCapabilities();

    this.registerCapabilityListener('button.repair_action_rules', async () => {
      await this.repairActionRules();
    });

    await this.setImage();
    await this.setVideo();

    await this.setCurrentState()
      .then(() => {
        this.setAvailable()
          .catch(this.error);
      })
      .catch(err => {
        this.log(err);
      });
  }

  async registerCameraForStation() {
    this.log('register camera for station');

    const station = await this.getStation();
    const data = this.getData();
    const driver = this.getDriver();

    if (station !== false) {
      await station.registerCamera(data.id, driver);
    }
  }

  getProfileType() {
    this.log('get profile type');

    const profiles = new Map();
    profiles.set('high', 0);
    profiles.set('balanced', 1);
    profiles.set('low', 2);

    const profiletype = this.getSetting('profiletype');
    const profileTypeId = profiles.get(profiletype);

    if (profileTypeId !== undefined) {
      return profileTypeId;
    }
    return 1;
  }

  async createSnapshot() {
    this.log('create snapshot');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.SnapShot',
      method: 'TakeSnapshot',
      camId: data.id,
      dsId: 0,
      version: 1,
      blSave: true,
    };

    await this.fetchApi('/webapi/entry.cgi', qs);
  }

  /**
   * checks if the camera is connected to the synology
   * @returns boolean
   */
  async isConnected() {
    this.log('is connected');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.Camera',
      method: 'List',
      idList: data.id,
      basic: true,
      version: 9,
    };

    const disconStatus = [3, 15];
    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    if (response.data.cameras.length === 0 || (response.data.cameras.length > 0
      && disconStatus.includes(response.data.cameras[0].status))) {
      return false;
    }

    return true;
  }

  async deleteActionRules() {
    await this.deleteMotionDetectionRule().catch(this.error);
    await this.deleteEnabledRule().catch(this.error);
    await this.deleteDisabledRule().catch(this.error);
    await this.deleteConnectionLostRule().catch(this.error);
    await this.deleteConnectionNormalRule().catch(this.error);
  }

  async onWebhookHostChanged() {
    await this.deleteActionRules().catch(this.error);
    await this.repairActionRules().catch(this.error);
  }

}

module.exports = SynoCameraDevice;
