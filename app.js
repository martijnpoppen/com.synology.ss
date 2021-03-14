'use strict';

const Homey = require('homey');
const crypto = require('crypto');

class MyApp extends Homey.App {

  async onInit() {
    this.log('Surveillance Station is running...');

    this.stations = [];

    await this.initPassKey();
  }

  /**
   * create a unique random hash
   * @returns {Promise<void>}
   */
  async initPassKey() {
    this.log('init passkey');
    const passKey = await this.homey.settings.get('passkey');

    this.log(passKey);
    if (passKey === undefined || passKey === null) {
      crypto.randomBytes(64, (err, buf) => {
        if (err) {
          Homey.app.log(err);
          return;
        }

        const newPassKey = buf.toString('hex');

        Homey.app.log(`The random data is: ${
          newPassKey}`);

        this.homey.settings.set('passkey', `${newPassKey}`);
      });
    }
  }

  /**
   * encrypt data
   * @param data
   * @returns {Promise<*>}
   */
  async encryptData(data) {
    this.log('encrypt data');

    const userKey = await this.homey.settings.get('passkey');

    const encryptionKey = crypto.createHash('sha256').update(userKey).digest();
    const initVector = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-ctr', encryptionKey, initVector);
    let result = cipher.update(JSON.stringify(data), 'utf8', 'base64') + cipher.final('base64');
    result = initVector.toString('hex') + result;
    this.log(result);
    return result;
  }

  /**
   * decrypt data
   * @param data
   * @returns {Promise<any>}
   */
  async decryptData(data) {
    this.log('decrypt data');

    const userKey = await this.homey.settings.get('passkey');

    const encryptionKey = crypto.createHash('sha256').update(userKey).digest();
    const initVector = Buffer.from(data.substring(0, 32), 'hex');
    data = data.substring(32);
    const decipher = crypto.createDecipheriv('aes-256-ctr', encryptionKey, initVector);
    const decrypted = decipher.update(data, 'base64', 'utf8') + decipher.final('utf8');
    const result = JSON.parse(decrypted);
    this.log(result);
    return result;
  }

  async addStation(id) {
    this.log('station ready: ', id);
    this.stations.push(id);
  }

  isStationReady(id) {
    if (this.stations.indexOf(id) !== -1) {
      return true;
    }
    return false;
  }

}

module.exports = MyApp;
