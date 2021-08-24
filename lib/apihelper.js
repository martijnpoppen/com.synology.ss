'use strict';

exports.getCamera = (homey, params) => {
  homey.app.log('get camera');
  homey.app.log(params.station);
  homey.app.log(params.driver);
  homey.app.log(params.id);

  const { station } = params;
  const { driver } = params;
  const id = Number(params.id);

  if (driver !== 'camera' && driver !== 'ptz-camera') {
    homey.app.log(`${driver} is not a driver`);
    throw new Error(`${driver} is not a driver`);
  }

  try {
    const camSearchId1 = { id, station };
    const camSearchId2 = { id };
    let device;

    try {
      device = homey.drivers.getDriver(driver).getDevice(camSearchId1);
    } catch (e) {
      homey.app.log('device not found 1');
    }
    try {
      if (!device) {
        device = homey.drivers.getDriver(driver).getDevice(camSearchId2);
      }
    } catch (e) {
      homey.app.log('device not found 2');
      throw new Error('device not found');
    }
    return device;
  } catch (e) {
    homey.app.log(e.error);
    throw new Error(e);
  }
};

exports.getStation = (homey, params) => {
  homey.app.log('get station');
  homey.app.log(params.station);

  const { station } = params;
  try {
    let device;

    try {
      device = homey.drivers.getDriver('station').getDevice({ id: station });
    } catch (e) {
      homey.app.log('device not found');
      throw new Error('device not found');
    }
    return device;
  } catch (e) {
    homey.app.log(e.error);
    throw new Error(e);
  }
};
