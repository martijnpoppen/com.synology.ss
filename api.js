'use strict';

const { ManagerDrivers } = require('homey');

module.exports = [
  {
    method: 'GET',
    path: '/motion/:id',
    public: true,
    fn(args, callback) {
      console.log('params');
      console.log(args.params.id);

      const id = Number(args.params.id);

      if (Number.isInteger(id) === false) {
        callback(null, 'id is not an int');
        return;
      }

      try {
        const device = ManagerDrivers.getDriver('camera').getDevice({ id });
        console.log(device);

        if (device !== undefined && device !== null) {
          device.onMotion();
        }
      } catch (e) {
        console.log('no devices found');
        console.log(e);
      }

      // callback follows ( err, result )
      callback(null, {});
    },
  },
];
