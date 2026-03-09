// import Promise from "bluebird";
// import {
//     loginToProfile,
//     openPage,
//     closeBrowser,
//     getIdAcc,
//     delayTime,
//     hide,
//     ensureDirIfMissing,
//     downloadImagesToFolder
// } from "../src/service/BaseToolService.js";
//
// import { readExcelFile } from "../src/service/openFileExcel.js";
//
// // Đọc file Excel
// const products = readExcelFile("linkSanPham.xlsx");
//
// // Nhóm các dòng theo Name Acc
// const groupedByAcc = {};
// for (const product of products) {
//     if (!groupedByAcc[product["Name Acc"]]) {
//         groupedByAcc[product["Name Acc"]] = [];
//     }
//     groupedByAcc[product["Name Acc"]].push(product);
// }
//
// // Đọc tham số --thread
// const args = process.argv.slice(2);
// const threadLimit = args.find(arg => arg.startsWith('--thread='));
// const THREAD_LIMIT = threadLimit ? parseInt(threadLimit.split('=')[1], 10) : 3;
//
// // Lấy tất cả Name Acc duy nhất
// const accNames = Object.keys(groupedByAcc);
//
// async function processSingleAcc(accName) {
//     const productsOfAcc = groupedByAcc[accName];
//
//     const profileId = await getIdAcc(accName);
//     const { browser, context } = await loginToProfile(hide, profileId, { x: 0, y: 0 });
//
//     if (!browser || !context) return;
//
//     // Xử lý tuần tự từng dòng của acc này
//     for (const product of productsOfAcc) {
//         const page = await openPage(
//             context,
//             product["Link"],
//             { waitUntil: "load", timeout: 120000 }
//         );
//         console.log("da xong 1 phan cua 1 acc, doii 2s de doi acc")
//         await delayTime(2000)
//         try {
//             const nameSP = 'div h1';
//             await page.waitForSelector(nameSP, { state: 'visible', timeout: 10_000 });
//             const text = (await page.locator(nameSP).innerText()).trim().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ');
//             console.log(text)
//             // === LẤY LINK ẢNH Ở ĐÂY ===
//             const listboxImgsSelector = 'div#leftContent div div div[role="listbox"] img';
//             const { raw, clean } = await extractImageUrls(page, listboxImgsSelector);
//
//             // Tuỳ nhu cầu: gắn vào object, hoặc log/ghi file
//             product.imageUrlsRaw = raw;
//             product.imageUrls = clean;
//
//             console.log(`Found images: raw=${raw.length}, clean=${clean.length}`);
//             // Ví dụ in thử 3 cái đầu
//             console.log('Sample clean URLs:', clean.slice(0, Number.isFinite(Number(product["max"])) ? Number(product["max"]) : 99999));
//             const outputRoot = './../Output/dowloadImage/'+text;
//             console.log(outputRoot)
//             // await ensureDirIfMissing(outputRoot);
//             await ensureDirIfMissing(outputRoot, { unique: true });
// // Tải nhiều ảnh
//             const list = await downloadImagesToFolder(clean.slice(0, Number.isFinite(Number(product["max"])) ? Number(product["max"]) : 99999), outputRoot, { retries: 2, delayMs: 50 });
//
//             console.log(list);
//         } catch {
//             console.log('San pham loi')
//         }
//
//
//         // Đóng các tab phụ, giữ tab đầu tiên
//         const pages = await context.pages();
//         for (let i = 1; i < pages.length; i++) {
//             await pages[i].close();
//         }
//     }
//
//
//     // Sau khi xử lý hết các dòng trùng acc mới đóng profile
//     // await closeBrowser(accName);
//     console.log(`Đã đóng profile ${accName} sau khi xử lý hết các dòng trùng.`);
// }
//
//
// async function extractImageUrls(page, selector) {
//     // Đợi listbox nếu có, nhưng không fail cả flow nếu không thấy
//     try {
//         await page.waitForSelector(selector, { state: 'attached', timeout: 8000 });
//     } catch (_) {
//         // bỏ qua
//     }
//
//     const { raw, clean } = await page.$$eval(selector, (imgs) => {
//         const base = location.href;
//
//         const pickSrc = (img) => {
//             const src = img.getAttribute('src')
//                 || img.getAttribute('data-src')
//                 || (() => {
//                     const ss = img.getAttribute('srcset');
//                     if (!ss) return '';
//                     // lấy url lớn nhất (mục cuối)
//                     const last = ss.split(',').pop()?.trim()?.split(' ')[0] || '';
//                     return last;
//                 })()
//                 || '';
//             return src;
//         };
//
//         const toAbs = (u) => {
//             try {
//                 return new URL(u, base).toString();
//             } catch {
//                 return u || '';
//             }
//         };
//
//         const stripQuery = (u) => {
//             try {
//                 const url = new URL(u);
//                 url.search = '';
//                 return url.toString();
//             } catch {
//                 return u;
//             }
//         };
//
//         const raws = imgs.map(pickSrc).map(toAbs).filter(Boolean);
//
//         // unique giữ nguyên thứ tự
//         const uniq = (arr) => [...new Set(arr)];
//
//         return {
//             raw: uniq(raws),
//             clean: uniq(raws.map(stripQuery)),
//         };
//     });
//
//     return { raw, clean };
// }
//
// async function run() {
//     // Chạy các acc khác nhau song song, nhưng các dòng trong cùng acc chạy tuần tự
//     await Promise.map(
//         accNames,
//         async (accName) => {
//             await processSingleAcc(accName);
//         },
//         { concurrency: THREAD_LIMIT }
//     );
// }
//
// await run();
//
//

