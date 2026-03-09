// base.js
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import Hidemyacc from "./hidemyacc.js";

import { readdir, stat } from 'fs/promises';
import sharp from 'sharp'; // Thêm thư viện này ở đầu file
import axios from "axios";
import { chromium } from 'playwright'; // Thay puppeteer bằng playwright
import moment from 'moment-timezone';
import { PowerShell } from 'node-powershell';
// Hàm delay giúp chờ một khoảng thời gian
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Hàm xử lý tài khoản và tính toán vị trí cửa sổ cho từng sản phẩm
export async function runGroupedByKey(list, key, processItemFn, delayBetweenSameKey = 0) {
    // Gom theo key (Name Acc)
    const grouped = {};
    for (const item of list) {
        const k = item[key]?.trim() || "notData";
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(item);
    }

    // Chạy song song các nhóm 'Name Acc'
    const tasks = Object.entries(grouped).map(([groupKey, groupItems], groupIndex) => {
        return (async () => {
            console.log(`\n🚀 Bắt đầu xử lý nhóm: ${groupKey}`);

            // Duyệt các sản phẩm của nhóm 'Name Acc'
            const position = setBrowserPosition(groupIndex); // Vị trí của các sản phẩm cùng 'Name Acc'

            for (let i = 0; i < groupItems.length; i++) {
                const product = groupItems[i];

                // Tính toán vị trí cửa sổ cho sản phẩm
                const { x, y } = position; // Tất cả sản phẩm trong cùng 1 'Name Acc' sẽ có vị trí giống nhau

                await processItemFn(product, i, groupKey, x, y); // Truyền x, y vào hàm xử lý từng item

                if (i < groupItems.length - 1 && delayBetweenSameKey > 0) {
                    console.log(`⏳ Delay ${delayBetweenSameKey}ms giữa các dòng trong ${groupKey}`);
                    await delay(delayBetweenSameKey); // Delay giữa các dòng trong nhóm
                }
            }

            console.log(`🏁 Hoàn tất nhóm: ${groupKey}`);
        })();
    });

    // Chờ tất cả nhóm hoàn tất
    await Promise.all(tasks);
}

// Hàm tính vị trí cửa sổ trình duyệt
const setBrowserPosition = (index) => {
    index = parseInt(index);
    let x, y;

    // Tính toán vị trí cho mỗi cửa sổ (vị trí của từng tài khoản khác nhau)
    if (index >= 0 && index < 4) {
        x = index * 1200;
        y = 0;
    } else if (index >= 4 && index < 8) {
        x = (index - 4) * 1200;
        y = 900;
    } else {
        x = (index - 8) * 1200;
        y = 1800;
    }

    console.log(`Position for account ${index}: x = ${x}, y = ${y}`);
    return { x, y };
};



// Hàm đăng nhập vào tài khoản và khởi tạo trình duyệt
export async function loginToProfile(hide, profileId, screenIndex) {
    let start = null;
    console.log(screenIndex)
    const { x, y } = screenIndex;
    while (!start) {
        start = await hide.start(
            profileId,
            JSON.stringify({
                // params: "--force-device-scale-factor=0.4 --window-size=1280,720 --window-position=" + (screenIndex) // Tính toán vị trí cửa sổ
                // params: `--force-device-scale-factor=0.4 --window-size=1280,720 --window-position=${x},${y}`

            })
        );
        if (!start) await delayTime(5000);
    }

    console.log("start.data.wsUrl: ", start.data.wsUrl);
    const wsUrl = start.data.wsUrl;
    if (!wsUrl) {
        console.log("Không nhận được wsUrl từ API.");
        return null;
    }

    // Kết nối đến trình duyệt qua CDP
    const browser = await chromium.connectOverCDP(wsUrl);
    const context = await browser.contexts()[0];

    return { browser, context };
}

// Hàm mở trang sản phẩm và kiểm tra URL
export async function openProductPage(page, link) {
    try {
        await gotoWithTimeout(page, link);
        await delayTime(15000);

        const currentUrl = page.url();
        if (currentUrl.includes('account/register')) {
            console.log(`🔒 LOGIN_ERROR: Redirect tới /account/register`);
            return 'LOGIN_ERROR';
        }
    } catch (e) {
        console.error(`[❌ Lỗi khi goto(): ${e.message}]`);
        return 'GOTO_TIMEOUT';
    }
}

// Hàm đóng browser và dừng profile
export async function closeBrowserAndStop(browser, hide, profileId) {
    if (browser) {
        await browser.close();
    }
    await hide.stop(profileId);
}

// Hàm lấy ID tài khoản
export async function getIdAcc(nameAcc) {
    // Step 1: Lấy danh sách tài khoản từ API
    const response = await axios.get("http://127.0.0.1:2268/profiles");
    const accounts = response.data.data;

    // Chọn tài khoản theo tên
    const account = accounts.find(acc => acc.name === nameAcc);
    if (!account) {
        console.log(`Tài khoản ${nameAcc} không tồn tại`);
        return null;
    }
    return account.id;
}

// Hàm điều hướng trang với timeout
export async function gotoWithTimeout(page, url, timeout = 5000) {
    try {
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout,
        });
    } catch (e) {
        console.error(`❌ Lỗi khi mở trang: ${e.message}`);
        return 'GOTO_TIMEOUT';
    }
}

export async function openPage(context, url, options = {}) {
    const page = await context.newPage(); // Tạo một page mới trong context
    await page.goto(url, options);  // Mở trang và chờ tải xong
    return page;  // Trả về page hợp lệ để có thể thao tác với page.evaluate()
}
export async function closeOldPage(context) {
    try {
        const pages = await context.pages();
        if (pages.length > 0) {
            const oldPage = pages[0];
            await oldPage.close();
        }
    } catch (e) {
        console.log("Lỗi khi đóng trang cũ:", e);
    }
}

// Hàm lướt đến phần tử và click vào phần tử đó
export async function scrollAndClickElement(page, selector) {
    try {
        // Chờ phần tử xuất hiện và đảm bảo phần tử có thể tương tác
        const element = await page.waitForSelector(selector, { timeout: 10000, state: 'visible' });

        if (element) {
            // Lướt đến phần tử trước khi click
            await element.scrollIntoViewIfNeeded();
            console.log(`Lướt đến phần tử: ${await element.innerText()}`);

            // Click vào phần tử
            await element.click();
            console.log(`Đã click vào phần tử: ${selector}`);
            return true;
        } else {
            console.log(`Không tìm thấy phần tử: ${selector}`);
            return false;
        }
    } catch (e) {
        console.log("Lỗi khi thao tác với phần tử:", e);
        return false;
    }
}

export async function scrollAndClickElementByIndex(
    page,
    selector,
    position) {
    try {

        const idx = position - 1; // chuyển sang 0-based cho .nth()
        const list = page.locator(selector);
        const count = await list.count();

        if (count === 0) {
            console.log(`Không tìm thấy phần tử với selector: ${selector}`);
            return false;
        }
        if (idx >= count) {
            console.log(
                `Chỉ tìm thấy ${count} phần tử, nhưng yêu cầu vị trí ${position}. Selector: ${selector}`
            );
            return false;
        }

        const target = list.nth(idx);

        // Chờ phần tử trở nên "visible" và có thể tương tác
        await target.waitFor({ state: 'visible', timeout: 10000 });

        // Lướt tới phần tử
        await target.scrollIntoViewIfNeeded();

        const text = await target.innerText().catch(() => '');
        console.log(`Lướt đến phần tử [#${position}]: ${text?.slice(0, 120)}`);

        // Click
        await target.click();
        console.log(`Đã click vào phần tử [#${position}] của selector: ${selector}`);
    } catch (e) {
        console.log('Lỗi khi thao tác với phần tử:', e);
        return false;
    }
    return true;
}


