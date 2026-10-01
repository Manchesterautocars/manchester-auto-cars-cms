"""Browser test suite for the Manchester Auto Cars CMS.
Runs the real server + API handlers with FAKE env values and a faked GitHub/Cloudinary.
Setup: pip install playwright && playwright install chromium
Run:   python3 tests/ui_test.py   (from the project root)
It cannot prove real GitHub/Cloudinary behaviour - do one real publish/upload on a Vercel preview too."""
import subprocess, os, time, json, re, sys
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); H=os.environ.get("TEST_OUT","/tmp/mac-cms-tests"); os.makedirs(H+"/shots",exist_ok=True); PORT=3103
BASE=f"http://localhost:{PORT}"
CHROME=os.environ.get("CHROMIUM_PATH")  # optional; default = Playwright's own browser
for i,c in enumerate([(200,50,50),(50,160,80),(60,90,210)],1):
    im=Image.new("RGB",(640,400),c); ImageDraw.Draw(im).text((20,20),f"photo {i}",fill="white"); im.save(f"{H}/img{i}.png")
logo_bytes=open(f"{ROOT}/assets/images/manchester-autocars-logo.png","rb").read()

env=dict(os.environ, PORT=str(PORT), GITHUB_TOKEN="ghp_FAKE_TOKEN_FOR_TEST_ONLY", GITHUB_REPO="manchesterauto/manchester-auto-cars", GITHUB_BRANCH="main",
         CLOUDINARY_CLOUD_NAME="testcloud", CLOUDINARY_API_KEY="111222333", CLOUDINARY_API_SECRET="SECRET_FOR_TEST_ONLY",
         NODE_OPTIONS="-r "+os.path.join(ROOT,"tests","mock-external-apis.js"), TEST_OUT=H)
srv=subprocess.Popen(["node","server.js"],cwd=ROOT,env=env,stdout=open(f"{H}/srv-ui.log","w"),stderr=subprocess.STDOUT); time.sleep(1.5)

results=[]; 
def check(name, cond, detail=""):
    results.append((name,bool(cond),detail)); print(("PASS " if cond else "FAIL ")+name+(f"  [{detail}]" if detail else ""),flush=True)
def reqs(): return [json.loads(l) for l in open(f"{H}/requests.jsonl")]
def published(): return json.load(open(f"{H}/published.json"))

