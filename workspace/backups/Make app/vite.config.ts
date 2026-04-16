import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createAnalysisJob, runAnalysisJob } from './server/appAnalysis'
import { buildAndroidApk } from './server/apkBuilder'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apkDownloadHeaders(), appAnalysisApi(), apkBuildApi()],
})

const generatedApkDir = join(process.cwd(), 'public', 'downloads', 'generated')

function apkDownloadHeaders(): Plugin {
  return {
    name: 'make-app-apk-download-headers',
    configureServer(server) {
      server.middlewares.use('/downloads/generated', async (request, response, next) => {
        if (!request.url?.endsWith('.apk')) {
          next()
          return
        }

        const fileName = decodeURIComponent(request.url.split('/').pop() ?? '')
        const filePath = join(generatedApkDir, fileName)

        try {
          const [fileInfo, buffer] = await Promise.all([stat(filePath), readFile(filePath)])
          response.statusCode = 200
          response.setHeader('Content-Type', 'application/vnd.android.package-archive')
          response.setHeader('Content-Length', String(fileInfo.size))
          response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
          response.end(buffer)
        } catch {
          next()
        }
      })
    },
  }
}

function apkBuildApi(): Plugin {
  let buildQueue = Promise.resolve()

  return {
    name: 'make-app-apk-build-api',
    configureServer(server) {
      server.middlewares.use('/api/build-apk', async (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }

        try {
          const form = await readJsonBody(request)
          const result = await enqueueBuild(() => buildAndroidApk(form))

          sendJson(response, 200, {
            ok: true,
            filename: result.filename,
            downloadUrl: result.downloadUrl,
            size: result.size,
            appName: result.spec.name,
            localModuleTitle: result.spec.localModule.title,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(response, 500, { ok: false, error: message })
        }
      })
    },
  }

  function enqueueBuild<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = buildQueue.then(task, task)
    buildQueue = nextTask.then(
      () => undefined,
      () => undefined,
    )
    return nextTask
  }
}

function appAnalysisApi(): Plugin {
  const jobs = new Map<string, ReturnType<typeof createAnalysisJob>>()

  return {
    name: 'make-app-analysis-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url ? new URL(request.url, 'http://127.0.0.1') : null

        if (!url || !url.pathname.startsWith('/api/analyze-app')) {
          next()
          return
        }

        if (request.method === 'POST' && url.pathname === '/api/analyze-app') {
          try {
            const form = await readJsonBody(request)
            const job = createAnalysisJob()

            jobs.set(job.id, job)
            sendJson(response, 200, { ok: true, jobId: job.id })

            void runAnalysisJob(
              form,
              (snapshot) => {
                jobs.set(job.id, snapshot)
              },
              job,
            ).catch((error) => {
              const current = jobs.get(job.id)

              if (!current) {
                return
              }

              current.status = 'failed'
              current.error = error instanceof Error ? error.message : String(error)
              current.message = current.error
              jobs.set(job.id, current)
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 500, { ok: false, error: message })
          }

          return
        }

        if (request.method === 'GET') {
          const jobId = url.pathname.split('/').pop()

          if (!jobId || url.pathname === '/api/analyze-app') {
            sendJson(response, 400, { ok: false, error: 'Missing job id' })
            return
          }

          const job = jobs.get(jobId)

          if (!job) {
            sendJson(response, 404, { ok: false, error: 'Job not found' })
            return
          }

          sendJson(response, 200, { ok: true, job })
          return
        }

        next()
      })
    },
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const body = Buffer.concat(chunks).toString('utf8')

  if (!body) {
    return {}
  }

  return JSON.parse(body) as Record<string, unknown>
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}
