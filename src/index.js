// @flow
import { ConfigurationUtil } from 'utils/ConfigurationUtil';

type Configuration = ?{
  prefixKey: ?string,
  watch: boolean,
  type: string,
  name: string,
  fields: {[key: string]: Configuration},
};

type Extension = {
  extension: string,
};

class ConfigBundle {
  _configuration = null;

  constructor(configuration: Configuration) {
    this._configuration = configuration;
  }

  async initialize(extension: Extension) {
    if (this._configuration != null) {
      const { prefixKey } = this._configuration;
      if (!prefixKey) {
        console.error('No prefix key provided!');
      } else {
        extension = extension || { extension: null };

        await ConfigurationUtil.initialize(extension, this._configuration);

        await this.populateValues(this, this._configuration, prefixKey, false);

        delete this._configuration;
      }
    }
  }

  async populateValues(processed: any, configuration: Configuration, prefixKey: string, watchAll: boolean) {
    if (configuration) {
      watchAll = watchAll || configuration.watch || false;
      const { fields } = configuration;
      const fieldKeys = Object.keys(fields);

      const promises = fieldKeys.map((key) =>
        new Promise(async (resolve) => {
          const currentObject = fields[key];
          if (currentObject) {
            const watch = currentObject.watch || false;

            let keyPath = null;
            if (currentObject.name && currentObject.name !== '') {
              keyPath = this.getKeyName(currentObject.name, prefixKey);
            } else {
              keyPath = this.getKeyName(key, prefixKey);
            }

            const isArray = currentObject.type === 'array' || false;

            if (isArray) {
              // Process array
              const size = await ConfigurationUtil.getListSize(keyPath);

              if (!currentObject.fields) {
                const promisesArray = [];

                for (let i = 0; i < size; i++) {
                  const promise = ConfigurationUtil.get(`${keyPath}[${i}]`);
                  promisesArray.push(promise);
                }

                const valueArray = await Promise.all(promisesArray);

                processed[key] = valueArray;
              } else {
                processed[key] = [];
                for (let i = 0; i < size; i++) {
                  processed[key].push({});
                }
                const promisesNested = [];
                for (let i = 0; i < size; i++) {
                  const promise = this.populateValues(processed[key][i], currentObject, `${keyPath}[${i}]`, watchAll);
                  promisesNested.push(promise);
                }

                await Promise.all(promisesNested);
              }
            } else if (currentObject.fields) {
              // Process nested object
              processed[key] = {};
              await this.populateValues(processed[key], currentObject, keyPath, watchAll);
            } else {
              // Process normal field
              const value = await ConfigurationUtil.get(keyPath);
              if (value) {
                processed[key] = value;
              } else {
                processed[key] = null;
              }
              if (watchAll || watch) {
                this.deployWatcher(keyPath);
              }
            }
          } else {
            console.error('ConfigurationObject is not valid!');
          }
          return resolve();
        }));

      await Promise.all(promises);
      watchAll = false;
    }
  }

  deployWatcher(key: string) {
    ConfigurationUtil.subscribe(key, async (thisKey, value) => {
      if (key === thisKey) {
        let splittedKey = this.getPath(key, ConfigurationUtil.configuration);
        splittedKey = splittedKey.split('.');

        const type = this.determineType(splittedKey.slice(1), ConfigurationUtil.configuration);

        if (typeof value !== type) {
          console.error(`Error when setting value, type mismatch for ${key}`);
        } else {
          this.setNestedValue(splittedKey.slice(1), value, this);
        }
      }
    });
  }

  getPath(wholeKey: string, processed: any) {
    const splittedKey = wholeKey.split('.');

    // Check for path without first element ( prefix key )
    const path = splittedKey.slice(1).map(currentKey => {
      let key = '';
      let iterateKey = currentKey.split('[');
      // Is array
      if (iterateKey.length > 1) {
        [iterateKey] = iterateKey;
      } else {
        iterateKey = currentKey;
      }

      if (processed.fields && !Object.keys(processed.fields).includes(this.hyphenCaseToCamelCase(iterateKey))) {
        Object.keys(processed.fields).forEach(k => {
          if (processed.fields[k].name === currentKey) {
            key = k;
            iterateKey = k;
          }
        });
      } else {
        key = currentKey;
      }
      processed = processed.fields[this.hyphenCaseToCamelCase(iterateKey)];
      return this.hyphenCaseToCamelCase(key);
    });

    return `${splittedKey[0]}.${path.join('.')}`;
  }

  determineType(splittedKey: Array<string>, processed: any) {
    if (splittedKey.length === 0) {
      return processed.type;
    }

    let [currentKey] = splittedKey;

    const arraySplit = currentKey.split('[');

    if (arraySplit.length > 1) {
      [currentKey] = arraySplit;
    }

    if (processed.fields[currentKey]) {
      if (splittedKey.length > 1) {
        splittedKey.splice(0, 1);
      } else {
        splittedKey = [];
      }
      return this.determineType(splittedKey, processed.fields[currentKey]);
    }
    return null;
  }

  setNestedValue(splittedKey: Array<string>, value: any, processed: any) {
    let [currentKey] = splittedKey;
    const arraySplit = currentKey.split('[');

    if (arraySplit.length > 1) {
      [currentKey] = arraySplit;
      const indexArray = parseInt(arraySplit[1], 10);

      if (splittedKey.length === 1) {
        processed[currentKey][indexArray] = value;
      } else {
        splittedKey.splice(0, 1);
        this.setNestedValue(splittedKey, value, processed[currentKey][indexArray]);
      }
    } else if (splittedKey.length === 1) {
      processed[currentKey] = value;
    } else {
      splittedKey.splice(0, 1);
      this.setNestedValue(splittedKey, value, processed[currentKey]);
    }
  }

  getKeyName(key: string, prefixKey: string) {
    let keyName = prefixKey;
    if (keyName !== '') {
      keyName = `${keyName}.`;
    }

    keyName = `${keyName}${this.camelCaseToHyphenCase(key)}`;

    return keyName;
  }

  hyphenCaseToCamelCase(key: string) {
    return key.replace(/-([a-z])/g, g => g[1].toUpperCase());
  }

  camelCaseToHyphenCase(key: string) {
    return key.replace(/([a-zA-Z])(?=[A-Z])/g, '$1-').toLowerCase();
  }
}

export { ConfigurationUtil };
export default ConfigBundle;
