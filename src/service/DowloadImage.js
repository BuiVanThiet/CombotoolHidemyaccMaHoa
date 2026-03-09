import {
    delayTime,
    downloadImagesToFolder,
    ensureDirIfMissing,
    extractImageUrls,
    getNextIndexFolder
} from "./BaseToolService.js";
import {
    showConfirm
} from "../service/ConfirmService.js";
import path from "path";

export async function dowloadImageBasic(page,product,elementTitle1,elementTitle2,elementMainImage1,elementMainImage2,elementSecurity,textCheckSecurity,inputChange,outputChange) {
    // console.log(`[${moment().format('HH:mm:ss')}] Đang xử lý sản phẩm Etsy...`);
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
    } catch (e) {}

    try {
        await page.waitForSelector(`${elementTitle1}, ${elementTitle2}`, { state: 'visible', timeout: 10000 });

        let rawText = '';
        if (await page.locator(elementTitle1).count() > 0) {
            rawText = await page.locator(elementTitle1).innerText();
        } else {
            rawText = await page.locator(elementTitle2).innerText();
        }

        const cleanTitle = rawText
            .trim()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .substring(0, 200); // Giới hạn để tránh lỗi path quá dài

        // 3. Lấy link ảnh
        let listboxImgsSelector = await elementMainImage1;
        let elementImage = await page.$$(listboxImgsSelector);
        if (elementImage.length <= 0) {
            listboxImgsSelector = await elementMainImage2;
            elementImage = await page.$$(listboxImgsSelector);
            if (elementImage.length <= 0) {
                listboxImgsSelector = "div.nla-listing-image.wt-width-full img.wt-width-full.wt-height-full";
            }
        }

        const { raw, clean } = await extractImageUrls(page, listboxImgsSelector,inputChange,outputChange);
        const maxImgs = Number.isFinite(Number(product["max"])) ? Number(product["max"]) : 9999;

        // 4. XỬ LÝ ĐƯỜNG DẪN VÀ ĐÁNH SỐ THỨ TỰ (STT)
        const subFolder = product["Folder"] === 'notData' ? '' : `/${product["Folder"]}`;
        const parentPath = path.resolve(`../../Output/dowloadImage${subFolder}`);

        // Lấy số thứ tự tiếp theo
        const nextIdx = await getNextIndexFolder(parentPath);
        const folderName = `${nextIdx}_${cleanTitle}`;
        const outputRoot = path.join(parentPath, folderName);

        console.log(`STT: ${nextIdx} | Path: ${outputRoot}`);

        // 5. Đảm bảo thư mục tồn tại và tải ảnh
        await ensureDirIfMissing(outputRoot);

        const list = await downloadImagesToFolder(
            clean.slice(0, maxImgs),
            outputRoot,
            { retries: 2, delayMs: 50 }
        );

        console.log(`Đã tải xong ${list.length} ảnh vào: ${folderName}`);

    } catch (error) {
        console.log('Có lỗi xảy ra với sản phẩm Etsy:');
        console.error(error.message);
    }
}