(function(){
  "use strict";
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}

  var DATA={
    payroll:{name:{th:"ระบบเงินเดือน",en:"Payroll"},status:"live",statusLabel:{th:"พร้อมใช้งาน",en:"Live now"},
      desc:{th:"คำนวณเงินเดือน ภาษี ประกันสังคม และกองทุนฯ อัตโนมัติจากเวลาทำงานจริง แม่นระดับสตางค์ ออกไฟล์ธนาคารและไฟล์ยื่นราชการจากงวดเดียวกันครบ",en:"Payroll, tax, social security and funds computed automatically from real attendance — accurate to the satang, with bank and government files from the same run."},
      pts:{th:["ลงเวลา GPS หลายสาขา · กะข้ามคืน","เบี้ยขยัน · พนักงานรายวัน","ภ.ง.ด.1 · สปส. · กองทุนสงเคราะห์ฯ","บันทึกตรวจสอบครบทุกรายการ"],en:["Multi-site GPS clock-in · overnight shifts","Diligence allowance · daily-wage staff","PND1 · SSO · welfare fund filings","Complete audit trail"]},
      vis:[["ยอดจ่ายสุทธิ","Net payroll","฿4.18M","g"],["ตรวจทานแล้ว","Reconciled","312/312",""],["ค่าคลาดเคลื่อน","Rounding error","±0.00",""]]},
    accounting:{name:{th:"ระบบบัญชี",en:"Accounting"},status:"next",statusLabel:{th:"ระบบถัดไป",en:"Next up"},
      desc:{th:"ต่อยอดจากเงินเดือนโดยตรง — ค่าใช้จ่ายพนักงาน ภาษี และการจ่ายเงินไหลเข้าบัญชีแยกประเภทอัตโนมัติ ไม่ต้องลงรายการซ้ำ ปิดงบเร็วขึ้น",en:"Flows straight from payroll — staff costs, tax and payments post to the ledger automatically, with no double entry and faster closes."},
      pts:{th:["เชื่อมตรงกับเงินเดือน ไม่กรอกซ้ำ","บัญชีแยกประเภท · งบการเงิน","ภาษีซื้อ-ขาย · ยื่นภาษีนิติบุคคล","ตรวจสอบย้อนได้เท่ากับเงินเดือน"],en:["Wired directly to payroll — no re-entry","General ledger · financial statements","Input/output VAT · corporate tax","Same audit depth as payroll"]},
      vis:[["จากเงินเดือน","From payroll","อัตโนมัติ","g"],["ลงรายการซ้ำ","Double entry","0",""],["ปิดงบ","Book close","เร็วขึ้น",""]]},
    crm:{name:{th:"ระบบ CRM",en:"CRM"},status:"next",statusLabel:{th:"กำลังพัฒนา",en:"On the roadmap"},
      desc:{th:"จัดการลูกค้า ดีล และการติดตามงานขายบนข้อมูลเดียวกับบัญชี — เห็นภาพลูกค้าครบตั้งแต่ดีลแรกจนถึงการวางบิลจริง",en:"Manage customers, deals and follow-ups on the same data as Accounting — a full view from first deal to actual billing."},
      pts:{th:["ไปป์ไลน์ดีล · ติดตามงานขาย","เชื่อมลูกค้ากับใบแจ้งหนี้จริง","ประวัติการติดต่อครบทุกช่องทาง","สิทธิ์เข้าถึงตามบทบาท"],en:["Deal pipeline · sales follow-up","Customers linked to real invoices","Full contact history","Role-based access"]},
      vis:[["มุมมองลูกค้า","Customer view","ครบวงจร","g"],["ดีล → บิล","Deal → invoice","เชื่อมกัน",""],["ข้อมูลซ้ำ","Duplicate data","0",""]]},
    service:{name:{th:"ระบบบริการ (Service)",en:"Service"},status:"next",statusLabel:{th:"กำลังพัฒนา",en:"On the roadmap"},
      desc:{th:"รับเรื่อง ติดตาม และปิดงานบริการลูกค้าอย่างเป็นระบบ ผูกกับ CRM และบัญชี — ทุกงานบริการมีเจ้าของ มีกำหนด และตรวจย้อนได้",en:"Log, track and close customer service tickets, tied to CRM and Accounting — every ticket owned, scheduled and traceable."},
      pts:{th:["ตั๋วงานบริการ · SLA ต่อเรื่อง","ผูกกับลูกค้าและใบแจ้งหนี้","วัดเวลาตอบและปิดงาน","ตรวจสอบย้อนได้ทุกขั้น"],en:["Service tickets · per-case SLA","Linked to customers & invoices","Response & resolution metrics","Fully auditable"]},
      vis:[["งานบริการ","Tickets","ติดตามได้","g"],["ผูก CRM","CRM link","อัตโนมัติ",""],["ตกหล่น","Dropped","0",""]]}
  };
  function curLang(){return document.documentElement.getAttribute("lang")==="en"?"en":"th";}
  function renderStage(k){
    var d=DATA[k],L=curLang();
    var pts=d.pts[L].map(function(p){return '<li>'+esc(p)+'</li>';}).join("");
    var vis=d.vis.map(function(r){return '<div class="vis-row"><span class="vk">'+esc(L==="en"?r[1]:r[0])+'</span><span class="vv '+(r[3]||"")+'">'+esc(r[2])+'</span></div>';}).join("");
    document.getElementById("stage").innerHTML=
      '<div class="stage-txt"><div class="st-name">'+esc(d.name[L])+'</div>'+
      '<span class="st-status '+(d.status==="live"?"live":"next")+'">'+esc(d.statusLabel[L])+'</span>'+
      '<p>'+esc(d.desc[L])+'</p><ul>'+pts+'</ul></div><div class="stage-vis">'+vis+'</div>';
  }
  var sw=document.getElementById("switch");
  sw.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;
    sw.querySelectorAll("button").forEach(function(x){x.setAttribute("data-on",String(x===b));});
    renderStage(b.getAttribute("data-k"));});
  new MutationObserver(function(){var on=sw.querySelector('button[data-on="true"]');renderStage(on?on.getAttribute("data-k"):"payroll");})
    .observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  renderStage("payroll");

  // sticky nav shadow
  var nav=document.getElementById("nav");
  window.addEventListener("scroll",function(){nav.classList.toggle("stuck",window.scrollY>8);},{passive:true});

  // scroll reveal
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add("in");io.unobserve(en.target);}});},{threshold:.15});
  document.querySelectorAll(".rv:not(.in)").forEach(function(el){io.observe(el);});

  // count-up + bar fill
  function countUp(el){
    var target=parseFloat(el.getAttribute("data-count"))||0, suf=el.getAttribute("data-suffix")||"", t0=null, dur=1300;
    function step(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/dur,1);var e=1-Math.pow(1-p,3);
      el.textContent=Math.round(target*e).toLocaleString()+suf;if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }
  var cio=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){countUp(en.target);cio.unobserve(en.target);}});},{threshold:.6});
  document.querySelectorAll("[data-count]").forEach(function(el){cio.observe(el);});
  var bio=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){var f=en.target.getAttribute("data-fill");en.target.style.width=f+"%";bio.unobserve(en.target);}});},{threshold:.4});
  document.querySelectorAll("[data-fill]").forEach(function(el){bio.observe(el);});
})();

