import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import * as xlsx from "xlsx";
import prompt from "prompt-sync";
const baseUrl = "https://www.tripadvisor.com";

let page;

// 1 = Get hotel information, 2 = Get hotel information(s), 3 = Get hotel comments, 4 = Get hotel info and comments
let type = "1";
let url = "exit";

async function getHotelUrls(url) {
    console.info(`Started to scrape hotel url's. (${baseUrl}${url})`);
    await goto(`${baseUrl}${url}`);
    let $ = cheerio.load(await page.content());
    let pages = $(".qrwtg").text().replace("properties", "");
    pages = pages < 30 ? pages : Math.ceil(pages / 30);
    console.info(`${pages} pages found. (${baseUrl}${url})`);
    let hotelUrls = [];
    for (let i = 0; i < pages; i++) {
        console.info(`Getting hotel urls ${i + 1}/${pages}`);
        if (i > 0) {
            const next = $("a.nav.next.ui_button.primary").attr("href");
            await goto(`${baseUrl}${next}`);
        }
        $ = cheerio.load(await page.content());
        hotelUrls.push(...$("a[id^='property_']").get().map(x => $(x).attr("href")));
    }
    hotelUrls = [...new Set(hotelUrls)];
    return hotelUrls;
}

async function getHotelInfo(url) {
    console.info(`Getting hotel informations (${baseUrl}${url})`);
    await goto(`${baseUrl}${url}`);
    const $ = cheerio.load(await page.content());
    const name = $("#HEADING").text();
    const reviewCount = $(".qqniT").text();
    const address = $("div.gZwVG:nth-child(1) > span:nth-child(2) > span:nth-child(1)").text();
    const score = $(".uwJeR").text();
    const information = $(".IGtbc > div:nth-child(1)").text();
    const propertyAmenities = $("div.OsCbb:nth-child(2)").find("[data-test-target='amenity_text']").get().map(x => $(x).text()).join(',');
    const roomFeatures = $("div.OsCbb:nth-child(5)").find("[data-test-target='amenity_text']").get().map(x => $(x).text()).join(',');
    const roomTypes = $("div.OsCbb:nth-child(8)").find("[data-test-target='amenity_text']").get().map(x => $(x).text()).join(',');
    return ({name, reviewCount, address, score, information, propertyAmenities, roomFeatures, roomTypes});
}

async function getHotelComments(url) {
    console.info(`Started to scrape hotel comment's. (${baseUrl}${url})`);
    await goto(`${baseUrl}${url}`);
    try {
        await page.waitForSelector("#onetrust-accept-btn-handler", {timeout: 20000});
        await page.$eval("#onetrust-accept-btn-handler", trust => trust.click());
    } catch (e) {
        // IGNORE
    }
    await page.$eval("input#LanguageFilter_0", language => language.click());
    await page.$eval("span.Ignyf._S.Z", readMore => readMore.click());
    let $ = cheerio.load(await page.content());
    const commentCount = $("#REVIEWS > div > span.raGTR.Pe.PQ.Pr.PD.c._S.Cj.Vm.B1.Z.BB.wHqmu.test-target-tab-Reviews.cUXYZ > span:nth-child(2) > span > span.iypZC.Mc._R.b").text();
    let hotelComments = [];
    console.info(`${commentCount} comment found. (${baseUrl}${url})`);
    for (let i = 0; i < (commentCount / 10); i++) {
        console.info(`${i + 1}/${Math.ceil(commentCount / 10)} Pages left.`);
        $ = cheerio.load(await page.content());
        await $("div.YibKl.MC.R2.Gi.z.Z.BB.pBbQr").get().forEach(x => {
            const name = $(x).find("a.ui_header_link.uyyBf").text();
            const point = $(x).find("span.ui_bubble_rating").attr("class").slice(-2, -1);
            const title = $(x).find("a.Qwuub").text();
            const comment = $(x).find("q.QewHA.H4._a").text();
            const dateOfStay = $(x).find("span.teHYY._R.Me.S4.H3").text().replace("Date of stay: ", "");
            hotelComments.push({name, point, title, comment, dateOfStay});
        });
        if (i + 1 < commentCount / 10)
            await page.$eval("a[class*='next']", nextButton => nextButton.click());
    }
    return hotelComments;
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

async function goto(url) {
    try {
        await page.goto(`${url}`, {timeout: 30000});

        const title = await page.$eval("head > title", x => x.textContent);
        if (title === "Access Denied") {
            await console.warn("Access is Denied. Waiting.. (Bot Guard)");
            await delay(60000);
            await goto(url);
        }
    } catch (e) {
        await goto(url);
    }
}

function writeToFile(name, data) {
    console.info(`Writing to file ${name}.xlsx`)
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, `${name}`);
    xlsx.writeFile(wb, `./data/${name}.xlsx`);
}

(async () => {
    const browser = await puppeteer.launch({headless: false});
    page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
            req.abort();
        } else {
            req.continue();
        }
    });
    const ui = prompt({sigint: true});

    while (type !== "exit") {
        console.info("Types:\n" +
            "1: Get hotel informations one by one.\n" +
            "2: Get ALL hotel informations in url.\n" +
            "3: Get hotel comments one by one.\n" +
            "4: Get ALL hotel informations in url.");
        type = ui('Type of bot (Type "exit" for exit):');

        let hotelUrls = [];
        let hotelInfos = [];
        let hotelComments = [];

        switch (type) {
            case "1":
                while (true) {
                    url = ui('Url (Type "exit" for exit):');
                    if (url === "exit")
                        break;
                    url = `/${url.split('/')[3]}`;
                    hotelInfos.push(await getHotelInfo(url));
                }
                writeToFile(`${ui("Filename: ")}-Informations`, hotelInfos);
                break;
            case "2":
                while (true) {
                    url = ui('Url (Type "exit" for exit):');
                    if (url === "exit")
                        break;
                    url = `/${url.split('/')[3]}`;
                    hotelUrls = await getHotelUrls(url);
                    for (let i in hotelUrls) {
                        console.log(`${hotelUrls.length - i} hotels left.`)
                        hotelInfos.push(await getHotelInfo(hotelUrls[i]));
                    }
                }
                await writeToFile(`${ui("Filename: ")}-Informations`, hotelInfos);
                break;
            case "3":
                while (true) {
                    url = ui('Url (Type "exit" for exit):');
                    if (url === "exit")
                        break;
                    url = `/${url.split('/')[3]}`;
                    hotelComments = await getHotelComments(url);
                    await writeToFile(`${ui("Filename: ")}-Comments`, hotelComments);
                }
                break;
            case "4":
                while (true) {
                    url = ui('Url (Type "exit" for exit):');
                    if (url === "exit")
                        break;
                    url = `/${url.split('/')[3]}`;
                    hotelUrls = await getHotelUrls(url);
                    for (let i in hotelUrls) {
                        hotelComments = await getHotelComments(hotelUrls[i]);
                        console.log(`${hotelUrls.length - i} hotels left.`)
                        await writeToFile(`${ui("Filename: ")}-Comments`, hotelComments);
                    }
                }
                break;
        }
        console.clear();
    }
    process.exit();
})();