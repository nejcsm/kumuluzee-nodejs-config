// @flow
import EtcdClient from 'node-etcd';
import { URL } from 'url';

import { ConfigurationUtil } from 'utils/ConfigurationUtil';
import InitializationUtils from 'utils/InitializationUtils';

class Etcd2ConfigurationSource {
  ordinalNumber = 110

  etcd = null
  namespace = ''
  startRetryDelay = 0
  maxRetryDelay = 0

  configurationDispatcher = null
  configurationUtil = null

  async init(configurationDispatcher: any) {
    this.configurationUtil = ConfigurationUtil;

    this.configurationDispatcher = configurationDispatcher;

    // Get namespace
    this.namespace = await InitializationUtils.getNamespace(this.configurationUtil, 'etcd');
    console.info(`Using namespace ${this.namespace}`);

    // Get user credentials
    const etcdUsername = await this.configurationUtil.get('kumuluzee.config.etcd.username') || null;
    const etcdPassword = await this.configurationUtil.get('kumuluzee.config.etcd.password') || null;

    // Get CA certificate
    let cert = await this.configurationUtil.get('kumuluzee.config.etcd.ca') || null;

    let sslContext = null;

    // TODO!
    if (cert) {
      cert = cert.replace(/\s+/g, '').replace('-----BEGINCERTIFICATE-----', '').replace('-----ENDCERTIFICATE-----', '');
      const decode = Buffer.from(cert, 'base64');

      sslContext = decode;
    }


    // Initialize security context
    let etcdSecurityContext = null;
    if (etcdUsername && etcdUsername !== '' && etcdPassword && etcdPassword !== '') {
      etcdSecurityContext = {
        auth: {
          username: etcdUsername,
          password: etcdPassword,
        },
      };
      if (sslContext) {
        // TODO
        etcdSecurityContext.ca = sslContext;
      }
    }

    // Get etcd host names
    const etcdUrls = await this.configurationUtil.get('kumuluzee.config.etcd.hosts') || null;

    if (etcdUrls && etcdUrls !== '') {
      const splitedEtcdUrls = etcdUrls.split(',');
      // URI maker is implemented in Java. Not sure if i need it too
      let etcdHosts = null;
      try {
        etcdHosts = splitedEtcdUrls.map(url => new URL(url)).map(url => url.href);
      } catch (err) {
        console.error(`Malformed URL exception: ${err}`);
      }

      if (etcdHosts && etcdHosts.length % 2 === 0) {
        console.error('Using an odd number of etcd hosts is recommended. See etcd documentation.');
      }

      etcdSecurityContext = null;
      if (etcdSecurityContext) {
        etcdSecurityContext.maxRetries = 1;
        this.etcd = new EtcdClient(etcdHosts, etcdSecurityContext);
      } else {
        this.etcd = new EtcdClient(etcdHosts, { maxRetries: 1 });
      }
      // Get retry delays
      this.startRetryDelay = await InitializationUtils.getStartRetryDelayMs(this.configurationUtil, 'etcd');
      this.maxRetryDelay = await InitializationUtils.getMaxRetryDelayMs(this.configurationUtil, 'etcd');

      console.info('etcd2 configuration source successfully initialised.');
    } else {
      console.error('No etcd server hosts provided. Specify hosts with configuration key ' +
        'kumuluzee.config.etcd.hosts in format ' +
        'http://192.168.99.100:2379,http://192.168.99.101:2379,http://192.168.99.102:2379');
    }
  }

  get(key: string) {
    key = `${this.namespace}/${this.parseKeyNameForEtcd(key)}`;
    return new Promise((resolve) => {
      this.etcd.get(key, { maxRetries: 0 }, (err, res) => {
        if (!err) {
          let { value } = res.node;
          value = this.changeType(value);

          resolve(value);
        } else {
          resolve(null);
        }
      });
    });
  }

  watch(key: string) {
    const fullKey = `${this.namespace}/${this.parseKeyNameForEtcd(key)}`;
    let currentRetryDelay = this.startRetryDelay;

    if (this.etcd) {
      console.info(`Initializing watch for key: ${fullKey}`);

      const callback = async (err, res) => {
        const watch = () => {
          try {
            this.etcd.get(fullKey, { wait: true, maxRetries: 0 }, callback);
          } catch (tryErr) {
            console.error(`Etcd Exception when watching key, error: ${tryErr}`);
          }
        };

        if (err || !res) {
          if (err) {
            console.error(`Etcd Exception when watching key, error: ${err}`);
          }
          setTimeout(() => watch(), currentRetryDelay);

          currentRetryDelay *= 2;
          if (currentRetryDelay > this.maxRetryDelay) {
            currentRetryDelay = this.maxRetryDelay;
          }
        } else {
          currentRetryDelay = this.startRetryDelay;

          let newValue = res.node.value;

          if (this.configurationDispatcher) {
            if (newValue) {
              console.info(`Value changed. Key: ${this.parseKeyNameFromEtcd(fullKey)} New value: ${newValue}`);

              newValue = this.changeType(newValue);
              this.configurationDispatcher.notifyChange(this.parseKeyNameFromEtcd(fullKey), newValue);
            } else {
              console.info(`Etcd2 watch callback for key ${this.parseKeyNameFromEtcd(fullKey)} invoked. No value present, fallback to other configuration sources.`);
              const fallbackConfig = await this.configurationUtil.get(this.parseKeyNameFromEtcd(fullKey)) || null;

              if (fallbackConfig) {
                this.configurationDispatcher.notifyChange(this.parseKeyNameFromEtcd(fullKey), fallbackConfig);
              }
            }
          }
          watch();
        }
      };
      this.etcd.get(fullKey, { wait: true, maxRetries: 0 }, callback);
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

  parseKeyNameForEtcd(key: string) {
    return key.replace(/\[/g, '.[').replace(/\./g, '/');
  }

  parseKeyNameFromEtcd(key: string) {
    return key.substring(this.namespace.length + 1).replace(/\//g, '.').replace(/\.\[/g, '[');
  }

  async getListSize(key: string) {
    key = `${this.namespace}/${this.parseKeyNameForEtcd(key)}`;
    if (this.etcd) {
      const { err, body } = this.etcd.getSync(key, { maxRetries: 1 });

      if (!err) {
        const { node } = body;

        let arrayIndexes = node.nodes.map(({ key: keyNode }) => {
          try {
            return parseInt(keyNode.substring(key.length + 3, keyNode.length - 1), 10);
          } catch (parseErr) {
            console.error(`Error when parsing integers from array key: ${parseErr}`);
            return -1;
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
    }
    return 0;
  }
}

export default new Etcd2ConfigurationSource();
