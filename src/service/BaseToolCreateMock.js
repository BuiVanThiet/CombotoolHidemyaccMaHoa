// base.js
import fs from 'fs';
import path from 'path';

import { readdir, stat } from 'fs/promises';
import sharp from 'sharp'; // Thêm thư viện này ở đầu file
import axios from "axios";
import { chromium } from 'playwright'; // Thay puppeteer bằng playwright
import moment from 'moment-timezone';
import { PowerShell } from 'node-powershell';
// Trích xuất object promises từ fs
const fsPromises = fs.promises;

export async function checkPathType(input) {
    // Đợi dữ liệu nếu input là một Promise hoặc xử lý chuỗi trực tiếp
    const rawPath = await input;

    // Kiểm tra nếu rỗng hoặc không phải string
    if (!rawPath || typeof rawPath !== 'string') return 1;

    // Làm sạch chuỗi: lấy phần tử đầu tiên nếu là danh sách cách nhau bằng dấu phẩy
    const cleanPath = rawPath.split(',')[0].trim();

    // Regex kiểm tra đuôi file ảnh (không phân biệt hoa thường)
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)$/i;

    // Trả về 0 nếu là ảnh, 1 nếu là folder hoặc loại khác
    return imageExtensions.test(cleanPath) ? 0 : 1;
}

export async function getImagesFromLocalFolder(folderPath) {
    try {
        // Sử dụng fsPromises thay vì fs
        const files = await fsPromises.readdir(folderPath);

        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)$/i;

        return files
            .filter(file => imageExtensions.test(file))
            .map(file => path.join(folderPath, file));

    } catch (error) {
        console.error("Lỗi:", error.message);
        return [];
    }
}

export async function uploadImageByBase64(imagePath,token) {
    const url = "https://api.printify.com/v1/uploads/images.json";
    const tokenFilePath = "./Input/ToolTaoMockupPrintify/token.txt";

    try {
        // 1. Đọc token từ file (Dùng fs/promises đã import readdir, stat)
        // Lưu ý: vì bạn chưa import 'readFile', mình sẽ dùng fs.promises trực tiếp hoặc thêm vào import

        // 2. Mã hóa ảnh thành Base64 bằng Buffer
        const fileBuffer = await fs.promises.readFile(imagePath);
        const base64Image = fileBuffer.toString('base64');

        // 3. Lấy tên file thực tế từ đường dẫn
        const fileName = path.basename(imagePath);

        // 4. Cấu trúc body request
        const jsonBody = {
            file_name: fileName,
            contents: base64Image
        };

        // 5. Thực thi yêu cầu bằng Axios
        const response = await axios.post(url, jsonBody, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // 6. Kiểm tra phản hồi
        if (response.status === 200 || response.status === 201) {
            console.log(`[${moment().format('HH:mm:ss')}] File uploaded successfully: ${fileName}`);
            return response.data; // Trả về thông tin từ Printify (id, image url...)
        } else {
            console.log(`Upload failed. Status code: ${response.status}`);
        }

    } catch (error) {
        console.error(`[${moment().format('HH:mm:ss')}] Error uploading image:`, error.response?.data || error.message);
        throw error;
    }
}

