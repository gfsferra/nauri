import type { Db } from '../db/client.js'
import { categories } from '../db/schema.js'

/**
 * Categorias iniciais em português, criadas no cadastro.
 *
 * Conta nova com lista vazia obriga o usuário a inventar uma taxonomia antes de
 * lançar o primeiro gasto — atrito logo no momento em que ele está comparando o
 * app com a planilha que já funciona. Tudo aqui é editável e arquivável depois.
 */
const DEFAULTS = [
  { name: 'Mercado', kind: 'expense', color: '#16a34a', icon: 'cart' },
  { name: 'Moradia', kind: 'expense', color: '#0891b2', icon: 'home' },
  { name: 'Transporte', kind: 'expense', color: '#f59e0b', icon: 'car' },
  { name: 'Alimentação fora', kind: 'expense', color: '#ef4444', icon: 'restaurant' },
  { name: 'Saúde', kind: 'expense', color: '#ec4899', icon: 'medkit' },
  { name: 'Educação', kind: 'expense', color: '#8b5cf6', icon: 'school' },
  { name: 'Lazer', kind: 'expense', color: '#f97316', icon: 'game-controller' },
  { name: 'Assinaturas', kind: 'expense', color: '#6366f1', icon: 'repeat' },
  { name: 'Outros', kind: 'expense', color: '#94a3b8', icon: 'ellipsis-horizontal' },
  { name: 'Salário', kind: 'income', color: '#059669', icon: 'wallet' },
  { name: 'Freelance', kind: 'income', color: '#0d9488', icon: 'briefcase' },
  { name: 'Rendimentos', kind: 'income', color: '#65a30d', icon: 'trending-up' },
  { name: 'Outras receitas', kind: 'income', color: '#94a3b8', icon: 'add-circle' },
] as const

export async function seedDefaultCategories(db: Db, userId: string): Promise<void> {
  await db
    .insert(categories)
    .values(DEFAULTS.map((c) => ({ ...c, userId })))
    .onConflictDoNothing()
}