export async function scrollAndHoverElement(page, selector) {
    try {
        // Chờ phần tử xuất hiện và đảm bảo phần tử có thể tương tác
        const element = await page.waitForSelector(selector, { timeout: 10000, state: 'visible' });

        if (element) {
            // Lướt đến phần tử trước khi click
            await element.evaluate(el => el.scrollIntoViewIfNeeded());
            // Lấy và in nội dung của phần tử
            const innerText = await element.evaluate(el => el.innerText);
            console.log(`Lướt đến phần tử: ${innerText}`);

            // Di chuột vào phần tử
            await element.hover();
            console.log(`Đã hover vào phần tử: ${selector}`);
        } else {
            console.log(`Không tìm thấy phần tử: ${selector}`);
        }
    } catch (e) {
        console.log("Lỗi khi thao tác với phần tử:", e);
    }
}

export async function closeBrowser(accountName) {
    try {
        // Step 1: Lấy danh sách tài khoản từ API
        const response = await axios.get("http://127.0.0.1:2268/profiles");
        const accounts = response.data.data;

        // Chọn tài khoản theo tên
        const account = accounts.find(acc => acc.name === accountName);
        if (!account) {
            console.log(`Tài khoản ${accountName} không tồn tại`);
            return null;
        }
        console.log(`Đã đóng [${accountName}]`)
        const startResponse = await axios.post(`http://127.0.0.1:2268/profiles/stop/${account.id}`);
    } catch (e) {
        console.log("Lỗi khi đóng trình duyệt:", e);
    }
}

// Hàm điền vào ô input
export async function fillInput(page, selector, value) {
    try {
        // Chờ cho ô input xuất hiện trên trang
        const element = await page.waitForSelector(selector, { timeout: 10000, state: 'visible' });

        if (element) {
            const inputElement = await page.$(selector);
            if (inputElement) {
                await inputElement.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                await inputElement.click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
            }

            // Điền giá trị mới vào ô input
            await element.type(value);
            console.log(`Đã điền giá trị "${value}" vào ô input`);
        } else {
            console.log("Không tìm thấy ô input với selector:", selector);
        }
    } catch (e) {
        console.log("Lỗi khi điền vào ô input:", e);
    }
}


export async function enterInputValue(page, selector, value, index) {
    try {
        // Lấy tất cả các phần tử trùng với selector
        const elements = await page.$$(selector);

        if (elements.length > 0) {
            // Lấy phần tử thứ 3 (index = 2)
            const element = elements[index];

            // Điền giá trị vào ô input
            await element. fill(value);
            await scrollAndClickElement(page,"div#preview-sale-information h1");
            console.log(`Đã điền giá trị "${value}" vào ô input thứ ${index + 1}`);
        } else {
            console.log(`Không tìm thấy đủ ô input, chỉ có ${elements.length} ô.`);
        }
    } catch (e) {
        console.log("Lỗi khi điền vào ô input:", e);
    }
}

// uploadFile.js (hoặc trong một file utils.js nếu bạn có nhiều file helpers)
export async function uploadFile(page, uploadInputSelector, filePaths) {
    try {
        // Chờ phần tử input (loại file) xuất hiện
        const inputElement = await page.waitForSelector(uploadInputSelector, { timeout: 10000, state: 'visible' });

        if (inputElement) {
            // Đảm bảo input là phần tử input kiểu file
            const inputFileElement = await page.$(uploadInputSelector); // Lấy lại phần tử input file

            if (inputFileElement) {
                // Tải lên tệp
                await inputFileElement.setInputFiles(filePaths);  // Phương thức này phải gọi trên input element
                console.log(`Đã tải lên ${filePaths.length} ảnh`);
            } else {
                console.log("Không tìm thấy phần tử input file");
            }
        } else {
            console.log(`Không tìm thấy input file với selector: ${uploadInputSelector}`);
        }
    } catch (e) {
        console.log("Lỗi khi tải tệp:", e);
    }
}


export async function loadList(page,element) {
    try {
        // Chờ phần tử `ul` có class `core-cascader-list` xuất hiện trên trang
        const menuItems = await page.$$eval('ul.core-cascader-list.core-cascader-list-select[role="menu"] li.core-cascader-list-item', items => {
            // Trả về tất cả các text của từng item trong danh sách
            return items.map(item => item.innerText);
        });

        // In danh sách các text của menu
        console.log("Danh sách các mục menu:");
        menuItems.forEach((text, index) => {
            console.log(`${index + 1}: ${text}`);
        });

        return menuItems; // Trả về mảng chứa text của các mục menu
    } catch (e) {
        console.error("Lỗi khi lấy text từ menu:", e);
    }
}

// Hàm lướt đến phần tử có text cụ thể và click vào phần tử
export async function scrollAndClickByText(page, menuSelector, itemSelector, itemText,itemClearText) {
    try {
        // Lấy tất cả các phần tử con của menu
        let menuItems = await page.$$eval(`${menuSelector} ${itemSelector}`, (items) => {
            // Trả về danh sách text của các mục menu
            return items.map(item => item.innerText.trim());
        });
        // Nếu không có phần tử nào, thay đổi menuSelector sang giá trị mặc định
        if (menuItems.length === 0) {
            console.log(`Không tìm thấy phần tử nào với menuSelector: ${menuSelector}. Sử dụng selector mặc định.`);
            menuSelector = 'div.core-select-popup div div.core-select-popup-inner div div'; // Thay đổi selector
            menuItems = await page.$$eval(`${menuSelector} ${itemSelector}`, (items) => {
                // Trả về danh sách text của các mục menu
                return items.map(item => item.innerText.trim());
            });
        }

        // Tìm phần tử có text khớp và click vào nó
        const index = menuItems.findIndex(text => text === itemText); // Tìm index của phần tử có text
        if (index !== -1) {
            // Tìm phần tử tương ứng và lướt đến nó
            const itemToClick = await page.$$(menuSelector + ' ' + itemSelector);
            await itemToClick[index].scrollIntoViewIfNeeded();  // Lướt đến phần tử
            await itemToClick[index].click();  // Click vào phần tử
            console.log(`Đã click vào phần tử có text: ${itemText}`);
        } else {
            await fillInput(page, "input[placeholder='Enter a custom value']", itemText);
            await delayTime(3000)
            await scrollAndClickElement(page,"div.flex.px-12.pb-0.space-x-8.flex-grow-1 button[data-v='17f6g56']")
            await delayTime(3000)
            console.log(`Không tìm thấy phần tử với text: ${itemText}`);
            // Chọn toàn bộ nội dung trong ô input để xóa
            await itemClearText.click({ clickCount: 3 }); // Chọn toàn bộ nội dung
            await page.keyboard.press('Backspace'); // Xóa nội dung đã nhập
            await page.waitForTimeout(3000); // Đợi 1s trước khi chuyển sang value tiếp theo
        }
    } catch (e) {
        console.error("Lỗi khi thao tác với phần tử:", e);
    }
}
// hàm trả về index cần ấn
export async function getIndex(page, cssSelector, targetText) {
    console.log(`Đang dùng vòng lặp FOR để tìm và click vào: "${targetText}"...`);

    try {
        // 1. Lấy tất cả các Locator khớp
        const locators = page.locator(cssSelector);

        // 2. Đếm số lượng phần tử (để xác định giới hạn vòng lặp)
        const count = await locators.count();

        if (count === 0) {
            console.warn(`Cảnh báo: Không tìm thấy phần tử nào khớp với selector: ${cssSelector}.`);
            return null;
        }

        // 3. Vòng lặp for để kiểm tra tuần tự từng phần tử
        for (let i = 0; i < count; i++) {
            const currentLocator = locators.nth(i);

            // Lấy nội dung văn bản của phần tử hiện tại
            const textContent = await currentLocator.innerText();
            const cleanedText = await textContent.trim();

            // 4. Kiểm tra điều kiện so khớp chính xác
            if (cleanedText === targetText) {
                console.log(`=> Tìm thấy phần tử tại vị trí thứ ${i + 1}. Đang click...`);
                return i+1; // Kết thúc và trả về true ngay khi tìm thấy
            }
        }

        // 5. Nếu vòng lặp kết thúc mà không tìm thấy
        console.warn(`Cảnh báo: Không tìm thấy phần tử có text chính xác là "${targetText}" sau khi lặp qua ${count} phần tử.`);
        return null;

    } catch (error) {
        console.error(`Lỗi trong quá trình tìm kiếm/click: ${error.message}`);
        return null;
    }
}
//lay text ten ten anh
export async function getCleanFileName(filePath) {
    // path.basename sẽ lấy "Not Our War Shirt...Peace Advocacy Shirt.png"
    // path.extname sẽ lấy ".png"
    // Tham số thứ 2 của path.basename giúp xóa bỏ đuôi file nếu biết trước đuôi

    const extension = await path.extname(filePath); // Lấy .png
    const fileName = await path.basename(filePath, extension); // Lấy tên và cắt bỏ .png

    return fileName.trim();
}

