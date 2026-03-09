import Promise from "bluebird";
import {
    loginToProfile,
    openPage,
    closeBrowser,
    getIdAcc,
    delayTime,
    hide, evaluateFolderContent, getProductFolders,getCleanFileName
} from "../src/service/BaseToolService.js";

import {
    checkPathType,
    getImagesFromLocalFolder
} from "../src/service/BaseToolCreateMock.js";

import {
    createMockUp
} from "../src/service/PrintifyService.js";

import { readExcelFile } from "../src/service/openFileExcel.js";

// Đọc file Excel
const products = readExcelFile("CreateMockup.xlsx");

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
        let page = null;
        const FolderImage = await product['Folder ảnh'];
        const color = await product['Màu sắc'];
        console.log('FolderImage: '+FolderImage)
        console.log('color: '+color)

        const listColor = color
            .split(",")           // Chia chuỗi tại dấu phẩy
            .map(s => s.trim())    // Xóa khoảng trắng 2 đầu mỗi phần tử
            .filter(s => s !== ""); // Loại bỏ các phần tử rỗng (nếu có)
        console.log(listColor);
        const checkLinkFolderImage = await checkPathType(FolderImage);
        let listImage = [];
        if (checkLinkFolderImage === 1) {
            listImage = await getImagesFromLocalFolder(FolderImage);
        }
        console.log(checkLinkFolderImage);
        console.log(listImage);
        let indexName = 1;
        for (let image of listImage) {
            page = await openPage(
                context,
                "https://printify.com/app/editor/6/99",
                { waitUntil: "load", timeout: 120000 }
            );
            console.log(image)
            const nameProduct = await getCleanFileName(image);
            await createMockUp(page,image,listColor,indexName+'_'+nameProduct);
            await delayTime(3000);
            await indexName++;
            // Đóng các tab phụ, giữ tab đầu tiên
            const pages = await context.pages();
            for (let i = 1; i < pages.length; i++) {
                await pages[i].close();
            }
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