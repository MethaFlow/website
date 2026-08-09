#!/usr/bin/env node
/* METHAFLOW — ตัวรัน golden tests ของ payroll engine
   วิธีใช้:  node tests/run-tests.js
   ไม่ต้องติดตั้ง dependency ใด ๆ — ใช้ Node.js อย่างเดียว */
"use strict";
var fs = require("fs");
var path = require("path");
var MF = require(path.join(__dirname, "..", "js", "payroll-engine.js"));

var MODULE_FN = {
  "prorate": "prorate",
  "deduction": "deduction",
  "social-security": "socialSecurity",
  "ewf": "ewfContribution",
  "tax": "withholdingTax",
  "external-deduction": "externalDeductions"
};

var files = fs.readdirSync(__dirname).filter(function (f) { return /\.json$/.test(f); }).sort();
var pass = 0, fail = 0;

files.forEach(function (file) {
  var spec = JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8"));
  var fnName = MODULE_FN[spec.module] || spec.module;
  var fn = MF[fnName];
  if (typeof fn !== "function") {
    console.error("X " + file + " — ไม่พบฟังก์ชัน " + fnName + " ใน engine");
    fail++;
    return;
  }
  spec.cases.forEach(function (c) {
    var out, ok = true, notes = [];
    try { out = fn(c.input); } catch (e) { out = { error: "THROWN: " + e.message }; }
    if (c.expectedError) {
      ok = !!out && out.error === c.expectedError;
      if (!ok) notes.push("คาดหวัง error " + c.expectedError + " แต่ได้ " + JSON.stringify(out));
    } else {
      Object.keys(c.expected).forEach(function (k) {
        var exp = Number(c.expected[k]);
        var act = Number(out ? out[k] : NaN);
        if (!(Math.abs(act - exp) < 0.005)) {
          ok = false;
          notes.push(k + ": คาดหวัง " + exp + " แต่ได้ " + act);
        }
      });
    }
    if (ok) { pass++; console.log("  OK " + c.caseCode + " — " + c.description); }
    else { fail++; console.error("  X " + c.caseCode + " — " + c.description + "\n      " + notes.join("\n      ")); }
  });
});

console.log("\nผลรวม: ผ่าน " + pass + " / " + (pass + fail) + " เคส");
process.exitCode = fail ? 1 : 0;
