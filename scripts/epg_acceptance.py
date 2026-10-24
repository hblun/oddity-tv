"""Browser verification for the EPG on a running demo station.

Run: python scripts/epg_acceptance.py --url http://127.0.0.1:8000
Requires the development-only playwright package and installed Chromium.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright, expect


async def run(url):
    output = Path('test-results')
    output.mkdir(exist_ok=True)
    errors, requests = [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or None)
        context = await browser.new_context(viewport={'width':1440,'height':1050})
        page = await context.new_page()
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.on('request',lambda request: requests.append(request.url))
        try:
            await page.goto(url)
            await expect(page.locator('.programme-button')).to_have_count(60)
            await page.screenshot(path=str(output/'epg-desktop.png'),full_page=True)
            await page.locator('#tune').click()
            await page.wait_for_function("document.querySelector('video').readyState>=2 && !document.querySelector('video').paused")
            await page.locator('#programme-guide').scroll_into_view_if_needed()
            await page.locator('[data-period="tomorrow"]').click()
            await page.wait_for_function("document.querySelector('#guide-viewport').getAttribute('aria-busy')==='false'")
            await expect(page.locator('[data-period="tomorrow"]')).to_have_attribute('aria-pressed','true')
            await page.locator('.programme-button').first.click()
            await expect(page.locator('#programme-dialog')).to_be_visible()
            await page.keyboard.press('Escape')
            await expect(page.locator('#programme-dialog')).not_to_be_visible()
            await page.wait_for_function("!document.querySelector('video').paused")
            await page.locator('#programmes-only').check()
            await page.locator('#guide-search').fill('night shift')
            await expect(page.locator('.programme-title').first).to_contain_text('Night Shift')
            await expect(page.locator('#guide-viewport')).to_have_attribute('aria-busy','false')
            assert set(await page.locator('#guide .kind').all_text_contents())=={'programme'}
            await page.locator('#guide-more').click()
            await expect(page.locator('.programme-button')).to_have_count(120)
            await page.locator('#guide-search').fill('zz-no-such-programme')
            await expect(page.locator('#guide-empty')).to_be_visible()
            await page.locator('#guide-search').fill('')
            await page.locator('#programmes-only').uncheck()
            await expect(page.locator('.programme-button')).to_have_count(60)
            await page.locator('#guide-auto').click()
            await expect(page.locator('#guide-auto')).to_have_attribute('aria-pressed','true')
            await page.wait_for_function("document.querySelector('#guide-viewport').scrollTop>5")
            await page.locator('#guide-auto').click()
            await page.route('**/api/guide?*',lambda route: route.abort())
            await page.locator('#guide-refresh').click()
            await expect(page.locator('#guide-status')).to_contain_text('Guide unavailable')
            assert await page.locator('.programme-button').count()==60
            await page.wait_for_function("!document.querySelector('video').paused")
            mobile = await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,reduced_motion='reduce')
            phone = await mobile.new_page()
            phone.on('pageerror',lambda error: errors.append(str(error)))
            await phone.goto(url)
            await expect(phone.locator('.programme-button')).to_have_count(60)
            await expect(phone.locator('#guide-auto')).to_be_disabled()
            assert await phone.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile horizontal overflow'
            await phone.screenshot(path=str(output/'epg-mobile.png'),full_page=True)
            assert not errors, errors
            assert all(urlparse(request).netloc==urlparse(url).netloc for request in requests),requests
            report={'status':'pass','desktop':'1440×1050','mobile':'390×844','page_errors':errors,
                    'checked':['day browsing','details/Escape','uninterrupted playback','server-side search','programme filter',
                               'pagination','empty state','auto-scroll','network failure recovery','reduced motion','mobile overflow']}
            (output/'epg-browser.json').write_text(json.dumps(report,indent=2))
            print(json.dumps(report,indent=2))
        finally:
            await browser.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    asyncio.run(run(parser.parse_args().url))
