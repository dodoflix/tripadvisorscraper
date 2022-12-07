import puppeteer, {launch} from "puppeteer";
import * as cheerio from "cheerio";
import * as xlsx from "xlsx";

// 3 TYPES: 1 = HOTELS, 2 = COMMENTS, 3 = HOTELS AND COMMENTS, 4 = HOTEL
let type = "1";
let url = "https://www.tripadvisor.com/Hotels-g298043-Yalova-Hotels.html";

const baseUrl = "https://www.tripadvisor.com";
const hotelsData = [];

async function getHotelUrls(page) {
    console.info("Started to scrape hotel url's.");
    await page.goto(`${baseUrl}${url}`);
    let $ = cheerio.load(await page.content());
    let pages = $(".qrwtg").text().replace("properties", "");
    pages = pages < 30 ? pages : Math.ceil(pages / 30);
    console.info(`${pages} pages found.`)
    let hotelUrls = [];
    for (let i = 0; i < pages; i++) {
        console.info(`Getting hotel urls ${i + 1}/${pages}`);
        if (i > 0) {
            const next = $("a.nav.next.ui_button.primary").attr("href");
            await page.goto(`${baseUrl}${next}`);
        }
        $ = cheerio.load(await page.content());
        hotelUrls.push(...$("a[id^='property_']").get().map(x => $(x).attr("href")));
    }
    hotelUrls = [...new Set(hotelUrls)];
    return hotelUrls;
}


async function getHotelInfos(page, hotelUrls) {
    console.info("Started to scrape hotel information's.");
    for (let i = 0; i < hotelUrls.length; i++) {
        console.info(`Getting hotel informations (${baseUrl}${hotelUrls[i]})`);
        await page.goto(`${baseUrl}${hotelUrls[i]}`);
        const $ = cheerio.load(await page.content());
        const name = $("#HEADING").text();
        const reviewCount = $(".qqniT").text();
        const address = $("div.gZwVG:nth-child(1) > span:nth-child(2) > span:nth-child(1)").text();
        const score = $(".uwJeR").text();
        const information = $(".IGtbc > div:nth-child(1)").text();
        const propertyAmenities = $("#ABOUT_TAB > div.ui_columns.MXlSZ > div:nth-child(2) > div:nth-child(1) > div:nth-child(2)").find("[data-test-target='amenity_text']").get().map(x => $(x).text()).join(',');
        const roomFeatures = $("div.OsCbb:nth-child(5)").find("[data-test-target='amenity_text']").get().map(x => $(x).text()).join(',');
        const roomTypes = $("div.OsCbb:nth-child(8)").find("[data-test-target='amenity_text']").get().map(x => $(x).text()).join(',');
        hotelsData.push({name, reviewCount, address, score, information, propertyAmenities, roomFeatures, roomTypes});
    }
    const ws = xlsx.utils.json_to_sheet(hotelsData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'HotelsInformation');
    xlsx.writeFile(wb, `${hotelUrls}.xlsx`);
    return hotelsData;
}


async function getHotelComments(page, hotelUrl) {
    console.info("Started to scrape hotel comment's.");
    await page.goto(`${baseUrl}${hotelUrl}`);
    await page.waitForSelector("#onetrust-accept-btn-handler");
    await page.$eval("#onetrust-accept-btn-handler", trust => trust.click());
    await page.$eval("input#LanguageFilter_0", language => language.click());
    await page.$eval("span.Ignyf._S.Z", readMore => readMore.click());
    let $ = cheerio.load(await page.content());
    const commentCount = $("#REVIEWS > div > span.raGTR.Pe.PQ.Pr.PD.c._S.Cj.Vm.B1.Z.BB.wHqmu.test-target-tab-Reviews.cUXYZ > span:nth-child(2) > span > span.iypZC.Mc._R.b").text();
    let hotelComments = [];
    console.info(`${commentCount} comment found.`);
    for (let i = 0; i < (commentCount / 10) - 1; i++) {
        $ = cheerio.load(await page.content());
        await $("div.YibKl.MC.R2.Gi.z.Z.BB.pBbQr").get().forEach(x => {
            const name = $(x).find("a.ui_header_link.uyyBf").text();
            const point = $(x).find("span.ui_bubble_rating").attr("class");
            const title = $(x).find("a.Qwuub").text();
            const comment = $(x).find("q.QewHA.H4._a").text();
            const dateOfStay = $(x).find("span.teHYY._R.Me.S4.H3").text();
            hotelComments.push({name, point, title, comment, dateOfStay});
        });
        await page.$eval("a[class*='next']", nextButton => nextButton.click());
    }
    const ws = xlsx.utils.json_to_sheet(hotelComments);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'HotelsComments');
    xlsx.writeFile(wb, `${hotelUrl}.xlsx`);
    return hotelComments;
}

function getType() {
    return null;
}


(async () => {
    const browser = await puppeteer.launch({headless: true});
    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
            req.abort();
        } else {
            req.continue();
        }
    });

    url = `/${url.split('/')[3]}`;

    await page.goto(`${baseUrl}/${url}`);
    const title = await page.$eval("head > title", x => x.textContent);
    if(title === "Access Denied"){
        await console.warn("Access is Denied try again later! (Bot Guard)");
        process.exit();
    }

    while (type < 1 && type > 3) {
        //type = getType();
    }

    let hotelUrls = [];
    let hotelInfos = [];
    let hotelComments = [];

    switch (type) {
        case "1":
            hotelUrls = await getHotelUrls(page);
            hotelInfos = await getHotelInfos(page, hotelUrls);
            break;
        case "2":
            hotelComments = await getHotelComments(page, url);
            break;
        case "3":
            hotelUrls = await getHotelUrls(page);
            hotelInfos = await getHotelInfos(page, hotelUrls);
            for (let i in hotelUrls.length) {
                hotelComments.push(await getHotelComments(page, hotelUrls[i]));
            }
            break;
        case "4":
            break;
    }
    console.info(hotelUrls.length);
    console.info(hotelInfos.length);
    console.info(hotelComments.length);
})();