export async function scrollAndHoverByText(page, menuSelector, itemSelector, itemText, itemClearText) {
    try {
        // Lấy tất cả các phần tử con của menu
        let menuItems = await page.$$eval(`${menuSelector} ${itemSelector}`, (items) => {
            // Trả về danh sách text của các mục menu
            return items.map(item => item.innerText.trim());
        });

        // Nếu không có phần tử nào, thay đổi menuSelector sang giá trị mặc định
        if (menuItems.length === 0) {
            console.log(`Không tìm thấy phần tử nào với menuSelector: ${menuSelector}. Sử dụng selector mặc định.`);
            menuSelector = 'div.core-select-popup div div.core-select-popup-inner div div'; // Thay đổi selector
            menuItems = await page.$$eval(`${menuSelector} ${itemSelector}`, (items) => {
                // Trả về danh sách text của các mục menu
                return items.map(item => item.innerText.trim());
            });
        }

        // Tìm phần tử có text khớp và click vào nó
        const index = menuItems.findIndex(text => text === itemText); // Tìm index của phần tử có text
        if (index !== -1) {
            // Tìm phần tử tương ứng và lướt đến nó
            const itemToClick = await page.$$(menuSelector + ' ' + itemSelector);
            await itemToClick[index].scrollIntoViewIfNeeded();  // Lướt đến phần tử

            // Thực hiện hover vào phần tử trước khi click
            await itemToClick[index].hover();
            console.log(`Đã hover vào phần tử có text: ${itemText}`);

            // await itemToClick[index].click();  // Click vào phần tử
            // console.log(`Đã click vào phần tử có text: ${itemText}`);
        } else {
            await fillInput(page, "input[placeholder='Enter a custom value']", itemText);
            await delayTime(3000);
            await scrollAndClickElement(page, "div.flex.px-12.pb-0.space-x-8.flex-grow-1 button[data-v='17f6g56']");
            await delayTime(3000);
            console.log(`Không tìm thấy phần tử với text: ${itemText}`);

            // Chọn toàn bộ nội dung trong ô input để xóa
            await itemClearText.click({ clickCount: 3 }); // Chọn toàn bộ nội dung
            await page.keyboard.press('Backspace'); // Xóa nội dung đã nhập
            await page.waitForTimeout(3000); // Đợi 1s trước khi chuyển sang value tiếp theo
        }
    } catch (e) {
        console.error("Lỗi khi thao tác với phần tử:", e);
    }
}


export async function scrollDownByPixels(newPage, pixels) {
    try {
        // Ép kiểu pixels thành số nguyên (parseInt) để đảm bảo giá trị là số
        const pixelsToScroll = parseInt(pixels, 10);

        if (isNaN(pixelsToScroll)) {
            console.error("Giá trị pixels không hợp lệ:", pixels);
            return;
        }

        // Kéo trang xuống theo chiều dọc (Y-axis) với số pixel đầu vào
        await newPage.evaluate((pixels) => {
            window.scrollBy(0, pixels);  // Cuộn trang xuống số pixel bạn truyền vào
        }, pixelsToScroll);

        console.log(`Đã cuộn màn xuống ${pixelsToScroll} pixel`);
    } catch (e) {
        console.log("Lỗi khi cuộn trang:", e);
    }
}

export async function splitByComma(inputString) {
    // Kiểm tra chuỗi đầu vào có hợp lệ không
    if (!inputString || typeof inputString !== "string") {
        console.error("Invalid input string:", inputString);
        return [];
    }

    // Chia chuỗi theo dấu phẩy, loại bỏ khoảng trắng ở hai đầu
    return inputString
        .split(",")                // tách theo dấu phẩy
        .map(item => item.trim())   // loại bỏ khoảng trắng 2 đầu mỗi phần tử
        .filter(Boolean);
}

// cho attribute

export async function parseAttributes(attributes) {
    // Bước 1: Tách chuỗi thành các cặp (key: value) theo dấu phẩy
    const attributePairs = attributes
        .split('),')  // Tách chuỗi theo dấu "),"
        .map(pair => pair.trim().replace(/[()]/g, ''));  // Loại bỏ dấu ngoặc đơn và khoảng trắng

    // Bước 2: Tạo đối tượng từ các cặp key-value
    const result = attributePairs.map(pair => {
        const [key, value] = pair.split(':');  // Tách key và value theo dấu ":"
        const trimmedKey = key.trim();  // Loại bỏ khoảng trắng dư thừa
        const trimmedValue = value.trim();  // Loại bỏ khoảng trắng dư thừa

        // Bước 3: Tách giá trị có dấu phẩy thành mảng (nếu có)
        const valueArray = trimmedValue.split(',').map(item => item.trim());

        return { [trimmedKey]: valueArray };  // Trả về đối tượng với key và giá trị dạng mảng
    });

    return result;  // Trả về mảng đối tượng
}

export async function clickInputByLabelTextAttribute(page, labelText, values = []) {
    try {
        if (!Array.isArray(values) || values.length === 0) {
            console.warn(`⚠️ Không có giá trị nào để chọn cho label "${labelText}"`);
            return false;
        }

        const inputSelector = await page.evaluate((labelText) => {
            const labels = Array.from(document.querySelectorAll("div.grid div label.text-neutral-text2"));
            for (const label of labels) {
                const textNode = label.querySelector(
                    "div.formLabel-GtFmkf span.flex.items-center span.title-TwiAC7 div.content-jECjMB"
                );
                if (textNode && textNode.textContent.trim() === labelText) {
                    const wrapper = label.closest("div");
                    if (!wrapper) return null;

                    const input = wrapper.querySelector("[role='combobox']");
                    if (input && input.getAttribute("aria-controls")) {
                        return `[aria-controls="${input.getAttribute("aria-controls")}"]`;
                    }
                }
            }
            return null;
        }, labelText);

        if (!inputSelector) {
            console.error(`❌ Không tìm thấy selector cho label "${labelText}"`);
            return false;
        }

        const input = await page.$(inputSelector);
        if (!input) {
            console.error(`❌ Không tìm thấy element DOM từ selector "${inputSelector}"`);
            return false;
        }

        await input.click();
        await page.waitForTimeout(3000);

        for (const value of values) {
            const inputBox = await input.$("input");
            if (!inputBox) {
                console.error("❌ Không tìm thấy ô nhập để gõ giá trị");
                return false;
            }

            await inputBox.type(value);
            await page.waitForTimeout(3000);

            // Enter để xác nhận giá trị đã gõ (giả định hệ thống tự suggest)
            await page.keyboard.press("Enter");
            await page.waitForTimeout(3000);

            await scrollAndClickByText(page, "div.core-select-popup.pulse-select-popup.core-select-popup-multiple div div.core-select-popup-inner div div", "li.core-select-option", value,inputBox);
            await page.waitForTimeout(3000);
        }

        console.log(`✅ Đã chọn ${values.length} giá trị cho "${labelText}"`);

    } catch (e) {
        console.error(`❌ Lỗi khi chọn giá trị cho "${labelText}":`, e);
    }
}

//

