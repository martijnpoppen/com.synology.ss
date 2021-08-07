'use strict';

const { Driver } = require('homey');
const CameraDriver = require('../camera/driver');

class PTZCameraDriver extends CameraDriver {

  async onInit() {
    await super.onInit();

    this.homey.flow.getActionCard('ptz_home').registerRunListener(async args => {
      const result = await args.device.home().catch(error => {throw new Error(error)});
      if(result===false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    });

    this.homey.flow.getActionCard('ptz_autofocus').registerRunListener(async args => {
      const result = await args.device.autoFocus().catch(error => {throw new Error(error)});
      if(result===false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    });

    this.homey.flow.getActionCard('ptz_autopan').registerRunListener(async args => {
      const start = args.start === "start" ? true:false;
      const result = await args.device.autoPan(start).catch(error => {throw new Error(error)});
      if(result===false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    });

    this.homey.flow.getActionCard('ptz_setposition').registerRunListener(async args => {
      const result = await args.device.setPosition(args.pos_x,args.pos_y).catch(error => {throw new Error(error)});
      if(result===false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    });

    this.homey.flow.getActionCard('ptz_runpatrol').registerRunListener(async args => {
      const result = await args.device.runPatrol(args.patrol).catch(error => {throw new Error(error)});
      if(result===false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    }).registerArgumentAutocompleteListener(
      "patrol",
      async (query, args) => {

        const results = [];

        const result = await args.device.listPatrol();
        if(result.success===false || result.data.patrols.length===0) {
          return results;
        }

        Object.keys(result.data.patrols).forEach(i => {
          const patrolData = result.data.patrols[i];
          const patrol = {
            id: patrolData.id,
            name: patrolData.name
          };
          results.push(patrol);
        });

        // filter based on the query
        return results.filter((result) => {
           return result.name.toLowerCase().includes(query.toLowerCase());
        });
      });
  }

  async onPair(session) {
    super.onPair(session, true);
  }
}

module.exports = PTZCameraDriver;
