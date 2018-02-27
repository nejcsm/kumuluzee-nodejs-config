# KumuluzEE Node.js Config

KumuluzEE Node.js Config is an open-source configuration management for the KumuluzEE framework. It is Node.js package based on [KumuluzEE Config](https://github.com/kumuluz/kumuluzee-config), configuration management library developed for microservices written in Java programming language. It extends basic configuration framework described [here](https://github.com/kumuluz/kumuluzee/wiki/Configuration).

Package provides support for [environment variables](https://github.com/kumuluz/kumuluzee/wiki/Configuration#environment-variables) and [configuration files](https://github.com/kumuluz/kumuluzee/wiki/Configuration#configuration-files) as well as for additional configuration sources Consul and etcd.

KumuluzEE Node.js Config follows the idea of an unified configuration API for the framework and provides additional configuration sources which can be utilised with a standard KumuluzEE configuration interface.



## Install


Node version >= 8.0.0:

```
$ npm install --save kumuluzee-nodejs-config
```

Note: if you are installing library on Debian operating system run this command first:

```
$ sudo apt-get install nodejs-legacy
```

## Setup
In order to connect to Consul and etcd, you must properly set configuration files. For more information check sections **Configuring Consul** and **Configuring etcd**  in [KumuluzEE Config's section Usage](https://github.com/kumuluz/kumuluzee-config#usage).

Properties in Consul and etcd are stored in a specific matter. For more information check sections  **Configuration properties inside Consul** and **Configuration properties inside etcd** in [KumuluzEE Config's section Usage](https://github.com/kumuluz/kumuluzee-config#usage).


**Configuration source priorities**

Each configuration source has its own priority, meaning values from configuration sources with lower priories can be overwritten with values from higher. Properties from configuration files has the lowest priority, which can be overwritten with properties from additional configuration sources Consul and etcd, while properties defined with environmental variables have the highest priority.

## Usage

Properties can be held in a object using `ConfigBundle` or retrieved using `ConfigurationUtil` function.

**ConfigBundle(ConfigruationObject)**

Creates new object which will automatically load and hold configuration properties. Function accepts object with described properties.

ConfigurationObject is an object with configuration properties where each property can have following options:
* type (String): type of a field. Possible types: `'number'`, `'string'`, `'boolean'`, `'array'` and `'object'` (note: configuration properties which have `'array'` type and fields property are arrays of objects),
*   prefixKey (String, optional): value represents the prefix key for the configuration property keys (note: this property can only be used on a first level of object),
* name (String, optional): overrides field name used to form a configuration key,
* watch (Boolean, optional): to enable watch for this property set value to true (note: if property also has fields property, watch will be applied to all of its nested properties),
* fields (ConfigurationObject, optional): if type of current field is 'object' or 'array', fields represent nested values of object.

***.initialze([{ extension }])***

Connects to additional configuration source and populates values. Possible extension values are `'consul'` and `'etcd'`.

```javascript
import ConfigBundle from 'kumuluzee-nodejs-config';

const restConfig = new ConfigBundle({
    prefixKey: 'rest-config',
    type: 'object',
    fields: {
        integerProperty: {
            type: 'number',
            name: 'foo'
        },
        booleanProperty: {
            type: 'boolean'
        },
        stringProperty: {
            type: 'string'
            watch: true
        }
    }
});

restConfig.initalize({ extension: 'consul' })
```

**ConfigurationUtil**

It is used for retrieving values of configuration parameters from the configuration framework.

***.initialze([{ extension }])***

Connects to additional configuration source. Possible extension values are `'consul'` and `'etcd'`.

```javascript
import { ConfigruationUtil } from 'kumuluzee-nodejs-config';

const configurationUtil = ConfigurationUtil.initialize({ extension: 'consul' });
```

***.get(key)***

Returns value of a given key. Returned value is a Promise, so you need to `await` for response.

```javascript
const booleanProperty = await configurationUtil.get('rest-config.boolean-property');
```

**Watches**

Since configuration properties in etcd and Consul can be updated during microservice runtime, they have to be dynamically updated inside the running microservices. This behaviour can be enabled with watches.

If watch is enabled on a field, its value will be dynamically updated on any change in configuration source, as long as new value is of a proper type. For example, if value in configuration store is set to `'string'` type and is changed to a non-string value, field value will not be updated.

While properties can be watched using ConfigBundle object by setting watch property to true, we can use ConfigurationUtil to subscribe for changes using `subscribe` function.

```javascript
configurationUtil.subscribe(watchKey, (key, value) => {
  if (watchKey === key) {
    console.info(`New value for key ${key} is ${value}`);
  }
});
```

**Retry delays**

Etcd and Consul implementations support retry delays on watch connection errors. Since they use increasing exponential delay, two parameters need to be specified:

* `kumuluzee.config.start-retry-delay-ms`, which sets the retry delay duration in ms on first error - default: 500
* `kumuluzee.config.max-retry-delay-ms`, which sets the maximum delay duration in ms on consecutive errors - default: 900000 (15 min)

## Changelog

Recent changes can be viewed on Github on the [Releases Page](https://github.com/kumuluz/kumuluzee/releases)

## Contribute

See the [contributing docs](https://github.com/kumuluz/kumuluzee-nodejs-config/blob/master/CONTRIBUTING.md)

When submitting an issue, please follow the [guidelines](https://github.com/kumuluz/kumuluzee-nodejs-config/blob/master/CONTRIBUTING.md#bugs).

When submitting a bugfix, write a test that exposes the bug and fails before applying your fix. Submit the test alongside the fix.

When submitting a new feature, add tests that cover the feature.

## License

MIT

