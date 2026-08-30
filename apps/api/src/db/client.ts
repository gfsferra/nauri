import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema.js'

/**
 * Driver WebSocket, não o HTTP.
 *
 * O `neon-http` é mais leve, mas não suporta transação interativa — e sem
 * transação o cadastro grava o `user`, falha no `account` e deixa um usuário
 * sem credencial: alguém que não consegue entrar nem se recadastrar com aquele
 * e-mail, sem saída pela interface. Foi exatamente o que aconteceu aqui.
 * Alguns milissegundos de handshake valem menos que essa classe de bug.
 */
export function createDb(pool: Pool) {
  return drizzle(pool, { schema, casing: 'snake_case' })
}

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl })
}

export type Db = ReturnType<typeof createDb>
export { schema }
