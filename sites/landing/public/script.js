(function () {
  var root = document.documentElement;
  root.classList.add("js");

  var nav = document.querySelector(".nav");
  function onScroll() { nav.classList.toggle("scrolled", window.scrollY > 8); reveal(); }

  // Bo‘limlar ekranga kirganda yumshoq paydo bo‘ladi (o‘lchov bilan: hech qachon yashirin qolmaydi)
  var pending = Array.prototype.slice.call(document.querySelectorAll(".sec-head, .table-wrap, .gallery, .how, .faq, .contact-in, .facts"));
  pending.forEach(function (el) { el.classList.add("rv"); });
  function reveal() {
    var limit = window.innerHeight - 30;
    pending = pending.filter(function (el) {
      if (el.getBoundingClientRect().top < limit) { el.classList.add("in"); return false; }
      return true;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", reveal);
  window.addEventListener("load", reveal);
  onScroll();

  // Sertifikatni katta ko‘rish: galereya, jadval qatori va bosh qismdagi hujjatlar
  var lb = document.querySelector(".lightbox");
  var list = Array.prototype.slice.call(document.querySelectorAll(".gallery .cert")).map(function (b) {
    return { n: b.getAttribute("data-n"), src: b.getAttribute("data-full") };
  });
  if (lb && lb.showModal && list.length) {
    var img = lb.querySelector("img"), cur = 0;
    function show(k) { cur = (k + list.length) % list.length; img.src = list[cur].src; img.alt = "Sertifikat " + (cur + 1); }
    function openN(n) {
      var k = list.findIndex(function (x) { return x.n === n; });
      if (k < 0) return; show(k); lb.showModal();
    }
    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-n]");
      if (t && !lb.contains(t)) openN(t.getAttribute("data-n"));
    });
    document.querySelectorAll(".results tbody tr").forEach(function (tr) {
      tr.tabIndex = 0;
      tr.addEventListener("keydown", function (e) { if (e.key === "Enter") openN(tr.getAttribute("data-n")); });
    });
    lb.querySelector(".lb-close").onclick = function () { lb.close(); };
    lb.querySelector(".lb-prev").onclick = function () { show(cur - 1); };
    lb.querySelector(".lb-next").onclick = function () { show(cur + 1); };
    lb.addEventListener("click", function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") show(cur - 1);
      if (e.key === "ArrowRight") show(cur + 1);
    });
    var sx = null;
    lb.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    });
  }

  document.getElementById("year").textContent = new Date().getFullYear();
})();
