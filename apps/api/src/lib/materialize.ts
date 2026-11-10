import { and, eq, lte, or, isNull, gte } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { recurrences, transactions } from '../db/schema.js'
import type { IsoDate } from '@orbital/contracts'
import { occurrencesBetween } from './recurrence.js'

/**
 * Cria as ocorrências que faltam num período, na hora em que ele é consultado.
 *
 * É o que substitui um cron: não há job agendado, nem infraestrutura extra, nem
 * o risco clássico de um worker agendado rodar duas vezes e lançar o salário em
 * duplicidade. O `onConflictDoNothing` sobre o índice único
 * `(recurrence_id, occurred_on)` faz o trabalho pesado — duas requisições
 * simultâneas abrindo o mesmo mês produzem exatamente uma linha, decidido pelo
 * banco e não por quem chegou primeiro.
 *
 * A materialização acontece só até a data pedida: nada é gerado para um futuro
 * que o usuário ainda não olhou.
 */
export async function materializeRecurrences(
  db: Db,
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<number> {
  const active = await db
    .select()
    .from(recurrences)
    .where(
      and(
        eq(recurrences.userId, userId),
        eq(recurrences.isActive, true),
        lte(recurrences.startOn, to),
        or(isNull(recurrences.endOn), gte(recurrences.endOn, from)),
      ),
    )

  if (active.length === 0) return 0

  const rows = active.flatMap((r) =>
    occurrencesBetween(
      {
        frequency: r.frequency,
        dayOfMonth: r.dayOfMonth,
        weekday: r.weekday,
        monthOfYear: r.monthOfYear,
        startOn: r.startOn,
        endOn: r.endOn,
      },
      from,
      to,
    ).map((occurredOn) => ({
      userId,
      kind: r.kind,
      occurredOn,
      amountCents: r.amountCents,
      description: r.description,
      categoryId: r.categoryId,
      recurrenceId: r.id,
    })),
  )

  if (rows.length === 0) return 0

  const inserted = await db
    .insert(transactions)
    .values(rows)
    .onConflictDoNothing({
      target: [transactions.recurrenceId, transactions.occurredOn],
    })
    .returning({ id: transactions.id })

  return inserted.length
}
