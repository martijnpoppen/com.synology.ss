'use strict';

const CameraDriver = require('../camera/driver');

class PTZCameraDriver extends CameraDriver {

  async onInit() {
    this._flowTriggerCameraEnabled = this.homey.flow.getDeviceTriggerCard('ptz-camera_enabled');
    this._flowTriggerCameraDisabled = this.homey.flow.getDeviceTriggerCard('ptz-camera_disabled');
    this._flowTriggerCameraConnectionLost = this.homey.flow.getDeviceTriggerCard('ptz-camera_connection_lost');
    this._flowTriggerCameraConnectionNormal = this.homey.flow.getDeviceTriggerCard('ptz-camera_connection_normal');

    this.homey.flow.getConditionCard('ptz_is_enabled').registerRunListener(async (args, state) => {
      const response = await args.device.getCapabilityValue('enabled');
      return response;
    });

    this.homey.flow.getConditionCard('ptz_is_connected').registerRunListener(async (args, state) => {
      const response = await args.device.isConnected();
      return response;
    });

    this.homey.flow.getActionCard('ptz_ext_record_start').registerRunListener(async args => {
      await args.device.externalRecordStart().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('ptz_ext_record_stop').registerRunListener(async args => {
      await args.device.externalRecordStop().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('ptz_enable_camera').registerRunListener(async args => {
      await args.device.enableCamera().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('ptz_disable_camera').registerRunListener(async args => {
      await args.device.disableCamera().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('ptz_create_snapshot').registerRunListener(async args => {
      await args.device.createSnapshot().catch(this.error);
      return true;
    });

    this.homey.flow.getActionCard('ptz_home').registerRunListener(async args => {
      if(args.device.getCapabilityValue('ptz_home')!==true){
        throw new Error(this.homey.__('exception.action_not_supported'));
      }
      const result = await args.device.home().catch(error => {
        throw new Error(error);
      });
      if (result === false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    });

    this.homey.flow.getActionCard('ptz_autofocus').registerRunListener(async args => {
      if(args.device.getCapabilityValue('ptz_autofocus')!==true){
        throw new Error(this.homey.__('exception.action_not_supported'));
      }
      const result = await args.device.autoFocus().catch(error => {
        throw new Error(error);
      });
      if (result === false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    });

    this.homey.flow.getActionCard('ptz_autopan').registerRunListener(async args => {
      const start = args.start === 'start';
      const result = await args.device.autoPan(start).catch(error => {
        throw new Error(error);
      });
      if (result === false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    });

    this.homey.flow.getActionCard('ptz_setposition').registerRunListener(async args => {
      if(args.device.getCapabilityValue('ptz_abs')!==true){
        throw new Error(this.homey.__('exception.action_not_supported'));
      }
      const result = await args.device.setPosition(args.pos_x, args.pos_y).catch(error => {
        throw new Error(error);
      });
      if (result.success === false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    });

    this.homey.flow.getActionCard('ptz_runpatrol').registerRunListener(async args => {
      const result = await args.device.runPatrol(args.patrol).catch(error => {
        throw new Error(error);
      });
      if (result === false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    }).registerArgumentAutocompleteListener(
      'patrol',
      async (query, args) => {
        let results = [];

        const result = await args.device.listPatrol();
        if (result.success === false || result.data.patrols.length === 0) {
          return results;
        }

        Object.keys(result.data.patrols).forEach(i => {
          const patrolData = result.data.patrols[i];
          const patrol = {
            id: patrolData.id,
            name: patrolData.name,
          };
          results.push(patrol);
        });

        // filter based on the query
        return results.filter(res => {
          return res.name.toLowerCase().includes(query.toLowerCase());
        });
      },
    );

    this.homey.flow.getActionCard('ptz_gopreset').registerRunListener(async args => {
      const result = await args.device.goPreset(args.preset).catch(error => {
        throw new Error(error);
      });
      if (result === false) {
        throw new Error(this.homey.__('exception.action_failed'));
      }
      return true;
    }).registerArgumentAutocompleteListener(
      'preset',
      async (query, args) => {
        let results = [];

        const result = await args.device.listPreset();
        if (result.success === false || result.data.presets.length === 0) {
          return results;
        }

        Object.keys(result.data.presets).forEach(i => {
          const presetData = result.data.presets[i];
          const preset = {
            id: presetData.id,
            name: presetData.name,
          };
          results.push(preset);
        });

        // filter based on the query
        return results.filter(res => {
          return res.name.toLowerCase().includes(query.toLowerCase());
        });
      },
    );
  }

  async onPair(session) {
    super.onPair(session, true);
  }

}

module.exports = PTZCameraDriver;
