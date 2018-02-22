// @flow
class EnvironmentConfigurationSource {
  ordinalNumber = 300;

  init() {}

  get(key: string) {
    let value = process.env[this.parseKeyNameForEnvironmentVariables(key)];

    if (!value) {
      value = process.env[this.parseKeyNameForEnvironmentVariablesLegacy(key)];
    }
    return value || null;
  }

  parseKeyNameForEnvironmentVariables(key: string) {
    return key.toUpperCase().replace(/\[/g, '')
      .replace(/\]/g, '')
      .replace(/-/g, '')
      .replace(/\./g, '_');
  }
  parseKeyNameForEnvironmentVariablesLegacy(key: string) {
    return key.toUpperCase().replace(/\./g, '_');
  }

  getListSize(key: string) {
    let listSize = -1;
    let index = -1;
    let value = null;
    do {
      listSize += 1;
      index += 1;
      value = process.env[this.parseKeyNameForEnvironmentVariables(`${key}[${index}]`)];
    } while (value);

    return (listSize > 0) ? listSize : 0;
  }

  watch() {}
}

export default new EnvironmentConfigurationSource();
