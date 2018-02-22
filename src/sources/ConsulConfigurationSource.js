// @flow
import consulClient from 'consul';
import { URL } from 'url';
import { ConfigurationUtil } from 'utils/ConfigurationUtil';
import InitializationUtils from 'utils/InitializationUtils';

class ConsulConfigurationSource {
  ordinalNumber = 110;

  namespace = ''
  kvClient = null
  consul = null
  startRetryDelay = 0
  maxRetryDelay = 0
  CONSUL_WATCH_WAIT_SECONDS = 120

  configurationDispatcher = null
  configurationUtil = null


  async init(configurationDispatcher) {
    this.configurationUtil = ConfigurationUtil;
    this.namespace = await InitializationUtils.getNamespace(this.configurationUtil, 'consul');
    console.info(`Using namespace ${this.namespace}`);

    this.startRetryDelay = await InitializationUtils.getStartRetryDelayMs(this.configurationUtil, 'consul');
    this.maxRetryDelay = await InitializationUtils.getMaxRetryDelayMs(this.configurationUtil, 'consul');

    this.configurationDispatcher = configurationDispatcher;

    let consulAgentUrl = await this.configurationUtil.get('kumuluzee.config.consul.agent') || 'http://localhost:8500';
    try {
      consulAgentUrl = new URL(consulAgentUrl);
    } catch (err) {
      console.error('Provided Consul Agent URL is not valid. Defaulting to http://localhost:8500');
      try {
        consulAgentUrl = new URL('http://localhost:8500');
      } catch (defaultErr) {
        console.error(`Error when parsing URL http://localhost:8500 Error: ${defaultErr}`);
      }
    }

    console.info(`Connectig to Consul Agent at: ${consulAgentUrl.toString()}`);

    this.consul = consulClient({
      host: consulAgentUrl.hostname,
      port: consulAgentUrl.port,
      secure: (consulAgentUrl.protocol === 'https:'),
      timeout: (this.CONSUL_WATCH_WAIT_SECONDS * 1000) + ((this.CONSUL_WATCH_WAIT_SECONDS * 1000) / 16) + 1000,
      promisify: true,
    });

    let pingSuccessful = false;

    try {
      await this.consul.agent.self();
      pingSuccessful = true;
    } catch (err) {
      console.error(`Cannot ping Consul agent: ${err}`);
    }

    this.kvClient = this.consul.kv;

    if (pingSuccessful) {
      console.info('Consul configuration source successfully initialised');
    } else {
      console.error('Consul configuration source initialized, but Consul agent inaccessible. Configuration source may not work as expected.');
    }
  }

  async get(key: string) {
    key = `${this.namespace}/${this.parseKeyNameForConsul(key)}`;

    if (!this.kvClient) return null;

    let value = null;
    try {
      value = await this.kvClient.get(key);

      if (value) {
        value = value.Value;
        value = this.changeType(value);
      }
    } catch (err) {
      console.error(`Consul exception: ${err}`);
    }
    return value || null;
  }

  watch(key: string) {
    let waitTime = this.CONSUL_WATCH_WAIT_SECONDS / 60;
    waitTime = `${waitTime}m`;

    const fullKey = `${this.namespace}/${this.parseKeyNameForConsul(key)}`;
    console.info(`Initializing watch for key: ${fullKey}`);

    let currentRetryDelay = this.startRetryDelay;

    let previouslyDeleted = false;

    let index = 0;

    const callback = async (err, res, data) => {
      const watch = () => {
        try {
          this.kvClient.get({
            key: fullKey,
            wait: waitTime,
            index,
            recurse: true,
          }, callback);
        } catch (tryErr) {
          console.error(`Exception when watching key ${tryErr}`);
        }
      };
      // Error
      if (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
          setTimeout(() => watch(), currentRetryDelay);

          currentRetryDelay *= 2;
          if (currentRetryDelay > this.maxRetryDelay) {
            currentRetryDelay = this.maxRetryDelay;
          }
        } else {
          console.error(`Watch error: ${err}`);
        }
      } else {
      // Response is succesful
        const responseIndex = data.headers['x-consul-index'];

        currentRetryDelay = this.startRetryDelay;
        if (res) {
          if (responseIndex !== index) {
            res.forEach(({ Value, Key }) => {
              const value = this.changeType(Value);

              this.configurationDispatcher.notifyChange(this.parseKeyNameFromConsul(Key), value);
              previouslyDeleted = false;

              console.info(`Consul watch callback for key ${this.parseKeyNameFromConsul(Key)} invoked. New value: ${value}`);
            });
          }
        } else if (!previouslyDeleted) {
          console.info(`Consul watch callback for key ${this.parseKeyNameFromConsul(fullKey)} invoked. No value present, fallback to other configuration sources.`);

          const fallbackConfig = await this.configurationUtil.get(key) || null;
          if (fallbackConfig) {
            this.configurationDispatcher.notifyChange(this.parseKeyNameFromConsul(fullKey), fallbackConfig);
          }

          previouslyDeleted = true;
        }
        index = responseIndex;

        watch();
      }
    };
    try {
      this.kvClient.get({
        key: fullKey,
        wait: waitTime,
        index,
        recurse: true,
      }, callback);
    } catch (tryErr) {
      console.error(`Exception when watching key ${tryErr}`);
    }
  }

  changeType(value: string) {
    let newValue = value;
    if (parseFloat(value)) {
      newValue = parseFloat(value);
    } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      newValue = (value.toLowerCase() === 'true');
    }
    return newValue;
  }

  set(key: string, value: any) {
    if (!this.kvClient) return null;

    try {
      this.kvClient.set({
        key: parseKeyNameForConsul(key),
        value,
      });
    } catch (err) {
      console.error(`Console error when trying to set value, Error: ${err}`);
    }
  }

  parseKeyNameForConsul(key: string) {
    return key.replace(/\[/g, '.[').replace(/\./g, '/');
  }

  parseKeyNameFromConsul(key: string) {
    return key.substring(this.namespace.length + 1).replace(/\//g, '.').replace(/\.\[/g, '[');
  }

  async getListSize(key: string) {
    key = `${this.namespace}/${this.parseKeyNameForConsul(key)}`;
    let values = [];

    try {
      values = await this.kvClient.get({ key, recurse: true });
    } catch (err) {
      console.error(`Consul exception: ${err}`);
    }

    if (values && values.length > 0) {
      let arrayIndexes = [];

      values.forEach(({ Key: valueKey }) => {
        try {
          arrayIndexes.push(parseInt(valueKey.substring(key.length + 2, valueKey.length - 1), 10));
        } catch (err) {
          console.error(`Error when parsing integer from array ${err}`);
        }
      });

      arrayIndexes = arrayIndexes.sort();

      let listSize = 0;

      for (let i = 0; i < arrayIndexes.length; i++) {
        if (arrayIndexes[i] === listSize) {
          listSize += 1;
        } else {
          break;
        }
      }

      if (listSize > 0) return listSize;
    }

    return 0;
  }
}

export default new ConsulConfigurationSource();
