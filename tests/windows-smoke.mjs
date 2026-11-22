import { chromium } from '@playwright/test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'

const directory = await mkdtemp(join(tmpdir(), 'reedline-test-'))
const port = 19376
const app = spawn(resolve('artifacts/app/Reedline.exe'), [], {env: {
  ...process.env, REEDLINE_STARTUP_TRACE: '1', WEBVIEW2_USER_DATA_FOLDER: join(directory, 'webview'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + port,
}})
app.stdout.pipe(process.stdout)
app.stderr.pipe(process.stderr)
let probe, client, page
const log = async () => { try { return await readFile(join(directory, 'events'), 'utf8') } catch { return '' } }
async function until(probeFn, description, timeout=20000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try { const result = await probeFn(); if (result) return result } catch (e) { last = e }
    await delay(80)
  }
  throw Error(description + ' timed out. ' + (last?.message || '') + '\nReceiver log:\n' + await log())
}
async function command(value) {
  const path = join(directory, 'command')
  await until(async () => { try { await stat(path); return false } catch { return true } }, 'receiver command queue')
  await writeFile(path + '.pending', value)
  await rename(path + '.pending', path)
}
async function seen(type, count=1) {
  await until(async () => (await log()).split('\n').filter(x => x.endsWith(' ' + type)).length >= count, type)
}
async function phase(name) {
  await until(async () => (await page.evaluate(() => window.reedlineTestStates.at(-1)?.phase)) === name, 'state ' + name)
}
try {
  await until(async () => {
    if (app.exitCode !== null) throw Error('desktop exited with ' + app.exitCode)
    return (await fetch('http://127.0.0.1:' + port + '/json/version')).ok
  }, 'packaged WebView2 startup', 60000)
  client = await chromium.connectOverCDP('http://127.0.0.1:' + port)
  page = await until(() => client.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('https://reedline.local')), 'desktop page')
  await page.getByRole('button', {name:'导入歌曲'}).waitFor()
  await page.evaluate(() => {
    window.reedlineTestStates = []
    window.chrome.webview.addEventListener('message', e => { if (e.data.type === 'state') window.reedlineTestStates.push(e.data.state) })
  })
  await mkdir('artifacts', {recursive:true})
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({path:'artifacts/windows-studio.png'})
  await page.getByRole('button',{name:'导入歌曲'}).click()
  await page.getByLabel('选择歌曲文件').setInputFiles(resolve('tests/fixtures/concert-a.mp3'))
  await page.getByRole('heading',{name:'concert-a'}).waitFor()
  assert.match(await page.locator('.hero-meta').innerText(), /1 音/)
  await page.getByRole('button',{name:'演奏设置'}).click()
  await page.getByLabel('演奏倒计时',{exact:true}).selectOption('1')
  await page.getByRole('button',{name:'完成',exact:true}).click()
  await page.getByRole('button',{name:'导入歌曲'}).click()
  await page.getByLabel('选择歌曲文件').setInputFiles({ name:'后台测试.txt', mimeType:'text/plain', buffer:Buffer.from('BPM=120\n1, 2:4 #4 1\':2 0') })
  await page.getByRole('heading',{name:'后台测试'}).waitFor()
  await phase('ready')

  // Prove that the actual executable rejects a non-game window.
  await page.getByRole('button',{name:'游戏演奏',exact:true}).click()
  await phase('error')
  assert.match(await page.locator('.banner.warn').innerText(), /前台/)
  console.log('PASS packaged WebView2, file import, unrecognized foreground guard')

  await page.getByRole('button',{name:'收进托盘'}).click()
  probe = spawn(resolve('artifacts/probe/DeltaForceClient-Win64-Shipping.exe'), [directory])
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
  assert.match(await page.evaluate(() => window.reedlineTestStates.at(-1).message), /焦点/)
  await command('F8')
  await phase('stopped')
  await command('focus')
  const offset = (await log()).length
  await command('F6')
  await phase('finished')
  const rows = (await log()).slice(offset).trim().split('\n').map(l => l.trim().split(' '))
  const inputs = rows.map(r => r[1])
  assert.deepEqual(inputs, ['md:1','kd:90','ku:90','mu:1','kd:88','ku:88','md:4','kd:86','ku:86','mu:4','kd:188','ku:188'])
  const keyTimes = rows.filter(r=>r[1].startsWith('kd:')).map(r=>Number(r[0]))
  const expected = [0,500,2500,3000]
  for (let i=1;i<keyTimes.length;i++) assert.ok(Math.abs(keyTimes[i]-keyTimes[0]-expected[i]) < 180, 'note timing outside 180 ms')
  console.log('PASS focus loss, full hidden song, ordered physical keyboard/mouse events and note timing', keyTimes)
} finally {
  if (!page) {
    for (const name of ['startup-trace.log','startup-error.log']) {
      try { console.error(await readFile(join(process.env.LOCALAPPDATA,'Reedline',name),'utf8')) } catch {}
    }
    const result = spawnSync('pwsh',['-NoProfile','-File',resolve('tests/windows-diagnostics.ps1'),String(app.pid)],{encoding:'utf8',timeout:20000})
    console.error(result.stdout, result.stderr)
  }
  if (page) {
    try { console.log('Last desktop states:', await page.evaluate(() => window.reedlineTestStates?.slice(-5))) } catch {}
  }
  await writeFile('artifacts/windows-input.log', await log())
  if (probe) probe.kill()
  if (client) await client.close()
  app.kill()
}
