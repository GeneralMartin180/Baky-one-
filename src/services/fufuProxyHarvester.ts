import { getNetworkStatus } from './serverTransport.ts';

// Compatibility facade: network configuration belongs to the server environment.
export const fufuProxyHarvester = {
  getMode: () => getNetworkStatus().mode,
  getStats: () => getNetworkStatus(),
};
