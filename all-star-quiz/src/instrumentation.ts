export const register = async () => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertProductionConfiguration } = await import(
      './lib/server/deployment-config'
    );
    assertProductionConfiguration();
  }
};
