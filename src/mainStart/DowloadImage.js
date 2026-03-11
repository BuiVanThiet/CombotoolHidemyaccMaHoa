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
    dowloadImageBasic
} from "../service/DowloadImage.js";

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
        if (product["Link"].toLowerCase().includes("temu")) {
            await dowloadImageBasic(
                page,
                product,
                'div h1',
                'div h1',
                'div#leftContent div div div[role="listbox"] img',
                'div#leftContent div div div[role="listbox"] img',
                'div div[role="dialog"] div.rArtBCOt',
                'Security Verification',
               '' ,
                '');
        } else if (product["Link"].toLowerCase().includes("redbubble")) {
            await dowloadImageBasic(
                page,
                product,
                'div h1',
                'div h1',
                'div.styles_box__54ba70e3.ProductPreviewsCarousel_box__k1Po4 img',
                'div.section1 div.Component-Image',
                '',
                '',
                '',
                '');
        }else if (product["Link"].toLowerCase().includes("tiktok")) {
            await dowloadImageBasic(
                page,
                product,
                'div h1',
                'div h1',
                'div.w-full.relative.flex.items-center.mt-16 div.flex.flex-row.items-center.gap-12.w-full.overflow-x-scroll.relative.overflow-visible div.relative.flex.justify-center.items-center.w-66.h-66.grow-0.shrink-0 img',
                '',
                '',
                '',
                'resize-(jpeg|webp):\\d+:\\d+\\.[a-z]+\\?[^\\s]*',
                'origin-jpeg.jpeg');
        } else if (product["Link"].toLowerCase().includes("etsy")) {
            await dowloadImageBasic(
                page,
                product,
                'h1.wt-line-height-tight',
                'p.nla-listing-title',
                'li[data-carousel-pagination-item] img[data-carousel-thumbnail-image]',
                'div.nla-listing-image.wt-width-full img.wt-width-full.wt-height-full',
                'p.captcha__human__title',
                'Just a moment',
                'il_\\d+x\\d+',
                'il_fullxfull');
        } else if (product["Link"].toLowerCase().includes("aliexpress")) {
            await dowloadImageBasic(
                page,
                product,
                'div.title--wrap--UUHae_g h1',
                'div h1',
                'div.slider--img--kD4mIg7 img',
                'img.magnifier--image--RM17RL2',
                'p.captcha__human__title',
                'Just a moment...',
                '_\\d+x\\d+q\\d+\\.jpg_\\.avif',
                '');
        } else if (product["Link"].toLowerCase().includes("sheshow")) {
            await dowloadImageBasic(
                page,
                product,
                'div h1',
                'div h1',
                'ul li a.productView-thumbnail-link img',
                '',
                '',
                '',
                '70x91',
                '2000x2300');
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