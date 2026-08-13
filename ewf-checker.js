(function(){
  "use strict";
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(ch){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch];
  }); }
  var EMAIL = "contact@methaflow.tech";
  var PHONE = "061-642-5116";

  var $ = function(id){ return document.getElementById(id); };

  var verifiedName = "";

  function looksLikeTaxId(s){ return /^\d{13}$/.test(s.replace(/\D/g, "")); }

  $("lookupBtn").addEventListener("click", function(){
    var q = $("q").value.trim();
    var st = $("lookupStatus");
    if(!q){ st.className="lookup-status err"; st.textContent="กรุณากรอกชื่อบริษัทหรือเลขผู้เสียภาษีก่อน"; return; }
    verifiedName = q;
    st.className="lookup-status ok";
    st.textContent = looksLikeTaxId(q)
      ? "บันทึกเลขผู้เสียภาษีแล้ว — กรอกข้อมูลขั้นตอนที่ 2 เพื่อประเมิน"
      : "ใช้ชื่อ “" + q + "” ในการประเมิน — กรอกข้อมูลขั้นตอนที่ 2 ต่อได้เลย";
  });

  /* ---------- Step 2 + logic ---------- */
  function getRadio(name){
    var el = document.querySelector('input[name="'+name+'"]:checked');
    return el ? el.value : null;
  }
  function fmt(n){ return n.toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2}); }

  $("checkForm").addEventListener("submit", function(e){
    e.preventDefault();
    var emp = parseInt($("emp").value,10);
    var lpa = getRadio("lpa");
    var pvd = getRadio("pvd");

    if(isNaN(emp) || emp<0){ flash($("emp")); return; }
    if(!lpa){ flash(document.querySelector('[data-name="lpa"]')); return; }
    if(!pvd){ flash(document.querySelector('[data-name="pvd"]')); return; }
    if(!$("consent").checked){ flash($("consent").parentElement); return; }

    render(decide(emp,lpa,pvd), verifiedName || $("q").value.trim());
  });

  function flash(el){
    el.style.transition="box-shadow .2s";
    el.style.boxShadow="0 0 0 3px rgba(185,28,28,.25)";
    setTimeout(function(){ el.style.boxShadow=""; },900);
    el.scrollIntoView({behavior:"smooth",block:"center"});
  }

  /* core rule engine — matches the law */
  function decide(emp,lpa,pvd){
    var count = emp;
    // Not under LPA -> exempt
    if(lpa==="no"){
      return {
        cls:"exempt", icon:"—", title:"น่าจะยังไม่เข้าเกณฑ์",
        body:"กิจการที่ไม่อยู่ภายใต้ พ.ร.บ. คุ้มครองแรงงาน (เช่น งานเกษตรบางประเภท งานรับใช้ในบ้าน มูลนิธิ สมาคม องค์กรไม่แสวงหากำไร) ไม่อยู่ในบังคับให้นำส่งกองทุนสงเคราะห์ลูกจ้าง",
        reasons:["ระบุว่าไม่อยู่ภายใต้ พ.ร.บ. คุ้มครองแรงงาน หรือไม่แน่ใจ","หากไม่แน่ใจสถานะ ควรตรวจสอบกับกรมสวัสดิการฯ ให้ชัดเจน"],
        est:null
      };
    }
    // Under LPA, < 10 employees -> exempt for now
    if(emp<10){
      return {
        cls:"exempt", icon:"—", title:"ยังไม่เข้าเกณฑ์ (ตอนนี้)",
        body:"บริษัทมีลูกจ้างน้อยกว่า 10 คน จึงยังไม่มีหน้าที่นำส่งกองทุนสงเคราะห์ลูกจ้างในขณะนี้ แต่ควรเตรียมระบบไว้ เพราะเมื่อจำนวนลูกจ้างถึง 10 คนจะเข้าเกณฑ์ทันที",
        reasons:["ลูกจ้าง "+count+" คน (น้อยกว่าเกณฑ์ 10 คน)","อยู่ภายใต้ พ.ร.บ. คุ้มครองแรงงาน"],
        est:null
      };
    }
    // >=10, under LPA, all in provident fund -> exempt
    if(pvd==="all"){
      return {
        cls:"maybe", icon:"≈", title:"อาจได้รับยกเว้น (บางส่วน)",
        body:"หากลูกจ้าง “ทุกคน” เป็นสมาชิกกองทุนสำรองเลี้ยงชีพแล้ว จะได้รับยกเว้นการนำส่ง EWF สำหรับลูกจ้างกลุ่มนั้น แต่หากมีลูกจ้างใหม่หรือบางคนยังไม่เข้ากองทุนสำรองเลี้ยงชีพ นายจ้างต้องนำคนกลุ่มนั้นเข้ากองทุนสงเคราะห์ลูกจ้าง",
        reasons:["ลูกจ้าง "+count+" คน (ถึงเกณฑ์ 10 คน)","อยู่ภายใต้ พ.ร.บ. คุ้มครองแรงงาน","ระบุว่ามีกองทุนสำรองเลี้ยงชีพครบทุกคน"],
        est:null,
        watch:"ตรวจสอบให้แน่ใจว่าครอบคลุมลูกจ้างครบ 100% รวมพนักงานเข้าใหม่และรายวัน"
      };
    }
    // >=10, under LPA, some/none in provident fund -> MUST enroll
    return {
      cls:"must", icon:"✓", title:"ต้องเข้ากองทุนสงเคราะห์ลูกจ้าง",
      body:"บริษัทของคุณเข้าเกณฑ์ที่กฎหมายกำหนด ต้องขึ้นทะเบียนและนำส่งเงินเข้ากองทุนสงเคราะห์ลูกจ้าง ตั้งแต่กฎหมายเริ่มบังคับใช้ (1 ต.ค. 2569) สำหรับลูกจ้างที่ยังไม่ได้เป็นสมาชิกกองทุนสำรองเลี้ยงชีพ",
      reasons:["ลูกจ้าง "+count+" คน (ถึงเกณฑ์ 10 คนขึ้นไป)","อยู่ภายใต้ พ.ร.บ. คุ้มครองแรงงาน","มีลูกจ้างที่ยังไม่ได้อยู่ในกองทุนสำรองเลี้ยงชีพ"],
      est:{count:count}
    };
  }

  function render(r, coName){
    var host=$("result");
    var reasonsHtml = r.reasons.map(function(x){ return '<li><span class="b">›</span><span>'+esc(x)+'</span></li>'; }).join("");

    var estHtml="";
    if(r.est){
      var perHead20 = 20000*0.0025;                 // employer 0.25% at 20k
      var monthlyBoth = r.est.count * perHead20 * 2; // both sides at 20k
      estHtml =
        '<div class="estimate">ประมาณการนำส่งคร่าว ๆ (สมมติค่าจ้างเฉลี่ย 20,000 บาท/คน, อัตราเริ่มต้น 0.25% ต่อฝ่าย):<br>'+
        'รวมทั้งสองฝ่ายราว <b>'+fmt(monthlyBoth)+' บาท/เดือน</b> สำหรับลูกจ้าง '+r.est.count+' คน '+
        '<span style="color:var(--muted)">— ตัวเลขจริงขึ้นกับค่าจ้างแต่ละคน</span></div>';
    }
    var watchHtml = r.watch ? '<div class="estimate" style="background:var(--amber);"><b style="color:var(--amber-edge)">ข้อควรระวัง:</b> '+r.watch+'</div>' : "";

    var subject = encodeURIComponent("ขอคำปรึกษากองทุนสงเคราะห์ลูกจ้าง - "+(coName||""));
    var body = encodeURIComponent("บริษัท: "+(coName||"")+"\nผลประเมิน: "+r.title+"\nต้องการให้ METHAFLOW ช่วยเตรียมความพร้อม EWF ค่ะ");

    var ctaPrimary =
      '<a href="mailto:'+EMAIL+'?subject='+subject+'&body='+body+'"><button class="btn btn-primary">คุยกับทีม METHAFLOW →</button></a>';
    var ctaDemo =
      '<a href="mailto:'+EMAIL+'?subject='+encodeURIComponent("นัดดูตัวอย่างระบบ METHAFLOW")+'"><button class="btn btn-ghost">นัดดูตัวอย่างระบบ</button></a>';
    var ctaCall =
      '<a href="tel:+66616425116"><button class="btn btn-ghost">โทร '+PHONE+'</button></a>';

    var nextTitle, nextCtas;
    if(r.cls==="must"){
      nextTitle="ขั้นตอนถัดไปที่ควรทำ";
      nextCtas=ctaPrimary+ctaDemo;
    } else if(r.cls==="maybe"){
      nextTitle="แนะนำให้ตรวจสอบเพิ่มเติม";
      nextCtas=ctaPrimary+ctaCall;
    } else {
      nextTitle="เตรียมความพร้อมไว้ล่วงหน้า";
      nextCtas=ctaDemo+ctaCall;
    }

    host.innerHTML =
      '<div class="result-card '+r.cls+'">'+
        '<div class="verdict">'+
          '<div class="icon">'+r.icon+'</div>'+
          '<div><h3>'+esc(r.title)+'</h3>'+(coName?'<div class="co">'+esc(coName)+'</div>':'')+'</div>'+
        '</div>'+
        '<div class="verdict-body">'+esc(r.body)+'</div>'+
        '<ul class="reasons">'+reasonsHtml+'</ul>'+
        estHtml + watchHtml +
        '<div class="next"><h4>'+nextTitle+'</h4>'+
          '<div class="verdict-body" style="font-size:14.5px;color:var(--muted)">METHAFLOW คำนวณเงินสะสม/สมทบ EWF อัตโนมัติในงวดเดียวกับเงินเดือน แยกกลุ่มกองทุนสำรองเลี้ยงชีพให้ถูกต้อง และสร้างไฟล์นำส่งพร้อม audit trail</div>'+
          '<div class="cta-row">'+nextCtas+'</div>'+
        '</div>'+
      '</div>';

    host.classList.add("show");
    host.scrollIntoView({behavior:"smooth",block:"start"});
  }
})();

