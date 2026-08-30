import { z } from 'zod'

/**
 * Discriminador que substitui as duas colunas da planilha: em vez de uma tabela
 * de gastos e outra de ganhos, uma tabela só com este campo.
 */
export const kindSchema = z.enum(['expense', 'income'])
export type Kind = z.infer<typeof kindSchema>

export const uuidSchema = z.uuid()

/**
 * Data de calendário (AAAA-MM-DD), sem hora e sem fuso.
 *
 * Um gasto "do dia 5" é uma data, não um instante: guardar timestamp faria uma
 * compra das 21h em São Paulo cair no dia seguinte quando lida em UTC, e o
 * fechamento do mês sairia errado.
 */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD')
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number]
    const date = new Date(Date.UTC(y, m - 1, d))
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    )
  }, 'Data inexistente no calendário')
export type IsoDate = z.infer<typeof isoDateSchema>

/** Competência mensal (AAAA-MM), usada em orçamentos e relatórios. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês deve estar no formato AAAA-MM')
export type Month = z.infer<typeof monthSchema>

/**
 * Valores trafegam e são guardados SEMPRE como centavos inteiros.
 *
 * Em ponto flutuante `0.1 + 0.2 === 0.30000000000000004`; num extrato com
 * milhares de linhas o erro vira centavos visíveis no total do ano. O teto de
 * 1 trilhão de centavos (R$ 10 bilhões) mantém tudo dentro de Number.MAX_SAFE_INTEGER.
 */
export const amountCentsSchema = z
  .number()
  .int('Valor deve ser um inteiro em centavos')
  .positive('Valor deve ser maior que zero')
  .max(1_000_000_000_000, 'Valor acima do limite suportado')

export const descriptionSchema = z.string().trim().max(200)

/** Cor em hexadecimal para a categoria (usada nos gráficos e nas etiquetas). */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve estar no formato #RRGGBB')

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
