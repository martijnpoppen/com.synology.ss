'use strict';

const Homey = require('homey');
const Log = require('homey-log').Log;

class MyApp extends Homey.App {
  onInit() {
    this.log('Surveillance Station is running...');
  }
}

module.exports = MyApp;
