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
            { waitUntil: "load", timeout: 320000 }
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
        } else if (product["Link"].toLowerCase().includes("sheshow")) {
            console.log('sheshow da vao')
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
        } else if (product["Link"].toLowerCase().includes("shopee")) {
            console.log('shopee da vao')
            await dowloadImageBasic(
                page,
                product,
                'div h1',
                'div h1',
                'div#modal div.flex div picture img',
                '',
                '',
                '',
                '@.*$',
                '@resize_w8200_nl.jpg');
        } else if (product["Link"].toLowerCase().includes("burga")) {
            console.log('burga da vao')
            await dowloadImageBasic(
                page,
                product,
                'div h1',
                'div h1',
                'div.js-prod-image-gallery-thumbs-carousel-container.embla div.embla__container button img',
                '',
                '',
                '',
                '\\?v=.*',
                '');
        } else if (product["Link"].toLowerCase().includes("bluntcases")) {
            console.log('bluntcases da vao')
            await dowloadImageBasic(
                page,
                product,
                'div h1',
                'div h1',
                'ul li.thumbnail-list__item button.global-media-settings--no-shadow img',
                '',
                '',
                '',
                '\\?v=.*',
                '');
        } else if (product["Link"].toLowerCase().includes("aliexpress")) {
            console.log('aliexpress da vao')
            await dowloadImageBasic(
                page,
                product,
                'div.pdp-info-right div h1[data-pl="product-title"]',
                'div.pdp-info-right div h1[data-pl="product-title"]',
                'div.pdp-info-left div img',
                '',
                '',
                '',
                '220x220',
                '2200x2200');
        } else if (product["Link"].toLowerCase().includes("printerval")) {
            console.log('aliexpress da vao')
            await dowloadImageBasic(
                page,
                product,
                'h1.js-product-name',
                'h1.js-product-name',
                'div.gallery-nav-item.max-height img',
                'div.product-gallery-item-image.product-gallery-item-img img',
                '',
                '',
                '/\\d+x\\d+/g',
                '2200x2200');
        } else if (product["Link"].toLowerCase().includes("getcasely")) {
            console.log('aliexpress da vao')
            await dowloadImageBasic(
                page,
                product,
                'div.title h1',
                'div.title h1',
                'div picture img.product__image',
                '',
                '',
                '',
                '\\?v=.*',
                '');
        } else if (product["Link"].toLowerCase().includes("velvetcaviar")) {
            console.log('aliexpress da vao')
            await dowloadImageBasic(
                page,
                product,
                'div h1',
                'div h1',
                'div.keen-slider.thumbnail div.keen-slider__slide img.h-full',
                'div.keen-slider.thumbnail div.keen-slider__slide img.h-full',
                '',
                '',
                '\\?v=.*',
                '');
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