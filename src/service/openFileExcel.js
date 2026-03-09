import xlsx from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Khởi tạo __dirname trong môi trường ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Đọc file Excel bất kỳ và thay các ô trống bằng "notData"
 * @param {string} fileName Tên file Excel trong thư mục /input
 * @returns {Array<Object>} Danh sách dòng dữ liệu dạng object
 */

export function processCategoriesToArray(categories){
    if (!categories) return [];  // Nếu không có dữ liệu, trả về mảng trống

    // Nếu có dấu newline (\n), tách theo newline
    if (categories.includes("\n")) {
        return categories.split("\n").map(item => item.trim());  // Dọn dẹp khoảng trắng thừa
    }

    // Nếu có dấu phẩy (`,`), tách theo phẩy
    if (categories.includes(",")) {
        return categories.split(",").map(item => item.trim());  // Dọn dẹp khoảng trắng thừa
    }

    // Nếu không có dấu phân tách, trả về một mảng chứa một phần tử duy nhất
    return [categories.trim()];
}
export function readExcelFile(fileName) {
    const filePath = path.resolve(__dirname, "../../input", fileName);
    console.log("📄 Đang đọc file:", filePath);

    if (!fs.existsSync(filePath)) {
        console.error("❌ File không tồn tại:", filePath);
        return [];
    }

    try {
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = xlsx.read(fileBuffer, { type: "buffer" });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Đọc dữ liệu và giữ cả ô trống (defval: "") rồi thay bằng "notData"
        const rawData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

        // Thay giá trị trống thành "notData"
        const data = rawData.map((row) => {
            const cleanRow = {};
            for (const key in row) {
                const value = row[key];
                cleanRow[key] = value === "" ? "notData" : value;
            }
            return cleanRow;
        });

        console.log(`✅ Đã đọc ${data.length} dòng từ file ${fileName}`);
        return data;
    } catch (error) {
        console.error("⚠️ Lỗi khi đọc Excel:", error.message);
        return [];
    }
}
