// Metro precisa enxergar a raiz do monorepo para resolver @financas/contracts,
// que é consumido direto do TypeScript-fonte, sem passo de build.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// Evita que o Metro suba a árvore e pegue uma cópia duplicada do React.
config.resolver.disableHierarchicalLookup = true

module.exports = config
