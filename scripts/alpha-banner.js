// alpha-banner.js
// Dismissible alpha preview banner

(function alphaBanner() {
  const root = document.documentElement;
  const banner = document.getElementById("alphaBanner");
  const btn = document.getElementById("alphaBannerClose");
  if (!banner || !btn) return;

  const KEY = "es_alpha_banner_dismissed_v1";

  try {
    if (localStorage.getItem(KEY) === "1") {
      banner.style.display = "none";
      return;
    }
  } catch (e) {}

  btn.addEventListener("click", () => {
    banner.style.display = "none";
    try {
      localStorage.setItem(KEY, "1");
    } catch (e) {}
  });
})();
