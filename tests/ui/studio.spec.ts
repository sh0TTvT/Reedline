import { test, expect } from '@playwright/test'
import { writeMidi } from 'midi-file'
import { readFile } from 'node:fs/promises'

test('preview, pause, seek and remap keys with keyboard-accessible dialogs', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'欢乐颂'})).toBeVisible()
  if (process.env.REEDLINE_SCREENSHOT) {
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: process.env.REEDLINE_SCREENSHOT, animations: 'disabled' })
  }
  await page.getByRole('button',{name:'试听',exact:true}).click()
  await expect(page.getByText('正在试听',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'暂停试听'}).click()
  await page.getByRole('slider',{name:'全曲进度'}).press('ArrowRight')
  await page.getByRole('button',{name:'停止',exact:true}).click()
  await page.getByRole('button',{name:'演奏设置'}).click()
  await page.getByLabel('音键 1',{exact:true}).selectOption('X')
  await expect(page.getByLabel('音键 2',{exact:true})).toHaveValue('Z')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByRole('button',{name:'试音 X',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'试音 X',exact:true}).click()
  await expect(page.getByRole('button',{name:'试音 X',exact:true})).toHaveClass('lit')
  expect(errors).toEqual([])
})

test('imports, persists, locates and removes a numbered score', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button',{name:'导入歌曲'}).click()
  await page.getByLabel('选择歌曲文件').setInputFiles({name:'hello.txt',mimeType:'text/plain',buffer:Buffer.from("曲名=试奏曲\nBPM=90\n1 2 #4 5 0 1':2")})
  await expect(page.getByRole('heading',{name:'试奏曲'})).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading',{name:'试奏曲'})).toBeVisible()
  await page.getByLabel('搜索曲目').fill('试奏')
  await expect(page.locator('.song')).toHaveCount(1)
  await page.getByRole('button',{name:'从曲库移除'}).click()
  await page.getByRole('button',{name:'移除',exact:true}).click()
  await expect(page.getByRole('heading',{name:'欢乐颂'})).toBeVisible()
  await page.reload()
  await expect(page.locator('.song')).toHaveCount(3)
})

test('imports a real MIDI, selects its second channel and reports invalid files', async ({page}) => {
  await page.goto('/')
  const midi = writeMidi({header:{format:0,numTracks:1,ticksPerBeat:96},tracks:[[
    {type:'noteOn',channel:0,deltaTime:0,noteNumber:60,velocity:80},{type:'noteOff',channel:0,deltaTime:96,noteNumber:60,velocity:0},
    {type:'noteOn',channel:1,deltaTime:0,noteNumber:78,velocity:80},{type:'noteOff',channel:1,deltaTime:96,noteNumber:78,velocity:0}]]})
  await page.getByRole('button',{name:'导入歌曲'}).click()
  await page.getByLabel('选择歌曲文件').setInputFiles({name:'合奏.mid',mimeType:'audio/midi',buffer:Buffer.from(midi)})
  await expect(page.getByRole('heading',{name:'合奏'})).toBeVisible()
  await page.getByLabel('音轨',{exact:true}).selectOption('0')
  await page.reload()
  await expect(page.getByRole('heading',{name:'合奏'})).toBeVisible()
  await expect(page.getByLabel('音轨',{exact:true})).toHaveValue('0')
  await page.getByRole('button',{name:'导入歌曲'}).click()
  await page.getByLabel('选择歌曲文件').setInputFiles({name:'bad.mid',mimeType:'audio/midi',buffer:Buffer.from('broken')})
  await expect(page.getByRole('alert')).toContainText('MIDI')
})

test('decodes and transcribes a WAV using the real import dialog and worker', async ({page}) => {
  await page.goto('/')
  const size=16000, wav=Buffer.alloc(44+size*2)
  wav.write('RIFF'); wav.writeUInt32LE(36+size*2,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16)
  wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28)
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(size*2,40)
  for(let i=0;i<size;i++) wav.writeInt16LE(Math.round(16000*Math.sin(2*Math.PI*440*i/16000)),44+2*i)
  await page.getByRole('button',{name:'导入歌曲'}).click()
  await page.getByLabel('选择歌曲文件').setInputFiles({name:'口哨.wav',mimeType:'audio/wav',buffer:wav})
  await expect(page.getByRole('heading',{name:'口哨'})).toBeVisible()
  await expect(page.locator('.hero-meta')).toContainText('1 音')
})

test('accepts an MP3 dropped onto the workbench', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('button',{name:'导入歌曲'})).toBeEnabled()
  const bytes = [...await readFile('tests/fixtures/concert-a.mp3')]
  await page.evaluate(data => {
    const files = new DataTransfer()
    files.items.add(new File([Uint8Array.from(data)], '口琴练音.mp3', {type:'audio/mpeg'}))
    document.querySelector('main')!.dispatchEvent(new DragEvent('drop',{dataTransfer:files,bubbles:true,cancelable:true}))
  },bytes)
  await expect(page.getByRole('heading',{name:'口琴练音'})).toBeVisible()
  await expect(page.locator('.hero-meta')).toContainText('1 音')
})

test('small viewport keeps library, import and reduced-motion controls usable', async ({page}) => {
  await page.setViewportSize({width:740,height:555})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/')
  await page.getByRole('button',{name:'打开曲库'}).click()
  await page.getByRole('button',{name:/小星星/}).click()
  await expect(page.getByRole('heading',{name:'小星星'})).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
