import { expoClient } from '@better-auth/expo/client'
import { createAuthClient } from 'better-auth/react'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { API_URL, APP_SCHEME } from './config'

/**
 * Duas formas de guardar a sessão, porque as plataformas não têm a mesma.
 *
 * Na web, o cookie HttpOnly do próprio Better Auth — o token nunca fica
 * legível para JavaScript, que é a defesa contra XSS. No iOS não existe cookie
 * jar, então o plugin do Expo guarda o token no Keychain via SecureStore e o
 * envia no header Authorization (o plugin `bearer` do servidor aceita isso).
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/api/auth',
  plugins:
    Platform.OS === 'web'
      ? []
      : [
          expoClient({
            scheme: APP_SCHEME,
            storagePrefix: 'financas',
            storage: SecureStore,
          }),
        ],
  fetchOptions: {
    // Necessário na web: app e API ficam em origens diferentes.
    credentials: 'include',
  },
})

export const { useSession, signIn, signUp, signOut, requestPasswordReset, resetPassword } =
  authClient
