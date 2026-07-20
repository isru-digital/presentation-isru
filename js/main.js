/* ============================================================
   presentation ISRU - scroll-cinematic engine
   Scrubs ONE concatenated film (media/film.mp4 / film_m.mp4) to the
   scroll position. Vanilla JS, no dependencies, degrades gracefully.
   DUR = per-clip durations; derives the caption timing bands.
   Engine from the scroll-cinematic-site skill (lerped scrub, loader,
   buffer clamp, iOS priming).
   ============================================================ */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mqMobile = window.matchMedia("(max-width: 820px), (orientation: portrait)");

  var film   = document.getElementById("film");
  var video  = document.getElementById("filmVideo");
  var caps   = Array.prototype.slice.call(document.querySelectorAll(".cap"));
  var dots   = Array.prototype.slice.call(document.querySelectorAll(".dots a"));
  var cue    = document.getElementById("scrollCue");
  var nav    = document.getElementById("nav");
  var pbar   = document.getElementById("progress");
  var loader = document.getElementById("loader");

  /* per-clip durations - set from the real encoded films */
  var DUR = [5.041667, 5.041667, 5.041667, 5.041667];
  var TOTAL = DUR.reduce(function (a, b) { return a + b; }, 0);
  var bands = (function () {
    var out = [], acc = 0;
    DUR.forEach(function (d) { var from = acc / TOTAL; acc += d; out.push({ from: from, to: acc / TOTAL }); });
    return out;
  })();

  /* ---------- preloader ---------- */
  var loaderGone = false;
  function hideLoader() {
    if (loaderGone || !loader) return;
    loaderGone = true;
    loader.classList.add("is-hidden");
    loader.setAttribute("aria-hidden", "true");
  }
  setTimeout(hideLoader, 2800);

  /* ---------- film source (PC vs mobile) + priming ---------- */
  var ready = false, primed = false;
  function wantSrc() { return mqMobile.matches ? video.dataset.srcM : video.dataset.src; }
  function loadFilm() {
    var want = wantSrc();
    if (video.getAttribute("src") !== want) {
      video.setAttribute("src", want);
      video.load();
      ready = false; primed = false;
    }
  }
  video.addEventListener("loadedmetadata", function () { ready = true; update(); });
  video.addEventListener("loadeddata", hideLoader);
  video.addEventListener("canplay", hideLoader);
  function prime() {
    if (primed) return;
    primed = true;
    var p = video.play();
    if (p && p.then) p.then(function () { video.pause(); }).catch(function () { primed = false; });
    else { try { video.pause(); } catch (e) {} }
  }

  /* ---------- scrub engine ---------- */
  function dur() { return (video.duration && isFinite(video.duration)) ? video.duration : TOTAL; }

  function filmProgress() {
    var scrollable = film.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    var top = film.getBoundingClientRect().top;
    var p = -top / scrollable;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }
  function activeIndex(p) {
    for (var i = 0; i < bands.length; i++) { if (p < bands[i].to) return i; }
    return bands.length - 1;
  }
  var lastP = 0;
  function bufferedEnd() {
    try { return video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0; } catch (e) { return 0; }
  }
  function seek(t) {
    if (!ready) return;
    var safe = Math.min(t, Math.max(0, bufferedEnd() - 0.05));
    try { video.currentTime = safe; } catch (e) {}
  }

  var lerpOn = !prefersReduced && typeof window.requestAnimationFrame === "function";
  var targetT = 0, currentT = 0, rafId = null;
  function tick() {
    var diff = targetT - currentT;
    if (Math.abs(diff) < 0.008) {
      currentT = targetT;
      seek(currentT);
      rafId = null;
      return;
    }
    currentT += diff * 0.22;
    seek(currentT);
    rafId = window.requestAnimationFrame(tick);
  }
  function requestSeek(t) {
    if (!lerpOn) { seek(t); return; }
    targetT = t;
    if (rafId === null) rafId = window.requestAnimationFrame(tick);
  }

  var revealEls = [];
  function runReveals() {
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    for (var k = 0; k < revealEls.length; k++) {
      if (!revealEls[k].classList.contains("is-in") &&
          revealEls[k].getBoundingClientRect().top < vh * 0.92) {
        revealEls[k].classList.add("is-in");
      }
    }
  }

  function update() {
    var p = filmProgress();
    lastP = p;
    var idx = activeIndex(p);
    for (var i = 0; i < caps.length; i++) caps[i].classList.toggle("is-active", i === idx);
    for (var j = 0; j < dots.length; j++) dots[j].classList.toggle("is-active", j === idx);
    if (cue) cue.style.opacity = p > 0.02 ? "0" : "";
    requestSeek(p * dur());
  }

  var waFloat = document.getElementById("waFloat");
  function onScroll() {
    update();
    var st = window.scrollY || window.pageYOffset;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (pbar) pbar.style.transform = "scaleX(" + (h > 0 ? st / h : 0) + ")";
    if (nav) nav.classList.toggle("is-scrolled", st > 40);
    /* reveal the floating WhatsApp once past the first screen of the film */
    if (waFloat) waFloat.classList.toggle("is-in", st > window.innerHeight * 0.9);
    runReveals();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", update, { passive: true });

  /* ---------- init ---------- */
  loadFilm();
  prime();
  revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal-item"));
  if (!prefersReduced) document.documentElement.classList.add("reveal-on");
  video.addEventListener("progress", function () { requestSeek(lastP * dur()); });
  ["touchstart", "pointerdown", "click", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, prime, { once: true, passive: true });
  });
  onScroll();

  function onMQ() { loadFilm(); prime(); update(); }
  if (mqMobile.addEventListener) mqMobile.addEventListener("change", onMQ);
  else if (mqMobile.addListener) mqMobile.addListener(onMQ);

  /* dots → jump to a scene's point in the film */
  function scrollToBand(i) {
    var scrollable = film.offsetHeight - window.innerHeight;
    var mid = (bands[i].from + bands[i].to) / 2;
    window.scrollTo({ top: Math.round(film.offsetTop + mid * scrollable), behavior: "smooth" });
  }
  dots.forEach(function (d, i) {
    d.addEventListener("click", function (e) { e.preventDefault(); scrollToBand(i); });
  });
  if (cue) cue.addEventListener("click", function (e) { e.preventDefault(); scrollToBand(1); });

  /* ---------- mobile menu ---------- */
  var toggle = document.getElementById("navToggle");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
  document.querySelectorAll("[data-link]").forEach(function (a) {
    a.addEventListener("click", function () { if (nav) nav.classList.remove("is-open"); });
  });

  /* ---------- project builder ----------
     Replaces static price tiers: visitor picks industry + scope (+ optional
     extras), gets a personalized summary and a pre-filled WhatsApp message.
     No numbers shown anywhere - the whole point is to start a conversation. */
  var wizIndustry = document.getElementById("wizIndustry");
  var wizScope = document.getElementById("wizScope");
  var wizExtras = document.getElementById("wizExtras");
  if (wizIndustry && wizScope) {
    var WA_NUMBER = "972527444984";
    var wizState = { industry: null, scope: null, extras: [] };

    var wizEmpty = document.getElementById("wizEmpty");
    var wizFilled = document.getElementById("wizFilled");
    var wizSummary = document.getElementById("wizSummary");
    var wizCta = document.getElementById("wizCta");

    function wizSelectSingle(group, chosen) {
      Array.prototype.slice.call(group.querySelectorAll("[data-value]")).forEach(function (b) {
        var active = b === chosen;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
    }
    function wizToggleMulti(btn) {
      var v = btn.dataset.value;
      var active = btn.classList.toggle("is-active");
      btn.setAttribute("aria-pressed", String(active));
      if (active) {
        if (wizState.extras.indexOf(v) === -1) wizState.extras.push(v);
      } else {
        wizState.extras = wizState.extras.filter(function (x) { return x !== v; });
      }
    }

    wizIndustry.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-value]");
      if (!btn) return;
      wizState.industry = btn.dataset.value;
      wizSelectSingle(wizIndustry, btn);
      wizRender();
    });
    wizScope.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-value]");
      if (!btn) return;
      wizState.scope = btn.dataset.value;
      wizSelectSingle(wizScope, btn);
      wizRender();
    });
    if (wizExtras) {
      wizExtras.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-value]");
        if (!btn) return;
        wizToggleMulti(btn);
        wizRender();
      });
    }

    function wizRender() {
      if (!wizState.industry || !wizState.scope) {
        if (wizEmpty) wizEmpty.hidden = false;
        if (wizFilled) wizFilled.hidden = true;
        return;
      }
      if (wizEmpty) wizEmpty.hidden = true;
      if (wizFilled) wizFilled.hidden = false;

      var extrasLine = wizState.extras.length ? ", עם " + wizState.extras.join(" + ") : "";
      if (wizSummary) {
        wizSummary.innerHTML =
          "סרט קולנועי לעסק בתחום <b>" + wizState.industry + "</b>, " +
          "בהיקף <b>" + wizState.scope + "</b>" + extrasLine + ".";
      }
      var lines = [
        "היי, מילאתי את הטופס באתר.",
        "תחום: " + wizState.industry,
        "היקף: " + wizState.scope
      ];
      if (wizState.extras.length) lines.push("תוספות: " + wizState.extras.join(", "));
      lines.push("אשמח להצעת מחיר מדויקת.");
      var msg = lines.join("\n");
      if (wizCta) wizCta.href = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(msg);
    }

    wizRender();
  }
})();
