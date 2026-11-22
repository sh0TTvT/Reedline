import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'

const directory = await mkdtemp(join(tmpdir(), 'reedline-test-'))
const traceFile = join(process.env.LOCALAPPDATA, 'Reedline', 'startup-trace.log')
const receiver = resolve('artifacts/probe/DeltaForceClient-Win64-Shipping.exe')
async function read(path) { try { return await readFile(path, 'utf8') } catch { return '' } }
const oldTrace = (await read(traceFile)).length
const trace = async () => (await read(traceFile)).slice(oldTrace)
const log = () => read(join(directory,'events'))
const app = spawn(resolve('artifacts/app/Reedline.exe'), [], {env: {
  ...process.env, REEDLINE_STARTUP_TRACE: '1', WEBVIEW2_USER_DATA_FOLDER: join(directory, 'webview'),
}})
app.stdout.pipe(process.stdout)
app.stderr.pipe(process.stderr)
let probe, driver
let sequence = 0
async function until(probeFn, description, timeout=20000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    if (app.exitCode !== null) throw Error('desktop exited with ' + app.exitCode)
    try { const result = await probeFn(); if (result) return result } catch (e) { last = e }
    await delay(80)
  }
  throw Error(description + ' timed out. ' + (last?.message || '') + '\nReceiver log:\n' + await log())
}
async function command(value) {
  const path = join(directory, 'command')
  const id = String(++sequence)
  await until(async () => { try { await stat(path); return false } catch { return true } }, 'receiver command queue')
  await writeFile(path + '.pending', id + ' ' + value)
  await rename(path + '.pending', path)
  await until(async () => (await read(join(directory,'ack'))) === id, 'receiver acknowledgment ' + value)
}
async function seen(type, count=1) {
  await until(async () => (await log()).split('\n').filter(x => x.endsWith(' ' + type)).length >= count, type)
}
async function phase(name) {
  await until(async () => (await trace()).trim().split(/\r?\n/).filter(l=>l.includes(' Transport ')).at(-1)?.endsWith(' ' + name), 'state ' + name)
}
try {
  await until(async () => (await trace()).includes('Workstation ready'), 'packaged WebView2 startup', 60000)
  driver = spawn(receiver, ['--drive', String(app.pid), directory])
  await until(async () => driver.exitCode !== null, 'Windows UI Automation', 120000)
  if (driver.exitCode !== 0) throw Error(await read(join(directory,'ui-error')) || 'UI driver failed')
  assert.match(await read(join(directory,'ui-result')), /tray hide passed/)
  console.log('PASS shipped WebView2, native file picker, MP3 and text import, foreground guard and tray hide')

  probe = spawn(receiver, [directory])
  await until(() => stat(join(directory,'ready')), 'Win32 receiver startup')
  await command('focus')
  await command('F6')
  await seen('kd:90')
  await seen('kd:88')
  await command('F6')
  await seen('ku:88')
  await phase('paused')
  const before = await log()
  await delay(450)
  assert.equal(await log(), before, 'input changed during pause')
  await command('F6')
  await seen('kd:88', 2)
  await command('F8')
  await seen('ku:88', 2)
  await phase('stopped')
  console.log('PASS tray-hidden global F6 start/pause/resume and F8 release')

  await command('F6')
  await seen('kd:90', 2)
  await command('blur')
  await phase('error')
  await command('F8')
  await phase('stopped')
  await command('focus')
  const offset = (await log()).length
  await command('F6')
  await phase('finished')
  const rows = (await log()).slice(offset).trim().split('\n').map(l => l.trim().split(' '))
  // RegisterHotKey can leave the initiating F6 key-up in the receiver before the countdown.
  if (rows[0]?.[1] === 'ku:117') rows.shift()
  assert.deepEqual(rows.map(r => r[1]), ['md:1','kd:90','ku:90','mu:1','kd:88','ku:88','md:4','kd:86','ku:86','mu:4','kd:188','ku:188'])
  const keyTimes = rows.filter(r=>r[1].startsWith('kd:')).map(r=>Number(r[0]))
  const expected = [0,500,2500,3000]
  for (let i=1;i<keyTimes.length;i++) assert.ok(Math.abs(keyTimes[i]-keyTimes[0]-expected[i]) < 180, 'note timing outside 180 ms')
  console.log('PASS focus loss, full hidden song, ordered Windows keyboard/mouse events and note timing', keyTimes)
} catch (error) {
  console.error(await trace(), await read(join(directory,'commands')), await read(join(process.env.LOCALAPPDATA,'Reedline','startup-error.log')))
  const result = spawnSync('pwsh',['-NoProfile','-File',resolve('tests/windows-diagnostics.ps1'),String(app.pid)],{encoding:'utf8',timeout:20000})
  console.error(result.stdout,result.stderr)
  throw error
} finally {
  await writeFile('artifacts/windows-input.log', await log())
  if (driver && driver.exitCode === null) driver.kill()
  if (probe) probe.kill()
  app.kill()
}
