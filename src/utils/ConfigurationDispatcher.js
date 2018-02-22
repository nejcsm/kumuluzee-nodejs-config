// @flow
class ConfigurationDispatcher {
  subscribtions = []

  notifyChange(key: string, value: any) {
    this.subscribtions.forEach(subscription => subscription(key, value));
  }

  subscribe(listener: any) {
    this.subscribtions.push(listener);
  }
}

export default ConfigurationDispatcher;
