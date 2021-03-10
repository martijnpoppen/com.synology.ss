'use strict';

const Homey = require('homey');
const { ManagerDrivers } = require('homey');

module.exports = [
  {
    method: 'GET',
    path: '/motion/:id',
    public: true,
    fn(args, callback) {
      Homey.app.log('params');
      Homey.app.log(args.params.id);

      const id = Number(args.params.id);

      if (Number.isInteger(id) === false) {
        callback(null, 'id is not an int');
        return;
      }

      try {
        const device = ManagerDrivers.getDriver('camera').getDevice({ id });

        if (device !== undefined && device !== null && !(device instanceof Error)) {
          device.onMotion().catch(Homey.app.error);
        } else {
          Homey.app.log('device is not a camera');
        }
      } catch (e) {
        Homey.app.log('no devices found');
        Homey.app.log(e);
      }

      // callback follows ( err, result )
      callback(null, {});
    },
  },
  {
    method: 'GET',
    path: '/enabled/:id',
    public: true,
    fn(args, callback) {
      Homey.app.log('params');
      Homey.app.log(args.params.id);

      const id = Number(args.params.id);

      if (Number.isInteger(id) === false) {
        callback(null, 'id is not an int');
        return;
      }

      try {
        const device = ManagerDrivers.getDriver('camera').getDevice({ id });

        if (device !== undefined && device !== null && !(device instanceof Error)) {
          device.onCameraEnabled().catch(Homey.app.error);
        } else {
          Homey.app.log('device is not a camera');
        }
      } catch (e) {
        Homey.app.log('no devices found');
        Homey.app.log(e);
      }

      // callback follows ( err, result )
      callback(null, {});
    },
  },
  {
    method: 'GET',
    path: '/disabled/:id',
    public: true,
    fn(args, callback) {
      Homey.app.log('params');
      Homey.app.log(args.params.id);

      const id = Number(args.params.id);

      if (Number.isInteger(id) === false) {
        callback(null, 'id is not an int');
        return;
      }

      try {
        const device = ManagerDrivers.getDriver('camera').getDevice({ id });

        if (device !== undefined && device !== null && !(device instanceof Error)) {
          device.onCameraDisabled().catch(Homey.app.error);
        } else {
          Homey.app.log('device is not a camera');
        }
      } catch (e) {
        Homey.app.log('no devices found');
        Homey.app.log(e);
      }

      // callback follows ( err, result )
      callback(null, {});
    },
  },
  {
    method: 'GET',
    path: '/homemode_on/:id',
    public: true,
    fn(args, callback) {
      Homey.app.log('trigger home mode on');
      Homey.app.log('params');
      Homey.app.log(args.params.id);

      const { id } = args.params;

      try {
        const device = ManagerDrivers.getDriver('station').getDevice({ id });
        Homey.app.log(device);

        if (device !== undefined && device !== null && !(device instanceof Error)) {
          device.onHomeModeStatusChange(true).catch(Homey.app.error);
        }
      } catch (e) {
        Homey.app.log('no devices found');
        Homey.app.log(e);
      }

      // callback follows ( err, result )
      callback(null, {});
    },
  },
  {
    method: 'GET',
    path: '/homemode_off/:id',
    public: true,
    fn(args, callback) {
      Homey.app.log('trigger home mode off');
      Homey.app.log('params');
      Homey.app.log(args.params.id);

      const { id } = args.params;

      try {
        const device = ManagerDrivers.getDriver('station').getDevice({ id });
        Homey.app.log(device);

        if (device !== undefined && device !== null && !(device instanceof Error)) {
          device.onHomeModeStatusChange(false).catch(Homey.app.error);
        }
      } catch (e) {
        Homey.app.log('no devices found');
        Homey.app.log(e);
      }

      // callback follows ( err, result )
      callback(null, {});
    },
  },
];
