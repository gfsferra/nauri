import { Hono } from 'hono'
import type { AppContext } from '../env.js'
import { openFinanceConfig, openFinanceStatus, syncOpenFinance } from '../lib/open-finance-sync.js'
import { requireAuth } from '../middleware.js'

/**
 * Open Finance via Meu Pluggy: só o dono da conexão (`OPEN_FINANCE_USER_ID`)
 * enxerga. Para qualquer outro usuário o recurso simplesmente não existe, e o
 * app não mostra a seção.
 */
export const openFinanceRoute = new Hono<AppContext>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const config = openFinanceConfig(c.env)
    if (!config || config.userId !== c.get('userId')) return c.json({ enabled: false as const })
    return c.json({ enabled: true as const, ...(await openFinanceStatus(c.get('db'), config)) })
  })

  /**
   * "Sincronizar agora". A conexão do Meu Pluggy se atualiza sozinha a cada
   * 24 h e não aceita atualização manual: isto relê o que a Pluggy já tem.
   */
  .post('/sync', async (c) => {
    const config = openFinanceConfig(c.env)
    if (!config || config.userId !== c.get('userId')) return c.json({ error: 'Não disponível' }, 404)
    try {
      const result = await syncOpenFinance(c.get('db'), config, { force: true })
      return c.json(result)
    } catch (error) {
      console.error('Falha na sincronização do Open Finance:', error)
      return c.json({ error: 'Não foi possível falar com o banco agora. Tente de novo em instantes.' }, 502)
    }
  })
