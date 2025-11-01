import * as path from "path";

export function generateFileName(
  invoiceDate: string,
  supplierName: string,
  totalTtc: string,
  originalFilename: string
): string {
  const date = new Date(invoiceDate);
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const yymmdd = `${year}${month}${day}`;

  const cleanSupplierName = supplierName
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/\s+/g, "");

  const amountInt = Math.floor(parseFloat(totalTtc.replace(",", "."))).toString();

  const extension = path.extname(originalFilename);

  return `${yymmdd}_${cleanSupplierName}_${amountInt}${extension}`;
}
