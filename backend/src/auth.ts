import { betterAuth } from 'better-auth'
import { fromNodeHeaders } from 'better-auth/node'
import { magicLink } from 'better-auth/plugins'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import nodemailer from 'nodemailer'
import type { Pool } from 'pg'
import type { Config } from './config.ts'
import { fail } from './errors.ts'

export type SendMail = (to: string, url: string) => Promise<void>

export function registerAuth(app: FastifyInstance, db: Pool, config: Config, sendMail?: SendMail) {
  const transport = nodemailer.createTransport({ host: config.mailHost, port: config.mailPort, secure: false })
  const auth = betterAuth({
    database: db,
    baseURL: config.baseUrl,
    secret: config.authSecret,
    trustedOrigins: config.origins,
    logger: { disabled: true },
    user: {
      additionalFields: {
        role: { type: ['fan', 'staff'], required: false, defaultValue: 'fan', input: false },
        phone: { type: 'string', required: false, input: false },
        phoneVerifiedAt: { type: 'date', required: false, input: false },
      },
    },
    plugins: [magicLink({
      expiresIn: 300,
      storeToken: 'hashed',
      async sendMagicLink({ email, url }) {
        if (!email.toLowerCase().endsWith('@example.test')) {
          throw new Error('The local demo uses @example.test accounts')
        }
        const incoming = new URL(url)
        const token = incoming.searchParams.get('token')
        if (!token) throw new Error('The sign-in link could not be created')
        const callback = new URL(incoming.searchParams.get('callbackURL') || '/profile', config.baseUrl)
        const finish = new URL('/sign-in/continue', config.baseUrl)
        finish.searchParams.set('token', token)
        finish.searchParams.set('callbackURL', new URL(`${callback.pathname}${callback.search}`, config.baseUrl).href)
        if (sendMail) {
          await sendMail(email, finish.href)
          return
        }
        await transport.sendMail({
          from: 'login@example.test',
          to: email,
          subject: 'Sign in to the FaZe demo',
          text: `Open this link within five minutes to finish signing in: ${finish.href}`,
        })
      },
    })],
  })

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const headers = fromNodeHeaders(request.headers)
      headers.delete('content-length')
      const response = await auth.handler(new Request(new URL(request.url, config.baseUrl), {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      }))
      reply.code(response.status)
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value)
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length) reply.header('set-cookie', cookies)
      return reply.send(response.body ? await response.text() : null)
    },
  })

  async function sessionUser(request: FastifyRequest) {
    if (!request.headers.cookie) return null
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    return session?.user ?? null
  }

  async function requireUser(request: FastifyRequest, role?: 'fan' | 'staff') {
    const user = await sessionUser(request)
    if (!user) fail(401, 'AUTH_REQUIRED', 'Sign in to continue.')
    if (role && user.role !== role) fail(403, 'FORBIDDEN', 'You do not have access to this action.')
    return user
  }

  return { sessionUser, requireUser }
}

export type Auth = ReturnType<typeof registerAuth>
