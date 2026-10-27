"""Browser verification of the stream-and-guide layout on the short demo.

Run: python scripts/epg_acceptance.py --url http://127.0.0.1:8000
Requires Playwright and Chromium. Saves desktop/mobile captures on success.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect


async def run(url):
    output=Path('test-results');output.mkdir(exist_ok=True)
    errors,requests=[],[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or None)
        context=await browser.new_context(viewport={'width':1440,'height':1050})
        page=await context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda request:requests.append(request.url))
        try:
            await page.goto(url)
            await expect(page.locator('#programme-guide')).to_be_hidden()
            await page.locator('#guide-toggle').click()
            await expect(page.locator('#guide-toggle')).to_have_attribute('aria-expanded','true')
            await expect(page.locator('.programme-button').first).to_be_visible()
            await page.evaluate('document.fonts.ready')
            assert await page.locator('#guide-heading').evaluate('(e)=>!getComputedStyle(e).fontFamily.includes("Oddity Pixel")'), 'Guide must use neutral interface type'
            await expect(page.locator('main > section')).to_have_count(2)
            await expect(page.locator('footer,.masthead,.on-now')).to_have_count(0)
            await page.locator('#guide-close').click()
            await expect(page.locator('#guide-toggle')).to_be_focused()
            await page.locator('#tune').click()
            await page.wait_for_function("document.querySelector('#video').readyState>=2 && !document.querySelector('#video').paused")
            await expect(page.locator('#programme-guide')).to_be_hidden()
            await page.locator('#guide-toggle').click()
            cells=page.locator('.programme-button')
            await cells.nth(1).focus()
            title=(await cells.nth(1).get_attribute('title')).split(' · ')[0]
            await expect(page.locator('#detail-title')).to_have_text(title)
            await page.keyboard.press('ArrowRight')
            await expect(cells.nth(2)).to_be_focused()
            await expect(cells.nth(2)).to_have_attribute('aria-pressed','true')
            await page.locator('[data-period="tomorrow"]').click()
            await expect(page.locator('#guide-viewport')).to_have_attribute('aria-busy','false')
            await expect(page.locator('[data-period="tomorrow"]')).to_have_attribute('aria-pressed','true')
            initial_window=await page.locator('#guide-window').inner_text()
            await page.locator('#guide-next').click()
            await expect(page.locator('#guide-viewport')).to_have_attribute('aria-busy','false')
            assert await page.locator('#guide-window').inner_text()!=initial_window
            await page.locator('#guide-prev').click()
            await expect(page.locator('#guide-window')).to_have_text(initial_window)
            await page.wait_for_function("!document.querySelector('#video').paused")
            await page.locator('#guide-now').click()
            await expect(page.locator('#guide-viewport')).to_have_attribute('aria-busy','false')
            await expect(page.locator('#guide-playhead')).to_be_visible()
            await expect(page.locator('.channel-rail')).to_have_count(1)
            await page.screenshot(path=str(output/'epg-desktop.png'),full_page=True)
            count=await cells.count()
            await page.route('**/api/blocks?*',lambda route:route.abort())
            await page.locator('#guide-now').click()
            await expect(page.locator('#guide-status')).to_contain_text('Guide unavailable')
            await expect(page.locator('#guide-refresh')).to_be_visible()
            assert await cells.count()==count
            await page.wait_for_function("!document.querySelector('#video').paused")
            mobile=await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,reduced_motion='reduce')
            phone=await mobile.new_page()
            phone.on('pageerror',lambda error:errors.append(str(error)))
            await phone.goto(url)
            await expect(phone.locator('#programme-guide')).to_be_hidden()
            await phone.locator('#guide-toggle').click()
            await expect(phone.locator('.programme-button').first).to_be_visible()
            await phone.evaluate('document.fonts.ready')
            assert await phone.evaluate('document.documentElement.scrollWidth<=innerWidth'),'Page overflows horizontally'
            left=await phone.locator('.channel-rail').bounding_box()
            await phone.locator('#guide-viewport').evaluate('(e)=>{e.scrollLeft=400;}')
            after=await phone.locator('.channel-rail').bounding_box()
            assert abs(left['x']-after['x'])<1,'Channel rail must stay fixed while the timeline scrolls'
            await phone.screenshot(path=str(output/'epg-mobile.png'),full_page=True)
            handle=await phone.locator('#sheet-handle').bounding_box()
            await phone.mouse.move(handle['x']+handle['width']/2,handle['y']+10)
            await phone.mouse.down()
            await phone.mouse.move(handle['x']+handle['width']/2,handle['y']+85,steps=6)
            await phone.mouse.up()
            await expect(phone.locator('#programme-guide')).to_be_hidden()
            await expect(phone.locator('#guide-toggle')).to_be_focused()
            assert not errors,errors
            assert all(urlparse(request).netloc==urlparse(url).netloc for request in requests),requests
            report={'status':'pass','desktop':'1440×1050','mobile':'390×844','page_errors':errors,
                'checked':['stream-first wrapper','guide hidden on arrival','guide dismiss and focus return','time grid','selection and arrow keys','day navigation','earlier/later windows',
                           'playback while browsing','Now marker','one real channel','failed refresh retains guide','fixed mobile channel rail','mobile swipe dismissal','mobile overflow']}
            (output/'epg-browser.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
        finally: await browser.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='http://127.0.0.1:8000')
    asyncio.run(run(parser.parse_args().url))
