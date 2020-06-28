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
        Homey.app.log(device);

        if (device !== undefined && device !== null) {
          device.onMotion();
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

        if (device !== undefined && device !== null) {
          device.onHomeModeStatusChange(true);
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

        if (device !== undefined && device !== null) {
          device.onHomeModeStatusChange(false);
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
