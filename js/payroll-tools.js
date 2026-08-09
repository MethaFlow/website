/* METHAFLOW — free payroll calculators UI.
   All computation runs locally via js/payroll-engine.js (window.MF).
   No data is transmitted or stored. */
(function () {
  "use strict";
  var MF = window.MF;

  /* ---- default statutory rules (Thailand, in force 2026) ---- */
  var R = {
    ot: [{ effectiveDate: "1998-08-20", workdayOtMultiplier: "1.5", holidayWorkMultiplier: "1", holidayOtMultiplier: "3" }],
    leave: [{ effectiveDate: "2019-05-05", paidSickDaysPerYear: 30, paidBusinessDaysPerYear: 3, paidAnnualDaysPerYear: 6, paidMaternityDaysPerYear: 45, paidMilitaryDaysPerYear: 60 }],
    severance: [{
      effectiveDate: "2019-05-05",
      entitledReasons: ["EMPLOYER_TERMINATION", "RETIREMENT", "END_OF_CONTRACT"],
      brackets: [
        { minServiceDays: 120, maxServiceDays: 364, payDays: 30 },
        { minServiceDays: 365, maxServiceDays: 1094, payDays: 90 },
        { minServiceDays: 1095, maxServiceDays: 2189, payDays: 180 },
        { minServiceDays: 2190, maxServiceDays: 3649, payDays: 240 },
        { minServiceDays: 3650, maxServiceDays: 7299, payDays: 300 },
        { minServiceDays: 7300, maxServiceDays: null, payDays: 400 }
      ]
    }],
    tax: [{
      effectiveDate: "2026-01-01", expenseRate: "0.5", expenseCap: "100000",
      personalAllowance: "60000", spouseAllowance: "60000", childAllowance: "30000",
      additionalChildAllowance: "60000", ssoDeductionCap: "10500",
      pvdDeductibleWageRate: "0.15", pvdDeductibleCap: "500000",
      brackets: [
        { over: "0", upTo: "150000", rate: "0" }, { over: "150000", upTo: "300000", rate: "0.05" },
        { over: "300000", upTo: "500000", rate: "0.1" }, { over: "500000", upTo: "750000", rate: "0.15" },
        { over: "750000", upTo: "1000000", rate: "0.2" }, { over: "1000000", upTo: "2000000", rate: "0.25" },
        { over: "2000000", upTo: "5000000", rate: "0.3" }, { over: "5000000", upTo: null, rate: "0.35" }
      ]
    }]
  };

  function baht(n) { return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " บาท"; }
  function plain(n) { return Number(n).toLocaleString("th-TH"); }
  function dates(str) { return (String(str || "").match(/\d{4}-\d{2}-\d{2}/g) || []); }
  function offDays(v) { return v === "sat-sun" ? [0, 6] : v === "sun" ? [0] : []; }

  var OFF_SEL = { k: "off", label: "วันหยุดประจำสัปดาห์", type: "sel", def: "sat-sun", opts: [["sat-sun", "เสาร์–อาทิตย์"], ["sun", "อาทิตย์วันเดียว"], ["none", "ไม่มี"]] };

  var CATS = [
    ["slip", "หมวด 0 · สลิปเงินเดือนทั้งงวด", "รวมทุกโมดูลเป็นสลิปเดียว — รายได้ เงินหักตามกฎหมาย ภาษี และต้นทุนนายจ้าง (ลอจิกเดียวกับเทสสลิปรวมของระบบ)"],
    ["income", "หมวด 1 · รายได้และค่าตอบแทน", "ฐานค่าจ้าง ค่าล่วงเวลา ค่ากะ และคอมมิชชัน"],
    ["deduct", "หมวด 2 · เงินหักตามกฎหมาย", "ประกันสังคม (เพดานใหม่ 17,500) กองทุนสงเคราะห์ลูกจ้าง กองทุนสำรองเลี้ยงชีพ ภาษี กยศ และอายัดเงินเดือน"],
    ["time", "หมวด 3 · เวลาทำงานและการลา", "วันทำงาน สิทธิการลา มาสาย และขาดงาน"],
    ["exit", "หมวด 4 · เข้างานใหม่และพ้นสภาพ", "คำนวณตามส่วนงวดแรก เงินได้งวดสุดท้าย ค่าชดเชย และเงินย้อนหลัง"],
    ["check", "หมวด 5 · ตรวจสอบความถูกต้องและกรณีพิเศษ", "ค่าจ้างขั้นต่ำ วันหยุดตามประเพณี และการกันยอดติดลบ"]
  ];

  var TOOLS = [

    { id: "payslip", cat: "slip", title: "คำนวณสลิปเงินเดือนทั้งงวด", ref: "เงินเดือน + OT + เงินเพิ่ม → สปส. (ปัดเป็นบาท) · กองทุนสงเคราะห์ฯ · PVD · ภาษีเสมือนทั้งปี → สุทธิ",
      fields: [
        { k: "salary", label: "เงินเดือน (บาท)", type: "num", def: 30000 },
        { k: "period", label: "งวดเดือน (กองทุนสงเคราะห์ฯ เริ่ม ต.ค. 2569)", type: "month", def: "2026-10" },
        { k: "ot", label: "OT วันทำงาน (ชั่วโมง/งวด)", type: "num", def: 0 },
        { k: "alwTax", label: "เงินเพิ่มที่เสียภาษี เช่น ค่าตำแหน่ง (บาท/งวด)", type: "num", def: 0 },
        { k: "alwFree", label: "เงินเพิ่มที่ยกเว้นภาษี เช่น ค่าเดินทางตามจริง (บาท/งวด)", type: "num", def: 0 },
        { k: "pvd", label: "กองทุนสำรองเลี้ยงชีพ", type: "sel", def: "no", opts: [["no", "ไม่เป็นสมาชิก"], ["yes", "เป็นสมาชิก"]] },
        { k: "pvdRate", label: "อัตราสะสม PVD (% — 2–15%)", type: "num", def: 5 },
        { k: "ewf", label: "หักกองทุนสงเคราะห์ลูกจ้าง (ตามสถานะขึ้นทะเบียนของบริษัท)", type: "sel", def: "yes", opts: [["yes", "หักตามงวด"], ["no", "ไม่หัก (เช่น ได้รับยกเว้น)"]] },
        { k: "loan", label: "เงินหักอื่น เช่น เงินกู้สวัสดิการ (บาท/งวด)", type: "num", def: 0 }
      ],
      run: function (v) {
        var res = MF.computePayslip({ payslip: {
          period: { startDate: v.period + "-01", endDate: v.period + "-28", paymentDate: v.period + "-28", periodsPerYear: 12, remainingPeriods: 12 },
          salaryProfile: { payType: "MONTHLY", monthlySalary: v.salary, dailyRate: 0, hourlyRate: 0, workingDaysPerMonth: 22, workingHoursPerDay: 8, dailyRateBasis: "CALENDAR_30" },
          worked: { days: 22, hours: 176 },
          prorate: null,
          attendanceRecords: [], attendancePolicy: { graceMinutes: 15, deductLateByMinute: true, breakMinutes: 60 },
          leaveTaken: [],
          overtimeEntries: v.ot > 0 ? [{ workDate: v.period + "-05", otType: "WORKDAY_OT", hours: v.ot }] : [],
          shiftAssignments: [],
          allowances: (v.alwTax > 0 || v.alwFree > 0) ? [
            { code: "ALW", name: "เงินเพิ่มเสียภาษี", amount: v.alwTax, taxable: true, prorated: false },
            { code: "TRV", name: "เงินเพิ่มยกเว้นภาษี", amount: v.alwFree, taxable: false, prorated: false }
          ] : [],
          allowanceProrate: { method: "CALENDAR", eligibleUnits: 1, totalUnits: 1 },
          bonuses: [], commission: null,
          voluntaryDeductions: v.loan > 0 ? [{ code: "LOAN", name: "เงินหักอื่น", amount: v.loan, priority: 1 }] : [],
          pvdPlan: v.pvd === "yes" ? { name: "PLAN", employeeRate: v.pvdRate / 100, employerRate: v.pvdRate / 100 } : null,
          ssoInsured: true,
          ewfRegistered: v.ewf === "yes",
          taxProfile: { maritalStatus: "SINGLE", children: 0, additionalChildren: 0, otherAllowances: 0 }
        } });
        if (res.error) return { error: "อัตรา PVD ต้องอยู่ระหว่าง 2–15% ตามกฎหมายกองทุนสำรองเลี้ยงชีพ" };
        var rows = [
          ["รายได้รวม", baht(res.gross)],
          ["ประกันสังคม ม.33", "− " + baht(res.sso)],
          ["กองทุนสงเคราะห์ลูกจ้าง", res.ewf > 0 ? "− " + baht(res.ewf) : "ไม่มีในงวดนี้"],
          ["กองทุนสำรองเลี้ยงชีพ", res.pvd > 0 ? "− " + baht(res.pvd) : "—"],
          ["ภาษีหัก ณ ที่จ่าย (ประมาณการ)", "− " + baht(res.tax)]
        ];
        if (res.voluntary > 0) rows.push(["เงินหักอื่น", "− " + baht(res.voluntary)]);
        rows.push(["เงินหักรวม", "− " + baht(res.totalDeduction)]);
        rows.push(["รายรับสุทธิ", baht(res.net), 1]);
        rows.push(["นายจ้างสมทบเพิ่ม (สปส.+กองทุนฯ)", baht(res.employerCost)]);
        return rows;
      } },

    { id: "salary", cat: "income", title: "ฐานค่าจ้าง — เทียบรายเดือน / รายวัน / รายชั่วโมง", ref: "ฐานคำนวณเดียวกับสลิปจริง",
      fields: [
        { k: "payType", label: "ประเภทการจ้าง", type: "sel", def: "MONTHLY", opts: [["MONTHLY", "รายเดือน"], ["DAILY", "รายวัน"], ["HOURLY", "รายชั่วโมง"]] },
        { k: "amount", label: "ค่าจ้าง (ตามประเภท: บาท/เดือน · บาท/วัน · บาท/ชั่วโมง)", type: "num", def: 30000 },
        { k: "basis", label: "ฐานหารรายวัน (สำหรับรายเดือน)", type: "sel", def: "CALENDAR_30", opts: [["CALENDAR_30", "หาร 30 วันตามปฏิทิน"], ["WORKING_DAYS", "หารตามวันทำงาน/เดือน"]] },
        { k: "wdpm", label: "วันทำงานต่อเดือน", type: "num", def: 22 },
        { k: "hpd", label: "ชั่วโมงทำงานต่อวัน", type: "num", def: 8 },
        { k: "workedDays", label: "วันที่ทำงานจริงในงวด (รายวัน)", type: "num", def: 22 },
        { k: "workedHours", label: "ชั่วโมงที่ทำงานจริงในงวด (รายชั่วโมง)", type: "num", def: 176 }
      ],
      run: function (v) {
        var res = MF.salary({
          profile: {
            payType: v.payType,
            monthlySalary: v.payType === "MONTHLY" ? v.amount : 0,
            dailyRate: v.payType === "DAILY" ? v.amount : 0,
            hourlyRate: v.payType === "HOURLY" ? v.amount : 0,
            workingDaysPerMonth: v.wdpm, workingHoursPerDay: v.hpd, dailyRateBasis: v.basis
          },
          worked: { days: v.workedDays, hours: v.workedHours }
        });
        return [["เทียบรายเดือน", baht(res.monthly)], ["เทียบรายวัน", baht(res.daily)], ["เทียบรายชั่วโมง", baht(res.hourly)], ["ค่าจ้างงวดนี้", baht(res.baseEarning), 1]];
      } },

    { id: "ot", cat: "income", title: "ค่าล่วงเวลา (OT)", ref: "พ.ร.บ. คุ้มครองแรงงาน ม.61–63",
      fields: [
        { k: "rate", label: "ค่าจ้างรายชั่วโมง (บาท)", type: "num", def: 125 },
        { k: "type", label: "ประเภท", type: "sel", def: "WORKDAY_OT", opts: [["WORKDAY_OT", "OT วันทำงาน × 1.5"], ["HOLIDAY_WORK", "ทำงานวันหยุด × 1 (รายเดือน)"], ["HOLIDAY_OT", "OT ในวันหยุด × 3"]] },
        { k: "hours", label: "จำนวนชั่วโมง", type: "num", def: 3 }
      ],
      run: function (v) {
        var res = MF.overtime({ hourlyRate: v.rate, entries: [{ workDate: "2026-01-05", otType: v.type, hours: v.hours }], rules: R.ot });
        return [["ชั่วโมงรวม", plain(res.totalHours) + " ชม."], ["ยอดค่าล่วงเวลา", baht(res.totalAmount), 1]];
      } },

    { id: "shift", cat: "income", title: "เงินเพิ่มค่ากะ", ref: "ตามข้อบังคับการทำงานของบริษัท",
      fields: [
        { k: "rate", label: "ค่าจ้างรายชั่วโมง (บาท)", type: "num", def: 125 },
        { k: "prem", label: "อัตราเพิ่ม (% ของค่าจ้างรายชั่วโมง)", type: "num", def: 20 },
        { k: "hours", label: "ชั่วโมงเข้ากะ", type: "num", def: 8 }
      ],
      run: function (v) {
        var res = MF.shift({ hourlyRate: v.rate, assignments: [{ workDate: "2026-01-05", shiftName: "SHIFT", premiumRate: v.prem / 100, hours: v.hours }] });
        return [["เงินเพิ่มค่ากะ", baht(res.totalAmount), 1]];
      } },

    { id: "comm", cat: "income", title: "คอมมิชชัน — คงที่ / ขั้นบันได", ref: "ขั้นบันไดคิดเฉพาะส่วนที่อยู่ในแต่ละชั้น",
      fields: [
        { k: "sales", label: "ยอดขาย (บาท)", type: "num", def: 600000 },
        { k: "method", label: "วิธีคิด", type: "sel", def: "PROGRESSIVE", opts: [["FLAT", "อัตราคงที่"], ["PROGRESSIVE", "ขั้นบันได"]] },
        { k: "flat", label: "อัตราคงที่ (%)", type: "num", def: 3 },
        { k: "t1", label: "ชั้น 1: ตั้งแต่ 0 บาท — อัตรา (%)", type: "num", def: 1 },
        { k: "f2", label: "ชั้น 2: ตั้งแต่ยอด (บาท)", type: "num", def: 200000 },
        { k: "t2", label: "ชั้น 2: อัตรา (%)", type: "num", def: 2 },
        { k: "f3", label: "ชั้น 3: ตั้งแต่ยอด (บาท)", type: "num", def: 500000 },
        { k: "t3", label: "ชั้น 3: อัตรา (%)", type: "num", def: 3 }
      ],
      run: function (v) {
        var res = MF.commission({
          salesAmount: v.sales, method: v.method, flatRate: v.flat / 100,
          tiers: [{ fromSales: 0, rate: v.t1 / 100 }, { fromSales: v.f2, rate: v.t2 / 100 }, { fromSales: v.f3, rate: v.t3 / 100 }]
        });
        return [["คอมมิชชัน", baht(res.amount), 1]];
      } },

    { id: "allowance", cat: "income", title: "เงินเพิ่ม/สวัสดิการ — แยกภาษีและหารตามสัดส่วน", ref: "แยกยอดเสียภาษี/ยกเว้นภาษีเพื่อส่งต่อการคำนวณ ภ.ง.ด.1",
      fields: [
        { k: "taxAmt", label: "เงินเพิ่มที่เสียภาษี เช่น ค่าตำแหน่ง (บาท/งวด)", type: "num", def: 3000 },
        { k: "freeAmt", label: "เงินเพิ่มที่ยกเว้นภาษี เช่น ค่าเดินทางตามจริง (บาท/งวด)", type: "num", def: 1000 },
        { k: "prorate", label: "หารตามสัดส่วนวันในงวด (พนักงานเข้า/ออกระหว่างงวด)", type: "sel", def: "no", opts: [["no", "จ่ายเต็มงวด"], ["yes", "หารตามสัดส่วน"]] },
        { k: "eligible", label: "วันที่มีสิทธิในงวด (ถ้าหารตามสัดส่วน)", type: "num", def: 15 },
        { k: "total", label: "วันทั้งงวด", type: "num", def: 30 }
      ],
      run: function (v) {
        var pro = v.prorate === "yes";
        var res = MF.allowance({
          lines: [
            { code: "TAXABLE", name: "เสียภาษี", amount: v.taxAmt, taxable: true, prorated: pro },
            { code: "EXEMPT", name: "ยกเว้นภาษี", amount: v.freeAmt, taxable: false, prorated: pro }
          ],
          context: { method: "CALENDAR", eligibleUnits: pro ? v.eligible : 1, totalUnits: pro ? v.total : 1 }
        });
        return [["ยอดที่เสียภาษี", baht(res.taxableTotal)], ["ยอดที่ยกเว้นภาษี", baht(res.nonTaxableTotal)], ["เงินเพิ่มรวมงวดนี้", baht(res.total), 1]];
      } },

    { id: "bonus", cat: "income", title: "โบนัส — เลือกวิธีคิดภาษี", ref: "หักภาษีในงวดที่จ่าย หรือเฉลี่ยตลอดงวดที่เหลือของปี",
      fields: [
        { k: "a1", label: "โบนัสก้อนที่ 1 (บาท)", type: "num", def: 50000 },
        { k: "m1", label: "วิธีคิดภาษีก้อนที่ 1", type: "sel", def: "CURRENT_PERIOD", opts: [["CURRENT_PERIOD", "หักภาษีในงวดที่จ่าย"], ["SPREAD_ANNUAL", "เฉลี่ยตลอดงวดที่เหลือ"]] },
        { k: "a2", label: "โบนัสก้อนที่ 2 (เว้น 0 หากไม่มี)", type: "num", def: 0 },
        { k: "m2", label: "วิธีคิดภาษีก้อนที่ 2", type: "sel", def: "SPREAD_ANNUAL", opts: [["CURRENT_PERIOD", "หักภาษีในงวดที่จ่าย"], ["SPREAD_ANNUAL", "เฉลี่ยตลอดงวดที่เหลือ"]] }
      ],
      run: function (v) {
        var entries = [{ payDate: "2026-01-31", amount: v.a1, taxMode: v.m1 }];
        if (v.a2) entries.push({ payDate: "2026-01-31", amount: v.a2, taxMode: v.m2 });
        var res = MF.bonus({ entries: entries });
        return [["ยอดโบนัสจ่ายจริง", baht(res.payout), 1], ["ฐานภาษีที่หักในงวดนี้", baht(res.taxedInCurrentPeriod)], ["ฐานภาษีที่เฉลี่ยงวดถัดไป", baht(res.spreadOverRemainingPeriods)]];
      } },

    { id: "statutory", cat: "deduct", title: "เงินหักประจำงวด — ประกันสังคม + กองทุนสงเคราะห์ฯ + PVD", ref: "เพดาน สปส. 17,500 (ม.ค. 2569) · กองทุนสงเคราะห์ฯ 0.25% (เริ่ม ต.ค. 2569)",
      fields: [
        { k: "wage", label: "ค่าจ้างต่อเดือน (บาท)", type: "num", def: 30000 },
        { k: "period", label: "งวดเดือน", type: "month", def: "2026-10" },
        { k: "pvdMember", label: "เป็นสมาชิกกองทุนสำรองเลี้ยงชีพหรือไม่", type: "sel", def: "no", opts: [["no", "ไม่เป็น"], ["yes", "เป็นสมาชิก (ยกเว้นกองทุนสงเคราะห์ฯ)"]] },
        { k: "pvdRate", label: "อัตราสะสม PVD (% — กฎหมายกำหนด 2–15%)", type: "num", def: 5 }
      ],
      run: function (v) {
        var on = (v.period || "2026-10") + "-01";
        var sso = MF.sso(v.wage, on);
        var ewf = MF.ewf(v.wage, on, v.pvdMember === "yes");
        var rows = [["ประกันสังคม ม.33 (5%)", "− " + baht(sso)]];
        rows.push(["กองทุนสงเคราะห์ลูกจ้าง", ewf > 0 ? "− " + baht(ewf) : (v.pvdMember === "yes" ? "ยกเว้น (สมาชิก PVD)" : "ยังไม่เริ่มเก็บในงวดนี้")]);
        var pvdAmt = 0;
        if (v.pvdMember === "yes") {
          var p = MF.pvd({ wage: v.wage, plan: { name: "PLAN", employeeRate: v.pvdRate / 100, employerRate: v.pvdRate / 100 }, rule: { minRate: 0.02, maxRate: 0.15 } });
          if (p.error) return { error: "อัตรา PVD ต้องอยู่ระหว่าง 2–15% ตามกฎหมายกองทุนสำรองเลี้ยงชีพ" };
          pvdAmt = p.employee;
          rows.push(["กองทุนสำรองเลี้ยงชีพ (" + v.pvdRate + "%)", "− " + baht(pvdAmt)]);
        }
        rows.push(["รวมเงินหักฝั่งลูกจ้าง", "− " + baht(sso + ewf + pvdAmt), 1]);
        rows.push(["นายจ้างสมทบ (เท่ากันทุกรายการ)", baht(sso + ewf + pvdAmt)]);
        return rows;
      } },

    { id: "wht", cat: "deduct", title: "ภาษีหัก ณ ที่จ่ายรายเดือน (ประมาณการ)", ref: "เสมือนทั้งปี · ค่าใช้จ่าย 50% ไม่เกิน 100,000 · ลดหย่อนส่วนตัว 60,000 · รวม สปส. อัตโนมัติ",
      fields: [
        { k: "income", label: "เงินได้ต่อเดือน (บาท)", type: "num", def: 50000 },
        { k: "extra", label: "ค่าลดหย่อนอื่นรวมทั้งปี (คู่สมรส บุตร ประกัน ฯลฯ)", type: "num", def: 0 }
      ],
      run: function (v) {
        var annualSso = MF.sso(v.income, "2026-01-01") * 12;
        var wht = MF.monthlyWht(v.income, { annualSso: annualSso, extraAllowances: v.extra });
        return [["ประกันสังคมทั้งปี (หักลดหย่อน)", baht(annualSso)], ["ภาษีโดยประมาณต่อเดือน", baht(wht), 1]];
      } },

    { id: "extdeduct", cat: "deduct", title: "กยศ + อายัดเงินเดือน (กรมบังคับคดี)", ref: "กยศ หักตามยอดแจ้ง e-PaySLF (ม.51) · อายัดได้เฉพาะส่วนที่เหลือให้ลูกหนี้ไม่น้อยกว่า 20,000 บาท (ป.วิ.แพ่ง ม.302)",
      fields: [
        { k: "net", label: "เงินได้หลังหักภาษี/ประกันสังคม/กองทุนแล้ว (บาท/เดือน)", type: "num", def: 28000 },
        { k: "slf", label: "ยอดหัก กยศ ตามที่ระบบ e-PaySLF แจ้ง (บาท)", type: "num", def: 1500 },
        { k: "garnish", label: "ยอดอายัดตามหมายกรมบังคับคดี (บาท)", type: "num", def: 0 }
      ],
      run: function (v) {
        var res = MF.externalDeductions({ netAfterStatutory: v.net, slfAmount: v.slf, garnishments: v.garnish > 0 ? [{ amount: v.garnish }] : [] });
        var rows = [["หัก กยศ นำส่งสรรพากร (รอบ ภ.ง.ด.1)", "− " + baht(res.slfDeducted)]];
        if (res.slfCarryOver > 0) rows.push(["กยศ ส่วนที่เงินได้ไม่พอหัก", baht(res.slfCarryOver) + " (แจ้งพนักงานชำระเอง)"]);
        rows.push(["หักอายัดนำส่งกรมบังคับคดี", res.garnished > 0 ? "− " + baht(res.garnished) : "หักไม่ได้ในงวดนี้"]);
        if (res.garnishCarryOver > 0) rows.push(["ยอดอายัดที่หักไม่ได้", baht(res.garnishCarryOver) + " (รายงานกลับตามหมาย)"]);
        rows.push(["เงินคงเหลือถึงมือพนักงาน", baht(res.remainingNet), 1]);
        rows.push(["เกณฑ์คุ้มครองลูกหนี้", "เหลือไม่น้อยกว่า " + baht(res.protectedFloor) + "/เดือน"]);
        return rows;
      } },

    { id: "yeartax", cat: "deduct", title: "ภาษีเงินได้บุคคลธรรมดาทั้งปี (ปีภาษี 2569)", ref: "ประมวลรัษฎากร ม.40(1) · ขั้นบันได 8 ขั้น",
      fields: [
        { k: "income", label: "เงินได้ทั้งปี (บาท)", type: "num", def: 960000 },
        { k: "marital", label: "สถานภาพ", type: "sel", def: "SINGLE", opts: [["SINGLE", "โสด / คู่สมรสมีเงินได้"], ["MARRIED_SPOUSE_NO_INCOME", "คู่สมรสไม่มีเงินได้ (+60,000)"]] },
        { k: "children", label: "จำนวนบุตร (คนละ 30,000)", type: "num", def: 0 },
        { k: "sso", label: "เงินสมทบประกันสังคมทั้งปี (บาท)", type: "num", def: 10500 },
        { k: "pvd", label: "เงินสะสม PVD ทั้งปี (บาท)", type: "num", def: 0 },
        { k: "other", label: "ค่าลดหย่อนอื่น (บาท)", type: "num", def: 0 },
        { k: "withheld", label: "ภาษีที่ถูกหักไว้แล้วระหว่างปี (บาท)", type: "num", def: 0 }
      ],
      run: function (v) {
        var res = MF.yearlyTax({
          annualIncome: v.income, annualSso: v.sso, annualPvd: v.pvd, withheldToDate: v.withheld,
          profile: { maritalStatus: v.marital, children: v.children, additionalChildren: 0, otherAllowances: v.other },
          on: "2026-12-31", rules: R.tax
        });
        return [["เงินได้สุทธิ", baht(res.taxableIncome)], ["ภาษีทั้งปี", baht(res.annualTax), 1],
          ["ต้องชำระเพิ่ม", baht(res.balanceDue)], ["ได้คืน", baht(res.refundable)]];
      } },

    { id: "workday", cat: "time", title: "นับวันทำงานในช่วง", ref: "แยกวันหยุดประจำสัปดาห์และวันหยุดตามประเพณี ไม่นับซ้ำ",
      fields: [
        { k: "start", label: "ตั้งแต่วันที่", type: "date", def: "2026-08-01" },
        { k: "end", label: "ถึงวันที่", type: "date", def: "2026-08-31" },
        OFF_SEL,
        { k: "hols", label: "วันหยุดตามประเพณีในช่วง (YYYY-MM-DD คั่นด้วยเว้นวรรค)", type: "text", def: "2026-08-12" }
      ],
      run: function (v) {
        var res = MF.workingDay({ startDate: v.start, endDate: v.end, weeklyOffDays: offDays(v.off), holidays: dates(v.hols) });
        return [["วันตามปฏิทิน", plain(res.calendarDays) + " วัน"], ["วันหยุดประจำสัปดาห์", plain(res.weeklyOffDays) + " วัน"],
          ["วันหยุดตามประเพณี", plain(res.holidayDays) + " วัน"], ["วันทำงาน", plain(res.workingDays) + " วัน", 1]];
      } },

    { id: "leave", cat: "time", title: "การลาและเงินหักส่วนที่เกินสิทธิ", ref: "ลาป่วยจ่าย 30 วัน/ปี (ม.32,57) · ลากิจ 3 · พักร้อน 6 · คลอด 45 · รับราชการทหาร 60",
      fields: [
        { k: "rate", label: "ค่าจ้างรายวัน (บาท)", type: "num", def: 1000 },
        { k: "cat", label: "ประเภทการลา", type: "sel", def: "SICK", opts: [["SICK", "ลาป่วย (30 วัน/ปี)"], ["BUSINESS", "ลากิจ (3 วัน/ปี)"], ["ANNUAL", "พักร้อน (6 วัน/ปี)"], ["MATERNITY", "ลาคลอด (จ่าย 45 วัน)"], ["MILITARY", "รับราชการทหาร (60 วัน)"], ["UNPAID", "ลาไม่รับค่าจ้าง"]] },
        { k: "days", label: "จำนวนวันลาครั้งนี้", type: "num", def: 5 },
        { k: "used", label: "วันลาแบบจ่ายที่ใช้ไปแล้วปีนี้", type: "num", def: 0 }
      ],
      run: function (v) {
        var res = MF.leave({ dailyRate: v.rate, taken: [{ category: v.cat, startDate: "2026-06-01", days: v.days, paidDaysUsedBefore: v.used }], rules: R.leave });
        return [["วันลาแบบได้ค่าจ้าง", plain(res.paidDays) + " วัน"], ["วันลาแบบไม่ได้ค่าจ้าง", plain(res.unpaidDays) + " วัน"], ["ยอดหักจากค่าจ้าง", "− " + baht(res.totalDeduction), 1]];
      } },

    { id: "late", cat: "time", title: "มาสายและขาดงาน", ref: "หักสายเป็นนาทีหลังพ้นช่วงผ่อนผัน · ขาดงานหักเต็มวัน",
      fields: [
        { k: "hourly", label: "ค่าจ้างรายชั่วโมง (บาท)", type: "num", def: 125 },
        { k: "daily", label: "ค่าจ้างรายวัน (บาท)", type: "num", def: 1000 },
        { k: "late", label: "มาสาย (นาที)", type: "num", def: 30 },
        { k: "grace", label: "ช่วงผ่อนผัน (นาที)", type: "num", def: 15 },
        { k: "absent", label: "ขาดงาน (วัน)", type: "num", def: 0 }
      ],
      run: function (v) {
        var records = [{ workDate: "2026-06-01", scheduledStartMinutes: 480, scheduledEndMinutes: 1020, checkInMinutes: 480 + v.late, checkOutMinutes: 1020 }];
        for (var i = 0; i < v.absent; i++) records.push({ workDate: "2026-06-02", scheduledStartMinutes: 480, scheduledEndMinutes: 1020, checkInMinutes: null, checkOutMinutes: null });
        var res = MF.attendance({ dailyRate: v.daily, hourlyRate: v.hourly, records: records, policy: { graceMinutes: v.grace, deductLateByMinute: true, breakMinutes: 60 } });
        return [["นาทีสายที่ถูกหัก", plain(res.totalLateMinutes) + " นาที"], ["วันขาดงาน", plain(res.absentDays) + " วัน"], ["ยอดหักรวม", "− " + baht(res.totalDeduction), 1]];
      } },

    { id: "newhire", cat: "exit", title: "เงินเดือนงวดแรก — เข้างานระหว่างงวด", ref: "เลือกคิดตามวันปฏิทินหรือวันทำงานจริง",
      fields: [
        { k: "salary", label: "เงินเดือน (บาท)", type: "num", def: 30000 },
        { k: "hire", label: "วันเริ่มงาน", type: "date", def: "2026-08-16" },
        { k: "ps", label: "งวดเริ่ม", type: "date", def: "2026-08-01" },
        { k: "pe", label: "งวดสิ้นสุด", type: "date", def: "2026-08-31" },
        { k: "method", label: "วิธีคิด", type: "sel", def: "CALENDAR", opts: [["CALENDAR", "ตามวันปฏิทิน"], ["WORKING_DAY", "ตามวันทำงานจริง"]] },
        OFF_SEL,
        { k: "hols", label: "วันหยุดตามประเพณีในงวด (ถ้าคิดตามวันทำงาน)", type: "text", def: "2026-08-12" }
      ],
      run: function (v) {
        var res = MF.newHire({ hireDate: v.hire, periodStart: v.ps, periodEnd: v.pe, monthlySalary: v.salary, method: v.method, weeklyOffDays: offDays(v.off), holidays: dates(v.hols) });
        return [["หน่วยที่มีสิทธิ / ทั้งงวด", plain(res.eligibleUnits) + " / " + plain(res.totalUnits)], ["เงินเดือนงวดแรก", baht(res.amount), 1]];
      } },

    { id: "finalpay", cat: "exit", title: "เงินได้งวดสุดท้าย — ลาออก / เลิกจ้าง", ref: "รวมพักร้อนคงเหลือ ค่าบอกกล่าวล่วงหน้า และค่าชดเชย · ยอดสุทธิไม่ติดลบ",
      fields: [
        { k: "salary", label: "เงินเดือน (บาท)", type: "num", def: 30000 },
        { k: "daily", label: "ค่าจ้างรายวัน (บาท)", type: "num", def: 1000 },
        { k: "resign", label: "วันพ้นสภาพ", type: "date", def: "2026-08-15" },
        { k: "ps", label: "งวดเริ่ม", type: "date", def: "2026-08-01" },
        { k: "pe", label: "งวดสิ้นสุด", type: "date", def: "2026-08-31" },
        { k: "leaveDays", label: "พักร้อนคงเหลือ (วัน)", type: "num", def: 0 },
        { k: "notice", label: "ค่าบอกกล่าวล่วงหน้า (วัน)", type: "num", def: 0 },
        { k: "sev", label: "ค่าชดเชย (บาท — คำนวณจากเครื่องมือค่าชดเชยด้านล่าง)", type: "num", def: 0 },
        { k: "ded", label: "ยอดหักคงค้าง (บาท)", type: "num", def: 0 }
      ],
      run: function (v) {
        var res = MF.resignation({
          resignDate: v.resign, periodStart: v.ps, periodEnd: v.pe, monthlySalary: v.salary, dailyRate: v.daily,
          method: "CALENDAR", weeklyOffDays: [], holidays: [],
          unusedAnnualLeaveDays: v.leaveDays, payInLieuOfNoticeDays: v.notice, severanceAmount: v.sev, outstandingDeductions: v.ded
        });
        return [["เงินเดือนตามส่วน", baht(res.proratedSalary)], ["ค่าพักร้อนคงเหลือ", baht(res.leaveEncashment)],
          ["ค่าบอกกล่าวล่วงหน้า", baht(res.payInLieuOfNotice)], ["เงินได้งวดสุดท้ายรวม", baht(res.totalFinalPay), 1]];
      } },

    { id: "severance", cat: "exit", title: "ค่าชดเชยเลิกจ้าง", ref: "พ.ร.บ. คุ้มครองแรงงาน ม.118 (30–400 วันตามอายุงาน)",
      fields: [
        { k: "hire", label: "วันเริ่มงาน", type: "date", def: "2020-01-01" },
        { k: "term", label: "วันเลิกจ้าง", type: "date", def: "2026-08-31" },
        { k: "wage", label: "ค่าจ้างรายวันงวดสุดท้าย (บาท)", type: "num", def: 1000 },
        { k: "reason", label: "เหตุแห่งการพ้นสภาพ", type: "sel", def: "EMPLOYER_TERMINATION", opts: [["EMPLOYER_TERMINATION", "นายจ้างเลิกจ้าง"], ["RETIREMENT", "เกษียณอายุ"], ["END_OF_CONTRACT", "สิ้นสุดสัญญาจ้าง"], ["RESIGNATION", "ลาออกเอง (ไม่มีสิทธิ)"]] }
      ],
      run: function (v) {
        var res = MF.severance({ hireDate: v.hire, terminationDate: v.term, dailyWage: v.wage, reason: v.reason, rules: R.severance });
        return [["อายุงาน", plain(res.serviceDays) + " วัน (" + plain(res.serviceYears) + " ปี)"], ["สิทธิค่าชดเชย", plain(res.payDays) + " วัน"], ["ยอดค่าชดเชย", baht(res.amount), 1]];
      } },

    { id: "retro", cat: "exit", title: "เงินย้อนหลัง (ปรับเงินเดือนย้อนงวด)", ref: "จ่ายขาดเป็นเงินตกเบิก จ่ายเกินเป็นยอดเรียกคืน",
      fields: [
        { k: "p1", label: "งวด 1 — จ่ายไปแล้ว (บาท)", type: "num", def: 30000 },
        { k: "r1", label: "งวด 1 — ยอดที่ถูกต้อง (บาท)", type: "num", def: 32000 },
        { k: "p2", label: "งวด 2 — จ่ายไปแล้ว (เว้น 0 หากไม่มี)", type: "num", def: 0 },
        { k: "r2", label: "งวด 2 — ยอดที่ถูกต้อง", type: "num", def: 0 },
        { k: "p3", label: "งวด 3 — จ่ายไปแล้ว (เว้น 0 หากไม่มี)", type: "num", def: 0 },
        { k: "r3", label: "งวด 3 — ยอดที่ถูกต้อง", type: "num", def: 0 }
      ],
      run: function (v) {
        var periods = [];
        [["p1", "r1"], ["p2", "r2"], ["p3", "r3"]].forEach(function (pair, i) {
          if (v[pair[0]] || v[pair[1]]) periods.push({ periodCode: "P" + (i + 1), effectiveDate: "2026-01-01", paidAmount: v[pair[0]], recalculatedAmount: v[pair[1]] });
        });
        var res = MF.retroPay({ periods: periods });
        return [["เงินตกเบิก", baht(res.totalArrears)], ["ยอดจ่ายเกิน", "− " + baht(res.totalOverpaid)], ["สุทธิที่ต้องจ่ายเพิ่ม", baht(res.netRetroPay), 1]];
      } },

    { id: "minwage", cat: "check", title: "ตรวจค่าจ้างขั้นต่ำรายจังหวัด", ref: "อัตราแตกต่างรายจังหวัด — ตรวจประกาศล่าสุดของคณะกรรมการค่าจ้าง",
      fields: [
        { k: "rate", label: "ค่าจ้างรายวันที่จ่ายจริง (บาท)", type: "num", def: 400 },
        { k: "min", label: "อัตราขั้นต่ำของจังหวัดคุณ (บาท)", type: "num", def: 400 }
      ],
      run: function (v) {
        var res = MF.minimumWage({ province: "X", dailyRate: v.rate, on: "2026-01-01", rules: [{ effectiveDate: "2020-01-01", province: "X", dailyRate: v.min }] });
        return [["อัตราขั้นต่ำอ้างอิง", baht(res.minimumDailyRate)], ["ผลตรวจ", res.compliant ? "✓ ไม่ต่ำกว่าขั้นต่ำ" : "✗ ต่ำกว่าขั้นต่ำ — ต้องปรับขึ้น", 1]];
      } },

    { id: "holiday", cat: "check", title: "วันหยุดตามประเพณี + วันหยุดชดเชย", ref: "ม.29 อย่างน้อย 13 วัน/ปี · ตรงวันหยุดประจำสัปดาห์ต้องชดเชยวันทำงานถัดไป",
      fields: [
        { k: "list", label: "วันหยุดที่ประกาศ (YYYY-MM-DD คั่นด้วยเว้นวรรค)", type: "text", def: "2026-01-01 2026-03-03 2026-04-06 2026-04-13 2026-04-14 2026-04-15 2026-05-01 2026-05-04 2026-06-03 2026-07-28 2026-08-12 2026-10-13 2026-12-05" },
        OFF_SEL
      ],
      run: function (v) {
        var res = MF.holiday({ yearStart: "2026-01-01", declaredHolidays: dates(v.list), weeklyOffDays: offDays(v.off), rules: [{ effectiveDate: "2019-05-05", minimumAnnualHolidays: 13 }] });
        var rows = [["ประกาศแล้ว", plain(res.declaredCount) + " วัน (ขั้นต่ำ " + plain(res.minimumRequired) + ")"],
          ["ผลตรวจ", res.compliant ? "✓ ครบตามกฎหมาย" : "✗ ขาดอีก " + plain(res.shortfall) + " วัน", 1]];
        res.substitutions.forEach(function (s) { rows.push(["ชดเชย " + s.holidayDate, "→ " + s.substituteDate]); });
        return rows;
      } },

    { id: "edge", cat: "check", title: "ตรวจยอดสุทธิและวันจ่าย", ref: "ยอดสุทธิต้องไม่ติดลบ (ยกยอดหักที่เก็บไม่ได้) · วันจ่ายเกินจำนวนวันของเดือนถูกปรับอัตโนมัติ",
      fields: [
        { k: "net", label: "ยอดสุทธิที่คำนวณได้ (บาท — ติดลบได้)", type: "num", def: -1500 },
        { k: "y", label: "ปีจ่าย (ค.ศ.)", type: "num", def: 2026 },
        { k: "m", label: "เดือนจ่าย (1–12)", type: "num", def: 2 },
        { k: "day", label: "วันจ่าย", type: "num", def: 31 }
      ],
      run: function (v) {
        var res = MF.edgeCase({ netPay: v.net, payDate: { year: v.y, month: v.m, dayOfMonth: v.day } });
        return [["ยอดจ่ายจริง", baht(res.netPay), 1], ["ยอดหักยกไปงวดถัดไป", baht(res.unrecoveredDeduction)], ["วันจ่ายที่ถูกต้อง", res.payDate]];
      } }
  ];

  /* ---- renderer ---- */
  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderTool(t) {
    var card = make("div", "tool-card");
    card.appendChild(make("h3", null, t.title));
    card.appendChild(make("div", "ref", t.ref));
    var inputs = {};
    t.fields.forEach(function (f) {
      var lb = make("label", null, f.label);
      lb.setAttribute("for", t.id + "-" + f.k);
      card.appendChild(lb);
      var el;
      if (f.type === "sel") {
        el = document.createElement("select");
        f.opts.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o[0]; op.textContent = o[1];
          el.appendChild(op);
        });
        el.value = f.def;
      } else if (f.type === "text") {
        el = document.createElement("textarea");
        el.value = f.def;
      } else {
        el = document.createElement("input");
        el.type = f.type === "date" ? "date" : f.type === "month" ? "month" : "number";
        if (el.type === "number") el.step = "any";
        el.value = f.def;
      }
      el.id = t.id + "-" + f.k;
      inputs[f.k] = { el: el, f: f };
      card.appendChild(el);
    });
    var btn = make("button", null, "คำนวณ");
    btn.type = "button";
    var res = document.createElement("dl");
    res.className = "res";
    btn.addEventListener("click", function () {
      var v = {};
      Object.keys(inputs).forEach(function (k) {
        var f = inputs[k].f, val = inputs[k].el.value;
        v[k] = f.type === "num" ? (parseFloat(val) || 0) : val;
      });
      res.textContent = "";
      var rows;
      try { rows = t.run(v); } catch (e) { rows = { error: "ข้อมูลไม่ครบถ้วน กรุณาตรวจสอบอีกครั้ง" }; }
      if (rows && rows.error) {
        var d0 = make("div", "strong");
        d0.appendChild(make("dt", null, "ผลลัพธ์"));
        var dd0 = make("dd", "err", rows.error);
        d0.appendChild(dd0);
        res.appendChild(d0);
      } else {
        rows.forEach(function (r) {
          var row = make("div", r[2] ? "strong" : null);
          row.appendChild(make("dt", null, r[0]));
          row.appendChild(make("dd", null, r[1]));
          res.appendChild(row);
        });
      }
      res.classList.add("show");
    });
    card.appendChild(btn);
    card.appendChild(res);
    return card;
  }

  var root = document.getElementById("tools");
  CATS.forEach(function (c) {
    root.appendChild(make("h2", "cat", c[1]));
    root.appendChild(make("p", "cat-note", c[2]));
    var grid = make("div", "tool-grid");
    TOOLS.forEach(function (t) { if (t.cat === c[0]) grid.appendChild(renderTool(t)); });
    root.appendChild(grid);
  });
})();
