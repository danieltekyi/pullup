#!/usr/bin/env node
// Bundle backend/dist into function.zip for Lambda deploy.
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const archiver = require('archiver')

const here = dirname(fileURLToPath(import.meta.url))
const backend = join(here, '..', 'apps', 'backend')
const dist = join(backend, 'dist')
const out = join(backend, 'function.zip')

await mkdir(dirname(out), { recursive: true })
const output = createWriteStream(out)
const archive = archiver('zip', { zlib: { level: 9 } })

output.on('close', () => console.info(`function.zip: ${archive.pointer()} bytes`))
archive.on('error', err => { throw err })
archive.pipe(output)
archive.directory(dist, false)
archive.directory(join(backend, 'templates'), 'templates')
await archive.finalize()
