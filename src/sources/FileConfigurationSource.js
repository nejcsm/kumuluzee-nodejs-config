// @flow
import jsyaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

class FileConfigurationSource {
  ordinalNumber = 100;
  yamlFileName = 'config.yaml';
  ymlFileName = 'config.yml';
  propertiesFileName = 'config.properties';
  doc = null;

  init() {
    const mainPath = path.dirname(require.main.filename);
    let file = null;
    try {
      file = fs.readFileSync(`${mainPath}/config/${this.ymlFileName}`, 'utf-8');
    } catch (err) {
    }
    if (!file) {
      try {
        file = fs.readFileSync(`${mainPath}/config/${this.yamlFileName}`, 'utf-8');
      } catch (err) {
      }
    }

    if (file) {
      console.info('Loading configuration from YAML file.');
      try {
        this.doc = jsyaml.safeLoad(file);
      } catch (err) {
        console.error(`Couldn't successfully process the YAML configuration file. All your properties may not be correctly loaded: ${err}`);
      }
    }

    if (this.doc) {
      console.info('Configuration successfully read.');
    } else {
      console.error('Unable to load configuration from file. No configuration files were found.');
    }
  }

  get(key: string) {
    return this.getValue(key);
  }

  getValue(key: string) {
    const splitedKeys = key.split('.');
    let value = this.doc;

    splitedKeys.forEach(splitedKey => {
      if (!value) return null;

      if (splitedKey.indexOf('[') !== -1 && splitedKey.indexOf(']') !== -1) {
        const startIndex = splitedKey.indexOf('[');
        let arrayIndex = splitedKey.match(/\[(.*)\]/);

        if (arrayIndex) {
          arrayIndex = arrayIndex.pop();
          const val = splitedKey.substring(0, startIndex);

          if (val && arrayIndex) {
            value = value[val][parseInt(arrayIndex, 10)];
          }
        }
      } else {
        value = value[splitedKey];
      }
    });
    return value;
  }

  getListSize(key: string) {
    const value = this.getValue(key);
    if (value instanceof Array) {
      return value.length;
    }
    return 0;
  }

  watch() {}
}

export default new FileConfigurationSource();