export async function enterDescription(page, element, content) {
    try {
        // Tìm phần tử div với selector CSS
        const descriptionField = await page.findElement(By.css(element));

        // Chờ đến khi phần tử có thể tương tác được (có thể sử dụng wait cho ổn định)
        await page.wait(1000); // Bạn có thể thay thế bằng các phương thức chờ khác nếu cần

        // Chỉnh sửa nội dung HTML của phần tử div
        await page.executeScript("arguments[0].innerHTML = arguments[1];", descriptionField, content);

        console.log(`Đã điền giá trị vào phần tử với selector "${element}"`);
    } catch (e) {
        console.log("Lỗi khi nhập vào phần tử:", e);
    }
}

export async function selectRadioButton(page, selector, value) {
    try {
        // Tìm tất cả các phần tử radio theo selector
        const labels = await page.$$(selector);

        // Lặp qua tất cả các label và tìm radio button có giá trị value tương ứng
        for (const label of labels) {
            const radioButton = await label.$('input[type="radio"]'); // Tìm input radio trong label
            const radioValue = await radioButton.evaluate(el => el.value); // Lấy giá trị value của radio button

            // So sánh giá trị radio với giá trị yêu cầu, không phân biệt hoa thường
            if (radioValue.toLowerCase() === value.toLowerCase()) {
                // Tìm span có class "core-icon-hover" trong cùng label
                const span = await label.$('span.core-icon-hover');

                if (span) {
                    // Click vào span có class "core-icon-hover"
                    await span.click();
                    console.log(`Đã chọn radio với value "${value}"`);
                    return;  // Kết thúc sau khi click vào radio button phù hợp
                } else {
                    console.log('Không tìm thấy span với class "core-icon-hover" trong label.');
                    return;
                }
            }
        }

        console.log(`Không tìm thấy radio với value "${value}"`);
    } catch (e) {
        console.log("Lỗi khi chọn radio button:", e);
    }
}

//chỉnh sửa variable
export async function uploadFileToPage(page, dataList) {
    // Lấy tất cả các thẻ input[type="file"] trên trang
    const fileInputs = await page.$$(`div.flex-row div.w-full div.flex-1 div div.core-space div.core-space-item div.cursor-default div.pulse-upload div.core-upload input[type="file"]`);

    // Duyệt qua từng phần tử trong danh sách dữ liệu và truyền ảnh vào các thẻ input[type="file"]
    for (let i = 0; i < dataList.length; i++) {
        const { filePath } = dataList[i]; // Lấy filePath từ dữ liệu
        const fileInput = fileInputs[i]; // Lấy thẻ input[type="file"] theo chỉ số i

        console.log(`Đang tải lên file ${filePath} vào thẻ input thứ ${i + 1}`);
        await fileInput.uploadFile(filePath); // Upload file vào thẻ input

        // Thêm sự kiện change để kích hoạt hành động sau khi tải lên
        await fileInput.evaluate(el => el.dispatchEvent(new Event('change')));
        console.log(`Tải lên thành công cho thẻ input thứ ${i + 1}`);
    }
}

export async function checkIfElementIsDisabled(page, elementSelector) {
    try {
        // Lấy phần tử
        const element = await page.$(elementSelector);

        // Kiểm tra xem phần tử có tồn tại không
        if (!element) {
            console.log(`Phần tử không tìm thấy: ${elementSelector}`);
            return false;
        }

        // Kiểm tra xem phần tử có class 'theme-arco-pagination-item-disabled' không
        const hasClass = await element.evaluate(el =>
            el.classList.contains('theme-arco-pagination-item-disabled') || el.classList.contains('core-pagination-item-disabled')
        );

        // Nếu có class 'theme-arco-pagination-item-disabled', trả về false
        return !hasClass;
    } catch (error) {
        console.error("Lỗi khi kiểm tra phần tử:", error);
        return false;
    }
}

export async function getFormattedDate(check) {
    let now = moment.tz('America/Los_Angeles'); // lấy thời gian hiện tại ở Los Angeles

    if (check === 1) {
        now.add(2, 'minutes'); // thêm 2 phút
    } else {
        now.add(3, 'days'); // thêm 3 ngày
    }

    const day = now.date();
    const month = now.month() + 1; // tháng là từ 0 đến 11
    const year = now.year();
    const hour = now.hours();
    const minute = now.minutes();
    const period = hour >= 12 ? 'PM' : 'AM';

    return {
        day: formatNumber(day).toString(),
        month: formatNumber(month).toString(),
        year: year.toString(),
        hour: formatNumber(hour > 12 ? hour - 12 : hour), // Điều chỉnh giờ theo định dạng 12 giờ
        minute: formatNumber(minute),
        period: period
    };
}

function formatNumber(num) {
    return num.toString().padStart(2, '0');  // Đảm bảo rằng số có ít nhất 2 chữ số
}

export async function parseSizes(sizeString) {
    // Sử dụng regex để tách các phần size và giá trị
    const sizeArray = sizeString.match(/\(([^)]+)\)/g).map(item => {
        const [size, value] = item.slice(1, -1).split(": ");
        return { size, value: parseFloat(value) };
    });
    return sizeArray;
}
//xuat du lieu the div tim dc
export async function extractTextFromElements(page, selector) {
    try {
        // Chờ cho tất cả các phần tử có selector xuất hiện trên trang
        const elements = await page.$$eval(selector, (els) => {
            // Trả về mảng văn bản của các phần tử
            return els.map(el => el.textContent.trim());
        });

        // Kiểm tra nếu không có dữ liệu
        if (elements.length === 0) {
            console.log(`Không tìm thấy phần tử nào với selector: ${selector}`);
        } else {
            console.log(`Đã trích xuất ${elements.length} phần tử với selector: ${selector}`);
        }

        // Trả về mảng chứa văn bản của các phần tử
        return elements;
    } catch (e) {
        console.log("Lỗi khi trích xuất văn bản từ các phần tử:", e);
    }
}

export async function scrollToBottom(page, selector) {
    try {
        // Chờ phần tử xuất hiện
        const element = await page.waitForSelector(selector, { timeout: 10000, state: 'visible' });

        if (element) {
            // Lấy chiều cao của phần tử và chiều cao có thể nhìn thấy
            const scrollHeight = await element.evaluate(el => el.scrollHeight);
            const clientHeight = await element.evaluate(el => el.clientHeight);
            let scrollPosition = 0;
            const scrollStep = 10; // Mỗi lần cuộn di chuyển 10px
            const interval = 15; // Thời gian giữa các lần cuộn (ms)

            // Cuộn từ từ bằng cách tăng scrollTop dần
            const smoothScroll = setInterval(async () => {
                scrollPosition += scrollStep;

                // Cuộn xuống
                await element.evaluate((el, position) => {
                    el.scrollTop = position;
                }, scrollPosition);

                // Kiểm tra nếu đã cuộn đến đáy
                if (scrollPosition >= scrollHeight - clientHeight) {
                    clearInterval(smoothScroll);
                    console.log('Đã cuộn đến đáy');
                }
            }, interval); // Thực hiện cuộn mỗi 15ms
        } else {
            console.log(`Không tìm thấy phần tử: ${selector}`);
        }
    } catch (e) {
        console.log("Lỗi khi thao tác cuộn phần tử:", e);
    }
}

export async function smoothScrollToTop(page, selector) {
    try {
        // Chờ phần tử xuất hiện
        const element = await page.waitForSelector(selector, { timeout: 10000, state: 'visible' });

        if (element) {
            // Lấy chiều cao của phần tử và chiều cao có thể nhìn thấy
            const scrollHeight = await element.evaluate(el => el.scrollHeight);
            const clientHeight = await element.evaluate(el => el.clientHeight);
            let scrollPosition = scrollHeight;  // Bắt đầu từ vị trí cuộn hiện tại
            const scrollStep = 10; // Mỗi lần cuộn di chuyển 10px
            const interval = 15; // Thời gian giữa các lần cuộn (ms)

            // Cuộn từ từ bằng cách giảm scrollTop dần
            const smoothScroll = setInterval(async () => {
                scrollPosition -= scrollStep;

                // Cuộn lên đầu
                await element.evaluate((el, position) => {
                    el.scrollTop = position;
                }, scrollPosition);

                // Kiểm tra nếu đã cuộn đến đầu
                if (scrollPosition <= 0) {
                    clearInterval(smoothScroll);
                    console.log('Đã cuộn lên đầu');
                }
            }, interval); // Thực hiện cuộn mỗi 15ms
        } else {
            console.log(`Không tìm thấy phần tử: ${selector}`);
        }
    } catch (e) {
        console.log("Lỗi khi thao tác cuộn phần tử:", e);
    }
}

