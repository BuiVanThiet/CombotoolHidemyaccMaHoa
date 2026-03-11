import fs from 'fs';
import path from 'path';
import Hidemyacc from "./hidemyacc.js";

import sharp from 'sharp'; // Thêm thư viện này ở đầu file
import axios from "axios";
import { chromium } from 'playwright'; // Thay puppeteer bằng playwright

// Hàm delay giúp chờ một khoảng thời gian
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function openPage(context, url, options = {}) {
    const page = await context.newPage(); // Tạo một page mới trong context
    await page.goto(url, options);  // Mở trang và chờ tải xong
    return page;  // Trả về page hợp lệ để có thể thao tác với page.evaluate()
}

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
export const delayTime = (ms) => delay(ms);

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

function stripQuery(u) {
    try {
        const url = new URL(u);
        url.search = '';  // Loại bỏ query
        return url.toString();
    } catch {
        return u;
    }
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
// Hàm đăng nhập vào tài khoản và khởi tạo trình duyệt
export async function loginToProfile(hide, profileId) {
    let start = null;
    while (!start) {
        start = await hide.start(
            profileId,
            JSON.stringify({

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
export const hide = new Hidemyacc();
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
