# METHAFLOW — หน้าตัวอย่างระบบ (Demo Mockup)

หน้า mockup 5 โมดูล แสดงหน้าตาระบบเงินเดือน METHAFLOW ข้อมูลเป็นตัวอย่างสมมติทั้งหมด

## ไฟล์
- index.html — ภาพรวมองค์กร (แดชบอร์ด)
- timeclock.html — ลงเวลา GPS
- approvals.html — คำขอ / อนุมัติ
- payroll.html — คำนวณเงินเดือน
- ewf.html — กองทุนสงเคราะห์ลูกจ้าง
- assets/app.css — สไตล์ร่วมทุกหน้า
- vercel.json — security headers (CSP, HSTS ฯลฯ)

## ขึ้น Vercel
วางทั้งโฟลเดอร์เป็น static site ได้ทันที (ไม่มี build step, ไม่มี dependency)
หรือลิงก์จากปุ่ม "ดูแพลตฟอร์ม" ในหน้าเว็บหลัก ให้ชี้มาที่ index.html ของโฟลเดอร์นี้

## ความปลอดภัย
- ไม่มี inline <script> ใด ๆ — สอดคล้อง CSP (script-src 'self')
- CSS แยกไฟล์ · ฟอนต์โหลดจาก Google Fonts ตาม allowlist ใน CSP
- ทุกหน้า noindex กันติด search engine
