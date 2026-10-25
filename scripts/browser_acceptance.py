"""Real two-viewer browser smoke test against the 2-minute demo station."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import time
from urllib.parse import urlparse
from playwright.async_api import async_playwright


async def run(url):
    async with async_playwright() as p:
        executable = os.getenv("CHROMIUM_EXECUTABLE")
        browser = await p.chromium.launch(executable_path=executable or None)
        contexts = [await browser.new_context(viewport={"width": 1280, "height": 900}) for _ in range(2)]
        pages = [await c.new_page() for c in contexts]
        requests, errors = [], []
        for page in pages:
            page.on("request", lambda request: requests.append(request.url))
            page.on("pageerror", lambda error: errors.append(str(error)))

        try:
            await pages[0].goto(url)
            await pages[0].wait_for_function("!document.getElementById('detail-title').textContent.includes('Loading guide')")
            await pages[0].locator("#tune").click()
            await pages[0].wait_for_function("document.querySelector('#video').readyState>=2 && !document.querySelector('#video').paused")
            await asyncio.sleep(2)
            await pages[1].goto(url)
            await pages[1].wait_for_function("!document.getElementById('detail-title').textContent.includes('Loading guide')")
            await pages[1].locator("#tune").click()
            await pages[1].wait_for_function("document.querySelector('#video').readyState>=2 && !document.querySelector('#video').paused")
            checks = 0
            seen = [set(), set()]
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                await asyncio.sleep(1)
                snapshots = await asyncio.gather(*[page.evaluate("({src:document.querySelector('#video').currentSrc,t:document.querySelector('#video').currentTime,ready:document.querySelector('#video').readyState,paused:document.querySelector('#video').paused,event:document.querySelector('#video').dataset.broadcastId,visible:document.querySelectorAll('video:not([hidden])').length})") for page in pages])
                for index, snapshot in enumerate(snapshots):
                    assert snapshot['visible']==1, 'Exactly one picture should be visible'
                    if snapshot['event']: seen[index].add(snapshot['event'])
                response = await contexts[0].request.get(url.rstrip("/") + "/api/channel?hours=0.01")
                data = await response.json()
                event = data["now"]
                # Avoid evaluating during normal metadata/clip-boundary loading.
                if event and event["end"] - data["server_time"] > 2 and data["server_time"] - event["start"] > 2:
                    expected = event["source_in"] + data["server_time"] - event["start"]
                    if all(s["src"].endswith(event["url"]) and s["ready"] >= 2 and not s["paused"] for s in snapshots):
                        for snapshot in snapshots:
                            assert abs(snapshot["t"] - expected) < 2, (snapshot, expected)
                        assert abs(snapshots[0]["t"] - snapshots[1]["t"]) < 1.75, snapshots
                        checks += 1
                if checks >= 5 and all(len(events) >= 3 for events in seen):
                    break
            assert checks >= 5, "Not enough stable playback samples"
            assert all(len(events) >= 3 for events in seen), "Expected two automatic transitions per viewer"
            origin = urlparse(url).netloc
            assert all(urlparse(request).netloc == origin for request in requests), requests
            assert not errors, errors
            output = Path("test-results")
            output.mkdir(exist_ok=True)
            await pages[0].screenshot(path=str(output / "broadcast.png"), full_page=True)
            report = {"result": "pass", "stable_samples": checks, "viewers": 2, "snapshots": snapshots, "active_transmissions": [len(events) for events in seen],
                      "external_requests": 0, "page_errors": errors}
            (output / "browser.json").write_text(json.dumps(report, indent=2))
            print(json.dumps(report, indent=2))
        finally:
            await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    asyncio.run(run(parser.parse_args().url))
