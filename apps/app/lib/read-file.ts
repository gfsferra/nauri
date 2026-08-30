import * as FileSystem from 'expo-file-system'
import { Platform } from 'react-native'

/**
 * Lê o arquivo escolhido como texto.
 *
 * Na web o DocumentPicker entrega um `File` do DOM; no nativo, só um caminho
 * `file://` que precisa do FileSystem. As duas plataformas divergem exatamente
 * aqui, então a diferença fica isolada nesta função.
 */
export async function readFileAsText(asset: {
  uri: string
  file?: File | null
}): Promise<string> {
  if (Platform.OS === 'web') {
    if (asset.file) return asset.file.text()
    const response = await fetch(asset.uri)
    return response.text()
  }
  return FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  })
}
