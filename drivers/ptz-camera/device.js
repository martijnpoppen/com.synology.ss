'use strict';

const SynoCameraDevice = require('../camera/device');

class SynoPTZCameraDevice extends SynoCameraDevice {

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
    return response.success;
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
