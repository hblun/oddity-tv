"""Run against the synthetic demo after `station.cli demo-subtitles`.

Checks native subtitles and real pause across a broadcast boundary, plus screen
controls and mobile layout. Requires Playwright and Chromium; takes up to 45s.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright, expect


async def run(url):
    output=Path('test-results'); output.mkdir(exist_ok=True)
    errors=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or None)
        context=await browser.new_context(viewport={'width':1440,'height':1050})
        page=await context.new_page()
        page.on('pageerror',lambda error: errors.append(str(error)))
        try:
            await page.goto(url)
            await expect(page.locator('#detail-title')).not_to_have_text('Loading guide…')
            await page.locator('#tune').click()
            await page.wait_for_function("document.querySelector('video').readyState>=2 && !document.querySelector('video').paused")
            await expect(page.locator('#captions')).to_be_enabled()
            await page.locator('#captions').click()
            await page.wait_for_function("[...document.querySelector('video').textTracks].some(t=>t.mode==='showing' && t.activeCues?.length>0)")
            data=await (await context.request.get(url.rstrip('/')+'/api/channel?hours=0.01')).json()
            await page.locator('#transport').click()
            await expect(page.locator('#paused-overlay')).to_be_visible()
            snapshot=await page.locator('video').evaluate('(v)=>({src:v.currentSrc,time:v.currentTime})')
            await asyncio.sleep(max(2,data['now']['end']-data['server_time']+1))
            frozen=await page.locator('video').evaluate('(v)=>({src:v.currentSrc,time:v.currentTime,paused:v.paused})')
            assert frozen['paused'] and frozen['src']==snapshot['src']
            assert abs(frozen['time']-snapshot['time'])<.1,(snapshot,frozen)
            await page.locator('#resume-live').click()
            await page.wait_for_function("!document.querySelector('video').paused && document.querySelector('video').readyState>=2")
            live=await (await context.request.get(url.rstrip('/')+'/api/channel?hours=0.01')).json()
            actual=await page.locator('video').evaluate('(v)=>({src:v.currentSrc,time:v.currentTime})')
            if live['now']['end']-live['server_time']>1:
                assert actual['src'].endswith(live['now']['url'])
                assert abs(actual['time']-(live['now']['source_in']+live['server_time']-live['now']['start']))<2
            await page.locator('#volume').evaluate("e=>{e.value='35';e.dispatchEvent(new Event('input',{bubbles:true}));}")
            assert await page.locator('video').evaluate('v=>Math.abs(v.volume-.35)<.01 && !v.muted')
            await page.locator('#settings-toggle').click()
            await expect(page.locator('#settings-close')).to_be_focused()
            await page.locator('#picture').select_option('classic')
            await page.locator('#caption-size').select_option('large')
            await page.locator('#crt').check()
            await expect(page.locator('#tv-set')).to_have_attribute('data-picture','classic')
            await expect(page.locator('#tv-set')).to_have_attribute('data-caption-size','large')
            await page.locator('#info').click()
            await expect(page.locator('#screen-info')).to_be_visible()
            await page.locator('#settings-close').click()
            await expect(page.locator('#settings-toggle')).to_be_focused()
            if await page.evaluate('document.fullscreenEnabled'):
                await page.locator('#fullscreen').click()
                await page.wait_for_function("document.fullscreenElement?.id==='tv-set'")
                assert await page.evaluate("document.fullscreenElement.contains(document.querySelector('#transport'))")
                await page.evaluate('document.exitFullscreen()')
            await page.screenshot(path=str(output/'tv-controls-desktop.png'),full_page=True)
            await page.reload()
            await expect(page.locator('#volume')).to_have_value('35')
            await expect(page.locator('#picture')).to_have_value('classic')
            assert await page.locator('video').evaluate('v=>v.paused'), 'Reload should not autoplay'
            mobile=await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,reduced_motion='reduce')
            phone=await mobile.new_page()
            phone.on('pageerror',lambda error: errors.append(str(error)))
            await phone.goto(url)
            await expect(phone.locator('#detail-title')).not_to_have_text('Loading guide…')
            assert await phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
            await phone.screenshot(path=str(output/'tv-controls-mobile.png'),full_page=True)
            assert not errors,errors
            report={'status':'pass','checks':['native WebVTT cues','pause across boundary','resume at live position',
                'volume','picture sizing','large captions','CRT preference','settings popover and focus return','programme OSD',
                'full-screen controls when supported','preferences','no automatic playback after reload','mobile overflow'],
                'page_errors':errors}
            (output/'tv-browser.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
        finally: await browser.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:8000')
    asyncio.run(run(parser.parse_args().url))
