import Promise from "bluebird";
import {
    loginToProfile,
    openPage,
    closeBrowser,
    getIdAcc,
    delayTime,
    hide
} from "../service/BaseToolService.js";

import {
    coppyLink
} from "../service/coppyProductByPage.js";

import { readExcelFile } from "../service/openFileExcel.js";

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
    const { browser, context } = await loginToProfile(hide, profileId);

    if (!browser || !context) return;

    // Xử lý tuần tự từng dòng của acc này
    for (const product of productsOfAcc) {
        const page = await openPage(
            context,
            product["Link"],
            { waitUntil: "load", timeout: 120000 }
        );
        if (product["Link"].toLowerCase().includes("tiktok")) {
            await coppyLink(
                page,
                product,
                '',
                '',
                'div div a.group',
                1,
                'div button.px-24.py-13.w-fit.min-w-128');
        } else if (product["Link"].toLowerCase().includes("bluntcases")) {
            await coppyLink(
                page,
                product,
                '',
                '',
                'h3.card__heading.h5 a',
                1,
                'a[aria-label="Next page"]');
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