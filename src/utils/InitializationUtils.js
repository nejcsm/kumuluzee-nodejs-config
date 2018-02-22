// @flow
class InitializationUtils {
  async getNamespace(configurationUtil: any, implementation: string) {
    const universalNamespace = await configurationUtil.get('kumuluzee.config.namespace') || null;
    if (universalNamespace) return universalNamespace;

    const implementationNamespace = await configurationUtil.get(`kumuluzee.config.${implementation}.namespace`) || null;
    if (implementationNamespace) return implementationNamespace;

    const env = await configurationUtil.get('kumuluzee.env.name') || 'dev';

    const serviceName = await configurationUtil.get('kumuluzee.name') || null;

    if (serviceName) {
      const serviceVersion = await configurationUtil.get('kumuluzee.version') || '1.0.0';

      return `enviroments/${env}/services/${serviceName}/${serviceVersion}/config`;
    }

    return `enviroments/${env}/config`;
  }

  async getStartRetryDelayMs(configurationUtil, implementation: string) {
    const universalConfig = await configurationUtil.get('kumuluzee.config.start-retry-delay-ms') || null;

    if (universalConfig) {
      return universalConfig;
    }

    return await configurationUtil.get(`kumuluzee.config.${implementation}.start-retry-delay-ms`) || 500;
  }

  async getMaxRetryDelayMs(configurationUtil, implementation: string) {
    const universalConfig = await configurationUtil.get('kumuluzee.config.max-retry-delay-ms') || null;

    if (universalConfig) {
      return universalConfig;
    }

    return await configurationUtil.get(`kumuluzee.config.${implementation}.max-retry-delay-ms`) || 900000;
  }
}

export default new InitializationUtils();