//ham chờ
export async function waitForElement(page, selector, timeout ) {
    // Tạo promise cho việc chờ đợi phần tử
    const elementPromise = page.waitForSelector(selector, { visible: true, timeout });

    // Tạo promise để hủy sau thời gian timeout
    const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error(`Timeout after ${timeout / 1000} seconds waiting for element: ${selector}`));
        }, timeout);
    });

    // Sử dụng Promise.race để chờ cho đến khi phần tử xuất hiện hoặc hết thời gian
    try {
        await Promise.race([elementPromise, timeoutPromise]);
        console.log(`Element ${selector} appeared.`);
        return true; // Trả về true nếu phần tử xuất hiện
    } catch (error) {
        console.log(`Error: ${error.message}`);
        return false; // Trả về false nếu hết thời gian
    }
}
// Hàm tạo tên sheet từ thời gian hiện tại (giờphútgiâyngàythángnăm)
function getFormattedSheetName() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();

    return `${hours}${minutes}${seconds}${day}${month}${year}`;
}

export async function getDateToday() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();

    return `${hours}:${minutes}:${seconds}-${day}/${month}/${year}`;
}
// Hàm nhận vào tên cột và dữ liệu từng hàng
export async function processTableData(colum,data,output,outputRoot) {

    const outputPath = path.resolve(output);

    // Tạo workbook mới hoặc mở workbook đã tồn tại
    const workbook = new ExcelJS.Workbook();

    if (fs.existsSync(outputPath)) {
        // Nếu tệp đã tồn tại, đọc tệp Excel
        await workbook.xlsx.readFile(outputPath);
    }

    // Tạo một sheet mới với tên mới dựa trên thời gian
    const sheetName = getFormattedSheetName();
    const worksheet = workbook.addWorksheet(sheetName);

    // Đặt tên các cột
    worksheet.columns = colum;

    data.forEach(row => worksheet.addRow(row));


    // Đảm bảo thư mục Output nằm ở cấp gốc của dự án
    const dir = path.resolve(outputRoot);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Ghi tệp vào thư mục Output
    await workbook.xlsx.writeFile(outputPath);

    console.log(`File Excel đã được tạo tại ${outputPath} với sheet tên là ${sheetName}`);
}


// Hàm để chia tài khoản thành các nhóm tối đa 3 tài khoản
export function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}
export const hide = new Hidemyacc();

export async function ensureDirIfMissing(dirPath, { unique = false } = {}) {
    const abs = path.resolve(dirPath);

    if (!unique) {
        try {
            await fs.promises.access(abs);
        } catch {
            await fs.promises.mkdir(abs, { recursive: true });
        }
        return abs;
    }

    // unique = true  -> tạo thư mục không đụng hàng
    const parent = path.dirname(abs);
    // Chuẩn hoá baseName: bỏ sẵn " (n)" ở cuối nếu có để tránh "Folder (1) (1)"
    const baseRaw = path.basename(abs);
    const base = baseRaw.replace(/\s\(\d+\)$/,'');
    // đảm bảo parent tồn tại
    await fs.promises.mkdir(parent, { recursive: true });

    // thử tạo đúng tên gốc trước
    const tryPath = path.join(parent, base);
    try {
        await fs.promises.mkdir(tryPath, { recursive: false });
        return tryPath;
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
    }

    // nếu đã tồn tại -> tăng (1), (2), ...
    let i = 1;
    // NOTE: dùng vòng lặp an toàn, mỗi lần thử mkdir không recursive
    while (true) {
        const candidate = path.join(parent, `${base} (${i})`);
        try {
            await fs.promises.mkdir(candidate, { recursive: false });
            return candidate;
        } catch (err) {
            if (err.code === 'EEXIST') {
                i += 1;
                continue;
            }
            throw err;
        }
    }
}

/** Đoán extension từ Content-Type hoặc URL */
function inferExt(contentType, url) {
    const map = {
        'image/jpeg': '.jpg',
        'image/jpg':  '.jpg',
        'image/png':  '.png',
        'image/webp': '.webp',
        'image/gif':  '.gif',
        'image/bmp':  '.bmp',
        'image/svg+xml': '.svg',
        'image/avif': '.avif',
    };
    if (contentType && map[contentType]) return map[contentType];

    try {
        const u = new URL(url);
        const pathname = u.pathname.toLowerCase();
        const m = pathname.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg|avif)(?:$|\?)/i);
        if (m) {
            const ext = m[0].toLowerCase().replace(/\?.*$/, '');
            return ext === '.jpeg' ? '.jpg' : ext;
        }
    } catch { /* ignore */ }

    return '.jpg'; // mặc định
}

/** Lấy số thứ tự tiếp theo trong thư mục (dựa trên file dạng NN.ext) */
async function getNextIndex(dir) {
    const files = await fs.promises.readdir(dir).catch(() => []);
    let max = 0;
    for (const f of files) {
        const m = f.match(/^(\d+)\.(jpg|png|webp|gif|bmp|svg|avif)$/i);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
}

export async function getNextIndexFolder(parentPath) {
    try {
        await fs.promises.mkdir(parentPath, { recursive: true });

        const items = await fs.promises.readdir(parentPath, { withFileTypes: true });

        let maxIndex = 0;

        for (const item of items) {
            if (!item.isDirectory()) continue;

            const match = item.name.match(/^(\d+)_/);
            if (match) {
                const index = Number(match[1]);
                if (index > maxIndex) maxIndex = index;
            }
        }

        return maxIndex + 1;

    } catch (e) {
        console.error(e);
        return 1;
    }
}

/**
 * Tải 1 ảnh về thư mục, tên file tự đánh số 1..n (không ghi đè).
 * Trả về đường dẫn file đã lưu.
 */
export async function downloadImageToFolder(url, folder) {
    const dir = await ensureDirIfMissing(folder);

    // fetch có sẵn từ Node >= 18
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} khi tải: ${url}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type')?.toLowerCase() || '';
    const ext = inferExt(ct, url);

    const idx = await getNextIndex(dir);
    const filepath = path.join(dir, `${idx}${ext}`);
    await fs.promises.writeFile(filepath, buf);

    return filepath;
}

