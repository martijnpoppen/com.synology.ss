'use strict';

const Homey = require('homey');
const fetch = require('node-fetch');
const DeviceBase = require('../../lib/devicebase');

class SynoCameraDevice extends DeviceBase {

  async onInit() {
    this.cameraImage = null;

    this.log('init device');

    this.setUnavailable('initializing').catch(this.error);

    const data = this.getData();
    const settings = this.getSettings();

    this.log(data);
    this.log(settings);

    this.migrate();

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

  migrate() {
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
      case '1.1.0':
        this.setClass('sensor')
          .catch(this.error)
          .then(this.log);
        this.log('camera changed to sensor class');
        break;
      case '2.1.0':
        if (settings.protocol !== null) {
          const sid = this.getStoreValue('sid');
          // copy host settings to store
          this.storePairData(settings.protocol, settings.host, settings.port, sid);
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

  onAdded() {
    this.log('on added');
    this.added = true;
  }

  onDeleted() {
    this.log('on deleted');
    // add motion detection rule
    this.deleteMotionDetectionRule().catch(this.error);
  }

  async setPairData(protocol, host, port, sid) {
    // store data
    await this.storePairData(protocol, host, port, sid);
    // (re)set image
    await this.setImage();
    // set available
    this.setAvailable().catch(this.error);
  }

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

  async setImageStream() {
    this.log('set stream');

    const snapshotPath = this.getStoreValue('snapshot_path');
    const urlParts = snapshotPath.split('?');

    const apiUrl = this.getAPIUrl(urlParts[0], this.querystringToObject(urlParts[1]));

    this.cameraImage.setStream(async stream => {
      const res = await fetch(`${apiUrl}`);
      this.log('image response');
      this.log(res);
      this.log(res.headers.raw());
      const contentType = res.headers.get('content-type');
      this.log(contentType);
      this.log(contentType.indexOf('application/json'));
      if (contentType && contentType.indexOf('application/json') !== -1) {
        this.pairException();
        throw new Error('failed to get image, please try again later');
      } else if (!res.ok) {
        this.log(res);
        throw new Error(res.statusText);
      }
      res.body.pipe(stream);
    });
  }

  async onSettings(oldSettingsObj, newSettingsObj, changedKeysArr) {
    this.log('onSettings');
    this.log(oldSettingsObj);
    this.log(newSettingsObj);
    this.log(changedKeysArr);

    if (changedKeysArr.includes('motion_detection')
            && newSettingsObj.motion_detection === true) {
      await this.enableMotionDetection();
    }

    if (changedKeysArr.includes('motion_detection')
            && newSettingsObj.motion_detection === false) {
      await this.disableMotionDetection();
    }
  }

  async enableMotionDetection() {
    this.log('enable motion detection');

    const rule = await this.getMotionDetectionRule();

    if (rule !== false) {
      // enable rule
      await this.enableActionRule(rule);
    } else {
      // add action rule
      await this.createMotionDetectionRule();
    }

    this.addCapability('alarm_motion').catch(this.error);
  }

  async disableMotionDetection() {
    this.log('disable motion detection');
    const rule = await this.getMotionDetectionRule();

    if (rule !== false) {
      // disable rule
      await this.disableActionRule(rule);
    }

    this.removeCapability('alarm_motion').catch(this.error);
  }

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

    // get and save action rule id
    const ruleMotion = await this.getActionRuleMotionDetection(deviceApiMotionUrl);

    // save rule id
    this.setStoreValue('rule_motion', ruleMotion).catch(this.error);
  }

  // add action rule
  async deleteMotionDetectionRule() {
    this.log('delete motion detection rule');

    const ruleMotion = this.getStoreValue('rule_motion');

    const qs = {
      api: 'SYNO.SurveillanceStation.ActionRule',
      method: 'Delete',
      version: 1,
      idList: ruleMotion,
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

  async getActionRuleMotionDetection(deviceApiMotionUrl) {
    this.log('create motion detection rule');

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

  async externalRecordStart() {
    this.externalRecord('start');
  }

  async externalRecordStop() {
    this.externalRecord('stop');
  }

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

module.exports = SynoCameraDevice;
