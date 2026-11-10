import {
  buildRowsFromSheet,
  guessColumns,
  type ColumnMap,
  type SheetMapping,
  type SheetResult,
} from '@nauri/contracts'
import { useMutation } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import Papa from 'papaparse'
import { useMemo, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, Text, View } from 'react-native'
import {
  Amount,
  Button,
  Card,
  Chip,
  ErrorBanner,
  Gutter,
  Muted,
  Screen,
  SectionLabel,
  StatTile,
  Title,
} from '@/components/ui'
import { client, unwrap } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { readFileAsText } from '@/lib/read-file'
import { radius, spacing, tabular, type, useTheme } from '@/lib/theme'

/** A API aceita 500 linhas por requisição; anos de planilha passam disso. */
const BATCH = 500

type Sheet = { headers: string[]; records: Array<Record<string, string>> }

export default function Import() {
  const theme = useTheme()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [expense, setExpense] = useState<ColumnMap | null>(null)
  const [income, setIncome] = useState<ColumnMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null)

  async function pickFile() {
    setError(null)
    setDone(null)
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets[0]) return

    try {
      const text = await readFileAsText(result.assets[0])
      // O parsing roda AQUI, no cliente: o preview é instantâneo, o arquivo
      // nunca sobe, e o Worker não gasta CPU com isso.
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: 'greedy',
        // Planilha brasileira exportada do Excel costuma usar ";".
        delimiter: '',
      })
      const headers = parsed.meta.fields ?? []
      if (headers.length === 0) throw new Error('Não encontrei cabeçalho no arquivo.')

      setSheet({ headers, records: parsed.data })
      const guess = guessColumns(headers)
      if (guess.date && guess.amount) {
        setExpense({
          date: guess.date,
          amount: guess.amount,
          description: guess.description,
          category: guess.category,
          fallbackCategory: 'Outros',
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui ler o arquivo.')
    }
  }

  const mapping: SheetMapping = useMemo(
    () => ({ expense: expense ?? undefined, income: income ?? undefined }),
    [expense, income],
  )

  const preview: SheetResult | null = useMemo(
    () => (sheet && (expense || income) ? buildRowsFromSheet(sheet.records, mapping) : null),
    [sheet, mapping, expense, income],
  )

  const totals = useMemo(() => {
    if (!preview) return null
    const sum = (kind: 'expense' | 'income') =>
      preview.rows.filter((r) => r.kind === kind).reduce((acc, r) => acc + r.amountCents, 0)
    return { expense: sum('expense'), income: sum('income') }
  }, [preview])

  const commit = useMutation({
    mutationFn: async () => {
      if (!preview) return { inserted: 0, skipped: 0 }
      let inserted = 0
      let skipped = 0
      // Em lotes, sequencialmente: uma planilha de anos vira várias requisições,
      // e mandar todas de uma vez estouraria o limite da rota.
      for (let i = 0; i < preview.rows.length; i += BATCH) {
        const result = await unwrap(
          await client.import.commit.$post({
            json: { rows: preview.rows.slice(i, i + BATCH), skipDuplicates: true },
          }),
        )
        inserted += result.inserted
        skipped += result.skipped
      }
      return { inserted, skipped }
    },
    onSuccess: (result) => setDone(result),
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <Gutter style={{ gap: spacing.xl }}>
          <View style={{ gap: 6 }}>
            <Title>Importar planilha</Title>
            <Muted>
              Exporte sua planilha como CSV. Nada é enviado antes de você conferir o preview.
            </Muted>
          </View>

          <ErrorBanner message={error} />

        {done ? (
          /* A confirmação do DS: disco em accentSoft com o traço em destaque,
             sem emoji e com o texto rente à esquerda. */
          <Card style={{ gap: spacing.md }}>
            <View
              style={{
                width: 76,
                height: 76,
                borderRadius: radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.accentSoft,
              }}
            >
              <Ionicons name="checkmark" size={36} color={theme.accent} />
            </View>
            <Text style={{ ...type.heading, color: theme.text }}>
              {done.inserted} lançamento{done.inserted === 1 ? '' : 's'} importado
              {done.inserted === 1 ? '' : 's'}
            </Text>
            {done.skipped > 0 && (
              <Muted>{done.skipped} pulado(s) por já existirem — reimportar é seguro.</Muted>
            )}
          </Card>
        ) : (
          <Button label={sheet ? 'Escolher outro arquivo' : 'Escolher arquivo CSV'} onPress={pickFile} variant={sheet ? 'ghost' : 'primary'} />
        )}

        {sheet && !done && (
          <>
            <Block
              title="Colunas de gasto"
              headers={sheet.headers}
              value={expense}
              onChange={setExpense}
              fallback="Outros"
            />
            <Block
              title="Colunas de ganho"
              subtitle="Se a planilha tiver ganhos em outras colunas da mesma linha."
              headers={sheet.headers}
              value={income}
              onChange={setIncome}
              fallback="Outras receitas"
            />
          </>
        )}

        {preview && !done && (
          <Card style={{ gap: spacing.md }}>
            <Text style={{ ...type.section, color: theme.text }}>Preview</Text>

            {/* As caixas de número do DS. Saída em tinta neutra e entrada no
                verde profundo — o sinal é que separa os dois, não a cor. */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile label="Gastos">
                <Amount cents={totals?.expense ?? 0} direction="out" format={formatBRL} size={16} />
              </StatTile>
              <StatTile label="Ganhos">
                <Amount cents={totals?.income ?? 0} direction="in" format={formatBRL} size={16} />
              </StatTile>
              <StatTile label="Linhas">
                <Text style={{ ...type.amount, ...tabular, fontSize: 16, color: theme.text }}>
                  {preview.rows.length}
                </Text>
              </StatTile>
            </View>

            {/* Confira estes totais contra a própria planilha antes de importar —
                é o teste de aceitação que realmente importa. */}
            <Muted>
              Compare esses totais com os da sua planilha. Se baterem, o mapeamento está certo.
            </Muted>

            {preview.errors.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                {/* Linha descartada é perda de dado, não gasto normal: aqui o
                    coral do DS está no seu lugar. */}
                <Text style={{ ...type.row, fontWeight: '600', color: theme.danger }}>
                  {preview.errors.length} linha(s) serão puladas
                </Text>
                {preview.errors.slice(0, 5).map((e, i) => (
                  <Muted key={i}>
                    Linha {e.line} · {e.column}: “{e.value}” — {e.reason}
                  </Muted>
                ))}
                {preview.errors.length > 5 && <Muted>…e mais {preview.errors.length - 5}.</Muted>}
              </View>
            )}

            <Button
              label={`Importar ${preview.rows.length} lançamento(s)`}
              onPress={() => {
                setError(null)
                commit.mutate()
              }}
              loading={commit.isPending}
              disabled={preview.rows.length === 0}
            />
          </Card>
        )}
        </Gutter>
      </ScrollView>
    </Screen>
  )
}

function Block({
  title,
  subtitle,
  headers,
  value,
  onChange,
  fallback,
}: {
  title: string
  subtitle?: string
  headers: string[]
  value: ColumnMap | null
  onChange: (v: ColumnMap | null) => void
  fallback: string
}) {
  const theme = useTheme()
  const active = value !== null

  function set(field: keyof ColumnMap, column: string | undefined) {
    const base: ColumnMap = value ?? { date: '', amount: '', fallbackCategory: fallback }
    onChange({ ...base, [field]: column })
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <Pressable onPress={() => onChange(active ? null : { date: '', amount: '', fallbackCategory: fallback })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Ionicons
            name={active ? 'checkbox' : 'square-outline'}
            size={19}
            color={active ? theme.accent : theme.text3}
          />
          <Text style={{ ...type.section, color: theme.text }}>{title}</Text>
        </View>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </Pressable>

      {active && (
        <>
          <Picker label="Data *" headers={headers} selected={value?.date} onSelect={(c) => set('date', c)} />
          <Picker label="Valor *" headers={headers} selected={value?.amount} onSelect={(c) => set('amount', c)} />
          <Picker label="Descrição" headers={headers} selected={value?.description} onSelect={(c) => set('description', c)} optional />
          <Picker label="Categoria" headers={headers} selected={value?.category} onSelect={(c) => set('category', c)} optional />
        </>
      )}
    </Card>
  )
}

function Picker({
  label,
  headers,
  selected,
  onSelect,
  optional = false,
}: {
  label: string
  headers: string[]
  selected?: string
  onSelect: (column: string | undefined) => void
  optional?: boolean
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <SectionLabel>{label}</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {optional && (
          <Chip label="nenhuma" active={!selected} onPress={() => onSelect(undefined)} />
        )}
        {headers.map((header) => (
          <Chip
            key={header}
            label={header || '(sem nome)'}
            active={selected === header}
            onPress={() => onSelect(header)}
          />
        ))}
      </View>
    </View>
  )
}