export async function downloadImagesToFolder(urls, folder, { retries = 2, delayMs = 500 } = {}) {
    const dir = await ensureDirIfMissing(folder);
    const uniqueUrls = [...new Set(urls)].filter(Boolean);
    let index = await getNextIndex(dir);
    const results = [];

    const headers = {
        'User-Agent': 'PostmanRuntime/7.51.1',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Referer': 'https://www.redbubble.com/',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
    };

    for (const url of uniqueUrls) {
        let lastErr = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, {
                    method: 'GET',
                    headers: headers,
                    redirect: 'follow'
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const arrayBuffer = await res.arrayBuffer();
                const inputBuffer = Buffer.from(arrayBuffer);

                // --- PHẦN XỬ LÝ CHUYỂN ĐỔI SANG JPG ---
                const filepath = path.join(dir, `${index}.jpg`); // Luôn để đuôi .jpg

                await sharp(inputBuffer)
                    .jpeg({ quality: 90 }) // Chuyển đổi sang JPEG, chất lượng 90%
                    .toFile(filepath);
                // --------------------------------------

                results.push(filepath);
                index++;

                if (delayMs) await new Promise(r => setTimeout(r, delayMs));
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                if (attempt < retries) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
        if (lastErr) {
            results.push(null);
            console.error(`Tải thất bại: ${url} -> ${lastErr.message}`);
        }
    }

    return results;
}
export const delayTime = (ms) => delay(ms); // Sử dụng lại delay cho các bước khác


//hàm check folder
export async function evaluateFolderContent(folderPath) {
    let folderCount = 0;

    try {
        // 1. Đọc tất cả các mục (tệp và thư mục) trong thư mục
        const items = await readdir(folderPath);

        // 2. Lặp qua từng mục
        for (const item of items) {
            const fullPath = path.join(folderPath, item);

            // Lấy thông tin trạng thái (stat)
            const fileStat = await stat(fullPath);

            if (fileStat.isFile()) {
                // Nếu là một tệp (file) -> Trả về dạng file (Dạng 2)
                console.log(`Tìm thấy tệp: ${item}. Trả về dạng file.`);

                // Trả về mảng chứa đối tượng file
                return [{
                    'dạng': 'file',
                    'soluong': 1
                }];
            } else if (fileStat.isDirectory()) {
                // Nếu là thư mục, tăng bộ đếm
                folderCount++;
            }
            // Bỏ qua các loại khác
        }

        // 3. Nếu lặp xong mà không tìm thấy tệp nào -> Trả về số lượng folder (Dạng 1)
        console.log(`Chỉ có các thư mục. Trả về số lượng: ${folderCount}.`);

        // Trả về mảng chứa đối tượng folder
        return [{
            'dạng': 'folder',
            'soluong': folderCount
        }];

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Lỗi: Thư mục không tồn tại tại đường dẫn: ${folderPath}`);
        } else {
            console.error(`Lỗi trong quá trình xử lý thư mục: ${error.message}`);
        }
        // Trả về đối tượng lỗi để dễ dàng debug
        return [{
            'dạng': 'error',
            'soluong': 0,
            'message': error.message
        }];
    }
}

//lay folder san pham theo duong dan folder
export async function getProductFolders(inputFolderPath) {
    const productList = [];

    try {
        // 1. Đọc tất cả các mục (tệp và thư mục) trong thư mục gốc
        const items = await readdir(inputFolderPath);

        // 2. Lặp qua từng mục
        for (const item of items) {
            const fullPath = path.join(inputFolderPath, item);

            // Lấy thông tin trạng thái (stat)
            const fileStat = await stat(fullPath);

            // 3. Kiểm tra nếu mục là một thư mục (folder)
            if (fileStat.isDirectory()) {
                // Thêm đối tượng vào danh sách
                productList.push({
                    'DuongDanFolder': fullPath,
                    'TenSanPham': item // item chính là tên folder
                });
            }
            // Bỏ qua các tệp (file) và các loại khác
        }

        console.log(`Đã tìm thấy ${productList.length} thư mục sản phẩm.`);
        return productList;

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Lỗi: Thư mục không tồn tại tại đường dẫn: ${inputFolderPath}`);
        } else {
            console.error(`Lỗi trong quá trình đọc thư mục: ${error.message}`);
        }
        // Trả về mảng rỗng hoặc một giá trị lỗi tùy theo logic xử lý của bạn
        return [];
    }
}

export function getLastSegmentOfPath(fullPath) {
    if (!fullPath || typeof fullPath !== 'string') {
        return '';
    }

    // Node.js path.basename() sẽ xử lý ký tự gạch chéo ngược (\) tự động
    // và trả về phần cuối cùng của đường dẫn.
    const lastSegment = path.basename(fullPath);

    return lastSegment;
}

//xóa <số>_
export async function removeNumberPrefix(originalText) {
    // Biểu thức chính quy:
    // ^      : Khớp với vị trí BẮT ĐẦU chuỗi.
    // \d+    : Khớp với MỘT hoặc NHIỀU chữ số (0-9).
    // _      : Khớp với ký tự gạch dưới (_).
    const regex = /^\d+_+/;

    // Thay thế mẫu khớp bằng chuỗi rỗng ('')
    let cleanedText = originalText.replace(regex, '');

    // Loại bỏ khoảng trắng thừa ở đầu chuỗi (nếu có sau khi xóa tiền tố)
    return cleanedText.trim();
}

//luot den phan tu
export async function scrollIntoViewIfNeeded(page, selector) {
    const isInView = await checkElementInView(page, selector);
    if (!isInView) {
        await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, selector);
        await delayTime(1000); // Đợi sau khi cuộn trang
    }
}

export async function checkElementInView(page, selector) {
    const element = await page.$(selector);
    if (!element) return false;

    const boundingBox = await element.boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    // Kiểm tra xem phần tử có nằm trong phạm vi nhìn thấy không
    return boundingBox && boundingBox.top >= 0 && boundingBox.top < viewportHeight;
}

//lay danh sach anh

// Giả định bạn đã định nghĩa hằng số này:
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']; // Thêm các đuôi mở rộng hợp lệ

// --- HÀM HỖ TRỢ: SẮP XẾP TỰ NHIÊN (Natural Sort) ---
// Giúp sắp xếp '1.jpg', '2.jpg', '10.jpg' đúng thứ tự
function naturalSort(a, b) {
    // 1. Lấy tên tệp từ đường dẫn
    const nameA = path.basename(a);
    const nameB = path.basename(b);

    // 2. Sử dụng localeCompare với tùy chọn numeric: true
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}
// --------------------------------------------------

