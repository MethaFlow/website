/* METHAFLOW — homepage interactions (payroll-only, no dead code) */
(function () {
  "use strict";

  /* sticky nav shadow */
  var nav = document.getElementById("nav");
  if (nav) {
    window.addEventListener("scroll", function () {
      nav.classList.toggle("stuck", window.scrollY > 8);
    }, { passive: true });
  }

  /* scroll reveal */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll(".rv:not(.in)").forEach(function (el) { io.observe(el); });

  /* count-up numbers */
  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count")) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    var t0 = null, dur = 1300;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var cio = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach(function (el) { cio.observe(el); });

  /* progress bars */
  var bio = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.style.width = en.target.getAttribute("data-fill") + "%";
        bio.unobserve(en.target);
      }
    });
  }, { threshold: 0.4 });
  document.querySelectorAll("[data-fill]").forEach(function (el) { bio.observe(el); });
})();
