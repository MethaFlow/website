/* METHAFLOW Payroll Engine 2026 — pure calculation functions.
   No DOM, no network, no storage. All rules follow Thai labour/tax law
   in force as of 2026 (Labour Protection Act B.E. 2541, Revenue Code,
   SSO ministerial regulation eff. 2026-01-01, EWF royal decree eff. 2026-10-01). */
var MF = (function () {
  "use strict";

  var DAY = 86400000;
  function num(v) { if (typeof v === "number") return v; var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function r2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
  function d(s) { return new Date(s + "T00:00:00Z"); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function pickRule(rules, on) {
    var onT = on ? d(on).getTime() : Infinity, best = null, bestT = -Infinity;
    (rules || []).forEach(function (r) {
      var t = d(r.effectiveDate).getTime();
      if (t <= onT && t > bestT) { best = r; bestT = t; }
    });
    return best || (rules && rules[0]) || {};
  }

  /* 01 — ฐานค่าจ้าง (รายเดือน/รายวัน/รายชั่วโมง) */
  function salary(input) {
    var p = input.profile, w = input.worked || {};
    var monthly, daily, hourly, base;
    var wd = num(p.workingDaysPerMonth) || 30, hpd = num(p.workingHoursPerDay) || 8;
    if (p.payType === "MONTHLY") {
      monthly = num(p.monthlySalary);
      daily = p.dailyRateBasis === "CALENDAR_30" ? monthly / 30 : monthly / wd;
      hourly = daily / hpd;
      base = monthly;
    } else if (p.payType === "DAILY") {
      daily = num(p.dailyRate);
      monthly = daily * wd;
      hourly = daily / hpd;
      base = daily * num(w.days);
    } else { /* HOURLY */
      hourly = num(p.hourlyRate);
      daily = hourly * hpd;
      monthly = daily * wd;
      base = hourly * num(w.hours);
    }
    return { monthly: r2(monthly), daily: r2(daily), hourly: r2(hourly), baseEarning: r2(base) };
  }

  /* 02 — วันทำงานในช่วง */
  function workingDay(input) {
    var start = d(input.startDate).getTime(), end = d(input.endDate).getTime();
    var offs = input.weeklyOffDays || [], hols = {};
    (input.holidays || []).forEach(function (h) { hols[h] = 1; });
    var cal = 0, off = 0, hol = 0;
    for (var t = start; t <= end; t += DAY) {
      cal++;
      if (offs.indexOf(new Date(t).getUTCDay()) >= 0) off++;
      else if (hols[iso(t)]) hol++;
    }
    return { calendarDays: cal, weeklyOffDays: off, holidayDays: hol, workingDays: cal - off - hol };
  }

  /* 04 — ค่าล่วงเวลา (ม.61–63: วันงาน 1.5x, ทำงานวันหยุด 1x เพิ่ม, OT วันหยุด 3x) */
  function overtime(input) {
    var rate = num(input.hourlyRate);
    var key = { WORKDAY_OT: "workdayOtMultiplier", HOLIDAY_WORK: "holidayWorkMultiplier", HOLIDAY_OT: "holidayOtMultiplier" };
    var hours = 0, amount = 0;
    (input.entries || []).forEach(function (e) {
      var ru = pickRule(input.rules, e.workDate);
      hours += num(e.hours);
      amount += rate * num(e.hours) * num(ru[key[e.otType]]);
    });
    return { totalHours: hours, totalAmount: r2(amount) };
  }

  /* 05 — ค่ากะ */
  function shift(input) {
    var rate = num(input.hourlyRate), amount = 0;
    (input.assignments || []).forEach(function (a) {
      amount += rate * num(a.premiumRate) * num(a.hours);
    });
    return { totalAmount: r2(amount) };
  }

  /* 06 — เงินเพิ่ม/สวัสดิการ (แยกเสียภาษี/ยกเว้นภาษี หารตามสัดส่วนงวดได้) */
  function allowance(input) {
    var cx = input.context || {};
    var eligible = num(cx.eligibleUnits), total = num(cx.totalUnits) || 1;
    var taxable = 0, nonTaxable = 0;
    (input.lines || []).forEach(function (l) {
      var amt = num(l.amount);
      if (l.prorated) amt = amt * eligible / total;
      if (l.taxable) taxable += amt; else nonTaxable += amt;
    });
    return { taxableTotal: r2(taxable), nonTaxableTotal: r2(nonTaxable), total: r2(taxable + nonTaxable) };
  }

  /* 07 — โบนัส (หักภาษีในงวดที่จ่าย หรือเฉลี่ยตลอดงวดที่เหลือของปี) */
  function bonus(input) {
    var payout = 0, current = 0, spread = 0;
    (input.entries || []).forEach(function (e) {
      var amt = num(e.amount);
      payout += amt;
      if (e.taxMode === "SPREAD_ANNUAL") spread += amt; else current += amt;
    });
    return { payout: r2(payout), taxedInCurrentPeriod: r2(current), spreadOverRemainingPeriods: r2(spread) };
  }

  /* 08 — คอมมิชชัน (คงที่ / ขั้นบันได) */
  function commission(input) {
    var sales = num(input.salesAmount), amount = 0;
    if (input.method === "FLAT") {
      amount = sales * num(input.flatRate);
    } else {
      var tiers = (input.tiers || []).slice().sort(function (a, b) { return num(a.fromSales) - num(b.fromSales); });
      tiers.forEach(function (t, i) {
        var from = num(t.fromSales);
        var upTo = i + 1 < tiers.length ? num(tiers[i + 1].fromSales) : Infinity;
        var portion = Math.min(Math.max(sales - from, 0), upTo - from);
        amount += portion * num(t.rate);
      });
    }
    return { amount: r2(amount) };
  }

  /* 12 — กองทุนสำรองเลี้ยงชีพ (อัตรา 2–15% ตาม พ.ร.บ. กองทุนสำรองเลี้ยงชีพ) */
  function pvd(input) {
    var rule = input.rule || {};
    if (!input.plan) return { base: 0, employee: 0, employer: 0 };
    var er = num(input.plan.employeeRate), mr = num(input.plan.employerRate);
    var lo = num(rule.minRate), hi = num(rule.maxRate);
    if (er < lo || er > hi || mr < lo || mr > hi) return { error: "RATE_OUT_OF_RANGE" };
    var wage = num(input.wage);
    return { base: r2(wage), employee: r2(wage * er), employer: r2(wage * mr) };
  }

  function bracketTax(taxable, brackets) {
    var tax = 0;
    (brackets || []).forEach(function (b) {
      var over = num(b.over), upTo = b.upTo == null ? Infinity : num(b.upTo);
      var portion = Math.min(Math.max(taxable - over, 0), upTo - over);
      tax += portion * num(b.rate);
    });
    return tax;
  }

  /* 14 — ภาษีเงินได้ทั้งปี (ม.40(1) หักค่าใช้จ่าย 50% ไม่เกิน 100,000 + ลดหย่อน) */
  function yearlyTax(input) {
    var ru = pickRule(input.rules, input.on);
    var inc = num(input.annualIncome);
    var expenses = Math.min(inc * num(ru.expenseRate), num(ru.expenseCap));
    var p = input.profile || {};
    var allow = num(ru.personalAllowance);
    if (p.maritalStatus === "MARRIED_SPOUSE_NO_INCOME") allow += num(ru.spouseAllowance);
    allow += (p.children || 0) * num(ru.childAllowance);
    allow += (p.additionalChildren || 0) * num(ru.additionalChildAllowance);
    allow += num(p.otherAllowances);
    var sso = Math.min(num(input.annualSso), num(ru.ssoDeductionCap));
    var pvdDed = Math.min(num(input.annualPvd), inc * num(ru.pvdDeductibleWageRate), num(ru.pvdDeductibleCap));
    var taxable = Math.max(0, inc - expenses - allow - sso - pvdDed);
    var tax = bracketTax(taxable, ru.brackets);
    var withheld = num(input.withheldToDate);
    return {
      taxableIncome: r2(taxable), annualTax: r2(tax),
      balanceDue: r2(Math.max(0, tax - withheld)),
      refundable: r2(Math.max(0, withheld - tax))
    };
  }

  /* 15 — การลา (สิทธิลาป่วย 30 วัน/ปี ม.32,57 ฯลฯ) */
  var LEAVE_KEY = {
    SICK: "paidSickDaysPerYear", BUSINESS: "paidBusinessDaysPerYear", ANNUAL: "paidAnnualDaysPerYear",
    MATERNITY: "paidMaternityDaysPerYear", MILITARY: "paidMilitaryDaysPerYear", UNPAID: null
  };
  function leave(input) {
    var rate = num(input.dailyRate), paid = 0, unpaid = 0;
    (input.taken || []).forEach(function (t) {
      var ru = pickRule(input.rules, t.startDate);
      var key = LEAVE_KEY[t.category], days = num(t.days);
      if (!key) { unpaid += days; return; }
      var remaining = Math.max(0, num(ru[key]) - num(t.paidDaysUsedBefore));
      var p = Math.min(days, remaining);
      paid += p; unpaid += days - p;
    });
    return { paidDays: paid, unpaidDays: unpaid, totalDeduction: r2(unpaid * rate) };
  }

  /* 16 — เวลาเข้างาน สาย ขาด */
  function attendance(input) {
    var pol = input.policy || {}, grace = num(pol.graceMinutes), brk = num(pol.breakMinutes);
    var hours = 0, late = 0, absent = 0, ded = 0;
    (input.records || []).forEach(function (rec) {
      if (rec.checkInMinutes == null || rec.checkOutMinutes == null) {
        absent++; ded += num(input.dailyRate); return;
      }
      hours += Math.max(0, rec.checkOutMinutes - rec.checkInMinutes - brk) / 60;
      var lateMin = Math.max(0, rec.checkInMinutes - rec.scheduledStartMinutes);
      if (lateMin > grace) {
        var counted = lateMin - grace;
        late += counted;
        if (pol.deductLateByMinute) ded += counted / 60 * num(input.hourlyRate);
      }
    });
    return { totalWorkHours: r2(hours), totalLateMinutes: late, absentDays: absent, totalDeduction: r2(ded) };
  }

  /* 17 — ค่าชดเชยเลิกจ้าง (ม.118: 30/90/180/240/300/400 วัน) */
  function severance(input) {
    var days = Math.round((d(input.terminationDate).getTime() - d(input.hireDate).getTime()) / DAY) + 1;
    var years = Math.floor(days / 365);
    var ru = pickRule(input.rules, input.terminationDate);
    var payDays = 0;
    if ((ru.entitledReasons || []).indexOf(input.reason) >= 0) {
      (ru.brackets || []).forEach(function (b) {
        var max = b.maxServiceDays == null ? Infinity : b.maxServiceDays;
        if (days >= b.minServiceDays && days <= max) payDays = b.payDays;
      });
    }
    return { serviceDays: days, serviceYears: years, payDays: payDays, amount: r2(payDays * num(input.dailyWage)) };
  }

  /* 18 — ปรับเงินย้อนหลัง */
  function retroPay(input) {
    var arrears = 0, over = 0;
    (input.periods || []).forEach(function (p) {
      var diff = num(p.recalculatedAmount) - num(p.paidAmount);
      if (diff > 0) arrears += diff; else over += -diff;
    });
    return { totalArrears: r2(arrears), totalOverpaid: r2(over), netRetroPay: r2(arrears - over) };
  }

  function countUnits(startT, endT, method, offs, hols) {
    var holMap = {}; (hols || []).forEach(function (h) { holMap[h] = 1; });
    var n = 0;
    for (var t = startT; t <= endT; t += DAY) {
      if (method === "WORKING_DAY") {
        var dow = new Date(t).getUTCDay();
        if ((offs || []).indexOf(dow) >= 0 || holMap[iso(t)]) continue;
      }
      n++;
    }
    return n;
  }

  /* 19 — พนักงานเข้าใหม่ระหว่างงวด */
  function newHire(input) {
    var ps = d(input.periodStart).getTime(), pe = d(input.periodEnd).getTime();
    var hire = d(input.hireDate).getTime();
    var from = Math.max(hire, ps);
    var eligible = countUnits(from, pe, input.method, input.weeklyOffDays, input.holidays);
    var total = countUnits(ps, pe, input.method, input.weeklyOffDays, input.holidays);
    return { eligibleUnits: eligible, totalUnits: total, amount: r2(num(input.monthlySalary) * eligible / total) };
  }

  /* 20 — เงินได้งวดสุดท้าย (ลาออก/เลิกจ้าง) */
  function resignation(input) {
    var ps = d(input.periodStart).getTime(), pe = d(input.periodEnd).getTime();
    var to = Math.min(d(input.resignDate).getTime(), pe);
    var eligible = countUnits(ps, to, input.method, input.weeklyOffDays, input.holidays);
    var total = countUnits(ps, pe, input.method, input.weeklyOffDays, input.holidays);
    var prorated = num(input.monthlySalary) * eligible / total;
    var encash = num(input.unusedAnnualLeaveDays) * num(input.dailyRate);
    var lieu = num(input.payInLieuOfNoticeDays) * num(input.dailyRate);
    var totalPay = Math.max(0, prorated + encash + lieu + num(input.severanceAmount) - num(input.outstandingDeductions));
    return { proratedSalary: r2(prorated), leaveEncashment: r2(encash), payInLieuOfNotice: r2(lieu), totalFinalPay: r2(totalPay) };
  }

  /* 21 — ค่าจ้างขั้นต่ำรายจังหวัด */
  function minimumWage(input) {
    var rules = (input.rules || []).filter(function (r) { return r.province === input.province; });
    var ru = pickRule(rules, input.on);
    var min = num(ru.dailyRate);
    return { minimumDailyRate: r2(min), compliant: num(input.dailyRate) + 1e-9 >= min };
  }

  /* 22 — วันหยุดตามประเพณี (ขั้นต่ำ 13 วัน ม.29 + วันหยุดชดเชย) */
  function holiday(input) {
    var offs = input.weeklyOffDays || [];
    var declared = (input.declaredHolidays || []).slice().sort();
    var declaredMap = {}; declared.forEach(function (h) { declaredMap[h] = 1; });
    var ru = pickRule(input.rules, input.yearStart);
    var minReq = num(ru.minimumAnnualHolidays);
    var subs = [], subMap = {};
    declared.forEach(function (h) {
      if (offs.indexOf(d(h).getUTCDay()) < 0) return;
      var t = d(h).getTime();
      do { t += DAY; } while (offs.indexOf(new Date(t).getUTCDay()) >= 0 || declaredMap[iso(t)] || subMap[iso(t)]);
      subMap[iso(t)] = 1;
      subs.push({ holidayDate: h, substituteDate: iso(t) });
    });
    var shortfall = Math.max(0, minReq - declared.length);
    return {
      declaredCount: declared.length, minimumRequired: minReq, shortfall: shortfall,
      compliant: shortfall === 0, substitutions: subs
    };
  }

  /* 23 — กฎหลายบริษัท (กฎเฉพาะบริษัทชนะกฎกลาง เลือกฉบับล่าสุด ณ วันคำนวณ) */
  function multiCompany(input) {
    var onT = d(input.on).getTime();
    function latest(list) {
      var best = null, bestT = -Infinity;
      list.forEach(function (r) {
        var t = d(r.effectiveDate).getTime();
        if (t <= onT && t > bestT) { best = r; bestT = t; }
      });
      return best;
    }
    var own = latest((input.rules || []).filter(function (r) { return r.companyId === input.companyId; }));
    var global = latest((input.rules || []).filter(function (r) { return r.companyId === null; }));
    var chosen = own || global;
    return chosen ? chosen.rule : null;
  }

  /* 24 — ขอบเขตพิเศษ (ยอดสุทธิไม่ติดลบ, วันจ่ายเกินจำนวนวันของเดือน) */
  function edgeCase(input) {
    var net = num(input.netPay);
    var pd = input.payDate;
    var dim = daysInMonth(pd.year, pd.month);
    var day = Math.min(pd.dayOfMonth, dim);
    var mm = String(pd.month).length < 2 ? "0" + pd.month : String(pd.month);
    var dd = String(day).length < 2 ? "0" + day : String(day);
    return {
      netPay: r2(Math.max(0, net)),
      unrecoveredDeduction: r2(Math.max(0, -net)),
      payDate: pd.year + "-" + mm + "-" + dd
    };
  }

  /* ประกันสังคม ม.33 — เพดาน 17,500 บาท อัตรา 5% (กฎกระทรวง มีผล 1 ม.ค. 2569)
     เพดานถัดไปตามกฎกระทรวง: 20,000 (2572) และ 23,000 (2575) */
  var SSO_CEILINGS = [
    { effectiveDate: "2026-01-01", maxBase: 17500 },
    { effectiveDate: "2029-01-01", maxBase: 20000 },
    { effectiveDate: "2032-01-01", maxBase: 23000 }
  ];
  function sso(monthlyWage, on) {
    var ru = pickRule(SSO_CEILINGS, on || "2026-01-01");
    return r2(Math.min(num(monthlyWage), ru.maxBase) * 0.05);
  }

  /* กองทุนสงเคราะห์ลูกจ้าง — เริ่ม 1 ต.ค. 2569 ฝ่ายละ 0.25%, 1 ต.ค. 2574 ฝ่ายละ 0.5%
     ลูกจ้างที่เป็นสมาชิกกองทุนสำรองเลี้ยงชีพได้รับยกเว้น */
  function ewf(monthlyWage, periodDate, isPvdMember) {
    if (isPvdMember) return 0;
    var t = d(periodDate).getTime();
    if (t >= d("2031-10-01").getTime()) return r2(num(monthlyWage) * 0.005);
    if (t >= d("2026-10-01").getTime()) return r2(num(monthlyWage) * 0.0025);
    return 0;
  }

  /* ภาษีหัก ณ ที่จ่ายรายเดือน (ประมาณการแบบเสมือนทั้งปี) */
  var TAX_BRACKETS_2026 = [
    { over: 0, upTo: 150000, rate: 0 }, { over: 150000, upTo: 300000, rate: 0.05 },
    { over: 300000, upTo: 500000, rate: 0.10 }, { over: 500000, upTo: 750000, rate: 0.15 },
    { over: 750000, upTo: 1000000, rate: 0.20 }, { over: 1000000, upTo: 2000000, rate: 0.25 },
    { over: 2000000, upTo: 5000000, rate: 0.30 }, { over: 5000000, upTo: null, rate: 0.35 }
  ];
  function monthlyWht(monthlyIncome, opts) {
    opts = opts || {};
    var annual = num(monthlyIncome) * 12;
    var expenses = Math.min(annual * 0.5, 100000);
    var allow = 60000 + num(opts.extraAllowances);
    var annualSso = num(opts.annualSso);
    var taxable = Math.max(0, annual - expenses - allow - annualSso);
    return r2(bracketTax(taxable, TAX_BRACKETS_2026) / 12);
  }

  /* 26 — เงินหักส่งหน่วยงานภายนอก
     กยศ (พ.ร.บ. กยศ. 2560 ม.51): นายจ้างหักตามยอดแจ้งในระบบ e-PaySLF ลำดับหลังภาษี ณ ที่จ่าย
     และเงินกองทุน (ประกันสังคม/กองทุนสำรองเลี้ยงชีพ) นำส่งกรมสรรพากรพร้อมรอบ ภ.ง.ด.1
     — ไม่มีเพดานคุ้มครอง 20,000 เพราะเป็นการหักตามกฎหมายเฉพาะ
     อายัดเงินเดือน (ป.วิ.แพ่ง ม.302 + หมายกรมบังคับคดี): หักได้เฉพาะส่วนที่ทำให้ลูกหนี้
     เหลือเงินไม่น้อยกว่า 20,000 บาท/เดือน ส่วนที่หักไม่ได้ให้รายงานกลับตามหมาย */
  var GARNISH_PROTECTED_FLOOR = 20000;
  function externalDeductions(input) {
    var remaining = Math.max(0, num(input.netAfterStatutory));
    var slfDue = num(input.slfAmount);
    var slf = Math.min(slfDue, remaining);
    remaining = r2(remaining - slf);
    var floor = input.protectedFloor == null ? GARNISH_PROTECTED_FLOOR : num(input.protectedFloor);
    var garnishDue = 0;
    (input.garnishments || []).forEach(function (g) { garnishDue += num(g.amount); });
    var available = Math.max(0, remaining - floor);
    var garnished = Math.min(garnishDue, available);
    remaining = r2(remaining - garnished);
    return {
      slfDeducted: r2(slf), slfCarryOver: r2(slfDue - slf),
      garnished: r2(garnished), garnishCarryOver: r2(garnishDue - garnished),
      protectedFloor: r2(floor), remainingNet: remaining
    };
  }

  /* 25 — ประกอบสลิปทั้งงวด (integration): รายได้ทุกประเภท → เงินหักตามกฎหมาย → ภาษีเสมือนทั้งปี → สุทธิ
     หมายเหตุ: สปส. ปัดเศษเป็นบาทตามแนวปฏิบัติ สปส. · EWF คิดตามสถานะขึ้นทะเบียน (ewfRegistered) ที่กำหนดมาจากต้นทาง */
  var OT_RULES = [{ effectiveDate: "1998-08-20", workdayOtMultiplier: 1.5, holidayWorkMultiplier: 1, holidayOtMultiplier: 3 }];
  var LEAVE_RULES = [{ effectiveDate: "2019-05-05", paidSickDaysPerYear: 30, paidBusinessDaysPerYear: 3, paidAnnualDaysPerYear: 6, paidMaternityDaysPerYear: 45, paidMilitaryDaysPerYear: 60 }];
  function computePayslip(input) {
    var p = input.payslip;
    var sal = salary({ profile: p.salaryProfile, worked: p.worked });
    var factor = p.prorate ? num(p.prorate.eligibleUnits) / (num(p.prorate.totalUnits) || 1) : 1;
    var base = r2(sal.baseEarning * factor);

    var ot = overtime({ hourlyRate: sal.hourly, entries: p.overtimeEntries || [], rules: OT_RULES }).totalAmount;
    var sh = shift({ hourlyRate: sal.hourly, assignments: p.shiftAssignments || [] }).totalAmount;
    var alw = allowance({ lines: p.allowances || [], context: p.allowanceProrate || {} });
    var bon = bonus({ entries: p.bonuses || [] });
    var com = p.commission ? commission(p.commission).amount : 0;
    var att = attendance({ dailyRate: sal.daily, hourlyRate: sal.hourly, records: p.attendanceRecords || [], policy: p.attendancePolicy || {} });
    var lv = leave({ dailyRate: sal.daily, taken: p.leaveTaken || [], rules: LEAVE_RULES });

    var gross = r2(base + ot + sh + alw.total + bon.payout + com - att.totalDeduction - lv.totalDeduction);

    /* ฐาน "ค่าจ้าง" สำหรับ สปส./กองทุนสงเคราะห์ฯ = ค่าจ้างประจำ + เงินเพิ่มที่เป็นค่าจ้าง (ไม่รวม OT/โบนัส/คอมมิชชัน) */
    var wageBase = base + alw.taxableTotal;
    var payOn = p.period ? (p.period.paymentDate || p.period.endDate) : null;

    var ssoAmt = p.ssoInsured ? Math.round(Math.min(wageBase, pickRule(SSO_CEILINGS, payOn).maxBase) * 0.05) : 0;

    var pvdRes = p.pvdPlan ? pvd({ wage: base, plan: p.pvdPlan, rule: { minRate: 0.02, maxRate: 0.15 } }) : { employee: 0, employer: 0 };
    if (pvdRes.error) return { error: pvdRes.error };

    var ewfAmt = p.ewfRegistered ? ewf(wageBase, payOn, false) : 0;

    /* ภาษีหัก ณ ที่จ่าย — เสมือนทั้งปี พร้อมลดหย่อน สปส./PVD/ครอบครัว */
    var periods = (p.period && p.period.periodsPerYear) || 12;
    var taxableMonthly = base + ot + sh + alw.taxableTotal + com;
    var annualIncome = taxableMonthly * periods + bon.payout;
    var tp = p.taxProfile || {};
    var allowTotal = 60000;
    if (tp.maritalStatus === "MARRIED_SPOUSE_NO_INCOME") allowTotal += 60000;
    allowTotal += (tp.children || 0) * 30000 + (tp.additionalChildren || 0) * 60000 + num(tp.otherAllowances);
    var expenses = Math.min(annualIncome * 0.5, 100000);
    var ssoAnnual = Math.min(ssoAmt * periods, 10500);
    var pvdAnnual = Math.min(pvdRes.employee * periods, annualIncome * 0.15, 500000);
    var taxable = Math.max(0, annualIncome - expenses - allowTotal - ssoAnnual - pvdAnnual);
    var tax = r2(bracketTax(taxable, TAX_BRACKETS_2026) / periods);

    var voluntary = 0;
    (p.voluntaryDeductions || []).forEach(function (vd) { voluntary += num(vd.amount); });

    /* กยศ + อายัดเงินเดือน — หักหลังภาษีและเงินกองทุนตามลำดับ ม.51 พ.ร.บ. กยศ. */
    var ext = externalDeductions({
      netAfterStatutory: gross - tax - ssoAmt - pvdRes.employee - ewfAmt,
      slfAmount: p.studentLoanDeduction,
      garnishments: p.garnishmentOrders || []
    });

    var totalDeduction = r2(tax + ssoAmt + pvdRes.employee + ewfAmt + ext.slfDeducted + ext.garnished + voluntary);
    var net = r2(gross - totalDeduction);
    return {
      gross: gross, tax: tax, sso: r2(ssoAmt), pvd: r2(pvdRes.employee), ewf: r2(ewfAmt),
      slf: ext.slfDeducted, slfCarryOver: ext.slfCarryOver,
      garnished: ext.garnished, garnishCarryOver: ext.garnishCarryOver,
      voluntary: r2(voluntary), totalDeduction: totalDeduction,
      net: r2(Math.max(0, net)), unrecoveredDeduction: r2(Math.max(0, -net)),
      employerCost: r2(ssoAmt + pvdRes.employer + ewfAmt)
    };
  }


  /* helper: เลือก rule ที่มีผล ณ วันที่ on (ใช้ contract แบบ golden) */
  function pickRuleOrNull(rules, on) {
    var onT = d(on).getTime(), best = null, bestT = -Infinity;
    (rules || []).forEach(function (r) {
      var t = d(r.effectiveDate).getTime();
      if (t <= onT && t > bestT) { best = r; bestT = t; }
    });
    return best;
  }
  function money(v) { return r2(v).toFixed(2); }

  /* 03 — หารตามสัดส่วน (ปฏิทิน / วันทำงาน) */
  function prorate(input) {
    var full = num(input.fullAmount);
    var eligible = num(input.eligibleUnits), total = num(input.totalUnits);
    if (total <= 0) return { amount: money(0) };
    return { amount: money(full * eligible / total) };
  }

  /* 09 — หักเงินตามเพดานรายการ (perItem) และเพดานรวม (total) ของค่าจ้าง
     ม.76 พ.ร.บ.คุ้มครองแรงงาน — เรียงตาม priority ส่วนที่เกินยกไปงวดหน้า */
  function deduction(input) {
    var wage = num(input.wage), rule = input.rule || {};
    var perItemCap = wage * num(rule.perItemWageRate);
    var totalCap = wage * num(rule.totalWageRate);
    var lines = (input.lines || []).slice().sort(function (a, b) {
      return num(a.priority) - num(b.priority);
    });
    var applied = 0, carried = 0;
    lines.forEach(function (l) {
      var want = num(l.amount);
      var allowItem = Math.min(want, perItemCap);
      var allowTotal = Math.min(allowItem, totalCap - applied);
      if (allowTotal < 0) allowTotal = 0;
      applied += allowTotal;
      carried += want - allowTotal;
    });
    return { totalApplied: money(applied), totalCarriedForward: money(carried) };
  }

  /* 10 — ประกันสังคม ม.33 (date-aware ผ่าน rules[])
     ฐานคิดอยู่ระหว่าง minWage..maxWage, เงินสมทบ = ฐาน x rate ไม่เกิน maxContribution
     ปัดเศษเป็นจำนวนเต็มบาท (ตามแนวปฏิบัติ สปส.) */
  function socialSecurity(input) {
    if (!input.insured) return { base: money(0), employee: money(0), employer: money(0) };
    var ru = pickRuleOrNull(input.rules, input.on);
    if (!ru) return { error: "RULE_NOT_FOUND" };
    var wage = num(input.wage);
    var b = Math.min(Math.max(wage, num(ru.minWage)), num(ru.maxWage));
    var contrib = Math.min(Math.round(b * num(ru.rate)), num(ru.maxContribution));
    return { base: money(b), employee: money(contrib), employer: money(contrib) };
  }

  /* 11 — กองทุนสงเคราะห์ลูกจ้าง (date-aware)
     บังคับใช้ 1 ต.ค. 2569 ฝ่ายละ 0.25%, 1 ต.ค. 2574 ฝ่ายละ 0.50%
     registered=false → ยังไม่อยู่ในบังคับ = 0, ก่อนวันบังคับใช้ = RULE_NOT_FOUND */
  function ewfContribution(input) {
    if (!input.registered) return { base: money(0), employee: money(0), employer: money(0) };
    var ru = pickRuleOrNull(input.rules, input.on);
    if (!ru) return { error: "RULE_NOT_FOUND" };
    var wage = num(input.wage);
    return {
      base: money(wage),
      employee: money(wage * num(ru.employeeRate)),
      employer: money(wage * num(ru.employerRate))
    };
  }

  /* 13 — ภาษีหัก ณ ที่จ่ายรายเดือน ภ.ง.ด.1 (ประมาณการทั้งปี ÷ งวดที่เหลือ)
     - รายได้ประจำ: ประมาณการทั้งปี หักค่าใช้จ่าย 50% (เพดาน) + ลดหย่อน แล้วคิดภาษีขั้นบันได
     - โบนัสจ่ายทันที (irregularCurrentPeriod): ภาษีส่วนเพิ่มจากการรวมเข้ารายได้ทั้งปี หักในงวดที่จ่าย
     - โบนัสเฉลี่ย (irregularSpread): ภาษีส่วนเพิ่ม เฉลี่ยตลอดงวดที่เหลือ
     งวด = remainingPeriods (ปกติ 12) — ยอดหักรวม = ภาษีประจำ/งวด + โบนัสทันที + โบนัสเฉลี่ย/งวด */
  function withholdingTax(input) {
    var ru = pickRuleOrNull(input.rules, input.on) || {};
    var p = input.profile || {};
    var periods = num(input.remainingPeriods) || 12;

    function allowances() {
      var a = num(ru.personalAllowance);
      if (p.maritalStatus === "MARRIED_SPOUSE_NO_INCOME") a += num(ru.spouseAllowance);
      a += num(p.children) * num(ru.childAllowance);
      a += num(p.additionalChildren) * num(ru.additionalChildAllowance);
      a += num(p.otherAllowances);
      return a;
    }
    function taxOnIncome(annualIncome) {
      var expense = Math.min(annualIncome * num(ru.expenseRate), num(ru.expenseCap));
      var sso = Math.min(num(input.annualSso), num(ru.ssoDeductionCap));
      var pvd = Math.min(num(input.annualPvd), annualIncome * num(ru.pvdDeductibleWageRate), num(ru.pvdDeductibleCap));
      var taxable = Math.max(0, annualIncome - expense - allowances() - sso - pvd);
      return bracketTax(taxable, ru.brackets);
    }

    var regular = num(input.annualRegularIncome);
    var current = num(input.irregularCurrentPeriod);
    var spread = num(input.irregularSpread);

    var taxRegular = taxOnIncome(regular);
    // ภาษีส่วนเพิ่มของเงินได้ไม่ประจำ = ภาษี(ประจำ+ไม่ประจำ) - ภาษี(ประจำ)
    var taxCurrentExtra = current > 0 ? taxOnIncome(regular + current) - taxRegular : 0;
    var taxSpreadExtra = spread > 0 ? taxOnIncome(regular + spread) - taxRegular : 0;

    var period = taxRegular / periods + taxCurrentExtra + taxSpreadExtra / periods;

    return {
      annualTaxOnRegularIncome: money(taxRegular),
      taxOnIrregularIncome: money(taxCurrentExtra + taxSpreadExtra),
      periodWithholding: money(period)
    };
  }

  return {
    prorate: prorate, deduction: deduction, socialSecurity: socialSecurity,
    ewfContribution: ewfContribution, withholdingTax: withholdingTax,
    salary: salary, workingDay: workingDay, overtime: overtime, shift: shift,
    allowance: allowance, bonus: bonus, computePayslip: computePayslip,
    externalDeductions: externalDeductions,
    commission: commission, pvd: pvd, yearlyTax: yearlyTax, leave: leave,
    attendance: attendance, severance: severance, retroPay: retroPay,
    newHire: newHire, resignation: resignation, minimumWage: minimumWage,
    holiday: holiday, multiCompany: multiCompany, edgeCase: edgeCase,
    sso: sso, ewf: ewf, monthlyWht: monthlyWht, bracketTax: bracketTax,
    TAX_BRACKETS_2026: TAX_BRACKETS_2026
  };
})();
if (typeof window !== "undefined") window.MF = MF;



if (typeof window !== "undefined") window.MF = MF;
if (typeof module !== "undefined" && module.exports) module.exports = MF;