export async function getImageFilePaths(folderPath) {
    const imagePaths = [];

    try {
        // 1. Đọc tất cả các mục (tệp và thư mục) trong thư mục
        const items = await readdir(folderPath);

        // 2. Lặp qua từng mục và kiểm tra
        for (const item of items) {
            const fullPath = path.join(folderPath, item);
            const fileExtension = path.extname(item).toLowerCase();

            // 3. Kiểm tra xem mục có phải là tệp và có đuôi ảnh hợp lệ không
            const fileStat = await stat(fullPath);

            if (fileStat.isFile() && IMAGE_EXTENSIONS.includes(fileExtension)) {
                // Thêm đường dẫn đầy đủ vào danh sách
                imagePaths.push(fullPath);
            }
        }

        // 4. BƯỚC MỚI: SẮP XẾP CÁC ĐƯỜNG DẪN THEO TÊN TỆP
        imagePaths.sort(naturalSort);

        console.log(`Đã tìm thấy ${imagePaths.length} tệp ảnh trong thư mục và sắp xếp theo tên.`);
        return imagePaths;

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Lỗi: Thư mục ảnh không tồn tại tại đường dẫn: ${folderPath}`);
        } else {
            console.error(`Lỗi trong quá trình đọc thư mục ảnh: ${error.message}`);
        }
        return [];
    }
}

// const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
// export async function getImageFilePaths(folderPath) {
//     const imagePaths = [];
//
//     try {
//         // 1. Đọc tất cả các mục (tệp và thư mục) trong thư mục
//         const items = await readdir(folderPath);
//
//         // 2. Lặp qua từng mục và kiểm tra
//         for (const item of items) {
//             const fullPath = path.join(folderPath, item);
//             const fileExtension = path.extname(item).toLowerCase(); // Lấy đuôi mở rộng
//
//             // 3. Kiểm tra xem mục có phải là tệp và có đuôi ảnh hợp lệ không
//             const fileStat = await stat(fullPath);
//
//             if (fileStat.isFile() && IMAGE_EXTENSIONS.includes(fileExtension)) {
//                 // Thêm đường dẫn đầy đủ vào danh sách
//                 imagePaths.push(fullPath);
//             }
//             // Bỏ qua thư mục và các loại tệp không phải là ảnh
//         }
//
//         console.log(`Đã tìm thấy ${imagePaths.length} tệp ảnh trong thư mục.`);
//         return imagePaths;
//
//     } catch (error) {
//         if (error.code === 'ENOENT') {
//             console.error(`Lỗi: Thư mục ảnh không tồn tại tại đường dẫn: ${folderPath}`);
//         } else {
//             console.error(`Lỗi trong quá trình đọc thư mục ảnh: ${error.message}`);
//         }
//         // Trả về mảng rỗng nếu có lỗi
//         return [];
//     }
// }

//lay tên file
export function getFileNameWithoutExtension(fullPath) {
    // 1. Trích xuất tên file đầy đủ (ví dụ: '1.jpg')
    const fullFileName = path.basename(fullPath);

    // 2. Sử dụng basename() lần nữa, truyền fullFileName và đuôi mở rộng để loại bỏ
    // Hoặc, cách đơn giản hơn là loại bỏ phần mở rộng trực tiếp trong basename() đầu tiên.
    // Lấy phần mở rộng từ fullPath và truyền nó vào tham số thứ hai của basename()
    const fileNameWithoutExt = path.basename(fullPath, path.basename(fullPath).match(/\.\w+$/i)?.[0] || '');

    // CÁCH ĐƠN GIẢN HƠN cho trường hợp đơn giản:
    // const fileNameWithoutExt = fullFileName.replace(/\.[^/.]+$/, "");
    const regex = /\.[^/.]+$/;
    // Tuy nhiên, để tuân thủ Node.js, ta dùng cách này:
    return path.basename(fullPath, '.jpg').replace(regex, ''); // Giả định đuôi luôn là .jpg
}

//chuyển đổi mảng
export function convertMixedSizeStringToSizearray(sizeString) {
    if (!sizeString || typeof sizeString !== 'string') {
        return [];
    }

    // 1. Phân tách chuỗi gốc bằng ký tự xuống dòng (\r?\n|\r) để xử lý dữ liệu đa dòng
    const lineArray = sizeString.split(/\r?\n|\r/);

    let finalSizeArray = [];

    // 2. Lặp qua từng dòng đã phân tách
    for (const line of lineArray) {
        // Làm sạch khoảng trắng ở đầu/cuối dòng trước
        const cleanedLine = line.trim();

        if (cleanedLine.length === 0) {
            // Bỏ qua các dòng rỗng
            continue;
        }

        // 3. Kiểm tra: Nếu dòng vẫn chứa dấu phẩy, phân tách tiếp bằng dấu phẩy
        if (cleanedLine.includes(',')) {
            // Phân tách bằng dấu phẩy và làm sạch khoảng trắng của từng phần tử
            const commaSeparatedSizes = cleanedLine
                .split(',')
                .map(size => size.trim())
                .filter(size => size.length > 0); // Lọc bỏ rỗng

            finalSizeArray.push(...commaSeparatedSizes); // Nối mảng kết quả
        } else {
            // Nếu không có dấu phẩy, thêm kích cỡ đó vào mảng
            finalSizeArray.push(cleanedLine);
        }
    }

    return finalSizeArray;
}

//ẤN VAÀO THEO ĐẦU VÀO
export async function clickElementByExactTextUsingFor(page, cssSelector, targetText) {
    console.log(`Đang dùng vòng lặp FOR để tìm và click vào: "${targetText}"...`);

    try {
        // 1. Lấy tất cả các Locator khớp
        const locators = page.locator(cssSelector);

        // 2. Đếm số lượng phần tử (để xác định giới hạn vòng lặp)
        const count = await locators.count();

        if (count === 0) {
            console.warn(`Cảnh báo: Không tìm thấy phần tử nào khớp với selector: ${cssSelector}.`);
            return false;
        }

        // 3. Vòng lặp for để kiểm tra tuần tự từng phần tử
        for (let i = 0; i < count; i++) {
            const currentLocator = locators.nth(i);

            // Lấy nội dung văn bản của phần tử hiện tại
            const textContent = await currentLocator.innerText();
            const cleanedText = textContent.trim();

            // 4. Kiểm tra điều kiện so khớp chính xác
            if (cleanedText === targetText) {
                console.log(`=> Tìm thấy phần tử tại vị trí thứ ${i + 1}. Đang click...`);
                await currentLocator.click();
                console.log(`=> Đã click thành công vào: "${targetText}"`);
                return true; // Kết thúc và trả về true ngay khi tìm thấy
            }
        }

        // 5. Nếu vòng lặp kết thúc mà không tìm thấy
        console.warn(`Cảnh báo: Không tìm thấy phần tử có text chính xác là "${targetText}" sau khi lặp qua ${count} phần tử.`);
        return false;

    } catch (error) {
        console.error(`Lỗi trong quá trình tìm kiếm/click: ${error.message}`);
        return false;
    }
}

//chuyển đổi mảng v2
export async function convertMixedPriceStringToArray(dataString) {
    // if (typeof dataString !== 'number') {
    //     return [];
    // }
    if (!dataString || typeof dataString !== 'string') {
        return [];
    }

    // 1. Phân tách chuỗi gốc bằng ký tự xuống dòng (\r?\n|\r)
    const lines = dataString.split(/\r?\n|\r/);

    let finalResultArray = [];

    // 2. Lặp qua từng dòng và xử lý cặp Key:Value
    for (const line of lines) {
        // Làm sạch khoảng trắng ở đầu/cuối dòng
        const trimmedLine = line.trim();

        if (trimmedLine.length === 0) {
            continue; // Bỏ qua các dòng rỗng
        }

        // 3. Xử lý các dòng có thể chứa nhiều cặp phân tách bằng dấu phẩy
        const pairsInLine = trimmedLine.split(',');

        for (const pair of pairsInLine) {
            const trimmedPair = pair.trim();

            if (trimmedPair.length === 0) {
                continue;
            }

            // 4. Tìm vị trí dấu hai chấm (:) để phân tách Key và Value
            const separatorIndex = trimmedPair.lastIndexOf(':');

            if (separatorIndex === -1) {
                console.warn(`Cảnh báo: Cặp bị bỏ qua, thiếu dấu hai chấm: "${trimmedPair}"`);
                continue;
            }

            // Trích xuất Kích thước (Key)
            const size = trimmedPair.substring(0, separatorIndex).trim();

            // Trích xuất Giá trị (Value) và chuyển đổi sang số
            const valueString = trimmedPair.substring(separatorIndex + 1).trim();
            const value = (valueString);

            if (size.length > 0) {
                finalResultArray.push({
                    'KichThuoc': size,
                    'GiaTri': value
                });
            } else {
                console.warn(`Cảnh báo: Cặp bị bỏ qua do Giá trị không hợp lệ hoặc Kích thước rỗng: "${trimmedPair}"`);
            }
        }
    }

    return finalResultArray;
}

//check elemnet
export async function checkElement(
    page,
    selector) {
    if (!selector || typeof selector !== 'string') {
        console.error("Lỗi: Selector không hợp lệ.");
        return false;
    }

    try {
        // 1. Sử dụng page.locator để tìm tất cả các phần tử
        const locator = page.locator(selector);

        // 2. Lấy số lượng phần tử khớp
        const count = await locator.count();

        console.log(`Kết quả: Tìm thấy ${count} phần tử khớp với selector.`);

        // 3. Kiểm tra điều kiện: số lượng > 0
        if (count > 0) {
            return true;
        } else {
            // Trường hợp số lượng = 0 hoặc không tồn tại (Playwright trả về 0)
            return false;
        }
    } catch (error) {
        // Xử lý lỗi (ví dụ: lỗi cú pháp selector)
        console.error(`Lỗi khi kiểm tra selector: ${error.message}`);
        return false;
    }
}

//hien tab dừng chương triình

const ps = new PowerShell({
    executionPolicy: 'Bypass',
    noProfile: true
});

// export async function showConfirm() {
//     try {
//         const script = `
//       Add-Type -AssemblyName PresentationFramework
//       [System.Windows.MessageBox]::Show('phat hien anh keo?', 'Confirm', 'YesNo', 'Question')
//     `;
//
//         const result = await ps.invoke(script);
//         console.log('User clicked:', result);
//         return result;
//     } catch (err) {
//         console.error(err);
//     } finally {
//         ps.dispose();
//     }
// }



// ko ep kieu ham nay
// export async function extractImageUrls(page, selector) {
//     try {
//         await page.waitForSelector(selector, { state: 'attached', timeout: 8000 });
//     } catch (_) {
//         // Nếu không tìm thấy selector, bỏ qua
//     }
//
//     const base = await page.evaluate(() => location.href); // Lấy base URL của trang hiện tại
//
//     const raw = [];
//     const clean = [];
//
//     const imgs = await page.locator(selector).elementHandles(); // Lấy các phần tử ảnh
//
//     for (const img of imgs) {
//         const src = await img.evaluate((el) => {
//             return el.getAttribute('src') ||
//                 el.getAttribute('data-src') ||
//                 (() => {
//                     const ss = el.getAttribute('srcset');
//                     if (!ss) return '';
//                     return ss.split(',').pop()?.trim()?.split(' ')[0] || '';
//                 })() ||
//                 '';
//         });
//
//         if (src) {
//             const absSrc = new URL(src, base).toString();
//             raw.push(absSrc);
//             clean.push(stripQuery(absSrc));
//         }
//     }
//
//     // Loại bỏ các URL trùng lặp
//     return {
//         raw: [...new Set(raw)],
//         clean: [...new Set(clean)],
//     };
// }
// export async function extractImageUrls(page, selector) {
//     try {
//         await page.waitForSelector(selector, { state: 'attached', timeout: 8000 });
//     } catch (_) {
//         // Nếu không tìm thấy selector, bỏ qua
//     }
//
//     const base = await page.evaluate(() => location.href); // Lấy base URL của trang hiện tại
//
//     const raw = [];
//     const clean = [];
//
//     const imgs = await page.locator(selector).elementHandles(); // Lấy các phần tử ảnh
//
//     for (const img of imgs) {
//         const src = await img.evaluate((el) => {
//             // Kiểm tra thuộc tính 'src'
//             let src = el.getAttribute('src') || el.getAttribute('data-src') || '';
//
//             // Nếu không có 'src', kiểm tra 'srcset'
//             if (!src) {
//                 const ss = el.getAttribute('srcset');
//                 if (ss) {
//                     src = ss.split(',').pop()?.trim()?.split(' ')[0] || '';
//                 }
//             }
//
//             // Nếu không có 'src' hoặc 'srcset', kiểm tra trong 'style' (background-image)
//             if (!src) {
//                 const style = el.getAttribute('style');
//                 if (style) {
//                     const match = style.match(/background-image:\s*url\(["'](.*?)["']\)/);
//                     if (match && match[1]) {
//                         src = match[1];
//                     }
//                 }
//             }
//
//             if (src)
//
//             return src;
//         });
//
//         if (src) {
//             const absSrc = new URL(src, base).toString();
//             if (absSrc.includes('p16-oec-general-useast5')) {
//                 const match = absSrc.match(/\.com\/(.*)~/);
//
//                 if (match && match[1]) {
//                     const pathIdentifier = match[1]; // Kết quả: tos-useast5-i-omjb5zjo8w-tx/0f7ad264592e412badec4f484e9a48e7
//
//                     // Ghép thành link mới với đuôi origin-jpeg.jpeg
//                     const newUrl = `https://p16-oec-general-useast5.ttcdn-us.com/${pathIdentifier}~tplv-fhlh96nyum-origin-jpeg.jpeg`;
//
//                     raw.push(newUrl);
//                     clean.push(newUrl);
//                 } else {
//                     // Trường hợp không tìm thấy dấu ~, xử lý cắt query thủ công
//                     const basePart = absSrc.split('~')[0];
//                     const newUrl = `${basePart}~tplv-fhlh96nyum-origin-jpeg.jpeg`;
//
//                     raw.push(newUrl);
//                     clean.push(newUrl);
//                 }
//             } else if (absSrc.includes('etsystatic')) {
//                 const pattern = /il_\d+x[\dN]+/;
//
//                 if (pattern.test(absSrc)) {
//                     // Thay thế cụm tìm được bằng il_fullxfull
//                     const newUrl = absSrc.replace(pattern, 'il_fullxfull');
//
//                     raw.push(newUrl);
//                     clean.push(newUrl);
//                 } else {
//                     // Nếu không tìm thấy định dạng il_... thì giữ nguyên hoặc xử lý tùy ý
//                     raw.push(absSrc);
//                     clean.push(absSrc);
//                 }
//             } else if (absSrc.includes('aliexpress-media')) {
//                 const pattern = /(_\d+x\d+.*|_\.webp|_\.avif)$/;
//
//                 if (pattern.test(absSrc)) {
//                     // Xóa phần đuôi bằng cách thay thế bằng chuỗi rỗng
//                     const newUrl = absSrc.replace(pattern, '');
//
//                     raw.push(newUrl);
//                     clean.push(newUrl);
//                 } else {
//                     raw.push(absSrc);
//                     clean.push(absSrc);
//                 }
//             }  else {
//                 // Các link bình thường không phải kalocdn
//                 raw.push(absSrc);
//                 clean.push(stripQuery(absSrc));
//             }
//
//         }
//     }
//
//     // Loại bỏ các URL trùng lặp
//     return {
//         raw: [...new Set(raw)],
//         clean: [...new Set(clean)],
//     };
// }

export async function extractImageUrls(page, selector, inputChange = null, outputChange = null) {

    try {
        await page.waitForSelector(selector, { state: 'attached', timeout: 8000 });
    } catch (_) {}

    const base = await page.evaluate(() => location.href);

    const raw = [];
    const clean = [];

    const imgs = await page.locator(selector).elementHandles();

    for (const img of imgs) {

        const src = await img.evaluate((el) => {

            let url =
                el.getAttribute("src") ||
                el.getAttribute("data-src") ||
                el.getAttribute("data-original") ||
                el.getAttribute("href") ||
                "";

            // srcset
            if (!url) {
                const srcset = el.getAttribute("srcset") || el.getAttribute("data-srcset");
                if (srcset) {
                    url = srcset.split(",")[0].trim().split(" ")[0];
                }
            }

            // background-image
            if (!url) {
                const style = el.getAttribute("style");
                if (style) {
                    const match = style.match(/url\(["']?(.*?)["']?\)/);
                    if (match) {
                        url = match[1];
                    }
                }
            }

            return url || "";
        });

        if (!src) continue;

        let absSrc;

        try {
            absSrc = new URL(src, base).toString();
        } catch {
            continue;
        }

        // thêm https nếu thiếu
        if (absSrc.startsWith("//")) {
            absSrc = "https:" + absSrc;
        }

        // replace giống code Java
        if (inputChange && outputChange) {
            absSrc = absSrc.replace(new RegExp(inputChange, "g"), outputChange);
        }

        // ===== custom xử lý domain =====

        if (absSrc.includes('p16-oec-general-useast5')) {

            const match = absSrc.match(/\.com\/(.*)~/);

            if (match && match[1]) {

                const pathIdentifier = match[1];

                absSrc = `https://p16-oec-general-useast5.ttcdn-us.com/${pathIdentifier}~tplv-fhlh96nyum-origin-jpeg.jpeg`;

            } else {

                const basePart = absSrc.split('~')[0];
                absSrc = `${basePart}~tplv-fhlh96nyum-origin-jpeg.jpeg`;

            }

        } else if (absSrc.includes('etsystatic')) {

            const pattern = /il_\d+x[\dN]+/;

            if (pattern.test(absSrc)) {
                absSrc = absSrc.replace(pattern, 'il_fullxfull');
            }

        } else if (absSrc.includes('aliexpress-media')) {

            const pattern = /(_\d+x\d+.*|_\.webp|_\.avif)$/;

            if (pattern.test(absSrc)) {
                absSrc = absSrc.replace(pattern, '');
            }

        }

        raw.push(absSrc);
        clean.push(stripQuery(absSrc));

    }

    return {
        raw: [...new Set(raw)],
        clean: [...new Set(clean)]
    };
}


// Hàm xóa query string
function stripQuery(u) {
    try {
        const url = new URL(u);
        url.search = '';  // Loại bỏ query
        return url.toString();
    } catch {
        return u;
    }
}

//doc file txt

export async function readProfile(filePath) {
    try {
        // Dùng readFileSync thay vì readFile
        const data = fs.readFileSync(filePath, 'utf-8');
        return data.trim();
    } catch (err) {
        console.error("Lỗi đọc file:", err.message);
        return "Default";
    }
}

