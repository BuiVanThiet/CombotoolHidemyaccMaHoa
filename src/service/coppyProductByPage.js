import {
    delayTime,
    getLinks,
    countElements,
    scrollAndClickElement,
    writeToTxt
} from "./BaseToolService.js";
import {
    showConfirm
} from "../service/ConfirmService.js";


// import path from "../../cake.txt";

export async function coppyLink(page,product,elementSecurity,textCheckSecurity,elementA,checkPage,elementNext) {

    //checkPage = 1 (khi an thi tha xuong viewmore nhu tiktok)
    //checkPage = 2 (luot)
    //checkPage = 3 (an nut next)
    await delayTime(2000);

    // 1. Kiểm tra Captcha (Giữ nguyên logic của bạn)
    try {
        if (await page.locator(elementSecurity).isVisible({ timeout: 5000 })) {
            const secuText = (await page.locator(elementSecurity).innerText()).trim();
            if (secuText.includes(textCheckSecurity)) {
                console.log("Phát hiện Captcha Etsy!");
                await showConfirm();
            }
        }
    } catch (e) {

    }

    try {
        let maxProduct = await product["max"];
        let savedLinks = new Set();
        let result = [];

        while (true) {
            let countElementA = await countElements(page,elementA);
            console.log('maxProduct: '+maxProduct)
            console.log('countElementA: '+countElementA)

            const listLink = await getLinks(page,elementA);
            for (let linkAdd of listLink) {
                if (!savedLinks.has(linkAdd)) {
                    await savedLinks.add(linkAdd);
                    await result.push(linkAdd);
                }
                if (result.length == maxProduct) {
                    break;
                }
            }

            if (countElementA >= maxProduct) {
                break;
            } else {
                if (checkPage === 1) {
                    let checkElementNext = await page.$$(elementNext);
                    if (checkElementNext.length > 0) {
                        await scrollAndClickElement(page,elementNext);
                        await delayTime(3000);
                    } else {
                        break;
                    }
                }
            }

        }

        for (let linkW of result) {
            await writeToTxt('../../cake.txt',linkW);
        }

    } catch (error) {
        console.log('Có lỗi xảy ra với sản phẩm Etsy:');
        console.error(error.message);
    }
}