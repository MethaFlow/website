/* METHAFLOW — shared language switcher (TH/EN) */
(function () {
  "use strict";
  var KEY = "mf-lang";
  var root = document.documentElement;

  function apply(lang) {
    root.setAttribute("lang", lang);
    var t = root.getAttribute("data-title-" + lang);
    if (t) document.title = t;
    var btns = document.querySelectorAll("button[data-lang]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", String(btns[i].getAttribute("data-lang") === lang));
    }
    try { localStorage.setItem(KEY, lang); } catch (e) { /* storage unavailable */ }
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-lang]") : null;
    if (b) apply(b.getAttribute("data-lang"));
  });

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  if (saved === "en" || saved === "th") apply(saved);
})();
