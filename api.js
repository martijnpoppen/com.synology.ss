'use strict';

const { getCamera, getStation } = require('./lib/apihelper');

module.exports = {
  async onCameraMotion({ homey, params }) {
    homey.app.log('on camera motion');
    try {
      const device = await getCamera(homey, params);
      device.onMotion().catch(homey.app.error);
    } catch (e) {
      homey.app.log('error', e);
      homey.app.log(e.error);
      return e.error;
    }
    return 'ok';
  },
  async onCameraEnabled({ homey, params }) {
    homey.app.log('on camera enabled');
    try {
      const device = await getCamera(homey, params);
      device.onCameraEnabled().catch(homey.app.error);
    } catch (e) {
      homey.app.log('error', e);
      homey.app.log(e.error);
      return e.error;
    }
    return 'ok';
  },
  async onCameraDisabled({ homey, params }) {
    homey.app.log('on camera disabled');
    try {
      const device = await getCamera(homey, params);
      device.onCameraDisabled().catch(homey.app.error);
    } catch (e) {
      homey.app.log('error', e);
      homey.app.log(e.error);
      return e.error;
    }
    return 'ok';
  },
  async onCameraConnectionLost({ homey, params }) {
    homey.app.log('on camera connection lost');
    try {
      const device = await getCamera(homey, params);
      device.onCameraConnectionLost().catch(homey.app.error);
    } catch (e) {
      homey.app.log('error', e);
      homey.app.log(e.error);
      return e.error;
    }
    return 'ok';
  },
  async onCameraConnectionNormal({ homey, params }) {
    homey.app.log('on camera connection normal');
    try {
      const device = await getCamera(homey, params);
      device.onCameraConnectionNormal().catch(homey.app.error);
    } catch (e) {
      homey.app.log('error', e);
      homey.app.log(e.error);
      return e.error;
    }
    return 'ok';
  },
  async onStationHomeModeOn({ homey, params }) {
    homey.app.log('on station home mode on');
    try {
      const device = await getStation(homey, params);
      device.onHomeModeStatusChange(true).catch(homey.app.error);
    } catch (e) {
      homey.app.log('error', e);
      homey.app.log(e.error);
      return e.error;
    }
    return 'ok';
  },
  async onStationHomeModeOff({ homey, params }) {
    homey.app.log('on station home mode off');
    try {
      const device = await getStation(homey, params);
      device.onHomeModeStatusChange(false).catch(homey.app.error);
    } catch (e) {
      homey.app.log('error', e);
      homey.app.log(e.error);
      return e.error;
    }
    return 'ok';
  },
};
