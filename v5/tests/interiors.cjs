/* Run against a local static preview. No project dependencies are installed. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.V5_BASE_URL || 'http://127.0.0.1:8765';
const output = process.env.V5_QA_DIR || path.resolve(__dirname, '../../../v5-qa');
const projects = require('../../v4/content/projects.json');
const checks = [];
const failures = [];
const check = async (name, action) => {
  try { await action(); checks.push({name, pass: true}); console.log(`PASS ${name}`); }
  catch (error) { const text = String(error.stack || error); checks.push({name, pass: false, error:text}); failures.push(name); console.error(`FAIL ${name}\n${text}`); }
};
const visibleCount = p => p.locator('[data-project]:visible').count();
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const capture = async (page, filename) => {
  // Visit each image so a full-page capture represents loaded lazy media.
  for (const img of await page.locator('img').all()) {
    await img.scrollIntoViewIfNeeded();
    await img.evaluate(im => im.decode().catch(() => {}));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({path:path.join(output,filename),fullPage:true});
  await page.screenshot({path:path.join(output,filename.replace('.png','-viewport.png')),fullPage:false});
};
const launch = {};
if (process.env.CHROMIUM_EXECUTABLE) launch.executablePath = process.env.CHROMIUM_EXECUTABLE;

(async () => {
  fs.mkdirSync(output, {recursive:true});
  const browser = await playwright.chromium.launch({headless:true, ...launch});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await check('Collection contains all 16 projects and two board records', async () => {
      const response = await page.goto(`${base}/v5/projects/`);
      assert.equal(response.status(), 200);
      assert.equal(await visibleCount(page),16);
      assert.equal(await page.locator('#board-records article').count(),2);
      await capture(page,'interiors-collection-desktop.png');
    });
    await check('Search, discipline, empty state and resets reflect the same results', async () => {
      await page.getByLabel('Search projects', {exact:true}).fill('radio');
      assert.equal(await visibleCount(page),4);
      assert.equal(new URL(page.url()).searchParams.get('q'),'radio');
      await page.getByRole('button',{name:'Reset filters',exact:true}).click();
      assert.equal(await visibleCount(page),16);
      await page.getByLabel('Discipline',{exact:true}).selectOption('Expansion cards');
      assert.equal(await visibleCount(page),5);
      assert.equal(new URL(page.url()).searchParams.get('discipline'),'Expansion cards');
      await page.getByLabel('Search projects',{exact:true}).fill('xyz-nonexistent-device');
      assert.equal(await visibleCount(page),0);
      await page.locator('[data-empty]').waitFor({state:'visible'});
      await page.getByRole('button',{name:'Show all projects',exact:true}).click();
      assert.equal(await visibleCount(page),16);
      assert.equal(await page.getByLabel('Search projects',{exact:true}).inputValue(),'');
      assert.equal(await page.locator(':focus').getAttribute('id'),'project-query');
      assert.equal(new URL(page.url()).searchParams.has('q'),false);
    });
    await check('Shareable URL loads filters, and browser Back restores them', async () => {
      await page.goto(`${base}/v5/projects/?q=kiku&discipline=Embedded+systems`);
      assert.equal(await visibleCount(page),1);
      assert.equal(await page.getByLabel('Search projects',{exact:true}).inputValue(),'kiku');
      await page.locator('.project-entry h2 a').filter({hasText:'Kiku'}).click();
      await page.waitForURL('**/v5/projects/kiku/');
      await page.goBack();
      assert.equal(await visibleCount(page),1);
      assert.equal(await page.getByLabel('Search projects',{exact:true}).inputValue(),'kiku');
      await page.goto(`${base}/v5/projects/?discipline=not-a-real-discipline&q=PCB`);
      assert.equal(await page.getByLabel('Discipline',{exact:true}).inputValue(),'');
      assert.ok(await visibleCount(page)>0);
    });
    await check('Keyboard skip, controls and result links are usable', async () => {
      await page.goto(`${base}/v5/projects/`);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').getAttribute('href'),'#main');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(':focus').getAttribute('id'),'main');
      await page.getByLabel('Search projects',{exact:true}).focus();
      await page.keyboard.type('Dash');
      assert.equal(await visibleCount(page),1);
      await page.keyboard.press('Enter');
      assert.equal(await visibleCount(page),1);
      await page.locator('.project-entry:visible h2 a').focus();
      const focus = await page.locator(':focus').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      assert.ok(focus.y + focus.height > header.y + header.height, 'result link is not hidden behind the header');
      await page.keyboard.press('Enter');
      await page.waitForURL('**/v5/projects/dash/');
    });
    await check('Every generated case loads with valid media and one heading', async () => {
      for (const project of projects) {
        const response = await page.goto(`${base}/v5/projects/${project.slug}/`);
        assert.equal(response.status(),200,project.slug);
        assert.equal(await page.locator('h1').count(),1,project.slug);
        assert.equal(await page.locator('h1').innerText(),project.name,project.slug);
        const broken = await page.locator('img').evaluateAll(images => images.filter(im=>im.complete&&!im.naturalWidth).map(im=>im.src));
        assert.deepEqual(broken,[],project.slug);
        assert.equal(await overflow(page),false,project.slug);
      }
      assert.deepEqual(errors,[]);
    });
    for (const width of [320,390]) {
      await check(`${width}px collection, complex case and about reflow`, async () => {
        await page.setViewportSize({width,height:844});
        for (const [slug, filename] of [['projects/','collection'],['projects/skylabs/boards/telemetry/','telemetry'],['projects/framework-raspberry-pi/','pi'],['about/','about']]) {
          await page.goto(`${base}/v5/${slug}`);
          assert.equal(await overflow(page),false,`${width} ${slug}`);
          const heading=await page.locator('h1').boundingBox();
          assert.ok(heading.x>=0 && heading.x+heading.width<=width+1,`${slug} heading fits`);
          await capture(page,`interiors-${filename}-${width}.png`);
        }
        await page.goto(`${base}/v5/projects/`);
        await page.getByLabel('Discipline',{exact:true}).selectOption('Embedded systems');
        assert.equal(await visibleCount(page),3);
        await page.getByRole('button',{name:'Reset filters',exact:true}).click();
        assert.equal(await visibleCount(page),16);
      });
    }
    await check('No JavaScript retains all projects, contact and case evidence', async () => {
      const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
      const nojs=await context.newPage();
      await nojs.goto(`${base}/v5/projects/`);
      assert.equal(await visibleCount(nojs),16);
      assert.equal(await nojs.locator('[data-filters]').isVisible(),false);
      await nojs.goto(`${base}/v5/projects/kiku/`);
      assert.ok((await nojs.locator('main').innerText()).includes('not extended listening reliability'));
      await nojs.getByText('Read the detailed project notes',{exact:true}).count();
      await nojs.goto(`${base}/v5/about/`);
      assert.equal(await nojs.locator('a[href="mailto:andrew.noah.chung@gmail.com"]').count(),1);
      assert.equal(await overflow(nojs),false);
      await nojs.screenshot({path:path.join(output,'interiors-about-nojs.png'),fullPage:true});
      await context.close();
    });
    await check('Desktop project hierarchy and expanded notes render cleanly', async () => {
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(`${base}/v5/projects/skylabs/boards/telemetry/`);
      await page.getByText('Read the detailed project notes',{exact:true}).click();
      assert.equal(await page.locator('details').getAttribute('open'),'');
      assert.ok((await page.locator('details').innerText()).includes('missing values are NaN, not zero'));
      await capture(page,'interiors-telemetry-desktop.png');
      await page.goto(`${base}/v5/about/`);
      await capture(page,'interiors-about-desktop.png');
    });
    await page.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output,'interiors-results.json'),JSON.stringify({base,checks,failures},null,2));
  if(failures.length) process.exitCode=1;
  else console.log(`All ${checks.length} interior acceptance checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