import Promise from "bluebird";
import {
    loginToProfile,
    openPage,
    closeBrowser,
    getIdAcc,
    delayTime,
    hide
} from "../src/service/BaseToolService.js";

import {
    dowloadImageTemu
} from "./service/TemuService.js";

import {
    dowloadImageKalodata
} from "./service/KalodataService.js";

import {
    dowloadImageRedbubble
} from "./service/RedbubbleService.js";
import {
    dowloadImageTiktok
} from "./service/TiktokService.js";
import {
    dowloadImageEtsy
} from "./service/EtsyService.js";
import {
    dowloadImageAliExpress
} from "./service/AliExpressService.js";


import { readExcelFile } from "../src/service/openFileExcel.js";

// Đọc file Excel
const products = readExcelFile("linkSanPham.xlsx");

// Nhóm các dòng theo Name Acc
const groupedByAcc = {};
for (const product of products) {
    if (!groupedByAcc[product["Name Acc"]]) {
        groupedByAcc[product["Name Acc"]] = [];
    }
    groupedByAcc[product["Name Acc"]].push(product);
}

// Đọc tham số --thread
const args = process.argv.slice(2);
const threadLimit = args.find(arg => arg.startsWith('--thread='));
const THREAD_LIMIT = threadLimit ? parseInt(threadLimit.split('=')[1], 10) : 3;

// Lấy tất cả Name Acc duy nhất
const accNames = Object.keys(groupedByAcc);

async function processSingleAcc(accName) {
    const productsOfAcc = groupedByAcc[accName];

    const profileId = await getIdAcc(accName);
    const { browser, context } = await loginToProfile(hide, profileId, { x: 0, y: 0 });

    if (!browser || !context) return;

    // Xử lý tuần tự từng dòng của acc này
    for (const product of productsOfAcc) {
        const page = await openPage(
            context,
            product["Link"],
            { waitUntil: "load", timeout: 120000 }
        );
        if (product["Link"].toLowerCase().includes("temu")) {
            await dowloadImageTemu(page,product);
        } else if (product["Link"].toLowerCase().includes("kalodata")) {
            await dowloadImageKalodata(page,product);
        } else if (product["Link"].toLowerCase().includes("redbubble")) {
            await dowloadImageRedbubble(page,product);
        }else if (product["Link"].toLowerCase().includes("tiktok")) {
            await dowloadImageTiktok(page,product);
        } else if (product["Link"].toLowerCase().includes("etsy")) {
            await dowloadImageEtsy(page,product);
        } else if (product["Link"].toLowerCase().includes("aliexpress")) {
            await dowloadImageAliExpress(page,product);
        }

        // Đóng các tab phụ, giữ tab đầu tiên
        const pages = await context.pages();
        for (let i = 1; i < pages.length; i++) {
            await pages[i].close();
        }
    }
    await delayTime(3000)

    // Sau khi xử lý hết các dòng trùng acc mới đóng profile
    // await closeBrowser(accName);
    console.log(`Đã đóng profile ${accName} sau khi xử lý hết các dòng trùng.`);
}

async function run() {
    // Chạy các acc khác nhau song song, nhưng các dòng trong cùng acc chạy tuần tự
    await Promise.map(
        accNames,
        async (accName) => {
            await processSingleAcc(accName);
        },
        { concurrency: THREAD_LIMIT }
    );
}

await run();