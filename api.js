'use strict';

module.exports = {
  async onCameraMotion({ homey, params }) {
    homey.app.log('params');
    homey.app.log(params.id);

    const id = Number(params.id);

    if (Number.isInteger(id) === false) {
      return 'id is not an int';
    }

    try {
      const device = homey.drivers.getDriver('camera').getDevice({ id });

      if (device !== undefined && device !== null && !(device instanceof Error)) {
        device.onMotion().catch(homey.app.error);
      } else {
        homey.app.log('device is not a camera');
        return 'device is not a camera';
      }
    } catch (e) {
      homey.app.log('no devices found');
      homey.app.log(e);
      return 'no devices found';
    }

    return 'ok';
  },
  async onCameraEnabled({ homey, params }) {
    homey.app.log('params');
    homey.app.log(params.id);

    const id = Number(params.id);

    if (Number.isInteger(id) === false) {
      return 'id is not an int';
    }

    try {
      const device = homey.drivers.getDriver('camera').getDevice({ id });

      if (device !== undefined && device !== null && !(device instanceof Error)) {
        device.onCameraEnabled().catch(homey.app.error);
      } else {
        homey.app.log('device is not a camera');
        return 'device is not a camera';
      }
    } catch (e) {
      homey.app.log('no devices found');
      homey.app.log(e);
      return 'no devices found';
    }

    return 'ok';
  },
  async onCameraDisabled({ homey, params }) {
    homey.app.log('params');
    homey.app.log(params.id);

    const id = Number(params.id);

    if (Number.isInteger(id) === false) {
      return 'id is not an int';
    }

    try {
      const device = homey.drivers.getDriver('camera').getDevice({ id });

      if (device !== undefined && device !== null && !(device instanceof Error)) {
        device.onCameraDisabled().catch(homey.app.error);
      } else {
        homey.app.log('device is not a camera');
        return 'device is not a camera';
      }
    } catch (e) {
      homey.app.log('no devices found');
      homey.app.log(e);
      return 'no devices found';
    }

    return 'ok';
  },
  async onCameraConnectionLost({ homey, params }) {
    homey.app.log('params');
    homey.app.log(params.id);

    const id = Number(params.id);

    if (Number.isInteger(id) === false) {
      return 'id is not an int';
    }

    try {
      const device = homey.drivers.getDriver('camera').getDevice({ id });

      if (device !== undefined && device !== null && !(device instanceof Error)) {
        device.onCameraConnectionLost().catch(homey.app.error);
      } else {
        homey.app.log('device is not a camera');
        return 'device is not a camera';
      }
    } catch (e) {
      homey.app.log('no devices found');
      homey.app.log(e);
      return 'no devices found';
    }

    return 'ok';
  },
  async onCameraConnectionNormal({ homey, params }) {
    homey.app.log('params');
    homey.app.log(params.id);

    const id = Number(params.id);

    if (Number.isInteger(id) === false) {
      return 'id is not an int';
    }

    try {
      const device = homey.drivers.getDriver('camera').getDevice({ id });

      if (device !== undefined && device !== null && !(device instanceof Error)) {
        device.onCameraConnectionNormal().catch(homey.app.error);
      } else {
        homey.app.log('device is not a camera');
        return 'device is not a camera';
      }
    } catch (e) {
      homey.app.log('no devices found');
      homey.app.log(e);
      return 'no devices found';
    }

    return 'ok';
  },
  async onStationHomeModeOn({ homey, params }) {
    homey.app.log('trigger home mode on');
    homey.app.log('params');
    homey.app.log(params.id);

    const { id } = params;

    try {
      const device = homey.drivers.getDriver('station').getDevice({ id });
      homey.app.log(device);

      if (device !== undefined && device !== null && !(device instanceof Error)) {
        device.onHomeModeStatusChange(true).catch(homey.app.error);
      }
    } catch (e) {
      homey.app.log('no devices found');
      homey.app.log(e);
      return 'no devices found';
    }

    return 'ok';
  },
  async onStationHomeModeOff({ homey, params }) {
    homey.app.log('trigger home mode off');
    homey.app.log('params');
    homey.app.log(params.id);

    const { id } = params;

    try {
      const device = homey.drivers.getDriver('station').getDevice({ id });
      homey.app.log(device);

      if (device !== undefined && device !== null && !(device instanceof Error)) {
        device.onHomeModeStatusChange(false).catch(homey.app.error);
      }
    } catch (e) {
      homey.app.log('no devices found');
      homey.app.log(e);
      return 'no devices found';
    }

    return 'ok';
  },
};
