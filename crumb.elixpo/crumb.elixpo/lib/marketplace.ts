import catalog from '@/public/marketplace/catalog.json'

export type MarketplacePackage = {
  id: string
  version: string
  kind: 'skill' | 'mcp' | 'bundle'
  display_name: string
  description: string
  license: string
  capabilities: string[]
  skills?: Array<{ id: string; path: string }>
  mcp_servers?: Array<{ id: string; command: string; arguments: string[]; environment: string[] }>
}

export const marketplacePackages = catalog.packages as MarketplacePackage[]