upload_log=[]; console_errors=[]
try:
  with sync_playwright() as p:
    b=p.chromium.launch(**({"executable_path":CHROME} if CHROME else {}),args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":1366,"height":850})
    page=ctx.new_page()
    page.on("console",lambda m: console_errors.append(m.text) if m.type=="error" else None)
    page.on("pageerror",lambda e: console_errors.append("PAGEERROR "+str(e)))
    n=[0]
    def cloud_upload(route):
        body=route.request.post_data_buffer.decode("latin1")
        folder=re.search(r'name="folder"\r\n\r\n([^\r]+)',body).group(1)
        sig=re.search(r'name="signature"\r\n\r\n([^\r]+)',body).group(1)
        n[0]+=1; pid=f"{folder}/up{n[0]}"; upload_log.append({"folder":folder,"sig":sig,"public_id":pid,"url":route.request.url})
        route.fulfill(status=200,headers={"access-control-allow-origin":"*","content-type":"application/json"},
                      body=json.dumps({"secure_url":f"https://res.cloudinary.com/testcloud/image/upload/v1/{pid}.png","public_id":pid}))
    ctx.route("**/api.cloudinary.com/v1_1/**",cloud_upload)
    ctx.route("https://res.cloudinary.com/**",lambda r: r.fulfill(status=200,content_type="image/png",body=logo_bytes))
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"),lambda r: r.abort())

    # ---------- 1. Login/entry + logo
    page.goto(BASE+"/"); page.wait_for_load_state("load")
    check("Entry page title", page.title()=="Manchester Auto Cars — Vehicle CMS", page.title())
    nat=page.eval_on_selector(".brand-logo-plate img","i=>[i.naturalWidth,i.naturalHeight,i.complete]")
    check("Entry page logo loads (real pixels)", nat[0]>0 and nat[2], str(nat))
    info=page.eval_on_selector(".brand-logo-plate img","i=>{const r=i.getBoundingClientRect();return [r.width,r.height,getComputedStyle(i).objectFit]}")
    cs=min(info[0]/nat[0],info[1]/nat[1]); drawn=(nat[0]*cs,nat[1]*cs)
    check("Logo not distorted on entry page (object-fit: contain, uniform scale)", info[2]=="contain" and abs(drawn[0]/drawn[1]-nat[0]/nat[1])<0.001, f"box {info[0]:.0f}x{info[1]:.0f}, drawn {drawn[0]:.0f}x{drawn[1]:.0f}")
    check("Favicon links point to Manchester assets", page.eval_on_selector_all("link[rel=icon],link[rel=apple-touch-icon]","l=>l.map(x=>x.getAttribute('href'))")==["assets/images/favicon-32.png","assets/images/apple-touch-icon.png"])
    page.screenshot(path=f"{H}/shots/desktop-entry.png")

    # ---------- 2. Dashboard (fresh browser)
    page.click("text=Enter CMS"); page.wait_for_selector("#stat-cards .stat-card")
    page.wait_for_function("document.querySelector('#config-banner').innerText.includes('GitHub publishing is configured')")
    banner=page.inner_text("#config-banner")
    check("Dashboard shows GitHub target manchesterauto/manchester-auto-cars @ main", "manchesterauto/manchester-auto-cars" in banner and "@ main" in banner, banner[:160].replace("\n"," "))
    check("Dashboard shows Cloudinary configured", "Cloudinary image uploads are configured" in banner)
    stats=[t.replace("\n"," ") for t in page.eval_on_selector_all(".stat-card","els=>els.map(e=>e.innerText)")]
    check("Dashboard stat cards: Total/Available/Reserved/Sold/Featured", [s.split(" ")[0] for s in stats][:2]==["TOTAL","AVAILABLE"] or len(stats)==5, str(stats))
    check("Fresh browser starts with 0 vehicles (no demo data)", stats[0].endswith("0"), stats[0])
    qa=page.eval_on_selector_all(".quick-action span","e=>e.map(x=>x.innerText)")
    check("Quick actions present", qa==["Add Vehicle","View Vehicles","Publish","Pull Latest","Settings"], str(qa))
    check("Sidebar logo loads + alt text", page.eval_on_selector("#sidebar img","i=>i.naturalWidth>0 && i.alt==='Manchester Auto Cars'"))
    check("Sidebar footer says Manchester Auto Cars", "Manchester Auto Cars" in page.inner_text(".sidebar-foot"))
    keys=page.evaluate("Object.keys(localStorage)")
    check("localStorage keys are mac_cms_* only", keys and all(k.startswith("mac_cms_") for k in keys), str(keys))
    page.screenshot(path=f"{H}/shots/desktop-dashboard-empty.png")

    # dashboard Pull Latest quick action -> modal
    page.click(".quick-action:has-text('Pull Latest')"); page.wait_for_selector("#confirm-modal.open")
    check("Dashboard 'Pull Latest' quick action opens pull confirmation on Vehicles", "vehicles.html" in page.url and "Pull latest" in page.inner_text("#confirm-modal"))

    # ---------- 3. Pull Latest
    page.click("#confirm-modal-ok"); page.wait_for_function("document.querySelectorAll('#vehicles-tbody tr').length==2")
    ids_ls=[v["id"] for v in json.loads(page.evaluate("localStorage.getItem('mac_cms_vehicles')"))]
    check("Pull Latest loads 2 vehicles from GitHub (IDs preserved)", ids_ls==["mac-bmw-320d-001","mac-audi-a4-002"], str(ids_ls))
    check("Vehicle list shows £ and miles", "£18,990" in page.inner_text("#vehicles-tbody") and "48,000 mi" in page.inner_text("#vehicles-tbody"))
    check("Publish card shows target repo@branch", page.inner_text("#publish-target")=="manchesterauto/manchester-auto-cars @ main", page.inner_text("#publish-target"))
    page.screenshot(path=f"{H}/shots/desktop-vehicles.png")

    # filters
    page.select_option("#f-status","reserved"); check("Status filter works", page.locator("#vehicles-tbody tr").count()==1)
    page.select_option("#f-status",""); page.fill("#f-search","bmw"); check("Search works", page.locator("#vehicles-tbody tr").count()==1); page.fill("#f-search","")
    page.select_option("#f-featured","yes"); check("Featured filter works", page.locator("#vehicles-tbody tr").count()==1); page.select_option("#f-featured","")

    # ---------- 4. Add vehicle with photos
    page.goto(BASE+"/vehicle-edit.html"); page.wait_for_selector("#vehicle-form")
    page.fill("[name=make]","Mercedes-Benz"); page.fill("[name=model]","C-Class"); page.fill("[name=variant]","C220d AMG Line"); page.fill("[name=year]","2020")
    page.fill("[name=registration]","MA20 ABC"); page.fill("[name=bodyType]","Saloon"); page.fill("[name=colour]","Silver"); page.fill("[name=location]","Manchester")
    page.click("[data-tab=pricing]"); page.fill("[name=price]","21500"); page.fill("[name=previousPrice]","22500")
    page.click("[data-tab=specs]"); page.fill("[name=mileage]","35000"); page.select_option("[name=fuel]","Diesel"); page.select_option("[name=transmission]","Automatic"); page.fill("[name=engine]","2.0L")
    page.click("[data-tab=description]"); page.fill("[name=description]","Clean C-Class with full history.")
    page.click("[data-tab=highlights]"); page.fill("#highlight-input","Full service history"); page.click("#highlight-add"); page.fill("#highlight-input","Heated seats"); page.press("#highlight-input","Enter")
    check("Key features chips added", page.locator("#highlight-list .chip").count()==2)
    page.click("[data-tab=status]"); page.select_option("[name=status]","reserved"); page.click(".toggle .slider")
    page.click("[data-tab=seo]"); page.fill("[name=seoTitle]","Used Mercedes C220d | Manchester Auto Cars")
    page.click("[data-tab=images]")
    page.set_input_files("#vimg-input",[f"{H}/img1.png",f"{H}/img2.png",f"{H}/img3.png"])
    page.wait_for_function("document.querySelectorAll('.vimg-tile').length==3 && !document.querySelector('.is-uploading') && !document.querySelector('.upload-failed')")
    check("3 photos uploaded (previews shown)", page.locator(".vimg-tile").count()==3)
    vid=page.evaluate("(()=>{const s=document.querySelector('#vimg-grid img').src;return s})()")
    folders={u["folder"] for u in upload_log}
    check("Upload folder is manchester-auto-cars/vehicles/<mac- id>", len(folders)==1 and re.fullmatch(r"manchester-auto-cars/vehicles/mac-[a-z0-9-]+",list(folders)[0]), str(folders))
    new_id=list(folders)[0].split("/")[-1]
    check("New vehicle ID starts with mac-", new_id.startswith("mac-"), new_id)
    check("Upload used the server signature (signature sent)", all(len(u["sig"])==40 for u in upload_log))
    order0=page.eval_on_selector_all(".vimg-tile img","e=>e.map(i=>i.src.split('/').pop())"); check("Initial order up1,up2,up3; first is Cover", order0==["up1.png","up2.png","up3.png"] and page.locator(".vimg-tile").first.get_attribute("class").find("is-cover")>=0, str(order0))
    page.screenshot(path=f"{H}/shots/desktop-photos.png")
    # set main image: tile 3 star
    page.locator(".vimg-tile").nth(2).hover(); page.locator(".vimg-tile").nth(2).locator("button[data-action=cover]").click()
    order1=page.eval_on_selector_all(".vimg-tile img","e=>e.map(i=>i.src.split('/').pop())"); check("Select main image moves photo to first/cover", order1==["up3.png","up1.png","up2.png"], str(order1))
    # reorder via drag: drag first tile onto last
    page.locator(".vimg-tile").nth(0).drag_to(page.locator(".vimg-tile").nth(2))
    order2=page.eval_on_selector_all(".vimg-tile img","e=>e.map(i=>i.src.split('/').pop())"); check("Drag-and-drop reorder works", order2==["up1.png","up2.png","up3.png"], str(order2))
    # remove photo 2 -> Cloudinary delete
    page.locator(".vimg-tile").nth(1).hover(); page.locator(".vimg-tile").nth(1).locator("button[data-action=remove]").click(); time.sleep(0.6)
    # destroy body is urlencoded; parse
    dels=[dict(x.split("=") for x in r["body"].split("&")) for r in reqs() if "/image/destroy" in r["url"]]
    from urllib.parse import unquote
    del_ids=[unquote(d["public_id"]) for d in dels]
    check("Removing a photo calls Cloudinary destroy with correct publicId", any(d.endswith("/up2") and d.startswith("manchester-auto-cars/vehicles/"+new_id) for d in del_ids), str(del_ids[-1:]))
    check("2 photos remain after removal", page.locator(".vimg-tile").count()==2)
    # preview
    page.click("#btn-preview"); page.wait_for_selector("#preview-modal.open")
    pv=page.inner_text("#preview-content"); check("Preview shows £ price + miles + vehicle", "£21,500" in pv and "35,000 mi" in pv and "mercedes-benz" in pv.lower(), pv.replace("\n"," | ")[:160])
    page.screenshot(path=f"{H}/shots/desktop-preview.png"); page.click("#preview-close")
    # Save & Publish
    page.click("#btn-save-publish"); page.wait_for_url("**/vehicles.html"); 
    pub=published(); mb=[v for v in pub["vehicles"] if v["id"]==new_id]
    check("Save & Publish committed new vehicle to (mock) GitHub", len(mb)==1 and len(pub["vehicles"])==3, f"{len(pub['vehicles'])} vehicles")
    v=mb[0]
    check("Published fields: status reserved, featured true, £ values, year, mileage", v["status"]=="reserved" and v["featured"] is True and v["price"]==21500 and v["previousPrice"]==22500 and v["year"]==2020 and v["mileage"]==35000 and v["registration"]=="MA20 ABC" and v["bodyType"]=="Saloon" and v["colour"]=="Silver" and v["fuel"]=="Diesel" and v["transmission"]=="Automatic" and v["engine"]=="2.0L" and v["variant"]=="C220d AMG Line", json.dumps({k:v[k] for k in ["status","featured","price","previousPrice"]}))
    check("Published images are URLs in order; mainImage = first", [u.split("/")[-1] for u in v["images"]]==["up1.png","up3.png"] and v["mainImage"].endswith("up1.png"), str(v["images"]))
    check("Published image URLs live under manchester-auto-cars/vehicles/<id>/", all(f"/manchester-auto-cars/vehicles/{new_id}/" in u for u in v["images"]))
    check("Published highlights, SEO, description, dateAdded present", v["highlights"]==["Full service history","Heated seats"] and v["seoTitle"].startswith("Used Mercedes") and v["description"] and re.fullmatch(r"\d{4}-\d\d-\d\d",v["dateAdded"]))
    check("Existing pulled vehicle IDs untouched after publish", {"mac-bmw-320d-001","mac-audi-a4-002"} <= {x["id"] for x in pub["vehicles"]})

    # ---------- 5. Edit existing vehicle (pulled, URL-string photo)
    page.goto(BASE+"/vehicle-edit.html?id=mac-bmw-320d-001"); page.wait_for_selector("#vehicle-form")
    check("Edit page title says Edit Vehicle", "edit vehicle" in page.inner_text("#topbar-title").lower(), page.inner_text("#topbar-title").replace("\n"," | "))
    page.click("[data-tab=pricing]"); check("Edit form populated from pulled data", page.input_value("[name=make]")=="BMW" and page.input_value("[name=price]")=="18990")
    page.click("[data-tab=pricing]"); page.fill("[name=price]","17990"); page.fill("[name=previousPrice]","18990"); page.click("[data-tab=status]"); page.select_option("[name=status]","sold"); page.click(".toggle .slider")
    page.click("[data-tab=images]"); check("Pulled photo shown", page.locator(".vimg-tile").count()==1)
    page.locator(".vimg-tile").nth(0).hover(); page.locator(".vimg-tile").nth(0).locator("button[data-action=remove]").click(); time.sleep(0.6)
    del_ids=[unquote(dict(x.split("=") for x in r["body"].split("&"))["public_id"]) for r in reqs() if "/image/destroy" in r["url"]]
    check("Deleting a PULLED photo derives publicId and deletes from Cloudinary", "manchester-auto-cars/vehicles/mac-bmw-320d-001/pic1" in del_ids, str(del_ids[-1:]))
    page.click("#btn-save"); page.wait_for_url("**/vehicles.html")
    lv=[v for v in json.loads(page.evaluate("localStorage.getItem('mac_cms_vehicles')")) if v["id"]=="mac-bmw-320d-001"][0]
    check("Edit saved: ID unchanged, price/status/featured updated", lv["id"]=="mac-bmw-320d-001" and lv["price"]==17990 and lv["status"]=="sold" and lv["featured"] is False and lv["images"]==[])
    # status badges + dashboard counts
    page.goto(BASE+"/dashboard.html"); page.wait_for_selector("#stat-cards .stat-card")
    vals=page.eval_on_selector_all(".stat-card .stat-value","e=>e.map(x=>x.innerText)")
    check("Dashboard counts: total 3, available 0, reserved 2, sold 1, featured 1", vals==["3","0","2","1","1"], str(vals))
    act=page.inner_text("#activity-list"); check("Activity log records events", "Vehicle added" in act and "Vehicle edited" in act and "Pulled latest" in act and "Published" in act)
    check("Recent vehicles list populated", page.locator("#recent-vehicles .recent-item").count()==3)
    page.screenshot(path=f"{H}/shots/desktop-dashboard.png")

    # ---------- 6. Delete vehicle + publish
    page.goto(BASE+"/vehicles.html"); page.wait_for_selector("#vehicles-tbody tr")
    row=page.locator("#vehicles-tbody tr",has_text="Audi"); row.locator("button[data-action=delete]").click(); page.wait_for_selector("#confirm-modal.open")
    page.click("#confirm-modal-ok"); page.wait_for_function("document.querySelectorAll('#vehicles-tbody tr').length==2")
    check("Delete vehicle removes it from the list", "Audi" not in page.inner_text("#vehicles-tbody"))
    page.click("#btn-publish"); page.wait_for_function("document.querySelector('.toast-stack')?.innerText.includes('Published')")
    pub=published(); check("Publish after delete removes vehicle from GitHub file", {v['id'] for v in pub['vehicles']}=={ "mac-bmw-320d-001", new_id}, str([v['id'] for v in pub['vehicles']]))

    # ---------- 7. Empty publish guard + Pull restores
    for vrow in range(2):
        page.locator("#vehicles-tbody tr").first.locator("button[data-action=delete]").click(); page.wait_for_selector("#confirm-modal.open"); page.click("#confirm-modal-ok"); time.sleep(0.2)
    check("List empty state shown", page.is_visible("#vehicles-empty"))
    before=len([r for r in reqs() if r["method"]=="PUT"])
    page.click("#btn-publish"); page.wait_for_selector("#confirm-modal.open")
    check("Publishing empty list asks for confirmation (no PUT yet)", "empty" in page.inner_text("#confirm-modal").lower() and len([r for r in reqs() if r["method"]=="PUT"])==before)
    page.click("#confirm-modal-cancel"); time.sleep(0.2)
    check("Cancelling the empty publish sends nothing", len([r for r in reqs() if r["method"]=="PUT"])==before)
    page.click("#btn-pull"); page.wait_for_selector("#confirm-modal.open"); page.click("#confirm-modal-ok"); page.wait_for_function("document.querySelectorAll('#vehicles-tbody tr').length==2")
    check("Pull Latest restores GitHub inventory after local deletes", page.locator("#vehicles-tbody tr").count()==2)
    page.screenshot(path=f"{H}/shots/desktop-vehicles-2.png")

    # ---------- 8. Settings
    page.goto(BASE+"/settings.html"); page.wait_for_function("document.querySelector('#github-banner').innerText.includes('configured')")
    st=page.inner_text("body")
    for needle in ["Manchester Auto Cars","Manchester, United Kingdom","https://manchesterautocars.com/","+44 7769 006333","WhatsApp:","manchesterauto/manchester-auto-cars","manchester-auto-cars/vehicles/"]:
        check(f"Settings shows: {needle}", needle in st)
    check("Settings has no invented email/street address", "@gmail" not in st and "Unit 4" not in st and "Email:" not in st)
    page.screenshot(path=f"{H}/shots/desktop-settings.png",full_page=True)

    # ---------- 9. Secrets exposure in browser
    blobs=[page.evaluate("JSON.stringify(localStorage)")]
    for path in ["/assets/js/config.js","/assets/js/app.js","/assets/js/vehicle-edit.js","/dashboard.html","/settings.html","/data/vehicles.json"]:
        blobs.append(page.request.get(BASE+path).text())
    blobs.append(page.request.get(BASE+"/api/status").text())
    joined="\n".join(blobs)
    check("No token/secret in served files, localStorage or /api/status", "ghp_FAKE" not in joined and "SECRET_FOR_TEST_ONLY" not in joined)
    check("No token/secret in published GitHub file", "ghp_FAKE" not in open(f"{H}/published.json").read() and "SECRET_FOR_TEST_ONLY" not in open(f"{H}/published.json").read())

    # ---------- 10. Mobile
    m=b.new_context(viewport={"width":390,"height":800},device_scale_factor=2,is_mobile=True,has_touch=True); mp=m.new_page()
    m.route("https://res.cloudinary.com/**",lambda r: r.fulfill(status=200,content_type="image/png",body=logo_bytes)); m.route(re.compile(r"https://fonts\..*"),lambda r: r.abort())
    mp.goto(BASE+"/"); mp.wait_for_load_state("load"); mp.screenshot(path=f"{H}/shots/mobile-entry.png")
    def noscroll(name):
        w=mp.evaluate("document.documentElement.scrollWidth"); check(f"Mobile no horizontal overflow: {name}", w<=390, f"scrollWidth {w} vs phone width 390")
    noscroll("entry")
    for name,url in [("dashboard","/dashboard.html"),("vehicles","/vehicles.html"),("vehicle-edit","/vehicle-edit.html"),("settings","/settings.html")]:
        mp.goto(BASE+url); mp.wait_for_load_state("load"); time.sleep(0.6); noscroll(name); mp.screenshot(path=f"{H}/shots/mobile-{name}.png")
    mp.goto(BASE+"/dashboard.html"); mp.click(".hamburger"); time.sleep(0.4)
    check("Mobile sidebar opens with logo visible", mp.eval_on_selector("#sidebar","s=>s.classList.contains('open')") and mp.eval_on_selector("#sidebar img","i=>i.naturalWidth>0 && i.getBoundingClientRect().width>40"))
    mp.screenshot(path=f"{H}/shots/mobile-sidebar.png")
    b.close()
finally:
    srv.terminate()

fe=[e for e in console_errors if "fonts" not in e.lower() and "ERR_FAILED" not in e]
check("No JS console/page errors during desktop run", not fe, "; ".join(fe)[:300])
print(f"\nTOTAL {len(results)}  PASS {sum(1 for r in results if r[1])}  FAIL {sum(1 for r in results if not r[1])}")
for r in results:
    if not r[1]: print("FAILED:",r[0],r[2])
