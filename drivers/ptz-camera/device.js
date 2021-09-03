'use strict';

const SynoCameraDevice = require('../camera/device');

class SynoPTZCameraDevice extends SynoCameraDevice {

  async migrate() {
    const result = await super.migrate();
    if(result===true) {
      if (this.hasCapability('ptz_abs') === false) {
        await this.addCapability('ptz_abs');
      }
      if (this.hasCapability('ptz_home') === false) {
        await this.addCapability('ptz_home');
      }
      if (this.hasCapability('ptz_autofocus') === false) {
        await this.addCapability('ptz_autofocus');
      }
    }
  }

  async setCapabilities(capabilities) {
    super.setCapabilities(capabilities);

    this.setCapabilityAbs(capabilities);
    this.setCapabilityHome(capabilities);
    this.setCapabilityAutofocus(capabilities);
  }

  async setCapabilityAbs(capabilities) {
    this.log('set capability abs');
    if(capabilities.ptzAbs!==undefined && capabilities.ptzAbs===true) {
      this.setCapabilityValue('ptz_abs',true);
    } else {
      this.setCapabilityValue('ptz_abs',false);
    }
  }

  async setCapabilityHome(capabilities) {
    this.log('set capability home');
    if(capabilities.ptzHome!==undefined && capabilities.ptzHome===true) {
      this.setCapabilityValue('ptz_home',true);
    } else {
      this.setCapabilityValue('ptz_home',false);
    }
  }

  async setCapabilityAutofocus(capabilities) {
    this.log('set capability autofocus');
    if(capabilities.ptzAutoFocus!==undefined && capabilities.ptzAutoFocus===true) {
      this.setCapabilityValue('ptz_autofocus',true);
    } else {
      this.setCapabilityValue('ptz_autofocus',false);
    }
  }

  async home() {
    this.log('home');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.PTZ',
      method: 'Home',
      cameraId: data.id,
      version: 5,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    return response.success;
  }

  async autoFocus() {
    this.log('autofocus');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.PTZ',
      method: 'AutoFocus',
      cameraId: data.id,
      version: 3,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    return response.success;
  }

  async autoPan(start) {
    this.log('autopan');

    const moveType = start === true ? 'Step' : 'Stop';

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.PTZ',
      method: 'AutoPan',
      cameraId: data.id,
      moveType,
      version: 3,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    return response.success;
  }

  async setPosition(posX, posY) {
    this.log('set position');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.PTZ',
      method: 'AbsPtz',
      cameraId: data.id,
      posX,
      posY,
      version: 3,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    return response;
  }

  async runPatrol(patrolId) {
    this.log('go preset');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.PTZ',
      method: 'RunPatrol',
      cameraId: data.id,
      patrolId,
      version: 3,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    return response.success;
  }

  async listPatrol() {
    this.log('list patrol');

    const data = this.getData();
    const qs = {
      api: 'SYNO.SurveillanceStation.PTZ',
      method: 'listPatrol',
      cameraId: data.id,
      version: 3,
    };

    const response = await this.fetchApi('/webapi/entry.cgi', qs);
    return response;
  }

}

module.exports = SynoPTZCameraDevice;
